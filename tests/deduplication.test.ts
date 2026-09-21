import { describe, it, expect } from 'vitest';
import {
  createDeduplicationKey,
  normalizeJobDescription,
  normalizeCompanyUrl,
} from '../shared/src/index.js';

describe('Phase 2: Deduplication Key Generation', () => {
  const baseInput = {
    jobDescription: 'Senior Backend Engineer\n\nWe need 5+ years with Node.js and distributed databases.',
    companyUrl: 'https://Acme.com/careers/',
    daysAvailable: 5,
  };

  it('generates the same key for logically identical inputs', () => {
    const key1 = createDeduplicationKey(baseInput);
    const key2 = createDeduplicationKey({
      jobDescription: '  Senior Backend Engineer \r\n\t We need 5+ years with Node.js and distributed databases.   ',
      companyUrl: 'https://acme.com/careers',
      daysAvailable: 5,
    });

    expect(key1).toBe(key2);
  });

  it('normalizes URL case, trailing slashes, and default ports', () => {
    const url1 = normalizeCompanyUrl('http://Example.com:80/about/');
    const url2 = normalizeCompanyUrl('http://example.com/about');
    expect(url1).toBe(url2);

    const https1 = normalizeCompanyUrl('https://Example.com:443/');
    const https2 = normalizeCompanyUrl('https://example.com');
    expect(https1).toBe(https2);
  });

  it('normalizes whitespace in job descriptions', () => {
    const norm1 = normalizeJobDescription('Line 1\n\nLine 2\t\tLine 3');
    const norm2 = normalizeJobDescription('Line 1 Line 2 Line 3');
    expect(norm1).toBe(norm2);
  });

  it('produces different keys when job description changes', () => {
    const key1 = createDeduplicationKey(baseInput);
    const key2 = createDeduplicationKey({
      ...baseInput,
      jobDescription: 'Senior Frontend Engineer with React experience.',
    });

    expect(key1).not.toBe(key2);
  });

  it('produces different keys when company URL changes', () => {
    const key1 = createDeduplicationKey(baseInput);
    const key2 = createDeduplicationKey({
      ...baseInput,
      companyUrl: 'https://othercompany.example.com',
    });

    expect(key1).not.toBe(key2);
  });

  it('produces different keys when daysAvailable changes', () => {
    const key1 = createDeduplicationKey(baseInput);
    const key2 = createDeduplicationKey({
      ...baseInput,
      daysAvailable: 10,
    });

    expect(key1).not.toBe(key2);
  });
});
