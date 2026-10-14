"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { api, setCsrfToken, clearCsrfToken, clearAuthToken, blockProtectedRequests, resumeProtectedRequests, setCacheIdentity, ApiError, AuthenticationError, ValidationError } from "@/lib/api";

export type Role = "developer" | "employer";
export type AuthUser = { 
  id: string; 
  name: string; 
  email: string; 
  username: string;
  role: Role;
  avatarUrl?: string;
  emailVerified?: boolean;
  githubConnected?: boolean;
};

export class AuthError extends Error {
  constructor(message: string, public code: "email-taken" | "invalid" | "network" | "unknown" | "mfa" = "unknown") {
    super(message);
  }
}

/* ---------- API Types ---------- */

type SignupRequest = {
  name: string;
  email: string;
  password: string;
  role: Role;
};

type LoginRequest = {
  email: string;
  password: string;
};

type AuthResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    username: string;
    role: string;
    avatarUrl?: string;
    emailVerified: boolean;
    githubConnected: boolean;
    isAdmin: boolean;
    createdAt: string;
    updatedAt: string;
  };
  csrfToken: string;
};
type MFAChallenge = { mfaRequired: true; challengeToken: string };
const MFA_CHALLENGE_KEY = "nuvora:mfa-challenge";

type UserUpdateRequest = {
  name?: string;
  email?: string;
  current_password?: string;
};

type PasswordUpdateRequest = {
  currentPassword: string;
  newPassword: string;
};

/* ---------- Helper Functions ---------- */

const roleOf = (r: unknown): Role => (r === "employer" ? "employer" : "developer");

function toAuthUser(apiUser: AuthResponse["user"]): AuthUser {
  return {
    id: apiUser.id,
    name: apiUser.name,
    email: apiUser.email,
    username: apiUser.username,
    role: roleOf(apiUser.role),
    avatarUrl: apiUser.avatarUrl,
    emailVerified: apiUser.emailVerified,
    githubConnected: apiUser.githubConnected,
  };
}

function notifyAuthChange(signedOut = false) {
  window.dispatchEvent(new CustomEvent("nuvora:auth", { detail: { invalidated: signedOut } }));
  try {
    localStorage.setItem("nuvora:auth-event", JSON.stringify({ id: crypto.randomUUID(), signedOut }));
  } catch {
    // Cross-tab refresh is optional when browser storage is unavailable.
  }
}

/* ---------- Session Management ---------- */

// Cache non-secret display data; the server session stays in an HttpOnly cookie.
function getCachedUser(): AuthUser | null {
  try {
    const cached = sessionStorage.getItem("nuvora:user");
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

function setCachedUser(user: AuthUser | null) {
  try {
    if (user) {
      sessionStorage.setItem("nuvora:user", JSON.stringify(user));
    } else {
      sessionStorage.removeItem("nuvora:user");
    }
  } catch {
    // Session storage full or unavailable
  }
}

export function startSession(user: AuthUser, csrf: string) {
  setCsrfToken(csrf);
  setCacheIdentity(user.id);
  setCachedUser(user);
  sessionHydrated = true;
  setSessionState(user);
  notifyAuthChange();
}

/* ---------- Authentication Functions ---------- */

export async function signUp(input: SignupRequest): Promise<AuthUser> {
  try {
    // Backend returns 201 with generic message, then user must log in
    await api.post("/api/auth/signup", input, { auth: false });
    
    // Auto-login after signup
    return await signIn({ email: input.email, password: input.password });
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new AuthError("Check your name, email, and password and try again.", "invalid");
    }
    if (error instanceof AuthError && error.code === "invalid") {
      // Signup deliberately has a generic response so the UI must not reveal
      // whether the email is already registered.
      throw new AuthError("We couldn’t sign you in after signup. Log in or reset your password if you already have an account, or try again.", "invalid");
    }
    if (error instanceof AuthError) throw error;
    if (error instanceof ApiError) {
      throw new AuthError(error.message, "unknown");
    }
    throw new AuthError("Network error. Please try again.", "network");
  }
}

export async function signIn(input: LoginRequest): Promise<AuthUser> {
  try {
    const response = await api.post<AuthResponse | MFAChallenge>("/api/auth/login", input, { auth: false });
    if ("mfaRequired" in response) {
      sessionStorage.setItem(MFA_CHALLENGE_KEY, response.challengeToken);
      throw new AuthError("Enter your authenticator code to finish signing in.", "mfa");
    }
    const user = toAuthUser(response.user);
    startSession(user, response.csrfToken);
    return user;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") {
      throw new AuthError("Email or password is incorrect.", "invalid");
    }
    if (error instanceof ApiError && error.status === 429) {
      throw new AuthError("Too many login attempts. Please try again later.", "unknown");
    }
    if (error instanceof ApiError) {
      throw new AuthError(error.message, "unknown");
    }
    throw new AuthError("Network error. Please try again.", "network");
  }
}

