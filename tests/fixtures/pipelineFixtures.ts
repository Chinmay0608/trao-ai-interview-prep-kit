import { CrawlResult } from '../../server/src/services/crawler/types.js';
import { ResearchResult } from '../../shared/src/index.js';

export const realisticJobDescription = `
Senior Backend Engineer - Core Infrastructure

About the Role:
We are looking for a Senior Backend Engineer to join our Core Infrastructure team. You will lead the architecture of high-scale streaming microservices and mentor other engineers.

Responsibilities:
- Design and deploy distributed, event-driven microservices.
- Mentor junior and mid-level software engineers.
- Collaborate with product managers on system reliability.

Requirements:
- 5+ years building distributed backend systems using Node.js or Go (Required)
- Proven track record mentoring junior and mid-level engineers (Required)
- Deep experience with relational and NoSQL databases like PostgreSQL and MongoDB (Required)
- Bonus: Hands-on experience with Kubernetes and Terraform infrastructure as code (Nice to have)
`;

export const shortStubJobDescription = `
Frontend Developer needed. Must have 3+ years experience with React and TypeScript.
Bonus points for familiarity with GraphQL.
`;

export const mockCrawlResult: CrawlResult = {
  pages: [
    {
      url: 'https://acme.example.com',
      title: 'Acme Corp - Scalable Cloud Infrastructure',
      extractedText:
        'Acme builds distributed telemetry processing pipelines. We serve enterprise finance platforms with real-time analytics.',
      depth: 0,
      relevanceScore: 100,
      retrievedAt: '2026-09-21T10:00:00Z',
      contentType: 'text/html',
    },
    {
      url: 'https://acme.example.com/careers',
      title: 'Careers at Acme',
      extractedText:
        'Our engineering interview process consists of an initial technical screen, a practical take-home coding challenge, an architecture & system design round, and a behavioural values interview.',
      depth: 1,
      relevanceScore: 90,
      retrievedAt: '2026-09-21T10:00:00Z',
      contentType: 'text/html',
    },
  ],
  pagesUsed: ['https://acme.example.com', 'https://acme.example.com/careers'],
  skippedSources: [],
  hiringEvidenceFound: true,
};

export const mockResearchResults: ResearchResult[] = [
  {
    url: 'https://glassdoor.example.com/acme-interview',
    title: 'Acme Senior Backend Engineer Interview Experience',
    snippet:
      'Candidates report a 4-stage interview process: recruiter screen, take-home assessment, 1-hour system design round on distributed systems, and a team leadership interview.',
    sourceType: 'public_discussion',
    relevance: 95,
    retrievedAt: '2026-09-21T10:00:00Z',
  },
];
