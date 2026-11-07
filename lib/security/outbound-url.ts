import dns from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
]);

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some(
      (part) => !Number.isInteger(part) || part < 0 || part > 255,
    )
  ) {
    return false;
  }

  const [a, b] = parts as [number, number, number, number];

  if (a === 0 || a === 10 || a === 127) {
    return true;
  }

  if (a === 169 && b === 254) {
    return true;
  }

  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  if (a === 192 && b === 168) {
    return true;
  }

  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }

  // Multicast and reserved ranges.
  return a >= 224;
}

function isLinkLocalIpv4(address: string): boolean {
  return address.startsWith("169.254.");
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? "";

  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  if (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fec0:") ||
    normalized.startsWith("ff")
  ) {
    return true;
  }

  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);

  return mapped ? isPrivateIpv4(mapped[1] ?? "") : false;
}

function isLinkLocalIpv6(address: string): boolean {
  return address.toLowerCase().startsWith("fe80:");
}

function allowPrivateEndpoints(): boolean {
  return process.env.S3_ALLOW_PRIVATE_ENDPOINTS === "1";
}

function assertHostAllowed(hostname: string): void {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("Endpoint host is not allowed");
  }

  const ipVersion = net.isIP(host);

  if (ipVersion === 0) {
    return;
  }

  if (ipVersion === 4) {
    if (isLinkLocalIpv4(host)) {
      throw new Error("Link-local endpoints are not allowed");
    }

    if (isPrivateIpv4(host) && !allowPrivateEndpoints()) {
      throw new Error(
        "Private network endpoints are disabled. Set S3_ALLOW_PRIVATE_ENDPOINTS=1 to allow them.",
      );
    }

    return;
  }

  if (isLinkLocalIpv6(host)) {
    throw new Error("Link-local endpoints are not allowed");
  }

  if (isPrivateIpv6(host) && !allowPrivateEndpoints()) {
    throw new Error(
      "Private network endpoints are disabled. Set S3_ALLOW_PRIVATE_ENDPOINTS=1 to allow them.",
    );
  }
}

export function assertSafeHttpUrl(value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid endpoint URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Endpoint must use http or https");
  }

  if (url.username || url.password) {
    throw new Error("Endpoint must not include credentials");
  }

  assertHostAllowed(url.hostname);

  return url;
}

export async function assertSafeS3Endpoint(value: string): Promise<URL> {
  const url = assertSafeHttpUrl(value);

  if (net.isIP(url.hostname) === 0) {
    let records: Array<{ address: string }>;

    try {
      records = await dns.lookup(url.hostname, {
        all: true,
        verbatim: true,
      });
    } catch {
      throw new Error("Endpoint host could not be resolved");
    }

    for (const record of records) {
      assertHostAllowed(record.address);
    }
  }

  return url;
}