/** GitHub sign-in via OAuth flow */
export async function initiateGitHubSignIn(): Promise<void> {
  const returnTo = window.location.pathname;
  sessionStorage.setItem("github-return-to", returnTo);
  const { authorizeUrl, state } = await api.get<{ authorizeUrl: string; state: string }>("/api/auth/github/authorize", { auth: false, fresh: true });
  sessionStorage.setItem("github-oauth-state", state);
  window.location.href = authorizeUrl;
}

/** Complete GitHub OAuth flow with authorization code */
export async function completeGitHubSignIn(code: string, state: string): Promise<AuthUser> {
  try {
    const response = await api.post<AuthResponse | MFAChallenge>("/api/auth/github/login", { code, state }, { auth: false });
    if ("mfaRequired" in response) {
      sessionStorage.setItem(MFA_CHALLENGE_KEY, response.challengeToken);
      throw new AuthError("Enter your authenticator code to finish signing in.", "mfa");
    }
    const user = toAuthUser(response.user);
    startSession(user, response.csrfToken);
    return user;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof ApiError) {
      throw new AuthError(error.message, "unknown");
    }
    throw new AuthError("GitHub authentication failed. Please try again.", "network");
  }
}

export async function completeMfaSignIn(code: string): Promise<AuthUser> {
  const challengeToken = sessionStorage.getItem(MFA_CHALLENGE_KEY);
  if (!challengeToken) throw new AuthError("Your sign-in challenge expired. Log in again.", "invalid");
  try {
    const response = await api.post<AuthResponse>("/api/auth/mfa/verify", { challengeToken, code }, { auth: false });
    sessionStorage.removeItem(MFA_CHALLENGE_KEY);
    const user = toAuthUser(response.user);
    startSession(user, response.csrfToken);
    return user;
  } catch (error) {
    if (error instanceof ApiError) throw new AuthError(error.message, "invalid");
    throw new AuthError("MFA verification failed. Check your connection and try again.", "network");
  }
}

export async function getMfaStatus(): Promise<boolean> {
  const result = await api.get<{ enabled: boolean }>("/api/auth/mfa");
  return result.enabled;
}

export async function beginMfaSetup(): Promise<{ secret: string; otpauthUrl: string }> {
  return api.post<{ secret: string; otpauthUrl: string }>("/api/auth/mfa/setup");
}

export async function enableMfa(code: string): Promise<string[]> {
  const result = await api.post<{ backupCodes: string[] }>("/api/auth/mfa/enable", { code });
  return result.backupCodes;
}

export async function disableMfa(code: string, password?: string): Promise<void> {
  await api.post("/api/auth/mfa/disable", { code, password });
}

export async function signOut(): Promise<void> {
  blockProtectedRequests();
  setCachedUser(null);
  setSessionState(null);
  setCacheIdentity(null);
  try {
    // Call logout endpoint to revoke session on backend
    await api.post("/api/auth/logout", undefined, { auth: false });
  } catch (error) {
    // Continue with local logout even if backend call fails
    console.error("Logout API call failed:", error);
  } finally {
    clearAuthToken();
    setCachedUser(null);
    notifyAuthChange(true);
  }
}

