import {
  BuilderViewModel,
  AppendixAKit,
  GenerationJobInfo,
  QuestionCategory,
} from '@trao/shared';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface CreateKitInput {
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
  forceRefresh?: boolean;
}

export interface CreateKitResponse {
  kitId: string;
  jobId: string;
  status: string;
  generationVersion: number;
  isExisting: boolean;
}

export interface RegenerateKitInput {
  category?: QuestionCategory;
  questionIds?: string[];
  generationVersion?: number;
  forceRefresh?: boolean;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const rawApiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').trim().replace(/\/+$/, '');
// Strip trailing '/api' suffix if user provided it in NEXT_PUBLIC_API_URL since all endpoints specify '/api/...'
const API_BASE = rawApiBase.endsWith('/api') ? rawApiBase.slice(0, -4) : rawApiBase;

let inMemoryToken: string | null = null;

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      sessionStorage.setItem('trao_auth_token', token);
    } else {
      sessionStorage.removeItem('trao_auth_token');
    }
  }
}

export function getAuthToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('trao_auth_token');
    if (stored) {
      inMemoryToken = stored;
      return stored;
    }
  }
  return null;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err: any) {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      err.message || 'Network connection failed. Please check your connection.'
    );
  }

  if (!response.ok) {
    let errorCode = 'UNKNOWN_ERROR';
    let errorMessage = `Request failed with status ${response.status}`;

    try {
      const errorBody = await response.json();
      if (errorBody && errorBody.error) {
        errorCode = errorBody.error.code || errorCode;
        errorMessage = errorBody.error.message || errorMessage;
      }
    } catch {
      // Non-JSON error response
      errorMessage = response.statusText || errorMessage;
    }

    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }

    throw new ApiError(response.status, errorCode, errorMessage, retryAfter);
  }

  if (response.status === 204) {
    return null as unknown as T;
  }

  return (await response.json()) as T;
}

export const api = {
  auth: {
    async register(data: { email: string; password: string; name?: string }): Promise<AuthResponse> {
      const res = await request<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setAuthToken(res.token);
      return res;
    },

    async login(data: { email: string; password: string }): Promise<AuthResponse> {
      const res = await request<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setAuthToken(res.token);
      return res;
    },

    logout(): void {
      setAuthToken(null);
    },
  },

  kits: {
    async list(): Promise<BuilderViewModel[]> {
      return request<BuilderViewModel[]>('/api/kits', {
        method: 'GET',
      });
    },

    async get(id: string): Promise<BuilderViewModel> {
      return request<BuilderViewModel>(`/api/kits/${id}`, {
        method: 'GET',
      });
    },

    async create(input: CreateKitInput): Promise<CreateKitResponse> {
      return request<CreateKitResponse>('/api/kits', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async exportAppendixA(id: string): Promise<AppendixAKit> {
      return request<AppendixAKit>(`/api/kits/${id}/export`, {
        method: 'GET',
      });
    },

    async regenerate(id: string, input: RegenerateKitInput): Promise<BuilderViewModel> {
      return request<BuilderViewModel>(`/api/kits/${id}/regenerate`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async updateQuestion(
      kitId: string,
      questionId: string,
      patch: Partial<{
        prompt: string;
        answer_outline: string;
        category: QuestionCategory;
        difficulty: 1 | 2 | 3 | 4 | 5;
        requirement_ids: string[];
      }>
    ): Promise<BuilderViewModel> {
      return request<BuilderViewModel>(`/api/kits/${kitId}/questions/${questionId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    },

    async togglePinQuestion(
      kitId: string,
      questionId: string,
      pinned: boolean
    ): Promise<BuilderViewModel> {
      return request<BuilderViewModel>(`/api/kits/${kitId}/questions/${questionId}/pin`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned }),
      });
    },

    async addQuestion(
      kitId: string,
      question: {
        prompt: string;
        answer_outline: string;
        category: QuestionCategory;
        difficulty: 1 | 2 | 3 | 4 | 5;
        requirement_ids: string[];
      }
    ): Promise<BuilderViewModel> {
      return request<BuilderViewModel>(`/api/kits/${kitId}/questions`, {
        method: 'POST',
        body: JSON.stringify(question),
      });
    },

    async deleteQuestion(kitId: string, questionId: string): Promise<BuilderViewModel> {
      return request<BuilderViewModel>(`/api/kits/${kitId}/questions/${questionId}`, {
        method: 'DELETE',
      });
    },
  },

  jobs: {
    async get(id: string): Promise<GenerationJobInfo> {
      return request<GenerationJobInfo>(`/api/jobs/${id}`, {
        method: 'GET',
      });
    },

    getStreamUrl(jobId: string): string {
      const token = getAuthToken();
      const query = token ? `?token=${encodeURIComponent(token)}` : '';
      return `${API_BASE}/api/jobs/${jobId}/stream${query}`;
    },
  },
};
