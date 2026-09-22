import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

import { createApp } from './app.js';
import { connectDb, disconnectDb } from './db/connection.js';

const app = createApp();
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

if (process.env.NODE_ENV !== 'test') {
  connectDb()
    .then(() => {
      console.log('[server] Connected to MongoDB.');
      const server = app.listen(PORT, HOST, () => {
        console.log(`[server] Server listening on ${HOST}:${PORT}`);
      });

      const gracefulShutdown = (signal: string) => {
        console.log(`[server] Received ${signal}. Initiating graceful shutdown...`);
        server.close(async () => {
          console.log('[server] HTTP server closed.');
          try {
            await disconnectDb();
            console.log('[server] Database disconnected cleanly.');
            process.exit(0);
          } catch (dbErr) {
            console.error('[server] Error during database disconnect:', dbErr);
            process.exit(1);
          }
        });

        // Force shutdown if connections do not close within 10 seconds
        setTimeout(() => {
          console.error('[server] Graceful shutdown timed out. Forcing exit.');
          process.exit(1);
        }, 10000).unref();
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    })
    .catch((err) => {
      console.error('[server] Failed to connect to database:', err);
      process.exit(1);
    });
}

export default app;
