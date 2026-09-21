#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { LLMProvider, ResearchProvider } from '@trao/shared';
import { BatchEvaluator } from './batchEvaluator.js';
import { MockLLMProvider } from '../providers/mocks/MockLLMProvider.js';
import { MockResearchProvider } from '../providers/mocks/MockResearchProvider.js';
import { GeminiLLMProvider } from '../providers/llm/GeminiLLMProvider.js';
import { DuckDuckGoHtmlSearchProvider } from '../providers/research/DuckDuckGoHtmlSearchProvider.js';

// Load environment variables from .env
dotenv.config();

interface CliArgs {
  inputPath: string;
  outputPath: string;
  isLive: boolean;
}

export function parseCliArgs(args: string[]): CliArgs {
  let inputPath = '';
  let outputPath = '';
  let isLive = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--input' || arg === '-i') {
      inputPath = args[i + 1] || '';
      i++;
    } else if (arg.startsWith('--input=')) {
      inputPath = arg.slice('--input='.length);
    } else if (arg === '--output' || arg === '-o') {
      outputPath = args[i + 1] || '';
      i++;
    } else if (arg.startsWith('--output=')) {
      outputPath = arg.slice('--output='.length);
    } else if (arg === '--live') {
      isLive = true;
    }
  }

  return { inputPath, outputPath, isLive };
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { inputPath, outputPath, isLive } = parseCliArgs(argv);

  if (!inputPath || !outputPath) {
    console.error('Usage: npm run evaluate -- --input <cases.json> --output <kits.json> [--live]');
    return 1;
  }

  const resolvedInput = path.resolve(process.cwd(), inputPath);
  const resolvedOutput = path.resolve(process.cwd(), outputPath);

  if (!fs.existsSync(resolvedInput)) {
    console.error(`Error: Input file not found at: ${resolvedInput}`);
    return 1;
  }

  let rawCases: unknown[];
  try {
    const rawContent = fs.readFileSync(resolvedInput, 'utf-8');
    rawCases = JSON.parse(rawContent);
  } catch (err: any) {
    console.error(`Error: Failed to parse input JSON: ${err.message}`);
    return 1;
  }

  if (!Array.isArray(rawCases)) {
    console.error('Error: Input file must contain a top-level JSON array of cases.');
    return 1;
  }

  console.log(`[Evaluate CLI] Loaded ${rawCases.length} cases from ${inputPath}`);
  console.log(`[Evaluate CLI] Mode: ${isLive ? 'LIVE (Real external APIs)' : 'DETERMINISTIC (Mock providers)'}`);

  // Setup providers
  let llmProvider: LLMProvider;
  let researchProvider: ResearchProvider;

  if (isLive) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('Error: GEMINI_API_KEY environment variable is required for live mode.');
      return 1;
    }
    llmProvider = new GeminiLLMProvider({ apiKey });
    researchProvider = new DuckDuckGoHtmlSearchProvider();
  } else {
    const mockLlm = new MockLLMProvider();
    mockLlm.generateStructured = (async (req: any): Promise<any> => {
      if (req.schemaName === 'ExtractionOutput') {
        return {
          roleTitle: 'Software Engineer',
          seniority: 'Mid-Senior',
          responsibilities: ['Develop scalable systems', 'Conduct code reviews'],
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
      if (req.schemaName === 'TargetedGapQuestionsOutput') {
        return {
          questions: [
            {
              category: 'technical',
              prompt: 'Explain caching strategies for low latency.',
              answer_outline: 'Write-through, write-back, and TTL-based eviction.',
              difficulty: 2,
              requirement_ids: ['r1'],
            },
          ],
        };
      }
      if (req.schemaName === 'FlashcardsOutput') {
        return {
          flashcards: [
            {
              front: 'What is eventual consistency?',
              back: 'A consistency model where all replicas eventually converge to the same value.',
              requirement_ids: ['r1'],
            },
            {
              front: 'What is the STAR framework in interviews?',
              back: 'Situation, Task, Action taken, and Result achieved.',
              requirement_ids: ['r2'],
            },
          ],
        };
      }
      return {};
    }) as any;

    const mockResearch = new MockResearchProvider({
      mockResults: [
        {
          url: 'https://glassdoor.example.com/interview',
          title: 'Interview Experience Overview',
          snippet: 'Standard rounds including technical coding, system design, and values.',
          sourceType: 'interview_experience',
          relevance: 90,
          retrievedAt: new Date().toISOString(),
        },
      ],
    });

    llmProvider = mockLlm;
    researchProvider = mockResearch;
  }

  const allowLocalCrawl = process.env.ALLOW_LOCAL_CRAWL === 'true' || !isLive;

  const evaluator = new BatchEvaluator({
    llmProvider,
    researchProvider,
    allowLocalCrawl,
    onProgress: (current, total, result) => {
      const icon = result.status === 'ok' ? '✓' : '✗';
      console.log(`[Evaluate CLI] [${current}/${total}] ${icon} Case ${result.id} (${result.status})`);
    },
  });

  const output = await evaluator.evaluateBatch(rawCases);

  // Ensure output directory exists
  const outputDir = path.dirname(resolvedOutput);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(resolvedOutput, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`[Evaluate CLI] Output successfully written to: ${resolvedOutput}`);

  const passedCount = output.kits.filter((k) => k.status === 'ok').length;
  const failedCount = output.kits.filter((k) => k.status === 'failed').length;
  console.log(`[Evaluate CLI] Summary: ${passedCount} passed, ${failedCount} failed of ${output.kits.length} total.`);

  return 0;
}

// Direct execution (CommonJS & TSX safe)
if (process.argv[1] && process.argv[1].includes('evaluate')) {
  runCli().then((code) => {
    process.exit(code);
  });
}

