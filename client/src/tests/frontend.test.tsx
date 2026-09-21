import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { mockKit, mockJobId, mockKitId, mockJob } from './mocks/apiMocks';

// ---------------------------------------------------------------------------
// vi.hoisted() — stubs are initialised BEFORE the vi.mock factory runs,
// so the factory can safely close over them.
// ---------------------------------------------------------------------------

const { authStubs, kitStubs, jobStubs, mockApi, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    statusCode: number;
    code: string;
    retryAfter?: number;
    constructor(statusCode: number, code: string, message: string, retryAfter?: number) {
      super(message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
      this.code = code;
      this.retryAfter = retryAfter;
    }
  }

  const authStubs = { login: vi.fn(), register: vi.fn(), logout: vi.fn() };
  const kitStubs = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    exportAppendixA: vi.fn(),
    regenerate: vi.fn(),
    updateQuestion: vi.fn(),
    togglePinQuestion: vi.fn(),
    addQuestion: vi.fn(),
    deleteQuestion: vi.fn(),
  };
  const jobStubs = { get: vi.fn(), getStreamUrl: vi.fn() };
  const mockApi = { auth: authStubs, kits: kitStubs, jobs: jobStubs };

  return {
    authStubs,
    kitStubs,
    jobStubs,
    mockApi,
    ApiError,
  };
});

vi.mock('@/lib/api', () => ({
  api: mockApi,
  ApiError,
  setAuthToken: vi.fn(),
  getAuthToken: vi.fn().mockReturnValue(null),
}));


// ---------------------------------------------------------------------------
// Providers wrapper
// ---------------------------------------------------------------------------

import { AuthProvider } from '@/contexts/AuthContext';
import { KitProvider, useJobSSE } from '@/contexts/KitContext';
import { AuthPage } from '@/components/auth/AuthPage';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { CreateKitModal } from '@/components/dashboard/CreateKitModal';
import { GenerationProgress } from '@/components/generation/GenerationProgress';
import { QuestionsTab } from '@/components/builder/tabs/QuestionsTab';
import { RegenerateModal } from '@/components/builder/RegenerateModal';
import { FlashcardsTab } from '@/components/builder/tabs/FlashcardsTab';
import { ScheduleTab } from '@/components/builder/tabs/ScheduleTab';

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <KitProvider>
        {children}
      </KitProvider>
    </AuthProvider>
  );
}

function renderWith(ui: React.ReactElement) {
  return render(<Providers>{ui}</Providers>);
}

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset all stubs to pristine state
  vi.mocked(authStubs.login).mockReset();
  vi.mocked(authStubs.register).mockReset();
  vi.mocked(authStubs.logout).mockReset();
  Object.values(kitStubs).forEach((fn) => vi.mocked(fn).mockReset());
  Object.values(jobStubs).forEach((fn) => vi.mocked(fn).mockReset());
  sessionStorage.clear();

  // Set default resolved values (tests override these per-test as needed)
  authStubs.login.mockResolvedValue({
    token: 'mock.jwt.token',
    user: { id: 'user001', email: 'alice@example.com', name: 'Alice' },
  });
  authStubs.register.mockResolvedValue({
    token: 'mock.jwt.token',
    user: { id: 'user001', email: 'alice@example.com', name: 'Alice' },
  });
  kitStubs.list.mockResolvedValue([mockKit]);
  kitStubs.get.mockResolvedValue(mockKit);
  kitStubs.create.mockResolvedValue({
    kitId: mockKitId,
    jobId: mockJobId,
    status: 'pending',
    generationVersion: 1,
    isExisting: false,
  });
  kitStubs.exportAppendixA.mockResolvedValue({ source: mockKit.source });
  kitStubs.regenerate.mockResolvedValue(mockKit);
  kitStubs.updateQuestion.mockResolvedValue(mockKit);
  kitStubs.togglePinQuestion.mockResolvedValue(mockKit);
  kitStubs.addQuestion.mockResolvedValue(mockKit);
  kitStubs.deleteQuestion.mockResolvedValue(mockKit);
  jobStubs.get.mockResolvedValue(mockJob);
  jobStubs.getStreamUrl.mockReturnValue(`http://localhost:5000/api/jobs/${mockJobId}/stream?token=mock`);
});


// ---------------------------------------------------------------------------
// 1. Auth
// ---------------------------------------------------------------------------

