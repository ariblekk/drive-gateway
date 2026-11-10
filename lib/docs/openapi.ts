export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Omnibucket API",
    version: "1.0.0",
    description:
      "Universal multi-provider storage gateway (Google Drive & S3 backends). Exposes an S3-compatible API (`/s3`) with AWS Signature V4 authentication.",
  },
  servers: [
    {
      url: "/",
      description: "Current Gateway Host",
    },
  ],
  tags: [
    {
      name: "S3 Compatible API (/s3)",
      description:
        "S3-compatible object operations with AWS Signature V4 authentication.",
    },
  ],
  paths: {
    "/s3": {
      get: {
        tags: ["S3 Compatible API (/s3)"],
        summary: "ListBuckets",
        description: "List all accessible S3 buckets. Scoped credentials only see their assigned bucket.",
        security: [{ AwsSigV4: [] }],
        responses: {
          "200": {
            description: "S3 ListAllMyBucketsResult XML",
            content: {
              "application/xml": {
                schema: { type: "string" },
              },
            },
          },
          "403": { description: "AccessDenied" },
        },
      },
    },
    "/s3/{bucket}": {
      get: {
        tags: ["S3 Compatible API (/s3)"],
        summary: "ListObjectsV2",
        description: "List objects and common prefixes in a bucket. Supports prefix, delimiter, and continuation-token.",
        security: [{ AwsSigV4: [] }],
        parameters: [
          { name: "bucket", in: "path", required: true, schema: { type: "string" } },
          { name: "prefix", in: "query", required: false, schema: { type: "string" } },
          { name: "delimiter", in: "query", required: false, schema: { type: "string", default: "/" } },
          { name: "max-keys", in: "query", required: false, schema: { type: "integer", default: 1000 } },
          { name: "continuation-token", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "S3 ListBucketResult XML",
            content: { "application/xml": { schema: { type: "string" } } },
          },
          "404": { description: "NoSuchBucket" },
          "403": { description: "AccessDenied" },
        },
      },
      put: {
        tags: ["S3 Compatible API (/s3)"],
        summary: "CreateBucket",
        description: "Creates a new bucket (admin credentials only).",
        security: [{ AwsSigV4: [] }],
        parameters: [
          { name: "bucket", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Bucket created successfully" },
          "403": { description: "AccessDenied" },
        },
      },
      delete: {
        tags: ["S3 Compatible API (/s3)"],
        summary: "DeleteBucket",
        description: "Deletes an empty bucket.",
        security: [{ AwsSigV4: [] }],
        parameters: [
          { name: "bucket", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "204": { description: "Bucket deleted" },
          "409": { description: "BucketNotEmpty" },
          "403": { description: "AccessDenied" },
        },
      },
      head: {
        tags: ["S3 Compatible API (/s3)"],
        summary: "HeadBucket",
        description: "Checks if a bucket exists and caller has access.",
        security: [{ AwsSigV4: [] }],
        parameters: [
          { name: "bucket", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Bucket exists" },
          "404": { description: "NoSuchBucket" },
        },
      },
    },
    "/s3/{bucket}/{key}": {
      put: {
        tags: ["S3 Compatible API (/s3)"],
        summary: "PutObject",
        description: "Uploads an object or creates a folder (key ending with /). Evaluates storage limits and routes to backend with most space.",
        security: [{ AwsSigV4: [] }],
        parameters: [
          { name: "bucket", in: "path", required: true, schema: { type: "string" } },
          { name: "key", in: "path", required: true, schema: { type: "string" } },
          { name: "Content-Type", in: "header", required: false, schema: { type: "string" } },
          { name: "x-amz-meta-*", in: "header", required: false, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/octet-stream": {
              schema: { type: "string", format: "binary" },
            },
          },
        },
        responses: {
          "200": {
            description: "Object stored, returns ETag header",
            headers: {
              ETag: { schema: { type: "string", example: '"d41d8cd98f00b204e9800998ecf8427e"' } },
            },
          },
          "403": { description: "AccessDenied / QuotaExceeded" },
          "413": { description: "EntityTooLarge" },
        },
      },
      get: {
        tags: ["S3 Compatible API (/s3)"],
        summary: "GetObject",
        description: "Retrieves an object stream. Supports Range requests and returns custom metadata.",
        security: [{ AwsSigV4: [] }],
        parameters: [
          { name: "bucket", in: "path", required: true, schema: { type: "string" } },
          { name: "key", in: "path", required: true, schema: { type: "string" } },
          { name: "Range", in: "header", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Object binary stream",
            content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
          },
          "206": { description: "Partial content range" },
          "404": { description: "NoSuchKey" },
        },
      },
      head: {
        tags: ["S3 Compatible API (/s3)"],
        summary: "HeadObject",
        description: "Retrieves object metadata, Content-Length, and ETag without returning the body.",
        security: [{ AwsSigV4: [] }],
        parameters: [
          { name: "bucket", in: "path", required: true, schema: { type: "string" } },
          { name: "key", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Object headers",
            headers: {
              ETag: { schema: { type: "string" } },
              "Content-Length": { schema: { type: "integer" } },
              "Content-Type": { schema: { type: "string" } },
              "Last-Modified": { schema: { type: "string" } },
            },
          },
          "404": { description: "NoSuchKey" },
        },
      },
      delete: {
        tags: ["S3 Compatible API (/s3)"],
        summary: "DeleteObject",
        description: "Permanently deletes an object or folder. Idempotent (returns 204 even if key does not exist).",
        security: [{ AwsSigV4: [] }],
        parameters: [
          { name: "bucket", in: "path", required: true, schema: { type: "string" } },
          { name: "key", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "204": { description: "Object deleted successfully" },
          "403": { description: "AccessDenied (e.g. read-only credential)" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      AwsSigV4: {
        type: "apiKey",
        in: "header",
        name: "Authorization",
        description:
          "AWS Signature Version 4 (AWS4-HMAC-SHA256). Handled automatically by AWS CLI, rclone, and S3 SDKs.",
      },
    },
    responses: {
      BadRequest: {
        description: "Invalid request parameters or payload",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                error: {
                  type: "object",
                  properties: {
                    code: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      Unauthorized: {
        description: "Missing or invalid S3 credentials",
      },
    },
  },
};
