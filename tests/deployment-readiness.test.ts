import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/src/app.js';
import { connectDb } from '../server/src/db/connection.js';
import { getJwtSecret } from '../server/src/auth/authService.js';
import { safeFetch } from '../server/src/services/crawler/safeHttpClient.js';
import { SsrfSecurityError } from '../server/src/services/crawler/types.js';
import { createDefaultPipelineOptions } from '../server/src/routes/kitRoutes.js';

describe('Deployment Readiness Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('1. Health Check Probes', () => {
    const app = createApp();

    it('responds with 200 ok on /health', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.uptime).toBeDefined();
    });

    it('responds with 200 ok on /api/health', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.uptime).toBeDefined();
    });
  });

  describe('2. Production Database Environment Enforcement', () => {
    it('throws explicit fatal error in production when MONGODB_URI is omitted', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.MONGODB_URI;

      await expect(connectDb()).rejects.toThrow(
        /MONGODB_URI environment variable is required in production mode/
      );
    });
  });

  describe('3. Production JWT Secret Enforcement', () => {
    it('throws fatal error in production if JWT_SECRET is missing', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;

      expect(() => getJwtSecret()).toThrow(
        /JWT_SECRET must be configured with at least 32 characters/
      );
    });

    it('throws fatal error in production if JWT_SECRET is too short (< 32 chars)', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'too-short-secret';

      expect(() => getJwtSecret()).toThrow(
        /JWT_SECRET must be configured with at least 32 characters/
      );
    });

    it('returns trimmed secret in production when valid (>= 32 chars)', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = '  this_is_a_sufficiently_long_production_secret_32_chars!  ';

      expect(getJwtSecret()).toBe('this_is_a_sufficiently_long_production_secret_32_chars!');
    });
  });

  describe('4. Production SSRF / Crawler Hardening', () => {
    it('strictly forbids local crawl in production even if ALLOW_LOCAL_CRAWL is true', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_LOCAL_CRAWL = 'true';

      await expect(
        safeFetch('http://127.0.0.1:8099/fixture', { allowLocal: true })
      ).rejects.toThrow(SsrfSecurityError);
    });
  });

  describe('5. Production LLM Key Requirement', () => {
    it('throws clear configuration error in production when no valid LLM key is configured', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.GROQ_API_KEY;
      delete process.env.GROQ_API_KEY_2;
      delete process.env.LLM_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.LLM_PROVIDER;

      expect(() => createDefaultPipelineOptions()).toThrow(
        /Fatal: No valid LLM API key configured in production mode/
      );
    });
  });

  describe('6. CORS Normalization', () => {
    it('permits origin with trailing slash when configured without slash', async () => {
      process.env.NODE_ENV = 'production';
      process.env.CLIENT_URL = 'https://my-app.vercel.app';
      const app = createApp();

      const res = await request(app)
        .options('/api/auth/login')
        .set('Origin', 'https://my-app.vercel.app/')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.headers['access-control-allow-origin']).toBe('https://my-app.vercel.app/');
    });
  });
});
