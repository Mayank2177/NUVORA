"use client";

/**
 * API Client for NUVORA Backend
 * 
 * Central HTTP client with:
 * - Automatic authorization header injection
 * - Request/response serialization
 * - Standardized error handling
 * - Retry logic for network failures
 * - Type-safe API calls
 */

/* ---------- Configuration ---------- */

// Browser requests go through Next's /api rewrites; server-side requests must
// use the configured backend origin directly.
const API_BASE_URL = typeof window === "undefined"
  ? process.env.NUVORA_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4117"
  : window.location.origin;
const TOKEN_KEY = "nuvora:token";
let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;
let cacheIdentity = "anon";
let protectedRequestsBlocked = false;
const protectedRequestControllers = new Set<AbortController>();
const AUTH_BLOCK_ABORT = Symbol("protected requests blocked");
export function migrateLegacyAuthToken(): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* Ignore unavailable browser storage. */ }
}
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
/** Identical GETs made within this window share one response (see "Request coalescing"). */
const GET_CACHE_TTL_MS = 3000;

/* ---------- Error Classes ---------- */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(message: string, public originalError?: unknown) {
    super(message);
    this.name = "NetworkError";
  }
}

export class AuthenticationError extends ApiError {
  constructor(message = "Authentication required") {
    super(message, 401, "UNAUTHENTICATED");
    this.name = "AuthenticationError";
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown, code = "VALIDATION_ERROR") {
    super(message, 400, code, details);
    this.name = "ValidationError";
  }
}

/* ---------- Token Management ---------- */

export function setCsrfToken(token: string): void {
  csrfToken = token;
  csrfRequest = null;
  protectedRequestsBlocked = false;
}

export function clearCsrfToken(): void {
  csrfToken = null;
  csrfRequest = null;
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  try {
    blockProtectedRequests();
    localStorage.removeItem(TOKEN_KEY);
    setCacheIdentity(null);
    clearCsrfToken();
    window.dispatchEvent(new CustomEvent("nuvora:auth", { detail: { invalidated: true } }));
  } catch (err) {
    console.error("Failed to clear auth token:", err);
  }
}

export function blockProtectedRequests(): void {
  protectedRequestsBlocked = true;
  protectedRequestControllers.forEach((controller) => controller.abort(AUTH_BLOCK_ABORT));
  protectedRequestControllers.clear();
  invalidateGetCache();
}

export function resumeProtectedRequests(): void {
  protectedRequestsBlocked = false;
}

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (!csrfRequest) {
    csrfRequest = (async () => {
      const response = await fetch(new URL("/api/auth/csrf", API_BASE_URL), { credentials: "include" });
      if (!response.ok) throw new NetworkError("Could not establish a secure session.");
      const body = await response.json() as { csrfToken: string };
      csrfToken = body.csrfToken;
      return csrfToken;
    })().finally(() => { csrfRequest = null; });
  }
  return csrfRequest;
}

/* ---------- Request Builder ---------- */

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean; // Default true
  retries?: number; // Default MAX_RETRIES
  signal?: AbortSignal;
}

async function buildRequest(
  endpoint: string,
  options: RequestOptions = {}
): Promise<Request> {
  const {
    method = "GET",
    body,
    headers = {},
  } = options;

  const url = new URL(endpoint, API_BASE_URL);
  const requestHeaders = new Headers(headers);

  if (method !== "GET") {
    requestHeaders.set("X-CSRF-Token", await getCsrfToken());
  }

  const requestInit: RequestInit = {
    method,
    headers: requestHeaders,
    credentials: "include",
    signal: options.signal,
  };

  if (body !== undefined && method !== "GET") {
    requestHeaders.set("Content-Type", "application/json");
    requestInit.body = JSON.stringify(body);
  }

  return new Request(url.toString(), requestInit);
}

