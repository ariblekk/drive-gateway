import { z } from "zod";

const envSchema = z
  .object({
    ADMIN_EMAIL: z.string().min(1, "ADMIN_EMAIL is required"),
    ADMIN_PASSWORD: z.string().optional(),
    ADMIN_PASSWORD_HASH: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
    GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
    GOOGLE_REDIRECT_URI: z
      .string()
      .url("GOOGLE_REDIRECT_URI must be a valid URL"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    COOKIE_SECURE: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.enum(["0", "1"]).optional(),
    ),
    STORAGE_DIR: z.string().default("./data"),
    DATABASE_PATH: z.string().default("./data/gateway.db"),
    ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY is required"),
    ACCOUNT_SELECTION_STRATEGY: z
      .enum(["quota", "round_robin"])
      .default("quota"),
    MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(50 * 1024 * 1024),
    S3_REGION: z.string().default("us-east-1"),
    S3_MAX_PUT_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(1024 * 1024 * 1024),
    S3_ALLOW_PRIVATE_ENDPOINTS: z.coerce
      .number()
      .int()
      .min(0)
      .max(1)
      .default(0),
    TRUST_PROXY: z.coerce.number().int().min(0).max(1).default(0),
    LOGIN_MAX_PER_IP: z.coerce.number().int().positive().default(5),
    LOGIN_MAX_PER_EMAIL: z.coerce.number().int().positive().default(20),
    LOGIN_WINDOW_MINUTES: z.coerce.number().int().positive().default(1),
    ADMIN_PASSWORD_MAX_ATTEMPTS: z.coerce
      .number()
      .int()
      .positive()
      .default(5),
    API_KEY_MAX_FAILURES: z.coerce
      .number()
      .int()
      .positive()
      .default(30),
  })
  .refine(
    (env) =>
      Boolean(
        env.ADMIN_PASSWORD?.trim() || env.ADMIN_PASSWORD_HASH?.trim(),
      ),
    {
      message: "Set either ADMIN_PASSWORD or ADMIN_PASSWORD_HASH",
      path: ["ADMIN_PASSWORD"],
    },
  );

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) {
    return cached;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  cached = parsed.data;
  return cached;
}

export function getAdminEmail(): string {
  const email = process.env.ADMIN_EMAIL?.trim();

  if (!email) {
    throw new Error("ADMIN_EMAIL must be set");
  }

  return email;
}
