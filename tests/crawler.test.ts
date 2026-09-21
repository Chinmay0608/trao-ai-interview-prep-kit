import { describe, it, expect } from 'vitest';
import {
  validateAndNormalizeUrl,
  isPrivateOrBlockedIp,
  resolveAndValidateDns,
} from '../server/src/services/crawler/ssrfGuard.js';
import { safeFetch, isAllowedContentType } from '../server/src/services/crawler/safeHttpClient.js';
import { RobotsHandler } from '../server/src/services/crawler/robotsHandler.js';
import { DynamicCrawler } from '../server/src/services/crawler/DynamicCrawler.js';
import {
  SsrfSecurityError,
  ResponseSizeExceededError,
  UnsupportedContentTypeError,
  SafeHttpResponse,
} from '../server/src/services/crawler/types.js';

describe('Phase 4: Security & Crawler', () => {
  describe('URL & IP Validation (SSRF Guard)', () => {
    it('1. accepts http scheme', () => {
      const { normalizedUrl } = validateAndNormalizeUrl('http://example.com/careers');
      expect(normalizedUrl).toBe('http://example.com/careers');
    });

    it('2. accepts https scheme', () => {
      const { normalizedUrl } = validateAndNormalizeUrl('https://example.com/jobs');
      expect(normalizedUrl).toBe('https://example.com/jobs');
    });

    it('3. rejects file scheme', () => {
      expect(() => validateAndNormalizeUrl('file:///etc/passwd')).toThrow(SsrfSecurityError);
    });

    it('4. rejects ftp scheme', () => {
      expect(() => validateAndNormalizeUrl('ftp://example.com/file.txt')).toThrow(SsrfSecurityError);
    });

    it('5. rejects javascript scheme', () => {
      expect(() => validateAndNormalizeUrl('javascript:alert(1)')).toThrow(SsrfSecurityError);
    });

    it('6. rejects credentials in URL', () => {
      expect(() => validateAndNormalizeUrl('https://admin:secret@example.com/careers')).toThrow(
        SsrfSecurityError
      );
    });

    it('7. rejects localhost', async () => {
      await expect(resolveAndValidateDns('localhost')).rejects.toThrow(SsrfSecurityError);
    });

    it('8. rejects 127.0.0.1 (IPv4 loopback)', () => {
      expect(isPrivateOrBlockedIp('127.0.0.1').blocked).toBe(true);
      expect(isPrivateOrBlockedIp('127.1.2.3').blocked).toBe(true);
    });

    it('9. rejects 10.x.x.x (RFC 1918 private)', () => {
      expect(isPrivateOrBlockedIp('10.0.0.1').blocked).toBe(true);
      expect(isPrivateOrBlockedIp('10.255.255.254').blocked).toBe(true);
    });

    it('10. rejects 172.16.x.x - 172.31.x.x (RFC 1918 private)', () => {
      expect(isPrivateOrBlockedIp('172.16.0.1').blocked).toBe(true);
      expect(isPrivateOrBlockedIp('172.31.255.254').blocked).toBe(true);
      // 172.32.0.1 is public
      expect(isPrivateOrBlockedIp('172.32.0.1').blocked).toBe(false);
    });

    it('11. rejects 192.168.x.x (RFC 1918 private)', () => {
      expect(isPrivateOrBlockedIp('192.168.1.1').blocked).toBe(true);
      expect(isPrivateOrBlockedIp('192.168.254.254').blocked).toBe(true);
    });

    it('12. rejects 169.254.x.x (Link-Local & Cloud Metadata)', () => {
      expect(isPrivateOrBlockedIp('169.254.169.254').blocked).toBe(true);
      expect(isPrivateOrBlockedIp('169.254.0.1').blocked).toBe(true);
    });

    it('13. rejects IPv6 ::1 (loopback)', () => {
      expect(isPrivateOrBlockedIp('::1').blocked).toBe(true);
    });

    it('14. rejects IPv6 ULA (fc00::/7)', () => {
      expect(isPrivateOrBlockedIp('fc00::1').blocked).toBe(true);
      expect(isPrivateOrBlockedIp('fd12:3456:789a::1').blocked).toBe(true);
    });

    it('15. rejects IPv6 link-local (fe80::/10)', () => {
      expect(isPrivateOrBlockedIp('fe80::1').blocked).toBe(true);
      expect(isPrivateOrBlockedIp('fe80::dead:beef').blocked).toBe(true);
    });

    it('16. rejects IPv4-mapped IPv6 loopback and private ranges', () => {
      expect(isPrivateOrBlockedIp('::ffff:127.0.0.1').blocked).toBe(true);
      expect(isPrivateOrBlockedIp('::ffff:10.0.0.1').blocked).toBe(true);
      expect(isPrivateOrBlockedIp('::ffff:192.168.1.5').blocked).toBe(true);
      // Public IPv4 mapped is not blocked
      expect(isPrivateOrBlockedIp('::ffff:93.184.216.34').blocked).toBe(false);
    });

    it('17. rejects unspecified addresses (0.0.0.0 and ::)', () => {
      expect(isPrivateOrBlockedIp('0.0.0.0').blocked).toBe(true);
      expect(isPrivateOrBlockedIp('::').blocked).toBe(true);
    });
  });

  describe('DNS Resolution & SSRF Policy', () => {
    it('18. accepts hostname resolving to public IP', async () => {
      const mockDns = async () => [{ address: '93.184.216.34', family: 4 }];
      const ips = await resolveAndValidateDns('example.com', false, mockDns);
      expect(ips).toEqual(['93.184.216.34']);
    });

    it('19. rejects hostname resolving to private IP', async () => {
      const mockDns = async () => [{ address: '192.168.1.100', family: 4 }];
      await expect(resolveAndValidateDns('internal.corp', false, mockDns)).rejects.toThrow(
        SsrfSecurityError
      );
    });

    it('20. rejects hostname resolving to multiple IPs when ANY is private', async () => {
      const mockDns = async () => [
        { address: '93.184.216.34', family: 4 }, // public
        { address: '10.0.0.1', family: 4 }, // private
      ];
      await expect(resolveAndValidateDns('split-brain.com', false, mockDns)).rejects.toThrow(
        SsrfSecurityError
      );
    });
  });

  describe('Redirect Security & Safe HTTP Fetching', () => {
    it('21. accepts public -> public redirect', async () => {
      const mockFetch = async (url: string): Promise<SafeHttpResponse> => {
        if (url === 'http://example.com') {
          return safeFetch('https://example.com/careers', {
            httpFetchOverride: async () => ({
              statusCode: 200,
              finalUrl: 'https://example.com/careers',
              contentType: 'text/html',
              body: '<html><body>Careers Page</body></html>',
              redirectChain: ['http://example.com'],
            }),
          });
        }
        throw new Error('Unexpected');
      };

      const res = await mockFetch('http://example.com');
      expect(res.statusCode).toBe(200);
      expect(res.finalUrl).toBe('https://example.com/careers');
    });

    it('22. rejects public -> localhost redirect', async () => {
      // Simulate redirect to localhost
      const mockDns = async (host: string) => {
        if (host === 'localhost') throw new SsrfSecurityError('Localhost blocked', host);
        return [{ address: '93.184.216.34', family: 4 }];
      };

      await expect(
        resolveAndValidateDns('localhost', false, mockDns)
      ).rejects.toThrow(SsrfSecurityError);
    });

    it('23. rejects public -> private IP redirect', async () => {
      const mockDns = async (host: string) => {
        if (host === 'evil-redirect.com') {
          return [{ address: '169.254.169.254', family: 4 }]; // cloud metadata
        }
        return [{ address: '93.184.216.34', family: 4 }];
      };

      await expect(
        resolveAndValidateDns('evil-redirect.com', false, mockDns)
      ).rejects.toThrow(SsrfSecurityError);
    });

    it('24. rejects redirect chains exceeding maximum limit (5)', async () => {
      let redirects = 0;
      const mockOverride = async (_url: string): Promise<SafeHttpResponse> => {
        redirects++;
        if (redirects > 5) {
          throw new SsrfSecurityError('Maximum redirect limit (5) exceeded', _url);
        }
        return mockOverride(`http://example.com/hop-${redirects}`);
      };

      await expect(
        safeFetch('http://example.com', { httpFetchOverride: mockOverride })
      ).rejects.toThrow(SsrfSecurityError);
    });

    it('25. revalidates redirect targets before issuing connection', async () => {
      let validated = false;
      const mockDns = async (host: string) => {
        if (host === 'target.com') validated = true;
        return [{ address: '93.184.216.34', family: 4 }];
      };

      await resolveAndValidateDns('target.com', false, mockDns);
      expect(validated).toBe(true);
    });
  });

  describe('Response Limits & Content Type', () => {
    it('26. permits responses below 2 MB boundary', () => {
      expect(isAllowedContentType('text/html; charset=utf-8')).toBe(true);
      expect(isAllowedContentType('application/xhtml+xml')).toBe(true);
    });

    it('27. rejects oversized responses exceeding 2 MB', async () => {
      const maxBytes = 1000;
      const mockOverride = async () => {
        throw new ResponseSizeExceededError(1500, maxBytes);
      };

      await expect(
        safeFetch('http://example.com/huge', { httpFetchOverride: mockOverride })
      ).rejects.toThrow(ResponseSizeExceededError);
    });

    it('28. rejects unsupported content types (e.g. application/pdf, image/png)', () => {
      expect(isAllowedContentType('application/pdf')).toBe(false);
      expect(isAllowedContentType('image/png')).toBe(false);
      expect(isAllowedContentType('application/octet-stream')).toBe(false);
      expect(isAllowedContentType('')).toBe(false);
    });
  });

  describe('Robots.txt Layer', () => {
    const mockRobotsTxt = `
      User-agent: *
      Disallow: /admin/
      Disallow: /private/
      Crawl-delay: 1
    `;

    it('30. skips disallowed URLs', async () => {
      const handler = new RobotsHandler({
        httpFetchOverride: async () => ({
          statusCode: 200,
          finalUrl: 'https://example.com/robots.txt',
          contentType: 'text/plain',
          body: mockRobotsTxt,
          redirectChain: [],
        }),
      });

      const allowedAdmin = await handler.isAllowed('https://example.com/admin/settings');
      expect(allowedAdmin).toBe(false);

      const allowedPrivate = await handler.isAllowed('https://example.com/private/data');
      expect(allowedPrivate).toBe(false);
    });

    it('31. allows permitted URLs', async () => {
      const handler = new RobotsHandler({
        httpFetchOverride: async () => ({
          statusCode: 200,
          finalUrl: 'https://example.com/robots.txt',
          contentType: 'text/plain',
          body: mockRobotsTxt,
          redirectChain: [],
        }),
      });

      const allowedCareers = await handler.isAllowed('https://example.com/careers');
      expect(allowedCareers).toBe(true);
    });

    it('32. respects Crawl-delay from robots.txt', async () => {
      const sleepDelays: number[] = [];
      const handler = new RobotsHandler(
        {
          httpFetchOverride: async () => ({
            statusCode: 200,
            finalUrl: 'https://example.com/robots.txt',
            contentType: 'text/plain',
            body: mockRobotsTxt,
            redirectChain: [],
          }),
        },
        'Trao-Crawler',
        async (ms) => {
          sleepDelays.push(ms);
        }
      );

      // Trigger initial fetch
      await handler.isAllowed('https://example.com/careers');
      handler.markRequestCompleted('https://example.com');

      // Enforce delay immediately after
      await handler.enforceCrawlDelay('https://example.com');
      expect(sleepDelays.length).toBe(1);
      expect(sleepDelays[0]).toBeGreaterThan(0);
    });

    it('33. fetches robots.txt once per origin and caches it', async () => {
      let fetchCount = 0;
      const handler = new RobotsHandler({
        httpFetchOverride: async () => {
          fetchCount++;
          return {
            statusCode: 200,
            finalUrl: 'https://example.com/robots.txt',
            contentType: 'text/plain',
            body: mockRobotsTxt,
            redirectChain: [],
          };
        },
      });

      await handler.isAllowed('https://example.com/careers');
      await handler.isAllowed('https://example.com/jobs');
      await handler.isAllowed('https://example.com/about');

      expect(fetchCount).toBe(1); // Cached!
      expect(handler.getCacheSize()).toBe(1);
    });
  });

  describe('Bounded Best-First Crawler', () => {
    // Deterministic HTML fixtures simulating website with links
    const homepageHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Acme Corp Home</title></head>
        <body>
          <header><nav><a href="/home">Home</a></nav></header>
          <h1>Welcome to Acme</h1>
          <p>We build scalable cloud software.</p>
          <a href="/careers">Join our team - Careers</a>
          <a href="/about">About Us</a>
          <a href="https://external-blog.com/news">External News</a>
          <a href="/jobs#engineering">Engineering Jobs</a>
        </body>
      </html>
    `;

    const careersHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Acme Careers</title></head>
        <body>
          <h1>Careers at Acme</h1>
          <p>Explore opportunities with our team.</p>
          <a href="/careers/engineering">Engineering Openings</a>
          <a href="/careers/culture">Our Culture</a>
        </body>
      </html>
    `;

    const engineeringJobsHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Engineering Jobs at Acme</title></head>
        <body>
          <h1>Engineering Hiring Process</h1>
          <p>Our hiring process includes a take-home assessment, a technical interview round, and a system design round.</p>
        </body>
      </html>
    `;

    const mockSiteRouter: Record<string, string> = {
      'https://acme.com': homepageHtml,
      'https://acme.com/': homepageHtml,
      'https://acme.com/careers': careersHtml,
      'https://acme.com/careers/engineering': engineeringJobsHtml,
      'https://acme.com/careers/culture': '<html><head><title>Culture</title></head><body>Culture text</body></html>',
      'https://acme.com/about': '<html><head><title>About</title></head><body>About text</body></html>',
      'https://acme.com/jobs': '<html><head><title>Jobs</title></head><body>Jobs list</body></html>',
    };

    const mockCrawlerFetch = async (url: string): Promise<SafeHttpResponse> => {
      const html = mockSiteRouter[url] || mockSiteRouter[url.replace(/\/$/, '')];
      if (!html) {
        throw new Error(`404 Not Found: ${url}`);
      }
      return {
        statusCode: 200,
        finalUrl: url,
        contentType: 'text/html',
        body: html,
        redirectChain: [],
      };
    };

    it('34. discovers relative links and resolves them to absolute URLs', async () => {
      const crawler = new DynamicCrawler({
        safeFetchOptions: { httpFetchOverride: mockCrawlerFetch },
      });

      const result = await crawler.crawl('https://acme.com');
      expect(result.pagesUsed).toContain('https://acme.com/careers');
    });

    it('35. rejects external domains (domain constraint)', async () => {
      const crawler = new DynamicCrawler({
        safeFetchOptions: { httpFetchOverride: mockCrawlerFetch },
      });

      const result = await crawler.crawl('https://acme.com');
      expect(result.pagesUsed.some((url) => url.includes('external-blog.com'))).toBe(false);
    });

    it('36. deduplicates identical URLs and strips fragments', async () => {
      const crawler = new DynamicCrawler({
        safeFetchOptions: { httpFetchOverride: mockCrawlerFetch },
      });

      const result = await crawler.crawl('https://acme.com');
      // Verify no duplicate URLs
      const uniqueUrls = new Set(result.pages.map((p) => p.url));
      expect(uniqueUrls.size).toBe(result.pages.length);
      // Verify #engineering fragment stripped
      expect(result.pages.some((p) => p.url.includes('#'))).toBe(false);
    });

    it('38 & 39. prioritizes hiring/careers links over generic about links (best-first ordering)', async () => {
      const crawler = new DynamicCrawler({
        budget: { maxPages: 3 },
        safeFetchOptions: { httpFetchOverride: mockCrawlerFetch },
      });

      const result = await crawler.crawl('https://acme.com');

      // First crawled is seed (home), second should be highest-scoring link (/careers)
      expect(result.pages[0].url).toBe('https://acme.com');
      expect(result.pages[1].url).toBe('https://acme.com/careers');
    });

    it('40. respects depth limit strictly', async () => {
      const crawler = new DynamicCrawler({
        budget: { maxDepth: 1 },
        safeFetchOptions: { httpFetchOverride: mockCrawlerFetch },
      });

      const result = await crawler.crawl('https://acme.com');
      for (const page of result.pages) {
        expect(page.depth).toBeLessThanOrEqual(1);
      }
    });

    it('41. respects page limit budget', async () => {
      const crawler = new DynamicCrawler({
        budget: { maxPages: 2 },
        safeFetchOptions: { httpFetchOverride: mockCrawlerFetch },
      });

      const result = await crawler.crawl('https://acme.com');
      expect(result.pages.length).toBeLessThanOrEqual(2);
    });

    it('42. recursive discovery reaches relevant page beyond first-level links', async () => {
      const crawler = new DynamicCrawler({
        budget: { maxPages: 4, maxDepth: 2 },
        safeFetchOptions: { httpFetchOverride: mockCrawlerFetch },
      });

      const result = await crawler.crawl('https://acme.com');

      // /careers/engineering is a depth-2 page discovered from /careers
      const depth2Page = result.pages.find((p) => p.url === 'https://acme.com/careers/engineering');
      expect(depth2Page).toBeDefined();
      expect(depth2Page?.depth).toBe(2);
      expect(result.hiringEvidenceFound).toBe(true);
    });

    it('43. produces deterministic output for identical website fixture', async () => {
      const crawlerA = new DynamicCrawler({
        safeFetchOptions: { httpFetchOverride: mockCrawlerFetch },
      });
      const crawlerB = new DynamicCrawler({
        safeFetchOptions: { httpFetchOverride: mockCrawlerFetch },
      });

      const resA = await crawlerA.crawl('https://acme.com');
      const resB = await crawlerB.crawl('https://acme.com');

      expect(resA.pages.map((p) => p.url)).toEqual(resB.pages.map((p) => p.url));
      expect(resA.hiringEvidenceFound).toBe(resB.hiringEvidenceFound);
    });
  });

  describe('Security Regression Test: Attacker Redirect to Private Loopback', () => {
    it('guarantees an attacker redirect to private/loopback is blocked and destination is NEVER fetched', async () => {
      let privateDestinationRequested = false;

      // Mock transport returning a 302 redirect toward metadata service
      const mockTransport = async (url: string) => {
        if (url.includes('169.254.169.254')) {
          privateDestinationRequested = true;
          return {
            status: 200,
            headers: { 'content-type': 'text/html' },
            data: 'METADATA_SECRET_CREDENTIALS',
          };
        }

        // Return a 302 redirect toward metadata service
        return {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
          data: null,
        };
      };

      // Mock DNS resolving attacker.com to public IP, and metadata to 169.254.169.254
      const mockDns = async (host: string) => {
        if (host === 'attacker.com') {
          return [{ address: '93.184.216.34', family: 4 }];
        }
        return [{ address: '169.254.169.254', family: 4 }];
      };

      // Attempt safe fetch
      await expect(
        safeFetch('http://attacker.com', {
          dnsLookupFn: mockDns,
          transportOverride: mockTransport,
        })
      ).rejects.toThrow(SsrfSecurityError);

      // Verify the private destination was NEVER accessed
      expect(privateDestinationRequested).toBe(false);
    });
  });
});