/* ---------- Response Handler ---------- */

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type");
  const isJson = contentType?.includes("application/json");

  // Handle successful responses
  if (response.ok) {
    if (response.status === 204 || !isJson) {
      return undefined as T; // No content or non-JSON response
    }
    return response.json() as Promise<T>;
  }

  // Handle error responses
  let errorData: { error?: string; details?: unknown; message?: string; code?: string } = {};
  
  try {
    if (isJson) {
      errorData = await response.json();
    }
  } catch {
    // Failed to parse error response, use default message
  }

  const errorMessage = 
    errorData.error || 
    errorData.message || 
    `Request failed with status ${response.status}`;

  // Map HTTP status to specific error types
  switch (response.status) {
    case 401:
      throw new ApiError(errorMessage, 401, errorData.code);
    case 400:
    case 422:
      throw new ValidationError(errorMessage, errorData.details, errorData.code);
    case 403:
      throw new ApiError(errorMessage, 403, errorData.code || "FORBIDDEN", errorData.details);
    case 404:
      throw new ApiError(errorMessage, 404, errorData.code || "NOT_FOUND", errorData.details);
    case 429:
      throw new ApiError("Too many requests. Please try again later", 429, "RATE_LIMITED", {
        retryAfterMs: Math.max(0, Number(response.headers.get("Retry-After") || 0) * 1000),
      });
    case 500:
    case 502:
    case 503:
    case 504:
      throw new ApiError("Server error. Please try again later", response.status, "SERVER_ERROR");
    default:
      throw new ApiError(errorMessage, response.status);
  }
}

/* ---------- Core Request Function ---------- */

async function fetchWithRetry<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const protectedRequest = options.auth !== false;
  if (protectedRequest && protectedRequestsBlocked) throw new AuthenticationError();
  const controller = protectedRequest ? new AbortController() : null;
  if (controller) protectedRequestControllers.add(controller);
  const abortWithCaller = () => controller?.abort(options.signal?.reason);
  if (options.signal?.aborted) abortWithCaller();
  else options.signal?.addEventListener("abort", abortWithCaller, { once: true });
  const retries = options.method === "GET" ? options.retries ?? MAX_RETRIES : 0;
  let lastError: Error | null = null;

  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          throw new NetworkError("Can't connect to the API server. Check that the backend is running and try again.");
        }
        if (protectedRequest && protectedRequestsBlocked) {
          throw new AuthenticationError();
        }
        if (controller?.signal.aborted) throw controller.signal.reason ?? new DOMException("Aborted", "AbortError");
        const request = await buildRequest(endpoint, options);
        if (protectedRequest && protectedRequestsBlocked) {
          throw new AuthenticationError();
        }
        if (controller?.signal.aborted) throw controller.signal.reason ?? new DOMException("Aborted", "AbortError");
        const response = await fetch(request, controller ? { signal: controller.signal } : undefined);
        return await handleResponse<T>(response);
      } catch (error) {
        if (controller?.signal.reason === AUTH_BLOCK_ABORT) throw new AuthenticationError();
        if (protectedRequest && protectedRequestsBlocked) {
          throw new AuthenticationError();
        }
        if (controller?.signal.aborted) throw new DOMException("Aborted", "AbortError");
        lastError = error as Error;

        if (error instanceof ApiError) {
          if (protectedRequest && error.status === 401 && error.code === "UNAUTHENTICATED") {
            clearAuthToken();
            throw new AuthenticationError(error.message);
          }
          if (error.status === 429 && attempt < retries && typeof navigator !== "undefined" && navigator.onLine) {
            const retryAfterMs = (error.details as { retryAfterMs?: number } | undefined)?.retryAfterMs;
            if (retryAfterMs) {
              await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
              continue;
            }
          }
          if (error.status >= 400 && error.status < 500) {
            throw error;
          }
        }

        if (error instanceof AuthenticationError) {
          throw error;
        }
        if (error instanceof DOMException && error.name === "AbortError") throw error;

        if (attempt < retries && (typeof navigator === "undefined" || navigator.onLine)) {
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt) * (0.75 + Math.random() * 0.5);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (error instanceof ApiError) {
          throw error;
        }

        throw new NetworkError(
          "Can't connect to the API server. Check that the backend is running and try again.",
          error
        );
      }
    }
  } finally {
    if (controller) protectedRequestControllers.delete(controller);
    options.signal?.removeEventListener("abort", abortWithCaller);
  }

  throw lastError || new NetworkError("Request failed");
}

/* ---------- Request coalescing ---------- */

