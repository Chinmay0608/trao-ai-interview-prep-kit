import crypto from 'node:crypto';
import { URL } from 'node:url';

export interface DeduplicationInput {
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
}

/**
 * Normalizes job description text deterministically:
 * - Trims leading and trailing whitespace.
 * - Collapses consecutive whitespace characters (spaces, tabs, newlines) into a single space.
 * - Converts to lowercase.
 */
export function normalizeJobDescription(jd: string): string {
  if (!jd) return '';
  return jd
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Normalizes company URL deterministically:
 * - Trims leading and trailing whitespace.
 * - Converts to lowercase.
 * - Strips trailing slashes.
 * - Strips standard HTTP(S) default ports (:80, :443).
 */
export function normalizeCompanyUrl(url: string): string {
  if (!url) return '';
  let cleaned = url.trim().toLowerCase();

  try {
    const parsed = new URL(cleaned);
    // Remove default ports
    if ((parsed.protocol === 'http:' && parsed.port === '80') ||
        (parsed.protocol === 'https:' && parsed.port === '443')) {
      parsed.port = '';
    }
    // Reconstruct without trailing slash if path is just '/'
    let normalized = `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}`;
    // Strip trailing slash
    while (normalized.endsWith('/') && normalized.length > parsed.protocol.length + 2) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    // If not a standard URL, fallback to basic cleaning
    while (cleaned.endsWith('/')) {
      cleaned = cleaned.slice(0, -1);
    }
    return cleaned;
  }
}

/**
 * Creates a deterministic, collision-resistant SHA-256 deduplication key.
 *
 * Concatenates:
 * normalizedJD + "::TRAO_DELIM::" + normalizedUrl + "::TRAO_DELIM::" + normalizedDays
 */
export function createDeduplicationKey(input: DeduplicationInput): string {
  const normJd = normalizeJobDescription(input.jobDescription);
  const normUrl = normalizeCompanyUrl(input.companyUrl);
  const normDays = Math.max(1, Math.round(input.daysAvailable)).toString();

  const serialized = [normJd, normUrl, normDays].join('::TRAO_DELIM::');

  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}
