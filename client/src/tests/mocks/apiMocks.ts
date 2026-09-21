/**
 * Mock for the typed API client.
 * Import as: vi.mock('@/lib/api', () => ({ ... }))
 */
import { vi } from 'vitest';
import type { BuilderViewModel, GenerationJobInfo } from '@trao/shared';

export const mockKitId = 'aabbcc001122334455667788';
export const mockJobId = 'bbccdd001122334455667799';

export const mockUser = {
  id: 'user001',
  email: 'alice@example.com',
  name: 'Alice',
};

export const mockToken = 'mock.jwt.token';

export const mockJob: GenerationJobInfo = {
  id: mockJobId,
  kitId: mockKitId,
  userId: mockUser.id,
  status: 'running',
  currentStep: 'GENERATING_QUESTIONS',
  progress: 60,
  generationVersion: 1,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  heartbeatAt: new Date().toISOString(),
  retryAttempts: 0,
};

export const mockKit: BuilderViewModel = {
  id: mockKitId,
  userId: mockUser.id,
  generationVersion: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  source: {
    company: 'Acme Corp',
    company_url: 'https://acme.com',
    role: 'Software Engineer',
    location: 'Remote',
    jd_chars: 1500,
    researched_at: new Date().toISOString(),
    pages_used: ['https://acme.com/about'],
  },
  company_brief: {
    summary: 'Acme Corp builds scalable distributed systems.',
    what_they_do: 'Distributed systems software',
    sources: ['https://acme.com'],
  },
  role: {
    title: 'Software Engineer',
    seniority: 'Senior',
    responsibilities: ['Design APIs', 'Code review'],
    requirements: [
      {
        id: 'r1',
        text: 'Distributed systems experience',
        kind: 'technical',
        priority: 'must',
        _meta: { origin: 'generated', pinned: false },
      },
      {
        id: 'r2',
        text: 'Team collaboration',
        kind: 'behavioural',
        priority: 'nice',
        _meta: { origin: 'generated', pinned: false },
      },
    ] as any,
  },
  questions: [
    {
      id: 'q_test0001',
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: 'How do you design a distributed cache?',
      answer_outline: 'Consistent hashing, TTL, eviction policies.',
      difficulty: 2,
      _meta: { origin: 'generated', pinned: false },
    },
    {
      id: 'q_test0002',
      requirement_ids: ['r2'],
      category: 'behavioural',
      prompt: 'Describe a time you resolved a team conflict.',
      answer_outline: 'Situation-Action-Result format.',
      difficulty: 1,
      _meta: { origin: 'edited', pinned: true },
    },
  ] as any,
  flashcards: [
    {
      id: 'f_test0001',
      front: 'What is consistent hashing?',
      back: 'A technique where only K/N keys are remapped on bucket change.',
      requirement_ids: ['r1'],
      _meta: { origin: 'generated', pinned: false },
    },
  ] as any,
  schedule: {
    days_available: 5,
    days: [
      { day: 1, focus: 'Distributed Systems', question_ids: ['q_test0001'], minutes: 60 },
      { day: 2, focus: 'Behavioural', question_ids: ['q_test0002'], minutes: 45 },
      { day: 3, focus: 'Review', question_ids: ['q_test0001', 'q_test0002'], minutes: 40 },
      { day: 4, focus: 'Deep Dive', question_ids: ['q_test0001'], minutes: 50 },
      { day: 5, focus: 'Mock Interview', question_ids: ['q_test0001', 'q_test0002'], minutes: 90 },
    ],
  },
  coverage: {
    uncovered_requirement_ids: [],
    passes: 1,
  },
};

export const createMockApi = (overrides: Record<string, any> = {}) => ({
  auth: {
    login: vi.fn().mockResolvedValue({ token: mockToken, user: mockUser }),
    register: vi.fn().mockResolvedValue({ token: mockToken, user: mockUser }),
    logout: vi.fn(),
    ...overrides.auth,
  },
  kits: {
    list: vi.fn().mockResolvedValue([mockKit]),
    get: vi.fn().mockResolvedValue(mockKit),
    create: vi.fn().mockResolvedValue({
      kitId: mockKitId,
      jobId: mockJobId,
      status: 'pending',
      generationVersion: 1,
      isExisting: false,
    }),
    exportAppendixA: vi.fn().mockResolvedValue({ source: mockKit.source }),
    regenerate: vi.fn().mockResolvedValue(mockKit),
    updateQuestion: vi.fn().mockResolvedValue(mockKit),
    togglePinQuestion: vi.fn().mockResolvedValue(mockKit),
    addQuestion: vi.fn().mockResolvedValue(mockKit),
    deleteQuestion: vi.fn().mockResolvedValue(mockKit),
    ...overrides.kits,
  },
  jobs: {
    get: vi.fn().mockResolvedValue(mockJob),
    getStreamUrl: vi.fn().mockReturnValue(`http://localhost:5000/api/jobs/${mockJobId}/stream?token=mock`),
    ...overrides.jobs,
  },
});
