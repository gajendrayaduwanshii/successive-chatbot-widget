const buckets = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 60_000;
const LIMIT = 20;
// This process-local limiter is only a basic safeguard. Use Vercel KV or Upstash
// for production-grade distributed rate limiting across serverless instances.
export function rateLimit(key: string) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) {
    buckets.set(key, { count: 1, reset: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= LIMIT,
    retryAfter: Math.ceil((bucket.reset - now) / 1000),
  };
}
