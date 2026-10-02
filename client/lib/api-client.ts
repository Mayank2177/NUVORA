/**
 * API Client for Nuvora Backend
 * Connects the Next.js frontend to the FastAPI backend
 */

/**
 * API Types
 */
export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  githubConnected: boolean;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  goal: string;
  users: string;
  constraints: string;
  stage: string;
  repo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Evidence {
  id: string;
  projectId: string;
  type: string;
  text: string;
  source: string;
  provenance: string;
  stage: string;
  public: boolean;
  date: string;
  createdAt: string;
}

export interface Commit {
  id: string;
  projectId: string;
  hash: string;
  message: string;
  author: string | null;
  when: string;
}

export interface Blocker {
  id: string;
  projectId: string;
  title: string;
  attempts: string[];
  solution: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  stage: string;
  done: boolean;
  createdAt: string;
}

export interface Design {
  id: string;
  projectId: string;
  title: string;
  kind: string;
  tool: string;
  url: string;
  image: string | null;
  note: string;
  stage: string;
  createdAt: string;
}

export interface Decision {
  id: string;
  projectId: string;
  decision: string;
  reason: string;
  stage: string;
  createdAt: string;
}

export interface PublicProject {
  snapshot: {
    project_id: string;
    slug: string;
    name: string;
    goal: string;
    users: string;
    stage: string;
    repo: string | null;
    author: string;
    published_at: string;
    story: Record<string, string>;
    evidence: Array<{
      id: string;
      type: string;
      text: string;
      date: string;
      source: string;
      provenance: string;
      stage: string;
    }>;
    blockers: Array<{
      id: string;
      title: string;
      status: string;
      attempts: string[];
      solution: string | null;
      created_at: string;
      resolved_at?: string | null;
    }>;
  };
}

interface PublishDraft {
  slug: string;
  story: { problem: string; process: string; build: string; challenges: string; result: string } | null;
  include_blockers: boolean;
}

