'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from 'react';
import { api, AuthUser, setAuthToken, getAuthToken, ApiError } from '@/lib/api';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

type AuthAction =
  | { type: 'INIT'; user: AuthUser; token: string }
  | { type: 'INIT_ANONYMOUS' }
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; user: AuthUser; token: string }
  | { type: 'LOGIN_ERROR'; error: string }
  | { type: 'LOGOUT' }
  | { type: 'CLEAR_ERROR' };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'INIT':
      return { user: action.user, token: action.token, loading: false, error: null };
    case 'INIT_ANONYMOUS':
      return { user: null, token: null, loading: false, error: null };
    case 'LOGIN_START':
      return { ...state, loading: true, error: null };
    case 'LOGIN_SUCCESS':
      return { user: action.user, token: action.token, loading: false, error: null };
    case 'LOGIN_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'LOGOUT':
      return { user: null, token: null, loading: false, error: null };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    token: null,
    loading: true,
    error: null,
  });

  // Restore session from sessionStorage on mount
  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      // Validate by hitting a protected endpoint — list kits (cheap, returns array)
      api.kits.list()
        .then(() => {
          // We don't have user info back from list, so parse JWT payload
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            dispatch({
              type: 'INIT',
              user: { id: payload.sub, email: payload.email, name: payload.name },
              token,
            });
          } catch {
            setAuthToken(null);
            dispatch({ type: 'INIT_ANONYMOUS' });
          }
        })
        .catch(() => {
          setAuthToken(null);
          dispatch({ type: 'INIT_ANONYMOUS' });
        });
    } else {
      dispatch({ type: 'INIT_ANONYMOUS' });
    }
  }, []);

  // Listen for 401 events dispatched by the API client
  useEffect(() => {
    const handler = () => {
      setAuthToken(null);
      dispatch({ type: 'LOGOUT' });
    };
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    dispatch({ type: 'LOGIN_START' });
    try {
      const res = await api.auth.login({ email, password });
      dispatch({ type: 'LOGIN_SUCCESS', user: res.user, token: res.token });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Login failed. Please try again.';
      dispatch({ type: 'LOGIN_ERROR', error: message });
      throw err;
    }
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    dispatch({ type: 'LOGIN_START' });
    try {
      const res = await api.auth.register({ email, password, name });
      dispatch({ type: 'LOGIN_SUCCESS', user: res.user, token: res.token });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Registration failed. Please try again.';
      dispatch({ type: 'LOGIN_ERROR', error: message });
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    api.auth.logout();
    dispatch({ type: 'LOGOUT' });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        token: state.token,
        loading: state.loading,
        error: state.error,
        isAuthenticated: state.user !== null,
        login,
        register,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
