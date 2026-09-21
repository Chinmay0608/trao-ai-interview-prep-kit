import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  BatchOutputFileSchema,
  validateAppendixA,
} from '../../shared/src/index.js';
import { BatchEvaluator } from '../../server/src/cli/batchEvaluator.js';
import {
  serializeSuccessCase,
  serializeFailedCase,
  formatAppendixBOutput,
} from '../../server/src/cli/appendixBSerializer.js';
import { parseCliArgs, runCli } from '../../server/src/cli/evaluate.js';
import { MockLLMProvider } from '../../server/src/providers/mocks/MockLLMProvider.js';
import { MockResearchProvider } from '../../server/src/providers/mocks/MockResearchProvider.js';

describe('Phase 9: Batch Evaluator & CLI Test Suite', () => {
  const sampleCasesPath = path.resolve(__dirname, 'fixtures/sample-cases.json');
  const expectedAppendixBPath = path.resolve(__dirname, 'fixtures/expected-appendix-b.json');

  const createStandardMockLlm = () => {
    const mock = new MockLLMProvider();
    mock.generateStructured = async (req: any) => {
      if (req.schemaName === 'ExtractionOutput') {
        return {
          roleTitle: 'Software Engineer',
          seniority: 'Mid-Senior',
          responsibilities: ['Develop scalable systems'],
          requirements: [
            {
              id: 'r1',
              text: 'Solid understanding of algorithms and system architecture',
              kind: 'technical',
              priority: 'must',
              evidenceText: 'Strong algorithms knowledge required',
            },
            {
              id: 'r2',
              text: 'Experience with team communication and agile ceremonies',
              kind: 'behavioural',
              priority: 'must',
              evidenceText: 'Team player with good communication',
            },
          ],
        };
      }
      if (req.schemaName === 'CompanyBriefOutput') {
        return {
          summary: 'A leading technology organization providing reliable cloud systems.',
          what_they_do: 'Enterprise platform infrastructure and services.',
          sources: ['https://example.com/about'],
        };
      }
      if (req.schemaName === 'InitialQuestionsOutput') {
        return {
          questions: [
            {
              category: 'technical',
              prompt: 'Explain the principles of high-throughput distributed architectures.',
              answer_outline: 'Cover load balancing, caching tiers, database replication, and eventual consistency.',
              difficulty: 3,
              requirement_ids: ['r1'],
            },
            {
              category: 'behavioural',
              prompt: 'Describe how you handle cross-functional disagreements in technical requirements.',
              answer_outline: 'Use the STAR method: Situation, Task, Action taken, Result achieved.',
              difficulty: 2,
              requirement_ids: ['r2'],
            },
          ],
        };
      }
      if (req.schemaName === 'FlashcardsOutput') {
        return {
          flashcards: [
            {
              front: 'What is eventual consistency?',
              back: 'A consistency model where all replicas converge.',
              requirement_ids: ['r1'],
            },
          ],
        };
      }
      return {};
    };
    return mock;
  };

  describe('1. CLI Argument Parsing', () => {
    it('parses --input and --output flags with spaces', () => {
      const args = parseCliArgs(['--input', 'cases.json', '--output', 'kits.json']);
      expect(args.inputPath).toBe('cases.json');
      expect(args.outputPath).toBe('kits.json');
      expect(args.isLive).toBe(false);
    });

    it('parses --input= and --output= flags with equals', () => {
      const args = parseCliArgs(['--input=my-cases.json', '--output=my-kits.json', '--live']);
      expect(args.inputPath).toBe('my-cases.json');
      expect(args.outputPath).toBe('my-kits.json');
      expect(args.isLive).toBe(true);
    });

    it('returns exit code 1 if missing input or output', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const code = await runCli(['--input', 'only-input.json']);
      expect(code).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
      consoleSpy.mockRestore();
    });

    it('returns exit code 1 if input file does not exist', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const code = await runCli(['--input', 'non-existent-file-xyz.json', '--output', '/tmp/out.json']);
      expect(code).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Input file not found'));
      consoleSpy.mockRestore();
    });
  });

  describe('2. Appendix B Serializer Boundary', () => {
    it('serializes a success case strictly conforming to Appendix A and strips _meta', () => {
      const rawKitWithMeta: any = {
        _id: 'mongo-id-12345',
        __v: 0,
        source: {
          company: 'Acme',
          company_url: 'https://acme.example.com',
          role: 'Backend Engineer',
          location: 'Remote',
          jd_chars: 500,
          researched_at: '2026-09-21T10:00:00Z',
          pages_used: [],
        },
        company_brief: {
          summary: 'Acme brief',
          what_they_do: 'Cloud systems',
          sources: [],
        },
        role: {
          title: 'Backend Engineer',
          seniority: 'Senior',
          responsibilities: ['Build APIs'],
          requirements: [
            { id: 'r1', text: 'Distributed systems', kind: 'technical', priority: 'must', _meta: { origin: 'generated', pinned: false } },
          ],
        },
        questions: [
          {
            id: 'q1',
            requirement_ids: ['r1'],
            category: 'technical',
            prompt: 'Design a distributed rate limiter.',
            answer_outline: 'Token bucket or leaky bucket algorithm with Redis.',
            difficulty: 3,
            _meta: { origin: 'generated', pinned: true },
          },
        ],
        flashcards: [
          { id: 'f1', front: 'What is token bucket?', back: 'Rate limiting algorithm.', requirement_ids: ['r1'], _meta: { origin: 'generated' } },
        ],
        schedule: {
          days_available: 1,
          days: [{ day: 1, focus: 'System Design', question_ids: ['q1'], minutes: 60 }],
        },
        coverage: {
          uncovered_requirement_ids: [],
          passes: 1,
        },
      };

      const result = serializeSuccessCase('case-01', rawKitWithMeta);
      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.error).toBeNull();
        expect((result.kit as any)._id).toBeUndefined();
        expect((result.kit as any).__v).toBeUndefined();
        expect((result.kit.questions[0] as any)._meta).toBeUndefined();
        expect((result.kit.flashcards[0] as any)._meta).toBeUndefined();
        expect((result.kit.role.requirements[0] as any)._meta).toBeUndefined();
        expect(() => validateAppendixA(result.kit)).not.toThrow();
      }
    });

    it('returns a failed case if kit fails Appendix A validation', () => {
      const invalidKit: any = {
        source: { company: 'Broken' },
        // missing required sections
      };

      const result = serializeSuccessCase('case-bad', invalidKit);
      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.kit).toBeNull();
        expect(result.error.code).toBe('VALIDATION_FAILED');
      }
    });

    it('sanitizes failed case error messages against sensitive paths and mongodb URIs', () => {
      const result = serializeFailedCase(
        'case-err',
        'DB_ERROR',
        'Failed to connect to mongodb://admin:secret123@cluster.mongodb.net/prod at C:\\Users\\Administrator\\Projects\\Trao\\db.ts'
      );
      expect(result.error.message).not.toContain('secret123');
      expect(result.error.message).toContain('[REDACTED_URI]');
      expect(result.error.message).toContain('[PATH]');
    });

    it('formats Appendix B output conforming strictly to BatchOutputFileSchema', () => {
      const output = formatAppendixBOutput([
        serializeFailedCase('case-01', 'COMPANY_UNREACHABLE', 'Host was unreachable.'),
      ]);
      expect(output.version).toBe('1.0');
      expect(typeof output.generated_at).toBe('string');
      expect(() => BatchOutputFileSchema.parse(output)).not.toThrow();
    });
  });

  describe('3. Batch Execution & Fault Isolation', () => {
    it('processes batch of cases and continues through malformed input or errors', async () => {
      const evaluator = new BatchEvaluator({
        llmProvider: createStandardMockLlm(),
        researchProvider: new MockResearchProvider(),
        allowLocalCrawl: true,
      });

      const mixedCases = [
        {
          id: 'valid-01',
          jd: 'Backend Engineer\nRequirements:\n- Strong algorithms (Required)',
          company_url: 'https://valid.example.com',
          days: 3,
        },
        {
          id: 'malformed-02',
          jd: '', // empty JD
          company_url: 'https://test.com',
          days: 5,
        },
        {
          id: 'malformed-03',
          jd: 'Valid JD string',
          company_url: '', // missing URL
          days: 5,
        },
        {
          id: 'malformed-04',
          jd: 'Valid JD string',
          company_url: 'https://test.com',
          days: -1, // invalid days
        },
        {
          id: 'valid-05',
          jd: 'Frontend Engineer\nRequirements:\n- Strong algorithms (Required)',
          company_url: 'https://valid2.example.com',
          days: 2,
        },
      ];

      const output = await evaluator.evaluateBatch(mixedCases);

      expect(output.version).toBe('1.0');
      expect(output.kits.length).toBe(5);

      // Verify ordering is preserved
      expect(output.kits[0].id).toBe('valid-01');
      expect(output.kits[0].status).toBe('ok');

      expect(output.kits[1].id).toBe('malformed-02');
      expect(output.kits[1].status).toBe('failed');
      if (output.kits[1].status === 'failed') {
        expect(output.kits[1].error.code).toBe('INVALID_JD');
      }

      expect(output.kits[2].id).toBe('malformed-03');
      expect(output.kits[2].status).toBe('failed');
      if (output.kits[2].status === 'failed') {
        expect(output.kits[2].error.code).toBe('INVALID_URL');
      }

      expect(output.kits[3].id).toBe('malformed-04');
      expect(output.kits[3].status).toBe('failed');
      if (output.kits[3].status === 'failed') {
        expect(output.kits[3].error.code).toBe('INVALID_DAYS');
      }

      expect(output.kits[4].id).toBe('valid-05');
      expect(output.kits[4].status).toBe('ok');

      // Validates against Appendix B schema
      expect(() => BatchOutputFileSchema.parse(output)).not.toThrow();
    });
  });

  describe('4. Fixture Compatibility', () => {
    it('fixture sample-cases.json is valid JSON array with required keys', () => {
      const content = fs.readFileSync(sampleCasesPath, 'utf-8');
      const cases = JSON.parse(content);
      expect(Array.isArray(cases)).toBe(true);
      expect(cases.length).toBeGreaterThanOrEqual(5);

      for (const c of cases) {
        expect(typeof c.id).toBe('string');
        expect(typeof c.jd).toBe('string');
        expect(typeof c.company_url).toBe('string');
        expect(typeof c.days).toBe('number');
      }
    });

    it('fixture expected-appendix-b.json strictly passes BatchOutputFileSchema', () => {
      const content = fs.readFileSync(expectedAppendixBPath, 'utf-8');
      const expected = JSON.parse(content);
      expect(() => BatchOutputFileSchema.parse(expected)).not.toThrow();
    });
  });
});
