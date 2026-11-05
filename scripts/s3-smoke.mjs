import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const endpoint =
  process.env.S3_ENDPOINT ?? "http://localhost:3100/s3";
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

if (!accessKeyId || !secretAccessKey) {
  throw new Error(
    "Set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY before running this script",
  );
}

const client = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const key = `smoke/hello-${Date.now()}.txt`;
const body = "hello from the s3 smoke test";

const buckets = await client.send(new ListBucketsCommand({}));
console.log(
  "buckets:",
  (buckets.Buckets ?? []).map((bucket) => bucket.Name),
);

const put = await client.send(
  new PutObjectCommand({
    Bucket: "default",
    Key: key,
    Body: body,
    ContentType: "text/plain",
    Metadata: { source: "smoke" },
  }),
);
console.log("put etag:", put.ETag);

const list = await client.send(
  new ListObjectsV2Command({
    Bucket: "default",
    Prefix: "smoke/",
  }),
);
console.log(
  "list:",
  (list.Contents ?? []).map((entry) => entry.Key),
);

const head = await client.send(
  new HeadObjectCommand({ Bucket: "default", Key: key }),
);
console.log("head:", head.ContentType, head.ContentLength);

const get = await client.send(
  new GetObjectCommand({ Bucket: "default", Key: key }),
);
const downloaded = await get.Body.transformToString();
console.log("get:", downloaded);

if (downloaded !== body) {
  throw new Error("Downloaded body does not match uploaded body");
}

await client.send(
  new DeleteObjectCommand({ Bucket: "default", Key: key }),
);
console.log("deleted:", key);
