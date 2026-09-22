# AI Interview Prep Kit

> **TRAO Engineering Assessment Submission**  
> **Document Type:** `ENGINEERING_ASSESSMENT`  
> **Assessment ID:** `FS-AI-INTERVIEW-01`  
> **AI Use Disclosure:** `assistive-permitted` (Used assistively for code structuring, testing acceleration, and refinement)  
> **Repository:** [https://github.com/Chinmay0608/trao-ai-interview-prep-kit](https://github.com/Chinmay0608/trao-ai-interview-prep-kit)

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Tech Stack & Justification](#2-tech-stack--justification)
3. [System Architecture](#3-system-architecture)
4. [Local Setup Instructions](#4-local-setup-instructions)
5. [Deployed Setup / Production URLs](#5-deployed-setup--production-urls)
6. [Batch Evaluation CLI](#6-batch-evaluation-cli)
7. [LLM Provider & Exact Model Configuration](#7-llm-provider--exact-model-configuration)
8. [Retrieval Approach & Grounding Sources](#8-retrieval-approach--grounding-sources)
9. [Research & Generation Sequencing](#9-research--generation-sequencing)
10. [Pipeline Step Breakdown](#10-pipeline-step-breakdown)
11. [State Representation: Generated, Edited & Pinned Items](#11-state-representation-generated-edited--pinned-items)
12. [Deterministic Schedule Allocation Logic](#12-deterministic-schedule-allocation-logic)
13. [Creative Features](#13-creative-features)
14. [Key Design Decisions](#14-key-design-decisions)
15. [Engineering Trade-offs](#15-engineering-trade-offs)
16. [Known Limitations](#16-known-limitations)
17. [Verification & Test Results](#17-verification--test-results)

---

## 1. Project Overview

The **AI Interview Prep Kit** is an end-to-end, production-ready system that transforms three basic user inputs:
1. **Job Description (JD)** (plain text, 100 – 50,000 characters)
2. **Company Website URL** (target employer domain)
3. **Days Available** (positive integer representing prep timeline: $1 \le N \le 60$)

into a structured, personalized, evidence-grounded interview preparation suite comprising:
- **Evidence-Grounded Role Requirements**: Technical, behavioural, and domain competencies linked to verbatim excerpts from the job description.
- **Factual Company Research**: Zero-hallucination company intelligence synthesized from bounded web crawling and public interview benchmarks.
- **Comprehensive Interview Question Bank**: Multi-category questions (technical, behavioural, system design, company fit) with explicit evaluation criteria and model answer outlines.
- **Deterministic Requirement Coverage**: Mathematical guarantee that 100% of must-have role requirements are addressed, backed by a second-pass gap closure engine.
- **Active-Recall Flashcards**: Concept and scenario flashcards directly mapped to question and requirement IDs.
- **Deterministic Day-by-Day Study Schedule**: Timeline allocated across exactly $N$ days with spaced repetition, difficulty weighting, and zero empty days.
- **Interactive Practice Experience**: Active recall flashcard practice mode with confidence tracking and real-time generation feedback via Server-Sent Events (SSE).

### Multi-Step Pipeline Architecture
Rather than relying on a single monolithic prompt—which suffers from hallucinations, superficial coverage, and unstructured responses—the prep kit executes an orchestrated **12-step deterministic pipeline**. LLMs are utilized strictly where language synthesis is required; all coverage calculations, scheduling allocations, scoring, deduplication, and schema serializations are performed by deterministic, verifiable TypeScript code.

---

## 2. Tech Stack & Justification

### Monorepo Layout (`package.json` workspaces)
```
trao-prep-kit-root/
├── shared/     # Shared contracts, Zod schemas, deterministic coverage & scheduler engine
├── server/     # Express API, authentication, crawler, LLM providers, pipeline orchestration
└── client/     # Next.js 15 App Router, React 19, Tailwind CSS, Lucide icons
```

### Technologies Used

| Layer | Technology | Justification |
| :--- | :--- | :--- |
| **Frontend** | **Next.js 15 (App Router)** | Modern production React framework providing optimal client/server boundary separation, fast navigation, and static asset optimization. |
| **UI Library** | **React 19 & Tailwind CSS** | Declarative state management paired with high-velocity, utility-first CSS for a cohesive, responsive developer-grade SaaS aesthetic. |
| **Icons** | **Lucide React** | Clean, lightweight icon set matching developer tool conventions (Linear/Vercel style). |
| **Backend** | **Node.js & Express** | Explicit backend API boundary offering full, granular control over authentication middleware, Server-Sent Events (SSE) streaming connections, and long-running pipeline orchestration. |
| **Database** | **MongoDB & Mongoose** | Flexible document storage natively suited for nested preparation kit structures, versioned generation jobs, and internal metadata without rigid schema migration friction. |
| **Language** | **TypeScript 5.7** | Strict end-to-end type safety across shared contracts, preventing schema drift between the frontend, backend, and evaluation CLI. |
| **AI / LLM** | **Groq (`llama-3.3-70b-versatile`)** | Production-grade reasoning, rapid token throughput, low latency, and dependable structured JSON output via genuine free-tier access. Supports **Google Gemini (`gemini-2.0-flash`)** as a pluggable alternative. |
| **Validation** | **Zod 3.24** | Runtime schema parsing and invariant validation guaranteeing strict compliance with Appendix A and Appendix B data contracts. |
| **Crawler** | **Node.js `SafeHttpClient`** | Custom secure HTTP client featuring strict SSRF defense (private IP blocklists), RFC-compliant `robots.txt` parsing, redirect validation, and HTML-to-text sanitization. |
| **Retrieval** | **DuckDuckGo HTML / Tavily** | Zero-dependency public interview intelligence search without mandatory paid API keys. |
| **Testing** | **Vitest 3.0 & RTL** | Fast, native ESM test runner executing 238 automated unit, integration, and regression tests across backend and frontend codebases. |

---

## 3. System Architecture

```
                                  ┌────────────────────────────────────────────────────────┐
                                  │                  USER / CLIENT                        │
                                  │   (Next.js 15 App Router + Tailwind CSS + Lucide)      │
                                  └───────────────┬────────────────────────▲───────────────┘
                                                  │                        │
                                       REST / JSON Requests       SSE Progress Stream
                                                  │                        │
                                  ┌───────────────▼────────────────────────┴───────────────┐
                                  │                 EXPRESS BACKEND                        │
                                  │    • JWT Auth & User Isolation (/api/auth)             │
                                  │    • Generation Job Orchestrator (/api/kits/generate)  │
                                  │    • Scoped Regeneration Service (/api/kits/:id/regen) │
                                  │    • Safe Crawl & Research Engine                      │
                                  └───────────────┬────────────────────────▲───────────────┘
                                                  │                        │
                       ┌──────────────────────────┴───────┐     ┌──────────┴──────────┐
                       │                                  │     │                     │
           ┌───────────▼───────────┐          ┌───────────▼─────▼─────┐    ┌──────────▼──────────┐
           │     EXTERNAL AI       │          │   DATABASE (MongoDB)  │    │ DETERMINISTIC ENGINE│
           │ • Groq Llama-3.3-70b  │          │ • Users Collection    │    │ • Coverage Calc     │
           │ • Gemini 2.0 Flash    │          │ • Kits Collection     │    │ • Scheduler Engine  │
           │ • DuckDuckGo Search   │          │ • Generation Jobs     │    │ • Deduplication     │
           └───────────────────────┘          └───────────────────────┘    │ • Zod Appendix A    │
                                                                           └─────────────────────┘
```

---

## 4. Local Setup Instructions

### Prerequisites
- **Node.js**: `v20.x` or higher (LTS recommended)
- **npm**: `v10.x` or higher
- **MongoDB**: Local MongoDB instance running on `mongodb://127.0.0.1:27017` OR a MongoDB Atlas connection string.
- **Groq API Key**: Genuine free-tier API key from [Groq Console](https://console.groq.com) (or Google Gemini API key from [Google AI Studio](https://aistudio.google.com)).

### 1. Clone the Repository
```bash
git clone https://github.com/Chinmay0608/trao-ai-interview-prep-kit.git
cd trao-ai-interview-prep-kit
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the sample environment file to `.env`:
```bash
cp .env.example .env
```
Edit `.env` and provide your credentials:
```env
# Server Runtime
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://127.0.0.1:27017/trao_interview_prep

# Authentication
JWT_SECRET=production_quality_super_secret_jwt_key_at_least_32_chars
JWT_EXPIRES_IN=7d

# URLs
CLIENT_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:5000/api

# LLM Provider Configuration
LLM_PROVIDER=groq
LLM_API_KEY=gsk_your_groq_api_key_here
LLM_MODEL=llama-3.3-70b-versatile

# Research Provider (DuckDuckGo requires no API key)
SEARCH_PROVIDER=duckduckgo
SEARCH_API_KEY=

# Security & Crawler Settings
ALLOW_LOCAL_CRAWL=false
```

### 4. Build All Packages
```bash
npm run build
```

### 5. Run the Application
You can run both backend and frontend concurrently:
```bash
npm run dev
```
Or run each service individually:
```bash
# Terminal 1: Backend Server (Port 5000)
npm run dev -w server

# Terminal 2: Frontend Web App (Port 3000)
npm run dev -w client
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 5. Deployed Setup / Production URLs

- **Frontend Application**: Deployed on Vercel / Cloud Container (Configured with `NEXT_PUBLIC_API_URL`).
- **Backend API Service**: Deployed on Container PaaS / Linux Host (Port 5000, connected to MongoDB Atlas).
- **Database**: MongoDB Atlas M0 Free Tier cluster.
- **Demo / Submission URL**: Accessible on local network or deployed host at `http://localhost:3000`.

To run in production mode on a server:
```bash
npm run build
npm run start -w server &
npm run start -w client
```

---

## 6. Batch Evaluation CLI

The repository includes a dedicated batch evaluation command-line interface conforming to assessment specifications.

### Command Syntax
```bash
npm run evaluate -- --input <path-to-cases.json> --output <path-to-output.json> [--live]
```

### Mode 1: Deterministic Offline Evaluation (Default)
Runs in **100% deterministic mode** using embedded fixtures, mock LLMs, and mock research providers. Guarantees bit-for-bit reproducible output and strict Appendix A compliance without network dependencies or API keys.
```bash
npm run evaluate -- --input tests/evaluation/fixtures/sample-cases.json --output tmp/test-kits.json
```
*Expected output:*
```
[Evaluate CLI] Loaded 5 cases from tests/evaluation/fixtures/sample-cases.json
[Evaluate CLI] Mode: DETERMINISTIC (Mock providers)
[Evaluate CLI] [1/5] ✓ Case case-01 (ok)
[Evaluate CLI] [2/5] ✓ Case case-02 (ok)
[Evaluate CLI] [3/5] ✓ Case case-03 (ok)
[Evaluate CLI] [4/5] ✓ Case case-04 (ok)
[Evaluate CLI] [5/5] ✓ Case case-05 (ok)
[Evaluate CLI] Output successfully written to: .../test-kits.json
[Evaluate CLI] Summary: 5 passed, 0 failed of 5 total.
```

### Mode 2: Live AI Evaluation (`--live`)
Executes the full pipeline against live LLMs (Groq / Gemini) and live web retrieval:
```bash
npm run evaluate -- --input tests/evaluation/fixtures/sample-cases.json --output tmp/test-kits.json --live
```

---

## 7. LLM Provider & Exact Model Configuration

The application is configured to use production-grade, genuine free-tier models:

- **Primary Provider**: **Groq Cloud**
  - **Exact Model**: **`llama-3.3-70b-versatile`**
  - **Configuration**: Context window: 128k tokens; temperature: `0.2` (deterministic extraction) and `0.4` (question generation); strict JSON mode (`response_format: { type: "json_object" }`).
- **Fallback / Secondary Provider**: **Google Gemini**
  - **Exact Model**: **`gemini-2.0-flash`** (or `gemini-1.5-flash`)
  - **Configuration**: Direct REST integration via `@google/genai` with structured schema enforcement.
- **Offline Evaluator Provider**: **`MockLLMProvider`**
  - Instant, hermetic execution with pre-validated question banks for testing and CI/CD pipelines.

---

## 8. Retrieval Approach & Grounding Sources

The prep kit employs a **dual-channel retrieval strategy**:

### Channel 1: Targeted Company Website Crawler
- **Bounded Best-First Traversal**: Crawls candidate pages using a priority queue biased toward career, engineering, and about pages. Max depth: 2; crawl budget: 5 pages; per-request timeout: 8,000 ms.
- **SSRF Defense (`SafeHttpClient`)**:
  - Resolves domain to IP using custom DNS lookups with `{ all: true }`.
  - Validates and blocks private, link-local, loopback, and cloud metadata ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`).
  - Blocks unsafe protocols (`ftp:`, `file:`, `gopher:`).
- **Robots.txt Adherence**: Respects `User-agent: *` disallow rules and crawl delays.
- **Honest Fallback**: If a target company blocks automated scraping (e.g. Cloudflare 403, strict robots disallow, or JavaScript SPA without static text), the crawler honestly records `pagesAttempted`, `pagesCrawled: 0`, and `blockedByRobots: 1`. It continues pipeline execution with verified JD requirements and public signals without fabricating company data.

### Channel 2: Public Interview Intelligence
- Synthesizes queries: `"<Company>" "<Role>" interview questions process technical rounds`.
- Retrieves verified public interview accounts, interview rounds, and tech stack signals using DuckDuckGo HTML search or Tavily API.
- All synthesized company briefs cite verified URLs in `sources`.

---

## 9. Research & Generation Sequencing

The pipeline follows a strict topological execution sequence where each stage consumes validated outputs from preceding stages:

```
[Job Description] ──► [Step 1: Evidence JD Extraction] ──────────────────────────┐
                                                                                  │
[Company URL]     ──► [Step 2: Company Website Crawl]   ──┐                       │
                                                          ├──► [Step 4: Brief] ───┼──► [Step 5: Initial Questions]
                      [Step 3: Public Web Research]     ──┘                       │                  │
                                                                                  │                  ▼
                                                                                  │      [Step 6: Coverage Check]
                                                                                  │                  │
                                                                                  ├──────────── (Gaps?)
                                                                                  │            ├── Yes ──► [Step 7: Gap Closure]
                                                                                  │            └── No  ──┐
                                                                                  ▼                      ▼
                                                                    [Step 8: Corrective Validation]
                                                                                  │
                                                                                  ▼
                                                                    [Step 9: Deduplication & Normalization]
                                                                                  │
                                                                                  ▼
                                                                    [Step 10: Flashcard Generation]
                                                                                  │
[Days Available]  ───────────────────────────────────────────────────────────────►[Step 11: Deterministic Scheduler]
                                                                                  │
                                                                                  ▼
                                                                    [Step 12: Strict Appendix A Serialization]
```

---

## 10. Pipeline Step Breakdown

| Step # | Stage Identifier | Purpose & Execution | Output Produced |
| :---: | :--- | :--- | :--- |
| **1** | `EXTRACTING_JD` | Extracts structured role title, seniority, responsibilities, and requirements. Every requirement is grounded by a **verbatim quote** (`evidenceText`) from the JD. | `JDExtractionResult` (requirements, priority: must/nice, evidence map). |
| **2** | `CRAWLING_SITE` | Safely crawls target company website under SSRF and robots constraints. | `CompanyCrawlResult` (scraped pages, text, crawl metrics). |
| **3** | `SEARCHING_PUBLIC_INFO` | Gathers verified public interview rounds and engineering values. | `ResearchResult[]` (snippets, titles, sources). |
| **4** | `SYNTHESIZING_BRIEF` | Synthesizes a factual, zero-hallucination company summary and interview focus. | `CompanyBrief` (`summary`, `what_they_do`, `sources`). |
| **5** | `GENERATING_QUESTIONS` | Generates candidate questions across technical, behavioural, system design, and company fit categories. | `Question[]` with category, difficulty, criteria, and requirement tags. |
| **6** | `CHECKING_COVERAGE` | Pure TypeScript calculation verifying which requirements are satisfied by the question bank. | `CoverageResult` (must-have coverage percentage, uncovered IDs). |
| **7** | `SECOND_PASS_GAP_CLOSURE` | If any must-have requirement is uncovered, executes a targeted generation prompt focused strictly on the gap requirements. | Additional targeted questions closing coverage gaps. |
| **7b**| `VALIDATING_QUESTIONS` | Validates every question against structural criteria (length, criteria count, requirement existence). Performs up to 2 corrective regeneration passes with deterministic fallbacks. | Validated, defect-free candidate questions. |
| **8** | `RECHECKING_COVERAGE` | Verifies the invariant that 100% of must-have requirements are covered. Throws `COVERAGE_GAP_UNRESOLVED` if violated. | Final verified coverage object. |
| **9** | `NORMALIZING_QUESTIONS` | Deduplicates question prompts and canonicalizes question IDs into `q-1`, `q-2`, etc. | Canonical question bank. |
| **10**| `GENERATING_FLASHCARDS` | Creates active-recall flashcard pairs (front prompt + back structured answer) mapped to questions and requirements. | `Flashcard[]` array. |
| **11**| `ALLOCATING_SCHEDULE` | Deterministically distributes questions across exactly $N$ days with spaced repetition and score-based prioritization. | `Schedule` (days 1..$N$, focus, duration, question references). |
| **12**| `VALIDATING_APPENDIX_A` | Strips internal metadata (`_meta`) and serializes through `serializeToAppendixA()`, validating against the pristine Appendix A Zod schema. | Validated `AppendixAKit` object. |

---

## 11. State Representation: Generated, Edited & Pinned Items

To deliver a production-grade user experience, the system maintains a clean separation between **internal builder metadata** and the **public Appendix A contract**.

### Internal Representation (`InternalQuestion`, `InternalRequirement`)
Every item in the database contains an internal metadata envelope:
```typescript
export type ItemOrigin = 'generated' | 'edited' | 'custom';

export interface ItemMeta {
  origin: ItemOrigin;          // Origin tracking
  pinned: boolean;             // User protection pin
  evidenceText?: string;       // Verbatim JD excerpt proving requirement exists
  sourceQuestionId?: string;   // Traceability reference
  targetRequirementId?: string;// Target requirement reference
}
```

### Scoped Regeneration Invariants
When a user regenerates questions (either by category or selected question IDs):
1. **Preservation Guarantees**:
   - Any question with `pinned === true` is **never modified or removed**.
   - Any question with `origin === 'edited'` or `origin === 'custom'` is **strictly preserved**.
   - Flashcards associated with preserved questions remain untouched.
2. **Pristine Replacement**:
   - Only pristine generated questions (`origin === 'generated' && !pinned`) matching the regeneration scope are replaced.
3. **Automatic Schedule Reconciliation**:
   - The deterministic scheduler automatically runs after regeneration, re-allocating new and preserved questions into the daily timeline.
4. **Clean Appendix A Export**:
   - When exporting JSON or returning public API responses, `serializeToAppendixA()` strips the `_meta` field, ensuring strict compliance with Appendix A schemas.

---

## 12. Deterministic Schedule Allocation Logic

The schedule allocation engine (`shared/src/engine/scheduler.ts`) is **100% deterministic**—it contains no `Math.random()`, no timestamps, and uses stable lexicographical tie-breakers.

### Mathematical & Algorithmic Guarantees
1. **Exact Days Allocated**: Always produces exactly $N$ schedule days (`daysAvailable`), whether $N=1$, $N=5$, or $N=60$.
2. **100% Must-Have Coverage**: Every must-have requirement appears in at least one day's question references.
3. **Composite Scoring & Early Prioritization**:
   Questions are sorted by a deterministic composite score:
   $$\text{Score} = (W_{\text{must}} \times 10) + (W_{\text{diff}} \times 5) + W_{\text{cat}}$$
   - Higher priority and harder questions are scheduled earlier in the timeline.
4. **Zero Empty Days**: If $N > \text{questionCount}$, questions are recycled deterministically for active recall and spaced repetition.
5. **Geometric Spaced Repetition**: For large timelines ($N \ge 14$), questions reappear at geometric review intervals ($+1, +3, +7, +14, +30$ days), marked with a `Review` flag.
6. **Realistic Integer Durations**: Each day calculates study duration in integer minutes ($30 \le \text{duration} \le 75$ min) based on question count and difficulty.

---

## 13. Creative Features

### 1. Active-Recall Flashcard Practice Mode
- **Interactive Flashcard Review**: Full-screen study mode supporting keyboard navigation (Space to reveal answer, 1–5 for confidence).
- **5-Tier Self-Assessment**: `No idea`, `Vague`, `Okay`, `Good`, and `Nailed it`.
- **Session Recap**: Summary screen displaying review stats and mastery progress.

### 2. Live SSE Streaming Generation
- **Granular 11-Step Real-Time Stepper**: Connected via Server-Sent Events (`/api/jobs/:id/events`) providing live feedback of every pipeline phase.
- **Resilient Fallback**: Automatically falls back to exponential polling if SSE connection is interrupted by network proxies.

### 3. Concurrency Versioning & Optimistic Locking
- Every kit maintains a monotonic `generationVersion` counter.
- Scoped regeneration requires passing the current client version; concurrent or stale updates trigger an HTTP `409 Conflict` with friendly state refresh, preventing data loss.

---

## 14. Key Design Decisions

1. **Evidence-Grounded Extraction**: Requirements are never accepted from LLM hallucinations; every extracted requirement must include a verbatim quotation from the raw JD.
2. **Deterministic Code Over Prompting for Logic**: Coverage calculation and scheduling are implemented as pure TypeScript functions rather than LLM prompts, eliminating nondeterminism and calculation errors.
3. **SSRF Defense-in-Depth**: Full network socket IP inspection in the custom crawler prevents malicious SSRF probes against internal network services (AWS/GCP metadata endpoints, local Redis/Mongo).
4. **Strict Monorepo Dependency Isolation**: `@trao/shared` contains zero server dependencies, allowing the client, server, and evaluator to share schemas and pure functions without bundling Node.js internals into the browser.

---

## 15. Engineering Trade-offs

| Decision | Trade-off Made | Rationale |
| :--- | :--- | :--- |
| **Custom Safe HTTP Crawler vs. Headless Browser (Puppeteer/Playwright)** | Does not execute heavy client-side JavaScript SPAs. | Massive reduction in memory footprint, zero headless browser vulnerability vectors, and deterministic sub-second request handling. |
| **Deterministic Scheduler vs. Dynamic Adaptive ML Scheduling** | Schedule is fixed upon generation rather than dynamically reshuffled each day. | Provides full visibility into the entire prep roadmap upfront, and guarantees test reproducibility and Appendix A contract compliance. |
| **Strict Appendix A Serialization vs. Relaxed Schema** | Internal fields (`_meta`, `evidenceText`) must be explicitly stripped on serialization. | Guarantees external evaluators receive 100% compliant Appendix A JSON without custom field leakage. |

---

## 16. Known Limitations

1. **Single-Page Application (SPA) Web Crawling**: Websites that render content exclusively via client-side JavaScript without SSR (e.g. hashbang SPAs) will yield minimal text to the lightweight crawler. The system gracefully falls back to verified public interview signals and JD requirements.
2. **Extremely Short JDs**: Job descriptions with fewer than 100 characters contain insufficient context for deep requirement extraction. The UI and API enforce validation boundaries to prevent empty generations.
3. **Free-Tier LLM Rate Limits**: When running large batch evaluations (>20 cases concurrently) on free-tier Groq/Gemini API keys, rate limits may be reached. The CLI provides a `--live` flag and defaults to deterministic mock evaluation for instant execution.

---

## 17. Verification & Test Results

The codebase includes an exhaustive test suite verifying every component from pure unit logic to full-stack integration:

```bash
# 1. Run all backend and client tests
npm test

# 2. Run full workspace production build
npm run build

# 3. Run evaluation CLI on sample cases
npm run evaluate -- --input tests/evaluation/fixtures/sample-cases.json --output tmp/test-kits.json
```

### Verified Test Summary
- **Backend & Integration Tests**: `14 test files, 205 passed (100%)`
  - Question ID format and normalization (`q-1`, `q-2`, etc.)
  - Coverage calculation & gap detection invariants
  - Schedule edge cases ($N=1$, $N=5$, $N=60$, spaced repetition)
  - Appendix A and B schema validation
  - Crawler security, SSRF blocking, robots.txt compliance
  - Scoped regeneration and edit/pin preservation
  - Rate limiting, authentication, and user isolation
- **Frontend Tests**: `1 test file, 33 passed (100%)`
  - Authentication flows (login, register, validation, token persistence)
  - Kit creation and input boundary validation
  - Builder tabs (Overview, Questions, Flashcards, Schedule, Company Research)
  - Active recall practice mode and confidence ratings
  - Scoped regeneration modal and optimistic locking
- **Production Build**: Clean compilation across `@trao/shared`, `@trao/server`, and `@trao/client` with 0 type errors.
- **Batch Evaluation**: `5/5 cases passed (100%)`.

---

## License
MIT License. Created for the TRAO Engineering Assessment (`FS-AI-INTERVIEW-01`).
