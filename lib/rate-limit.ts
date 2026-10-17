// Best-effort per-IP rate limiting, in-memory only.
// LIMITATION: counters reset on redeploy/cold start and are per-instance,
// so this is a guard against casual abuse, not a hard guarantee. For a
// production-hardened limit, move this to Vercel KV / Upstash Redis.

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  // Drop entries older than the window.
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= max) return false; // over the limit
  bucket.timestamps.push(now);
  return true;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

const HOUR_MS = 60 * 60 * 1000;

export function uploadAllowed(ip: string): boolean {
  return hit(`upload:${ip}`, 5, HOUR_MS);
}

export function tutorAllowed(ip: string): boolean {
  return hit(`tutor:${ip}`, 30, HOUR_MS);
}