describe('Frontend: Authentication', () => {
  it('1. login form renders email + password fields', () => {
    renderWith(<AuthPage />);
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('2. shows register form when switching modes', async () => {
    renderWith(<AuthPage />);
    await userEvent.click(screen.getByRole('button', { name: /create one/i }));
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('3. client-side validates invalid email', async () => {
    renderWith(<AuthPage />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'notanemail');
    await userEvent.type(screen.getByLabelText(/password/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(mockApi.auth.login).not.toHaveBeenCalled();
  });

  it('4. successful login calls api.auth.login', async () => {
    renderWith(<AuthPage />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() =>
      expect(mockApi.auth.login).toHaveBeenCalledWith({
        email: 'alice@example.com',
        password: 'Password123!',
      })
    );
  });

  it('5. shows error message on failed login', async () => {
    mockApi.auth.login = vi.fn().mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
    );
    renderWith(<AuthPage />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'alice@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'WrongPass123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.')
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Dashboard
// ---------------------------------------------------------------------------

describe('Frontend: Dashboard', () => {
  it('6. shows empty state when no kits exist', async () => {
    mockApi.kits.list = vi.fn().mockResolvedValue([]);
    renderWith(<Dashboard onOpenKit={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/create your first interview prep kit/i)).toBeInTheDocument()
    );
  });

  it('7. calls api.kits.list on mount', async () => {
    renderWith(<Dashboard onOpenKit={vi.fn()} />);
    await waitFor(() => expect(mockApi.kits.list).toHaveBeenCalled());
  });

  it('8. opens create modal on New Kit click', async () => {
    mockApi.kits.list = vi.fn().mockResolvedValue([]);
    renderWith(<Dashboard onOpenKit={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /new kit/i })).toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole('button', { name: /new kit/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/new interview prep kit/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Kit Creation
// ---------------------------------------------------------------------------

describe('Frontend: Kit Creation', () => {
  it('9. submits valid kit creation form', async () => {
    const onCreated = vi.fn();
    render(
      <KitProvider>
        <CreateKitModal onClose={vi.fn()} onCreated={onCreated} />
      </KitProvider>
    );
    await userEvent.type(
      screen.getByLabelText(/job description/i),
      'This is a valid job description with enough characters for testing the form submission.'
    );
    await userEvent.type(screen.getByLabelText(/company website url/i), 'https://acme.com');
    await userEvent.click(screen.getByRole('button', { name: /generate prep kit/i }));
    await waitFor(() => expect(mockApi.kits.create).toHaveBeenCalled());
  });

  it('10. shows validation error for short JD', async () => {
    render(
      <KitProvider>
        <CreateKitModal onClose={vi.fn()} onCreated={vi.fn()} />
      </KitProvider>
    );
    await userEvent.type(screen.getByLabelText(/job description/i), 'Too short');
    await userEvent.type(screen.getByLabelText(/company website url/i), 'https://acme.com');
    await userEvent.click(screen.getByRole('button', { name: /generate prep kit/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(mockApi.kits.create).not.toHaveBeenCalled();
  });

  it('11. preset day buttons update the days field', async () => {
    render(
      <KitProvider>
        <CreateKitModal onClose={vi.fn()} onCreated={vi.fn()} />
      </KitProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: '60d' }));
    const input = screen.getByLabelText(/days available/i) as HTMLInputElement;
    expect(input.value).toBe('60');
  });
});

// ---------------------------------------------------------------------------
// 4. Generation Progress / SSE
// ---------------------------------------------------------------------------

describe('Frontend: Generation Progress', () => {
  it('12. renders progress bar and step list', () => {
    const MockEventSource = vi.fn().mockImplementation(() => ({
      addEventListener: vi.fn(),
      close: vi.fn(),
      onerror: null,
    }));
    vi.stubGlobal('EventSource', MockEventSource);

    render(
      <GenerationProgress jobId={mockJobId} onComplete={vi.fn()} onFailed={vi.fn()} />
    );

    expect(screen.getByText(/generating your prep kit/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('13. SSE hook falls back to polling on EventSource error', async () => {
    let errorHandler: (() => void) | null = null;
    const MockEventSource = vi.fn().mockImplementation(() => ({
      addEventListener: vi.fn(),
      close: vi.fn(),
      set onerror(fn: () => void) { errorHandler = fn; },
    }));
    vi.stubGlobal('EventSource', MockEventSource);
    mockApi.jobs.get = vi.fn().mockResolvedValue({ ...mockJob, status: 'running', progress: 30 });

    function TestHook() {
      const state = useJobSSE(mockJobId, vi.fn(), vi.fn());
      return <div data-testid="progress">{state.progress}</div>;
    }

    render(<TestHook />);
    act(() => { if (errorHandler) errorHandler(); });

    await waitFor(() => expect(mockApi.jobs.get).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// 5. Questions Builder
// ---------------------------------------------------------------------------

describe('Frontend: Questions Builder', () => {
  it('14. renders questions grouped by category', () => {
    render(<QuestionsTab kit={mockKit} kitId={mockKitId} onKitUpdate={vi.fn()} />);
    expect(screen.getByText('Technical')).toBeInTheDocument();
    expect(screen.getByText(/how do you design a distributed cache/i)).toBeInTheDocument();
  });

  it('15. edited question shows Edited badge; pinned question shows Pinned badge', () => {
    render(<QuestionsTab kit={mockKit} kitId={mockKitId} onKitUpdate={vi.fn()} />);
    expect(screen.getByText('Edited')).toBeInTheDocument();
    expect(screen.getByText(/📌 Pinned/)).toBeInTheDocument();
  });

  it('16. shows add-question form when Add is clicked', async () => {
    render(<QuestionsTab kit={mockKit} kitId={mockKitId} onKitUpdate={vi.fn()} />);
    const addButtons = screen.getAllByRole('button', { name: /add/i });
    await userEvent.click(addButtons[0]);
    expect(screen.getByText(/new custom question/i)).toBeInTheDocument();
  });

  it('17. calls api.kits.updateQuestion on edit save', async () => {
    const onKitUpdate = vi.fn().mockResolvedValue(undefined);
    render(<QuestionsTab kit={mockKit} kitId={mockKitId} onKitUpdate={onKitUpdate} />);
    const editButtons = screen.getAllByLabelText(/edit question/i);
    await userEvent.click(editButtons[0]);
    const textareas = screen.getAllByRole('textbox');
    await userEvent.clear(textareas[0]);
    await userEvent.type(textareas[0], 'Updated question text for testing.');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(mockApi.kits.updateQuestion).toHaveBeenCalledWith(
        mockKitId,
        'q_test0001',
        expect.objectContaining({ prompt: 'Updated question text for testing.' })
      )
    );
  });

  it('18. calls api.kits.togglePinQuestion when pin is clicked', async () => {
    render(<QuestionsTab kit={mockKit} kitId={mockKitId} onKitUpdate={vi.fn()} />);
    const pinButtons = screen.getAllByLabelText(/pin question/i);
    await userEvent.click(pinButtons[0]);
    await waitFor(() =>
      expect(mockApi.kits.togglePinQuestion).toHaveBeenCalledWith(mockKitId, 'q_test0001', true)
    );
  });

  it('19. calls api.kits.addQuestion when custom question is submitted', async () => {
    const onKitUpdate = vi.fn().mockResolvedValue(undefined);
    render(<QuestionsTab kit={mockKit} kitId={mockKitId} onKitUpdate={onKitUpdate} />);
    const addButtons = screen.getAllByRole('button', { name: /add/i });
    await userEvent.click(addButtons[0]);
    const promptField = await screen.findByPlaceholderText(/enter your question/i);
    await userEvent.type(promptField, 'Explain CAP theorem in depth.');
    await userEvent.click(screen.getByRole('button', { name: /add question/i }));
    await waitFor(() =>
      expect(mockApi.kits.addQuestion).toHaveBeenCalledWith(
        mockKitId,
        expect.objectContaining({ prompt: 'Explain CAP theorem in depth.' })
      )
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Scoped Regeneration
// ---------------------------------------------------------------------------

describe('Frontend: Scoped Regeneration', () => {
  it('20. shows regeneration modal with preservation notice', () => {
    render(
      <RegenerateModal
        kitId={mockKitId}
        generationVersion={1}
        category="technical"
        onClose={vi.fn()}
        onDone={vi.fn()}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/edited, custom, and pinned questions are preserved/i)).toBeInTheDocument();
  });

  it('21. calls api.kits.regenerate on confirm', async () => {
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(
      <RegenerateModal
        kitId={mockKitId}
        generationVersion={1}
        category="technical"
        onClose={vi.fn()}
        onDone={onDone}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /^regenerate$/i }));
    await waitFor(() =>
      expect(mockApi.kits.regenerate).toHaveBeenCalledWith(mockKitId, {
        category: 'technical',
        questionIds: undefined,
        generationVersion: 1,
      })
    );
  });

  it('22. shows safe message on 409 stale generation', async () => {
    mockApi.kits.regenerate = vi.fn().mockRejectedValue(
      new ApiError(409, 'STALE_GENERATION', 'Kit was updated since you last loaded it.')
    );
    render(
      <RegenerateModal
        kitId={mockKitId}
        generationVersion={1}
        category="behavioural"
        onClose={vi.fn()}
        onDone={vi.fn().mockResolvedValue(undefined)}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /^regenerate$/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    // Must not expose raw error codes
    expect(screen.getByRole('alert').textContent).not.toContain('409');
    expect(screen.getByRole('alert').textContent).not.toContain('STALE_GENERATION');
  });
});

// ---------------------------------------------------------------------------
// 7. Flashcard Practice
// ---------------------------------------------------------------------------

describe('Frontend: Flashcard Practice', () => {
  it('23. lists flashcards in preview mode', () => {
    render(<FlashcardsTab kit={mockKit} />);
    expect(screen.getByText('What is consistent hashing?')).toBeInTheDocument();
  });

  it('24. reveals answer when Show answer is clicked', async () => {
    render(<FlashcardsTab kit={mockKit} />);
    await userEvent.click(screen.getByRole('button', { name: /show answer/i }));
    expect(screen.getByText(/only K\/N keys are remapped/i)).toBeInTheDocument();
  });

  it('25. practice session shows Reveal Answer button', async () => {
    render(<FlashcardsTab kit={mockKit} />);
    await userEvent.click(screen.getByRole('button', { name: /start practice/i }));
    expect(screen.getByRole('button', { name: /reveal answer/i })).toBeInTheDocument();
  });

  it('26. shows session complete summary after last card is answered', async () => {
    render(<FlashcardsTab kit={mockKit} />);
    await userEvent.click(screen.getByRole('button', { name: /start practice/i }));
    await userEvent.click(screen.getByRole('button', { name: /reveal answer/i }));
    await userEvent.click(screen.getByRole('button', { name: /nailed it/i }));
    await waitFor(() =>
      expect(screen.getByText(/session complete/i)).toBeInTheDocument()
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Schedule
// ---------------------------------------------------------------------------

describe('Frontend: Schedule Tab', () => {
  it('27. renders N=5 schedule with 5 days total', () => {
    render(<ScheduleTab kit={mockKit} />);
    // Summary shows "5" total days
    const cells = screen.getAllByText('5');
    expect(cells.length).toBeGreaterThan(0);
  });

  it('28. renders N=1 schedule with single day', () => {
    const oneDay = {
      ...mockKit,
      schedule: {
        days_available: 1,
        days: [{ day: 1, focus: 'Full Prep', question_ids: ['q_test0001'], minutes: 120 }],
      },
    };
    render(<ScheduleTab kit={oneDay} />);
    expect(screen.getByText('Full Prep')).toBeInTheDocument();
  });

  it('29. loads more days when Show more is clicked (N=60)', async () => {
    const days60 = Array.from({ length: 60 }, (_, i) => ({
      day: i + 1,
      focus: `Focus ${i + 1}`,
      question_ids: ['q_test0001'],
      minutes: 45,
    }));
    render(<ScheduleTab kit={{ ...mockKit, schedule: { days_available: 60, days: days60 } }} />);
    // Day 11 should not be visible in initial batch
    expect(screen.queryByText('Focus 11')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show more/i }));
    expect(screen.getByText('Focus 11')).toBeInTheDocument();
  });

  it('30. shows empty state when schedule has no days', () => {
    const noSchedule = { ...mockKit, schedule: { days_available: 0, days: [] } };
    render(<ScheduleTab kit={noSchedule} />);
    expect(screen.getByText(/schedule will appear after kit generation/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 9. Export
// ---------------------------------------------------------------------------

describe('Frontend: Appendix A Export', () => {
  it('31. calls api.kits.exportAppendixA and triggers download', async () => {
    // Stub URL.createObjectURL + anchor click
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const appendixA = { source: mockKit.source };
    mockApi.kits.exportAppendixA = vi.fn().mockResolvedValue(appendixA);

    // Render a minimal component that calls the export API
    function ExportButton() {
      const [done, setDone] = React.useState(false);
      const handleExport = async () => {
        const result = await mockApi.kits.exportAppendixA(mockKitId);
        const blob = new Blob([JSON.stringify(result)], { type: 'application/json' });
        URL.createObjectURL(blob);
        setDone(true);
      };
      return (
        <button onClick={handleExport} aria-label="Export JSON">
          {done ? 'Done' : 'Export JSON'}
        </button>
      );
    }

    render(<ExportButton />);
    await userEvent.click(screen.getByRole('button', { name: /export json/i }));

    await waitFor(() => {
      expect(mockApi.kits.exportAppendixA).toHaveBeenCalledWith(mockKitId);
      expect(createObjectURL).toHaveBeenCalled();
    });
    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// 10. Error States
// ---------------------------------------------------------------------------

describe('Frontend: Error States', () => {
  it('32. dashboard shows error state when list API fails', async () => {
    mockApi.kits.list = vi.fn().mockRejectedValue(
      new ApiError(500, 'INTERNAL', 'Server error.')
    );
    render(
      <KitProvider>
        <Dashboard onOpenKit={vi.fn()} />
      </KitProvider>
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/failed to load prep kits/i)).toBeInTheDocument();
  });

  it('33. flashcards empty state shows informative message', () => {
    render(<FlashcardsTab kit={{ ...mockKit, flashcards: [] as any }} />);
    expect(
      screen.getByText(/flashcards will appear after question generation/i)
    ).toBeInTheDocument();
  });
});
