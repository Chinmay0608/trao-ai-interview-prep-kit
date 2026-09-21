import dotenv from 'dotenv';
import { createApp } from './app.js';
import { connectDb } from './db/connection.js';

dotenv.config();

const app = createApp();
const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  connectDb()
    .then(() => {
      console.log('[server] Connected to MongoDB.');
      app.listen(PORT, () => {
        console.log(`[server] Server listening on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('[server] Failed to connect to database:', err);
      process.exit(1);
    });
}

export default app;
