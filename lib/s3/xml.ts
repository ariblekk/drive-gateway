import crypto from "node:crypto";

const S3_NAMESPACE = "http://s3.amazonaws.com/doc/2006-03-01/";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function encodeKey(value: string, encodingType?: string | null): string {
  return encodingType === "url"
    ? encodeURIComponent(value)
    : escapeXml(value);
}

function isoDate(value: number): string {
  return new Date(value).toISOString();
}

export function xmlResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>${body}`,
    {
      status,
      headers: {
        "content-type": "application/xml",
        "x-amz-request-id": crypto.randomUUID(),
        ...headers,
      },
    },
  );
}

export function listBucketsXml(
  buckets: Array<{ name: string; createdAt: number }>,
): string {
  const items = buckets
    .map(
      (bucket) => `<Bucket>
  <Name>${escapeXml(bucket.name)}</Name>
  <CreationDate>${isoDate(bucket.createdAt)}</CreationDate>
</Bucket>`,
    )
    .join("");

  return `<ListAllMyBucketsResult xmlns="${S3_NAMESPACE}">
  <Owner>
    <ID>drive-gateway</ID>
    <DisplayName>drive-gateway</DisplayName>
  </Owner>
  <Buckets>${items}</Buckets>
</ListAllMyBucketsResult>`;
}

export type S3ListEntry = {
  key: string;
  size: number;
  etag: string | null;
  updatedAt: number;
};

export type S3ListResult = {
  bucket: string;
  prefix: string;
  delimiter: string | null;
  maxKeys: number;
  encodingType: string | null;
  isTruncated: boolean;
  nextContinuationToken: string | null;
  contents: S3ListEntry[];
  commonPrefixes: string[];
};

export function listObjectsV2Xml(result: S3ListResult): string {
  const contents = result.contents
    .map(
      (entry) => `<Contents>
  <Key>${encodeKey(entry.key, result.encodingType)}</Key>
  <LastModified>${isoDate(entry.updatedAt)}</LastModified>
  <ETag>&quot;${escapeXml(entry.etag ?? entry.key)}&quot;</ETag>
  <Size>${entry.size}</Size>
  <StorageClass>STANDARD</StorageClass>
</Contents>`,
    )
    .join("");

  const prefixes = result.commonPrefixes
    .map(
      (prefix) =>
        `<CommonPrefixes><Prefix>${encodeKey(
          prefix,
          result.encodingType,
        )}</Prefix></CommonPrefixes>`,
    )
    .join("");

  const parts = [
    `<ListBucketResult xmlns="${S3_NAMESPACE}">`,
    `<Name>${escapeXml(result.bucket)}</Name>`,
    `<Prefix>${encodeKey(result.prefix, result.encodingType)}</Prefix>`,
    result.delimiter
      ? `<Delimiter>${escapeXml(result.delimiter)}</Delimiter>`
      : "",
    `<KeyCount>${result.contents.length + result.commonPrefixes.length}</KeyCount>`,
    `<MaxKeys>${result.maxKeys}</MaxKeys>`,
    `<IsTruncated>${result.isTruncated}</IsTruncated>`,
    result.nextContinuationToken
      ? `<NextContinuationToken>${escapeXml(
          result.nextContinuationToken,
        )}</NextContinuationToken>`
      : "",
    result.encodingType
      ? `<EncodingType>${escapeXml(result.encodingType)}</EncodingType>`
      : "",
    contents,
    prefixes,
    "</ListBucketResult>",
  ];

  return parts.join("");
}

export function locationXml(region: string): string {
  return `<LocationConstraint xmlns="${S3_NAMESPACE}">${escapeXml(
    region,
  )}</LocationConstraint>`;
}

export function aclXml(): string {
  return `<AccessControlPolicy xmlns="${S3_NAMESPACE}">
  <Owner>
    <ID>drive-gateway</ID>
    <DisplayName>drive-gateway</DisplayName>
  </Owner>
  <AccessControlList>
    <Grant>
      <Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CanonicalUser">
        <ID>drive-gateway</ID>
        <DisplayName>drive-gateway</DisplayName>
      </Grantee>
      <Permission>FULL_CONTROL</Permission>
    </Grant>
  </AccessControlList>
</AccessControlPolicy>`;
}

export function versioningXml(): string {
  return `<VersioningConfiguration xmlns="${S3_NAMESPACE}"/>`;
}

export function notificationXml(): string {
  return `<NotificationConfiguration xmlns="${S3_NAMESPACE}"/>`;
}

export function deleteResultXml(keys: string[]): string {
  const deleted = keys
    .map(
      (key) =>
        `<Deleted><Key>${escapeXml(key)}</Key></Deleted>`,
    )
    .join("");

  return `<DeleteResult xmlns="${S3_NAMESPACE}">${deleted}</DeleteResult>`;
}

export function copyObjectResultXml(
  etag: string,
  updatedAt: number,
): string {
  return `<CopyObjectResult xmlns="${S3_NAMESPACE}">
  <LastModified>${isoDate(updatedAt)}</LastModified>
  <ETag>&quot;${escapeXml(etag)}&quot;</ETag>
</CopyObjectResult>`;
}