/* ---------- Current User Management ---------- */

/**
 * Fetch current user from backend
 * Returns null if not authenticated
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const response = await api.get<AuthResponse["user"]>("/api/auth/me");
    const user = toAuthUser(response);
    setCachedUser(user);
    return user;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      // Token is invalid, clear it
      clearAuthToken();
      setCachedUser(null);
      notifyAuthChange();
      return null;
    }
    throw error;
  }
}

/* ---------- Shared session store ---------- */

/*
 * One session for the whole app. Previously every component that called
 * useSession() kept its own copy and hit /api/auth/me on mount, so a single page
 * (AppShell + two Sidebars + the page + every data hook) produced dozens of
 * identical requests. Now:
 *   - the state lives at module level and components subscribe to it;
 *   - /api/auth/me is revalidated once per page load (and de-duplicated if
 *     several things ask at once);
 *   - a transient network/5xx error keeps the user signed in instead of
 *     bouncing them to the login page.
 */

type SessionState = AuthUser | null | undefined; // undefined = still loading
const InitialSessionContext = createContext<AuthUser | null | undefined>(undefined);

export const SessionProvider = InitialSessionContext.Provider;

let sessionState: SessionState = undefined;
let sessionHydrated = false; // seeded from sessionStorage yet?
let sessionStarted = false; // window listeners installed + first revalidation done?
let sessionInflight: Promise<void> | null = null;
const sessionListeners = new Set<() => void>();

function setSessionState(next: SessionState) {
  if (next === sessionState) return;
  // Skip no-op updates so unchanged user data doesn't re-render every subscriber.
  if (next && sessionState && JSON.stringify(next) === JSON.stringify(sessionState)) return;
  const prevId = sessionState?.id;
  sessionState = next;
  const nextId = next?.id ?? null;
  if (prevId !== nextId) setCacheIdentity(nextId);
  sessionListeners.forEach((l) => l());
}

function getSessionSnapshot(): SessionState {
  if (!sessionHydrated && typeof window !== "undefined") {
    sessionHydrated = true;
    // Seed synchronously so the first client render already knows the user
    // (no loading flash, and no premature "no data yet" decisions downstream).
    sessionState = getCachedUser() ?? undefined;
    setCacheIdentity(sessionState?.id ?? null);
  }
  return sessionState;
}

const getServerSessionSnapshot = (): SessionState => undefined;

function refreshSession(): Promise<void> {
  if (sessionInflight) return sessionInflight;
  sessionInflight = (async () => {
    try {
      setSessionState(await fetchCurrentUser());
    } catch (error) {
      console.error("Failed to fetch current user:", error);
      // Offline / 5xx: keep what we already know. Only fall back to signed-out
      // when we know nothing at all.
      if (sessionState === undefined) setSessionState(getCachedUser());
    }
  })().finally(() => {
    sessionInflight = null;
  });
  return sessionInflight;
}

function onAuthEvent(event: Event) {
  if ((event as CustomEvent<{ invalidated?: boolean }>).detail?.invalidated) {
    setCachedUser(null);
    setSessionState(null);
    return;
  }
  // Sign-in and profile updates already put the canonical user in the store.
  const cached = getCachedUser();
  if (cached) setSessionState(cached);
  else setSessionState(null);
}

function onStorageEvent(e: StorageEvent) {
  // Other tabs only. Ignore unrelated keys (workspace autosave etc.), which used to
  // trigger a full session reload and spinner on every write.
  if (e.key === "nuvora:auth-event") {
    let signedOut = false;
    try {
      signedOut = Boolean(e.newValue && JSON.parse(e.newValue).signedOut);
    } catch {
      // Older tabs wrote a random ID; refresh their session as before.
    }
    if (signedOut) {
      clearAuthToken();
      setCachedUser(null);
      setSessionState(null);
      return;
    }
    // A sibling tab may have replaced the cookie pair. Re-fetch the matching
    // CSRF token before this tab sends its next state-changing request.
    clearCsrfToken();
    resumeProtectedRequests();
    void refreshSession();
  }
}

