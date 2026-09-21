import express, { Express } from 'express';
import { configureCors } from './middleware/corsConfig.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import kitRoutes from './routes/kitRoutes.js';
import jobRoutes from './routes/jobRoutes.js';

/**
 * Creates and configures the Express application.
 */
export function createApp(): Express {
  const app = express();

  // 1. Security & CORS configuration
  app.use(configureCors());

  // 2. Request body size limits (prevents payload-based denial of service)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 3. Health check endpoint
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 4. API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/kits', kitRoutes);
  app.use('/api/jobs', jobRoutes);

  // 5. Centralized Error Handler (must be last)
  app.use(errorHandler);

  return app;
}
