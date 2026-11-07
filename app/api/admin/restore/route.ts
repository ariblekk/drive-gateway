import { connection } from "next/server";

import { handleRouteError, json } from "@/lib/api/response";
import { verifyAdminPassword } from "@/lib/auth/admin-password";
import {
  checkActionRateLimit,
  clearActionFailures,
  recordActionFailure,
} from "@/lib/auth/rate-limit";
import { restoreBackup } from "@/lib/backup";
import { GatewayError } from "@/lib/errors";

const MAX_BACKUP_BYTES = 32 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await connection();

    const rateLimit = checkActionRateLimit(request, "restore");

    if (!rateLimit.allowed) {
      throw new GatewayError(
        "too_many_attempts",
        `Too many failed attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
        429,
      );
    }

    const contentLength = Number(
      request.headers.get("content-length") ?? 0,
    );

    if (Number.isFinite(contentLength) && contentLength > MAX_BACKUP_BYTES) {
      throw new GatewayError(
        "payload_too_large",
        "Backup file is too large (max 32 MB).",
        413,
      );
    }

    // Restoring replaces credentials, so require the admin password again
    // instead of trusting the session cookie alone.
    const password = request.headers.get("x-admin-password") ?? "";

    if (!password || !verifyAdminPassword(password)) {
      recordActionFailure(request, "restore");

      throw new GatewayError(
        "invalid_password",
        "Invalid admin password",
        403,
      );
    }

    const body = (await request.json().catch(() => null)) as unknown;

    if (body === null) {
      throw new GatewayError(
        "bad_request",
        "Request body must be a valid JSON backup file.",
        400,
      );
    }

    clearActionFailures(request, "restore");

    return json(restoreBackup(body));
  } catch (error) {
    return handleRouteError(error);
  }
}