interface PublishSnapshot {
  id: string;
  projectId: string;
  slug: string;
  story: { problem: string; process: string; build: string; challenges: string; result: string };
  include_blockers: boolean;
  publishedAt: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4117';

// Stage name passthrough - frontend and backend use identical stage names
export const toApiStage = (stage: string) => stage;
export const fromApiStage = (stage: string) => stage;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Make an authenticated API request
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = `${API_BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 204 No Content
    if (response.status === 204) {
      return null as T;
    }

    const data = await response.json();

    if (!response.ok) {
      const validation = Array.isArray(data.details)
        ? data.details.map((item: { message?: string }) => item.message).filter(Boolean).join("; ")
        : data.details?.message;
      throw new ApiError(
        [data.error, validation].filter((part) => typeof part === "string" && part.length).join(": ") || `Request failed with status ${response.status}`,
        response.status,
        data
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error',
      0
    );
  }
}

/**
 * Token management
 */
const TOKEN_KEY = 'nuvora:token';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * API Client
 */
export const api = {
  // Auth endpoints
  auth: {
    signup: (data: { name: string; email: string; password: string }) =>
      apiRequest<{ ok: boolean; message: string }>(
        '/api/auth/signup',
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),

    login: (data: { email: string; password: string }) =>
      apiRequest<{ user: { id: string; name: string; email: string; githubConnected: boolean }; token: string }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      ),

    logout: () =>
      apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

    getProfile: () =>
      apiRequest<{ id: string; name: string; email: string; githubConnected: boolean; created_at: string }>(
        '/api/auth/me'
      ),

    updateProfile: (data: { name: string; email: string }) =>
      apiRequest<{ id: string; name: string; email: string; githubConnected: boolean }>('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    requestPasswordReset: (email: string) =>
      apiRequest<{ message: string }>('/api/auth/password-reset-request', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
  },

  // Project endpoints
  projects: {
    list: () => apiRequest<{ projects: Project[]; pagination?: unknown }>('/api/projects?limit=100'),

    create: (data: {
      name: string;
      goal: string;
      users: string;
      constraints?: string;
      stage: string;
      repo?: string | null;
    }) =>
      apiRequest<{ project: Project }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ ...data, stage: toApiStage(data.stage) }),
      }),

    update: (id: string, data: Partial<{ stage: string; constraints: string; repo: string | null }>) =>
      apiRequest<{ project: Project }>(`/api/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...data, ...(data.stage ? { stage: toApiStage(data.stage) } : {}) }),
      }),

    delete: (id: string) =>
      apiRequest<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  },

  commits: {
    list: (projectId: string) =>
      apiRequest<{ commits: Commit[]; pagination?: unknown }>(`/api/projects/${projectId}/commits?limit=100`),
  },

  // Evidence endpoints
  evidence: {
    list: (projectId: string) =>
      apiRequest<{ evidence: Evidence[]; pagination?: unknown }>(`/api/projects/${projectId}/evidence?limit=100`),

    create: (projectId: string, data: {
      type: string;
      text: string;
      source: string;
      provenance: string;
      stage: string;
      public?: boolean;
      date?: string;
    }) =>
      apiRequest<{ evidence: Evidence }>(`/api/projects/${projectId}/evidence`, {
        method: 'POST',
        body: JSON.stringify({ ...data, date: data.date ?? new Date().toISOString(), stage: toApiStage(data.stage) }),
      }),

    togglePublic: (evidenceId: string) =>
      apiRequest<{ evidence: Evidence }>(`/api/evidence/${evidenceId}/toggle-public`, {
        method: 'PATCH',
      }),

    delete: (evidenceId: string) =>
      apiRequest<void>(`/api/evidence/${evidenceId}`, { method: 'DELETE' }),
  },

  // Blocker endpoints
  blockers: {
    list: (projectId: string) =>
      apiRequest<{ blockers: Blocker[]; pagination?: unknown }>(`/api/projects/${projectId}/blockers?limit=100`),

    create: (projectId: string, title: string) =>
      apiRequest<{ blocker: Blocker }>(`/api/projects/${projectId}/blockers`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),

    addAttempt: (blockerId: string, attempt: string) =>
      apiRequest<{ blocker: Blocker }>(`/api/blockers/${blockerId}/attempts`, {
        method: 'POST',
        body: JSON.stringify({ attempt }),
      }),

    resolve: (blockerId: string, solution: string) =>
      apiRequest<{ blocker: Blocker; evidence: Evidence }>(`/api/blockers/${blockerId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ solution }),
      }),

    delete: (blockerId: string) =>
      apiRequest<void>(`/api/blockers/${blockerId}`, { method: 'DELETE' }),
  },

  // Task endpoints
  tasks: {
    list: (projectId: string) =>
      apiRequest<{ tasks: Task[]; pagination?: unknown }>(`/api/projects/${projectId}/tasks?limit=100`),

    create: (projectId: string, data: { title: string; stage: string }) =>
      apiRequest<{ task: Task }>(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ ...data, stage: toApiStage(data.stage) }),
      }),

    toggle: (taskId: string) =>
      apiRequest<{ task: Task }>(`/api/tasks/${taskId}/toggle`, { method: 'PATCH' }),

    delete: (taskId: string) =>
      apiRequest<void>(`/api/tasks/${taskId}`, { method: 'DELETE' }),
  },

  // Design endpoints
  designs: {
    list: (projectId: string) =>
      apiRequest<{ designs: Design[]; pagination?: unknown }>(`/api/projects/${projectId}/designs?limit=100`),

    create: (projectId: string, data: {
      title: string;
      kind: string;
      tool: string;
      url: string;
      image?: string;
      note: string;
      stage: string;
    }) =>
      apiRequest<{ design: Design }>(`/api/projects/${projectId}/designs`, {
        method: 'POST',
        body: JSON.stringify({ ...data, stage: toApiStage(data.stage) }),
      }),

    delete: (designId: string) =>
      apiRequest<void>(`/api/designs/${designId}`, { method: 'DELETE' }),
  },

  // Decision endpoints
  decisions: {
    list: (projectId: string) =>
      apiRequest<{ decisions: Decision[]; pagination?: unknown }>(`/api/projects/${projectId}/decisions?limit=100`),

    create: (projectId: string, data: {
      decision: string;
      reason: string;
      stage: string;
    }) =>
      apiRequest<{ decision: Decision }>(`/api/projects/${projectId}/decisions`, {
        method: 'POST',
        body: JSON.stringify({ ...data, stage: toApiStage(data.stage) }),
      }),

    delete: (decisionId: string) =>
      apiRequest<void>(`/api/decisions/${decisionId}`, { method: 'DELETE' }),
  },

  // Publishing endpoints
  publishing: {
    status: (projectId: string) => apiRequest<{ published: boolean; slug?: string | null; publishedAt?: string | null }>(`/api/projects/${projectId}/publish/status`),
    getDraft: (projectId: string) =>
      apiRequest<{ draft: PublishDraft | null }>(`/api/projects/${projectId}/publish/draft`),

    saveDraft: (projectId: string, data: {
      slug: string;
      story: PublishDraft["story"];
      include_blockers: boolean;
    }) =>
      apiRequest<{ draft: PublishDraft | null }>(`/api/projects/${projectId}/publish/draft`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    publish: (projectId: string, data: {
      slug: string;
      story: NonNullable<PublishDraft["story"]>;
      include_blockers: boolean;
    }) =>
      apiRequest<{ snapshot: PublishSnapshot }>(`/api/projects/${projectId}/publish`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    unpublish: (projectId: string) =>
      apiRequest<void>(`/api/projects/${projectId}/publish`, { method: 'DELETE' }),

    getPublic: (slug: string) =>
      apiRequest<PublicProject>(`/api/public/${slug}`),

    checkSlug: (projectId: string, slug: string) =>
      apiRequest<{ available: boolean; reason?: string }>(
        `/api/projects/${projectId}/publish/check-slug/${slug}`
      ),
  },

  // GitHub integration endpoints
  github: {
    authorize: () =>
      apiRequest<{ authorizeUrl: string; expiresIn: number }>('/api/integrations/github/authorize'),

    repos: () =>
      apiRequest<{ repos: Array<{ id: number; fullName: string; htmlUrl: string; description?: string; updatedAt?: string; defaultBranch?: string; private: boolean }> }>('/api/integrations/github/repos'),

    sync: (projectId: string, repoUrl?: string, branch?: string) =>
      apiRequest<{ ok: boolean; inserted: number; fetched: number }>(`/api/projects/${projectId}/sync`, {
        method: 'POST',
        body: JSON.stringify({ repoUrl, branch: branch || 'main' }),
      }),
    
    disconnect: () =>
      apiRequest<{ ok: boolean }>('/api/integrations/github', {
        method: 'DELETE',
      }),
  },

  // Health check
  health: () =>
    apiRequest<{ status: string; service: string; version: string; timestamp?: string }>('/healthz'),
};

export { ApiError };




