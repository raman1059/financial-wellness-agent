/**
 * In-process sliding-window rate limiter.
 *
 * Suitable for a single-instance demo. In production, replace with
 * an Upstash Redis atomic increment or Vercel's @vercel/kv rate limiter
 * so the window is shared across all serverless instances.
 */

interface Window {
  count:     number;
  windowEnd: number;  // epoch ms
}

const store = new Map<string, Window>();

export interface RateLimitResult {
  allowed:       boolean;
  remaining:     number;
  retryAfterMs:  number;
}

/**
 * @param key       Unique key per subject (e.g. userId)
 * @param limit     Max requests allowed per window
 * @param windowMs  Window duration in milliseconds
 */
export function checkRateLimit(
  key:      string,
  limit:    number  = 20,
  windowMs: number  = 60_000,   // 1 minute default
): RateLimitResult {
  const now    = Date.now();
  const window = store.get(key);

  if (!window || now > window.windowEnd) {
    store.set(key, { count: 1, windowEnd: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (window.count >= limit) {
    return {
      allowed:      false,
      remaining:    0,
      retryAfterMs: window.windowEnd - now,
    };
  }

  window.count++;
  return { allowed: true, remaining: limit - window.count, retryAfterMs: 0 };
}
