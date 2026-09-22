import cors from 'cors';

/**
 * Creates configured CORS middleware.
 * Never allows wildcard '*' when credentials/auth tokens are involved.
 */
export function configureCors() {
  const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return cors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      const normalizedOrigin = origin.trim().replace(/\/+$/, '');
      if (allowedOrigins.includes(normalizedOrigin) || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Retry-After'],
    maxAge: 86400, // 24 hours preflight cache
  });
}
