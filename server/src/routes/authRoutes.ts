import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { registerUser, loginUser } from '../auth/authService.js';
import { validateBody } from '../middleware/validationMiddleware.js';
import { authRateLimiter } from '../middleware/rateLimiterMiddleware.js';

const router = Router();

const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /api/auth/register
 * Registers a new user account.
 */
router.post(
  '/register',
  authRateLimiter,
  validateBody(RegisterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await registerUser(req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/auth/login
 * Authenticates user credentials and issues session token.
 */
router.post(
  '/login',
  authRateLimiter,
  validateBody(LoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await loginUser(req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
