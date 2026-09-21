/**
 * Sanitizes sensitive credentials and secrets from error messages and logs
 * before persisting to MongoDB or returning via APIs.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return '';

  let sanitized = message
    // Google Gemini API keys (AIzaSy...)
    .replace(/AIzaSy[A-Za-z0-9_-]{33}/g, '[REDACTED_GEMINI_KEY]')
    // Tavily API keys (tvly-...)
    .replace(/tvly-[A-Za-z0-9_-]+/g, '[REDACTED_TAVILY_KEY]')
    // Specific Bearer / JWT tokens (whether standalone or inside Authorization header)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]')
    // Other Authorization schemes (e.g. Basic, Token, Key, ApiKey)
    .replace(/Authorization:\s*(Basic|Token|Key|ApiKey)\s+[^\r\n]+/gi, 'Authorization: $1 [REDACTED]')
    // URL parameters containing keys or tokens
    .replace(/([?&](?:api_?key|key|token|secret|password)=)[^&\s]+/gi, '$1[REDACTED]');

  // Enforce reasonable max length to prevent giant crawl dumps in DB
  const MAX_ERROR_LENGTH = 1500;
  if (sanitized.length > MAX_ERROR_LENGTH) {
    sanitized = sanitized.slice(0, MAX_ERROR_LENGTH) + '... [TRUNCATED]';
  }

  return sanitized;
}
