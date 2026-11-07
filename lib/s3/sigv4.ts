import crypto from "node:crypto";

import {
  decryptS3Secret,
  findS3Credential,
  touchS3Credential,
} from "./credentials";
import { S3Error } from "./errors";
import type { S3Credential } from "@/lib/db";

const ALGORITHM = "AWS4-HMAC-SHA256";
const MAX_SKEW_MS = 15 * 60 * 1000;
const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export type S3AuthResult = {
  credential: S3Credential;
  accessKeyId: string;
  payloadHash: string;
  signedHeaders: string[];
};

function parseAmzDate(value: string): number | null {
  const match =
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;

  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalQuery(url: URL): string {
  const entries: Array<[string, string]> = [];

  url.searchParams.forEach((value, key) => {
    if (key.toLowerCase() === "x-amz-signature") {
      return;
    }

    entries.push([key, value]);
  });

  entries.sort(([aKey, aValue], [bKey, bValue]) => {
    const keyCompare = aKey.localeCompare(bKey);

    return keyCompare !== 0
      ? keyCompare
      : aValue.localeCompare(bValue);
  });

  return entries
    .map(
      ([key, value]) =>
        `${encodeRfc3986(key)}=${encodeRfc3986(value)}`,
    )
    .join("&");
}

function canonicalHeaders(
  request: Request,
  signedHeaders: string[],
  url: URL,
): string {
  return signedHeaders
    .map((name) => {
      const lower = name.toLowerCase();
      const value =
        lower === "host"
          ? (request.headers.get("host") ?? url.host)
          : (request.headers.get(lower) ?? "");

      return `${lower}:${value.trim().replace(/\s+/g, " ")}\n`;
    })
    .join("");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return crypto
    .createHmac("sha256", key)
    .update(value, "utf8")
    .digest();
}

function signingKey(
  secret: string,
  date: string,
  region: string,
  service: string,
): Buffer {
  return hmac(
    hmac(
      hmac(hmac(`AWS4${secret}`, date), region),
      service,
    ),
    "aws4_request",
  );
}

function parseAuthorizationHeader(
  request: Request,
): {
  accessKeyId: string;
  date: string;
  region: string;
  service: string;
  terminator: string;
  signedHeaders: string[];
  signature: string;
} {
  const header = request.headers.get("authorization");

  if (!header || !header.startsWith(`${ALGORITHM} `)) {
    throw new S3Error(
      "AccessDenied",
      "Missing AWS Signature V4 authorization",
      403,
    );
  }

  const rest = header.slice(ALGORITHM.length + 1);
  const parts = new Map<string, string>();

  for (const segment of rest.split(",")) {
    const index = segment.indexOf("=");

    if (index === -1) {
      continue;
    }

    parts.set(
      segment.slice(0, index).trim(),
      segment.slice(index + 1).trim(),
    );
  }

  const credential = parts.get("Credential");
  const signedHeadersValue = parts.get("SignedHeaders");
  const signature = parts.get("Signature");

  if (!credential || !signedHeadersValue || !signature) {
    throw new S3Error(
      "AuthorizationHeaderMalformed",
      "Authorization header is missing required fields",
      400,
    );
  }

  const [accessKeyId, date, region, service, terminator] =
    credential.split("/");

  if (
    !accessKeyId ||
    !date ||
    !region ||
    service !== "s3" ||
    terminator !== "aws4_request"
  ) {
    throw new S3Error(
      "AuthorizationHeaderMalformed",
      "Unsupported credential scope",
      400,
    );
  }

  return {
    accessKeyId,
    date,
    region,
    service,
    terminator,
    signedHeaders: signedHeadersValue.split(";"),
    signature,
  };
}

export async function verifyS3Request(
  request: Request,
): Promise<S3AuthResult> {
  const parsed = parseAuthorizationHeader(request);
  const credential = findS3Credential(parsed.accessKeyId);

  if (!credential) {
    throw new S3Error(
      "InvalidAccessKeyId",
      "The AWS access key ID you provided does not exist",
      403,
    );
  }

  const secret = decryptS3Secret(credential);
  const amzDate =
    request.headers.get("x-amz-date") ??
    request.headers.get("date") ??
    "";
  const requestTime = parseAmzDate(amzDate);

  if (!requestTime) {
    throw new S3Error(
      "AccessDenied",
      "A valid x-amz-date header is required",
      403,
    );
  }

  if (Math.abs(Date.now() - requestTime) > MAX_SKEW_MS) {
    throw new S3Error(
      "RequestTimeTooSkewed",
      "The difference between the request time and the server time is too large",
      403,
    );
  }

  const date = amzDate.slice(0, 8);

  if (date !== parsed.date) {
    throw new S3Error(
      "AuthorizationHeaderMalformed",
      "Credential date does not match x-amz-date",
      400,
    );
  }

  if (!parsed.signedHeaders.includes("host")) {
    throw new S3Error(
      "AuthorizationHeaderMalformed",
      "The host header must be signed",
      400,
    );
  }

  const url = new URL(request.url);
  const payloadHash =
    request.headers.get("x-amz-content-sha256") ??
    (request.method === "GET" || request.method === "HEAD"
      ? EMPTY_SHA256
      : "UNSIGNED-PAYLOAD");

  // Accepting an unsigned body would let an attacker reuse a signature from
  // a different payload, so uploads must commit to a content hash.
  if (
    (request.method === "PUT" || request.method === "POST") &&
    payloadHash.includes("UNSIGNED-PAYLOAD")
  ) {
    throw new S3Error(
      "InvalidRequest",
      "Unsigned payloads are not accepted for uploads. Provide a valid x-amz-content-sha256 header.",
      400,
    );
  }

  const canonicalRequest = [
    request.method,
    url.pathname || "/",
    canonicalQuery(url),
    canonicalHeaders(request, parsed.signedHeaders, url),
    parsed.signedHeaders.join(";"),
    payloadHash,
  ].join("\n");

  const scope = `${parsed.date}/${parsed.region}/${parsed.service}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    crypto
      .createHash("sha256")
      .update(canonicalRequest, "utf8")
      .digest("hex"),
  ].join("\n");

  const expected = crypto
    .createHmac(
      "sha256",
      signingKey(
        secret,
        parsed.date,
        parsed.region,
        parsed.service,
      ),
    )
    .update(stringToSign, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(parsed.signature, "utf8");

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new S3Error(
      "SignatureDoesNotMatch",
      "The request signature we calculated does not match the signature you provided",
      403,
    );
  }

  touchS3Credential(credential.id);

  return {
    credential,
    accessKeyId: credential.accessKeyId,
    payloadHash,
    signedHeaders: parsed.signedHeaders,
  };
}

export function isAwsChunked(
  request: Request,
  payloadHash: string,
): boolean {
  return (
    payloadHash.startsWith("STREAMING-") ||
    (request.headers.get("content-encoding") ?? "")
      .toLowerCase()
      .includes("aws-chunked")
  );
}

export async function* decodeAwsChunkedStream(
  source: AsyncIterable<Uint8Array>,
): AsyncIterable<Uint8Array> {
  let buffer = Buffer.alloc(0);
  let done = false;

  for await (const chunk of source) {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);

    while (!done) {
      const lineEnd = buffer.indexOf("\r\n");

      if (lineEnd === -1) {
        break;
      }

      const line = buffer
        .subarray(0, lineEnd)
        .toString("utf8");
      const sizeHex = line.split(";")[0]?.trim() ?? "";

      if (!/^[0-9a-fA-F]+$/.test(sizeHex)) {
        throw new S3Error(
          "InvalidRequest",
          "Invalid aws-chunked header",
          400,
        );
      }

      const size = Number.parseInt(sizeHex, 16);

      if (size === 0) {
        buffer = buffer.subarray(lineEnd + 2);

        while (true) {
          const trailerEnd = buffer.indexOf("\r\n");

          if (trailerEnd === -1) {
            break;
          }

          const trailer = buffer
            .subarray(0, trailerEnd)
            .toString("utf8");
          buffer = buffer.subarray(trailerEnd + 2);

          if (trailer === "") {
            done = true;
            break;
          }
        }

        break;
      }

      const dataStart = lineEnd + 2;
      const dataEnd = dataStart + size;

      if (buffer.length < dataEnd + 2) {
        break;
      }

      yield new Uint8Array(
        buffer.subarray(dataStart, dataEnd),
      );
      buffer = buffer.subarray(dataEnd + 2);
    }

    if (done) {
      break;
    }
  }
}
