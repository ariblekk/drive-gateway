export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Drive Gateway API",
    version: "1.0.0",
    description:
      "Universal multi-provider storage gateway (Google Drive & S3 backends). Exposes both a public REST API (`/api/v1`) and an S3-compatible API (`/s3`) with AWS Signature V4 authentication.",
  },
  servers: [
    {
      url: "/",
      description: "Current Gateway Host",
    },
  ],
  tags: [
    {
      name: "Public REST API (v1)",
      description:
        "File upload, listing, download, and deletion via API keys.",
    },
    {
      name: "S3 Compatible API (/s3)",
      description:
        "S3-compatible object operations with AWS Signature V4 authentication.",
    },
  ],
  paths: {
    "/api/v1/upload": {
      post: {
        tags: ["Public REST API (v1)"],
        summary: "Upload a file",
        description:
          "Upload a file via multipart form-data or raw octet-stream body. The file is automatically placed on the storage account with the most remaining quota.",
        security: [{ ApiKeyAuth: [] }, { XApiKeyAuth: [] }],
        parameters: [
          {
            name: "name",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "File name (for raw stream uploads)",
          },
          {
            name: "folderId",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Target virtual folder ID (or 'root')",
          },
          {
            name: "path",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Target virtual path (e.g. /documents)",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: {
                    type: "string",
                    format: "binary",
                    description: "The file to upload",
                  },
                  name: {
                    type: "string",
                    description: "Optional custom file name",
                  },
                  folderId: {
                    type: "string",
                    description: "Optional folder ID",
                  },
                  path: {
                    type: "string",
                    description: "Optional virtual path",
                  },
                },
              },
            },
            "application/octet-stream": {
              schema: {
                type: "string",
                format: "binary",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "File uploaded successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    file: { $ref: "#/components/schemas/FileItem" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "413": { description: "File exceeds MAX_UPLOAD_BYTES" },
          "507": { description: "No storage account has enough free space" },
        },
      },
    },
    "/api/v1/files": {
      get: {
        tags: ["Public REST API (v1)"],
        summary: "List active files",
        description: "List files with optional query search, folder filter, and pagination.",
        security: [{ ApiKeyAuth: [] }, { XApiKeyAuth: [] }],
        parameters: [
          {
            name: "q",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Search keyword matching file name",
          },
          {
            name: "folderId",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Filter files in specific folder ID (or 'root')",
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", default: 20, minimum: 1, maximum: 100 },
          },
          {
            name: "offset",
            in: "query",
            required: false,
            schema: { type: "integer", default: 0, minimum: 0 },
          },
        ],
        responses: {
          "200": {
            description: "List of files",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    files: {
                      type: "array",
                      items: { $ref: "#/components/schemas/FileItem" },
                    },
                    total: { type: "integer" },
                    limit: { type: "integer" },
                    offset: { type: "integer" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/v1/files/{id}": {
      get: {
        tags: ["Public REST API (v1)"],
        summary: "Get file metadata",
        security: [{ ApiKeyAuth: [] }, { XApiKeyAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "File metadata",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    file: { $ref: "#/components/schemas/FileItem" },
                  },
                },
              },
            },
          },
          "404": { description: "File not found" },
        },
      },
      delete: {
        tags: ["Public REST API (v1)"],
        summary: "Permanently delete file",
        description: "Permanently deletes the file from the gateway and its storage provider.",
        security: [{ ApiKeyAuth: [] }, { XApiKeyAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "File deleted permanently",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    file: { $ref: "#/components/schemas/FileItem" },
                  },
                },
              },
            },
          },
          "404": { description: "File not found" },
        },
      },
    },
    "/api/v1/files/{id}/download": {
      get: {
        tags: ["Public REST API (v1)"],
        summary: "Download file stream",
        description: "Download the file content. Supports HTTP Range requests for streaming and resumable downloads.",
        security: [{ ApiKeyAuth: [] }, { XApiKeyAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "Range",
            in: "header",
            required: false,
            schema: { type: "string", example: "bytes=0-1048575" },
            description: "HTTP Range header for partial content",
          },
        ],
        responses: {
          "200": {
            description: "Full file binary stream",
            content: {
              "application/octet-stream": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
          "206": {
            description: "Partial content range",
            content: {
              "application/octet-stream": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
          "404": { description: "File not found" },
        },
      },
    },
    "/api/v1/stats": {
      get: {
        tags: ["Public REST API (v1)"],
        summary: "Storage statistics",
        description: "Returns aggregated statistics across all connected storage accounts.",
        security: [{ ApiKeyAuth: [] }, { XApiKeyAuth: [] }],
        responses: {
          "200": {
            description: "Gateway statistics",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    accounts: { type: "integer" },
                    totalFiles: { type: "integer" },
                    totalFileBytes: { type: "integer" },
                    totalLimitBytes: { type: "integer" },
                    totalUsedBytes: { type: "integer" },
                    totalFreeBytes: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
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
      ApiKeyAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "gwk_live_...",
        description: "API key passed in `Authorization: Bearer <key>` header.",
      },
      XApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "API key passed in `x-api-key` header.",
      },
      AwsSigV4: {
        type: "apiKey",
        in: "header",
        name: "Authorization",
        description:
          "AWS Signature Version 4 (AWS4-HMAC-SHA256). Handled automatically by AWS CLI, rclone, and S3 SDKs.",
      },
    },
    schemas: {
      FileItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          size: { type: "integer" },
          mimeType: { type: "string", nullable: true },
          path: { type: "string" },
          bucketId: { type: "string" },
          key: { type: "string" },
          status: { type: "string", enum: ["active"] },
          createdAt: { type: "integer" },
          updatedAt: { type: "integer" },
        },
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
        description: "Missing or invalid API key / S3 credentials",
      },
    },
  },
};