function subscribeSession(listener: () => void, revalidate = true) {
  sessionListeners.add(listener);
  if (!sessionStarted && typeof window !== "undefined") {
    sessionStarted = true;
    window.addEventListener("nuvora:auth", onAuthEvent);
    window.addEventListener("storage", onStorageEvent);
    if (revalidate) void refreshSession(); // one revalidation per page load when the server did not seed a user
  }
  return () => {
    sessionListeners.delete(listener);
  };
}

/**
 * React hook for authentication state.
 * Returns: undefined (loading), null (signed out), or AuthUser (signed in).
 */
export function useSession(): AuthUser | null | undefined {
  const initial = useContext(InitialSessionContext);
  const subscribe = useCallback((listener: () => void) => subscribeSession(listener, initial === undefined), [initial]);
  const getClientSnapshot = useCallback(() => {
    const current = getSessionSnapshot();
    if (current !== undefined || initial === undefined) return current;
    setCacheIdentity(initial?.id ?? null);
    return initial;
  }, [initial]);
  const getServerSnapshot = useCallback(() => initial === undefined ? getServerSessionSnapshot() : initial, [initial]);
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

/* ---------- Profile Management ---------- */

export async function updateProfile(input: { name: string; email: string; currentPassword?: string }): Promise<AuthUser> {
  try {
    const updateData: UserUpdateRequest = {
      name: input.name,
      email: input.email,
    };
    
    // Include current password if email is being changed
    if (input.currentPassword) {
      updateData.current_password = input.currentPassword;
    }

    const response = await api.patch<AuthResponse["user"]>("/api/auth/me", updateData);
    const user = toAuthUser(response);
    setCachedUser(user);
    notifyAuthChange();
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.code === "CURRENT_PASSWORD_REQUIRED") {
      throw new AuthError("Current password is required to change email.", "invalid");
    }
    if (error instanceof ValidationError) {
      throw new AuthError("Another account already uses this email.", "email-taken");
    }
    if (error instanceof ApiError) {
      throw new AuthError(error.message, "unknown");
    }
    throw new AuthError("Failed to update profile. Please try again.", "network");
  }
}

export async function changePassword(input: { current: string; next: string }): Promise<void> {
  try {
    const request: PasswordUpdateRequest = {
      currentPassword: input.current,
      newPassword: input.next,
    };
    await api.put("/api/auth/me/password", request);
  } catch (error) {
    if (error instanceof ApiError && error.code === "CURRENT_PASSWORD_INVALID") {
      throw new AuthError("Your current password is incorrect.", "invalid");
    }
    if (error instanceof ValidationError) {
      const details = error.details;
      if (Array.isArray(details) && details.some((detail) =>
        typeof detail === "object" && detail !== null && "field" in detail && detail.field === "newPassword"
      )) {
        throw new AuthError("Password must be at least 12 characters long.", "invalid");
      }
    }
    if (error instanceof ApiError) {
      throw new AuthError(error.message, "unknown");
    }
    throw new AuthError("Failed to change password. Please try again.", "network");
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  // Backend returns the same success response whether or not the account exists.
  await api.post("/api/auth/password/reset", { email }, { auth: false });
}

export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  try {
    await api.post("/api/auth/password/confirm", { token, password }, { auth: false });
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new AuthError(error.message, "invalid");
    }
    if (error instanceof ApiError) {
      throw new AuthError(error.message, "unknown");
    }
    throw new AuthError("Could not reset your password. Check your connection and try again.", "network");
  }
}

/** True for accounts created with email and password (GitHub accounts may not have password) */
export const hasPassword = (user: AuthUser | null) => {
  if (!user) return false;
  // GitHub users have avatarUrl from GitHub
  return !user.githubConnected;
};

/* ---------- Backward Compatibility ---------- */

// Deprecated: kept for backward compatibility with existing code
export const USERS_KEY = "nuvora:users"; // No longer used
