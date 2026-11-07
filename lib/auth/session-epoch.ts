import fs from "node:fs";
import path from "node:path";

// The epoch is a small file next to the SQLite database. Bumping it
// invalidates every previously issued session token, which lets logout
// revoke stolen cookies even though sessions themselves are stateless.
function epochPath(): string {
  const storageDir = process.env.STORAGE_DIR ?? "./data";

  return path.resolve(storageDir, "session-epoch");
}

export function getSessionEpoch(): number {
  try {
    const raw = fs.readFileSync(epochPath(), "utf8").trim();
    const value = Number(raw);

    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function rotateSessionEpoch(): number {
  const next = getSessionEpoch() + 1;
  const file = epochPath();

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, String(next), { mode: 0o600 });

  return next;
}