/*
 * Many components ask for the same data at the same moment (the sidebar alone is
 * mounted twice). Without this, one page navigation fired dozens of identical
 * `/api/auth/me` and `/api/projects` calls, which slowed rendering and could trip
 * the server's rate limiter.
 *
 *  - Identical GETs that are already in flight share ONE network request.
 *  - A successful GET is reused for GET_CACHE_TTL_MS.
 *  - Any mutation (POST/PATCH/PUT/DELETE) bumps `generation`, which drops the cache
 *    and prevents a GET that started before the mutation from being reused after it.
 *  - `{ fresh: true }` bypasses cache; an AbortSignal only stops that caller waiting.
 */

let generation = 0;
const inflightGets = new Map<string, Promise<unknown>>();
const getCache = new Map<string, { at: number; value: unknown }>();

export function invalidateGetCache(): void {
  generation++;
  getCache.clear();
  inflightGets.clear();
}

export function setCacheIdentity(uid: string | null): void {
  const next = uid ?? "anon";
  if (next === cacheIdentity) return;
  cacheIdentity = next;
  invalidateGetCache();
}

const cloneValue = <T,>(v: T): T =>
  typeof structuredClone === "function" && v !== undefined ? structuredClone(v) : v;

function coalescedGet<T>(
  endpoint: string,
  options: Omit<RequestOptions, "method" | "body"> & { fresh?: boolean } = {},
): Promise<T> {
  const { fresh, signal, ...rest } = options;
  if (fresh) return fetchWithRetry<T>(endpoint, { ...rest, signal, method: "GET" });

  const key = `${generation}|${rest.auth === false ? "anon" : cacheIdentity}|${endpoint}`;

  const hit = getCache.get(key);
  if (hit && Date.now() - hit.at < GET_CACHE_TTL_MS) {
    return Promise.resolve(cloneValue(hit.value as T));
  }

  let pending = inflightGets.get(key) as Promise<T> | undefined;
  if (!pending) {
    const startedAt = generation;
    pending = fetchWithRetry<T>(endpoint, { ...rest, method: "GET" })
      .then((value) => {
        if (startedAt === generation) getCache.set(key, { at: Date.now(), value });
        return value;
      })
      .finally(() => {
        if (inflightGets.get(key) === pending) inflightGets.delete(key);
      });
    inflightGets.set(key, pending);
  }
  // A caller may stop waiting without cancelling the request shared by other callers.
  const result = pending.then((v) => cloneValue(v));
  if (!signal) return result;
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    result.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

async function mutate<T>(endpoint: string, options: RequestOptions): Promise<T> {
  try {
    return await fetchWithRetry<T>(endpoint, options);
  } finally {
    // Success or failure, data may have changed on the server: never serve older reads.
    invalidateGetCache();
  }
}

/* ---------- Public API Methods ---------- */

export const api = {
  /**
   * Perform a GET request
   */
  get: <T>(endpoint: string, options?: Omit<RequestOptions, "method" | "body"> & { fresh?: boolean }) =>
    coalescedGet<T>(endpoint, options),

  /**
   * Perform a POST request
   */
  post: <T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, "method">) =>
    mutate<T>(endpoint, { ...options, body, method: "POST" }),

  /**
   * Perform a PATCH request
   */
  patch: <T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, "method">) =>
    mutate<T>(endpoint, { ...options, body, method: "PATCH" }),

  /**
   * Perform a PUT request
   */
  put: <T>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, "method">) =>
    mutate<T>(endpoint, { ...options, body, method: "PUT" }),

  /**
   * Perform a DELETE request
   */
  delete: <T>(endpoint: string, options?: Omit<RequestOptions, "method" | "body">) =>
    mutate<T>(endpoint, { ...options, method: "DELETE" }),
};

/* ---------- Utility Functions ---------- */

/**
 * Check if the API is reachable
 */
export async function checkApiHealth(): Promise<boolean> {
  try {
    await api.get("/healthz", { auth: false, retries: 0 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get API base URL (useful for debugging)
 */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

/* ---------- Type Exports for API Responses ---------- */

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type ApiSuccess = {
  ok: boolean;
  message?: string;
};
