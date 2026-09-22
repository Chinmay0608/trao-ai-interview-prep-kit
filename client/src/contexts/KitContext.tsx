'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import { BuilderViewModel, GenerationJobInfo } from '@trao/shared';
import { api, ApiError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KitListItem {
  id: string;
  status: 'generating' | 'ready' | 'failed';
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
  generationVersion: number;
  activeJobId?: string;
  updatedAt: string;
  createdAt: string;
  role?: string;
  company?: string;
}

interface KitState {
  list: KitListItem[];
  listLoading: boolean;
  listError: string | null;
  activeKit: BuilderViewModel | null;
  activeKitLoading: boolean;
  activeKitError: string | null;
  activeJob: GenerationJobInfo | null;
}

type KitAction =
  | { type: 'LIST_LOADING' }
  | { type: 'LIST_SUCCESS'; kits: KitListItem[] }
  | { type: 'LIST_ERROR'; error: string }
  | { type: 'KIT_LOADING' }
  | { type: 'KIT_SUCCESS'; kit: BuilderViewModel }
  | { type: 'KIT_ERROR'; error: string }
  | { type: 'KIT_CLEAR' }
  | { type: 'JOB_UPDATE'; job: GenerationJobInfo }
  | { type: 'JOB_CLEAR' }
  | { type: 'LIST_ITEM_UPDATE'; item: Partial<KitListItem> & { id: string } };

function kitReducer(state: KitState, action: KitAction): KitState {
  switch (action.type) {
    case 'LIST_LOADING':
      return { ...state, listLoading: true, listError: null };
    case 'LIST_SUCCESS':
      return { ...state, list: action.kits, listLoading: false };
    case 'LIST_ERROR':
      return { ...state, listLoading: false, listError: action.error };
    case 'KIT_LOADING':
      return { ...state, activeKitLoading: true, activeKitError: null };
    case 'KIT_SUCCESS':
      return { ...state, activeKit: action.kit, activeKitLoading: false };
    case 'KIT_ERROR':
      return { ...state, activeKitLoading: false, activeKitError: action.error };
    case 'KIT_CLEAR':
      return { ...state, activeKit: null, activeJob: null, activeKitError: null };
    case 'JOB_UPDATE':
      return { ...state, activeJob: action.job };
    case 'JOB_CLEAR':
      return { ...state, activeJob: null };
    case 'LIST_ITEM_UPDATE': {
      const updated = state.list.map((item) =>
        item.id === action.item.id ? { ...item, ...action.item } : item
      );
      return { ...state, list: updated };
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface KitContextValue {
  list: KitListItem[];
  listLoading: boolean;
  listError: string | null;
  activeKit: BuilderViewModel | null;
  activeKitLoading: boolean;
  activeKitError: string | null;
  activeJob: GenerationJobInfo | null;
  fetchList: () => Promise<void>;
  fetchKit: (id: string) => Promise<void>;
  refreshKit: (id: string) => Promise<void>;
  setActiveJob: (job: GenerationJobInfo | null) => void;
  clearActiveKit: () => void;
}

const KitContext = createContext<KitContextValue | null>(null);

function viewModelToListItem(vm: BuilderViewModel): KitListItem {
  const ik = vm as any;
  return {
    id: vm.id,
    status: vm.status ?? ik.status ?? 'ready',
    jobDescription: ik.jobDescription ?? '',
    companyUrl: vm.source?.company_url ?? '',
    daysAvailable: vm.schedule?.days_available ?? 0,
    generationVersion: vm.generationVersion,
    activeJobId: vm.activeJobId,
    updatedAt: vm.updatedAt,
    createdAt: vm.createdAt,
    role: vm.role?.title?.trim() || undefined,
    company: vm.source?.company?.trim() || undefined,
  };
}

export function KitProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(kitReducer, {
    list: [],
    listLoading: false,
    listError: null,
    activeKit: null,
    activeKitLoading: false,
    activeKitError: null,
    activeJob: null,
  });

  const fetchList = useCallback(async () => {
    dispatch({ type: 'LIST_LOADING' });
    try {
      const vms = await api.kits.list();
      const items = vms.map(viewModelToListItem);
      dispatch({ type: 'LIST_SUCCESS', kits: items });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to load prep kits.';
      dispatch({ type: 'LIST_ERROR', error: msg });
    }
  }, []);

  const fetchKit = useCallback(async (id: string) => {
    dispatch({ type: 'KIT_LOADING' });
    try {
      const kit = await api.kits.get(id);
      dispatch({ type: 'KIT_SUCCESS', kit });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to load prep kit.';
      dispatch({ type: 'KIT_ERROR', error: msg });
    }
  }, []);

  const refreshKit = useCallback(async (id: string) => {
    try {
      const kit = await api.kits.get(id);
      dispatch({ type: 'KIT_SUCCESS', kit });
    } catch {
      // silent refresh failure — keep current state
    }
  }, []);

  const setActiveJob = useCallback((job: GenerationJobInfo | null) => {
    if (job) {
      dispatch({ type: 'JOB_UPDATE', job });
    } else {
      dispatch({ type: 'JOB_CLEAR' });
    }
  }, []);

  const clearActiveKit = useCallback(() => {
    dispatch({ type: 'KIT_CLEAR' });
  }, []);

  return (
    <KitContext.Provider
      value={{
        ...state,
        fetchList,
        fetchKit,
        refreshKit,
        setActiveJob,
        clearActiveKit,
      }}
    >
      {children}
    </KitContext.Provider>
  );
}

export function useKits(): KitContextValue {
  const ctx = useContext(KitContext);
  if (!ctx) throw new Error('useKits must be used inside KitProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// SSE hook
// ---------------------------------------------------------------------------

export interface SSEState {
  status: GenerationJobInfo['status'] | null;
  currentStep: string | null;
  progress: number;
  error: { code: string; message: string } | null;
  kitId: string | null;
}

export function useJobSSE(
  jobId: string | null,
  onComplete: (kitId: string) => void,
  onFailed: (error: { code: string; message: string }) => void
): SSEState {
  const [sseState, setSseState] = React.useState<SSEState>({
    status: null,
    currentStep: null,
    progress: 0,
    error: null,
    kitId: null,
  });

  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onFailedRef = useRef(onFailed);
  onCompleteRef.current = onComplete;
  onFailedRef.current = onFailed;

  useEffect(() => {
    if (!jobId) return;

    function cleanup() {
      esRef.current?.close();
      esRef.current = null;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    function startPolling() {
      if (pollRef.current) return;
      const pollOnce = async () => {
        try {
          const job = await api.jobs.get(jobId!);
          setSseState({
            status: job.status,
            currentStep: job.currentStep,
            progress: job.progress,
            error: job.error ?? null,
            kitId: job.kitId ?? null,
          });
          if (job.status === 'completed') {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            onCompleteRef.current(job.kitId);
          } else if (job.status === 'failed') {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            onFailedRef.current(job.error ?? { code: 'FAILED', message: 'Generation failed.' });
          }
        } catch {
          // Keep polling — transient error
        }
      };

      pollOnce();
      pollRef.current = setInterval(pollOnce, 3000);
    }

    const url = api.jobs.getStreamUrl(jobId);
    try {
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('initial', (ev: MessageEvent) => {
        const data = JSON.parse(ev.data);
        setSseState({
          status: data.status,
          currentStep: data.currentStep,
          progress: data.progress ?? 0,
          error: data.error ?? null,
          kitId: data.kitId ?? null,
        });
      });

      es.addEventListener('progress', (ev: MessageEvent) => {
        const data = JSON.parse(ev.data);
        setSseState((prev) => ({
          ...prev,
          status: data.status ?? prev.status,
          currentStep: data.currentStep ?? prev.currentStep,
          progress: data.progress ?? prev.progress,
        }));
      });

      es.addEventListener('completed', (ev: MessageEvent) => {
        const data = JSON.parse(ev.data);
        setSseState((prev) => ({
          ...prev,
          status: 'completed',
          progress: 100,
          kitId: data.kitId ?? prev.kitId,
        }));
        cleanup();
        onCompleteRef.current(data.kitId);
      });

      es.addEventListener('failed', (ev: MessageEvent) => {
        const data = JSON.parse(ev.data);
        setSseState((prev) => ({
          ...prev,
          status: 'failed',
          error: data.error ?? { code: 'FAILED', message: 'Generation failed.' },
        }));
        cleanup();
        onFailedRef.current(data.error ?? { code: 'FAILED', message: 'Generation failed.' });
      });

      es.onerror = () => {
        // SSE failed — fall back to polling
        es.close();
        esRef.current = null;
        startPolling();
      };
    } catch {
      // EventSource not available (e.g., SSR) — fall back to polling
      startPolling();
    }

    return cleanup;
  }, [jobId]);

  return sseState;
}
