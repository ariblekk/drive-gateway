const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) {
    return "Unlimited";
  }

  if (bytes === 0) {
    return "0 B";
  }

  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    UNITS.length - 1,
  );
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${UNITS[exponent]}`;
}

export function formatDate(value: number | null | undefined): string {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString();
}

export function formatRelativeTime(value: number | null | undefined): string {
  if (!value) {
    return "—";
  }

  const seconds = Math.round((Date.now() - value) / 1000);

  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);

  return `${days}d ago`;
}

export function quotaPercent(
  limit: number | null,
  usage: number,
): number | null {
  if (limit === null) {
    return null;
  }

  if (limit <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((usage / limit) * 100)));
}
