import { connection } from "next/server";

import { handleRouteError, json } from "@/lib/api/response";
import { verifyAdminPassword } from "@/lib/auth/admin-password";
import {
  checkActionRateLimit,
  clearActionFailures,
  recordActionFailure,
} from "@/lib/auth/rate-limit";
import { createBackup } from "@/lib/backup";
import { GatewayError } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    await connection();

    const rateLimit = checkActionRateLimit(request, "backup");

    if (!rateLimit.allowed) {
      throw new GatewayError(
        "too_many_attempts",
        `Too many failed attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
        429,
      );
    }

    const body = (await request.json().catch(() => null)) as {
      password?: unknown;
    } | null;
    const password = typeof body?.password === "string" ? body.password : "";

    if (!password || !verifyAdminPassword(password)) {
      recordActionFailure(request, "backup");

      throw new GatewayError(
        "invalid_password",
        "Invalid admin password",
        403,
      );
    }

    clearActionFailures(request, "backup");

    const backup = createBackup();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `drive-gateway-credentials-${timestamp}.json`;

    return json(backup, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
