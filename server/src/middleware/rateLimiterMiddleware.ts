import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyPrefix?: string;
}

/**
 * In-memory sliding-window rate limiter keyed by authenticated user ID or remote IP.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const { windowMs, maxRequests, message, keyPrefix = 'rl' } = options;
  const store = new Map<string, RateLimitRecord>();

  // Periodically sweep expired entries every 60s
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }, 60_000);

  // Unref cleanup interval so it doesn't block process exit in tests
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  const middleware: any = (req: Request, res: Response, next: NextFunction): void => {
    const key = `${keyPrefix}:${req.user?.id || req.ip || req.socket.remoteAddress || 'unknown'}`;
    const now = Date.now();

    let record = store.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      store.set(key, record);
      next();
      return;
    }

    if (record.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message:
            message ||
            `Too many requests. Please wait ${retryAfterSeconds} seconds before retrying.`,
        },
      });
      return;
    }

    record.count++;
    next();
  };

  middleware.reset = () => {
    store.clear();
  };

  return middleware;
}

/**
 * Rate limiter for Auth endpoints (30 attempts per minute per IP).
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: 'auth',
  message: 'Too many authentication attempts. Please try again in 1 minute.',
});

/**
 * Rate limiter for expensive generation and regeneration endpoints
 * (15 requests per 5 minutes per user/IP).
 */
export const generationRateLimiter = createRateLimiter({
  windowMs: 300_000, // 5 minutes
  maxRequests: 15,
  keyPrefix: 'gen',
  message: 'Generation rate limit reached. Please wait before creating or regenerating kits.',
});
