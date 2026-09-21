import { Request, Response, NextFunction } from 'express';
import { verifyAuthToken, AuthenticationError } from './authService.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Express middleware enforcing authentication via Bearer token (or ?token= query param for SSE).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (typeof req.query.token === 'string') {
      // Allow token in query parameter for browser EventSource / SSE connections
      token = req.query.token.trim();
    }

    if (!token) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication token is required.',
        },
      });
      return;
    }

    const payload = verifyAuthToken(token);
    req.user = {
      id: payload.userId,
      email: payload.email,
    };

    next();
  } catch (err: any) {
    if (err instanceof AuthenticationError) {
      res.status(401).json({
        error: {
          code: err.code,
          message: err.message,
        },
      });
      return;
    }

    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired authentication token.',
      },
    });
  }
}
