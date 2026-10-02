"use client";

import { useEffect, useState } from "react";
import { ApiError, api, clearStoredToken, getStoredToken, setStoredToken } from "./api-client";

export type AuthUser = { id: string; name: string; email: string; githubConnected?: boolean };

export class AuthError extends Error {
  constructor(message: string, public code: "email-taken" | "invalid" | "network" | "unknown" = "unknown") {
    super(message);
  }
}

const SESSION_KEY = "nuvora:session";
export const USERS_KEY = "nuvora:users"; // Legacy local accounts, removed during account deletion.

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveSession(user: AuthUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event("nuvora:auth"));
}

export async function signUp(input: { name: string; email: string; password: string }): Promise<AuthUser> {
  try {
    await api.auth.signup(input);
    return await signIn({ email: input.email, password: input.password });
  } catch (error) {
    if (error instanceof ApiError) {
      throw new AuthError(error.message, error.status === 409 ? "email-taken" : "unknown");
    }
    throw new AuthError("Network error. Please try again.", "network");
  }
}

export async function signIn(input: { email: string; password: string }): Promise<AuthUser> {
  try {
    const response = await api.auth.login(input);
    setStoredToken(response.token);
    saveSession(response.user);
    return response.user;
  } catch (error) {
    if (error instanceof ApiError) {
      throw new AuthError(error.message, error.status === 401 ? "invalid" : error.status === 0 ? "network" : "unknown");
    }
    throw new AuthError("Network error. Please try again.", "network");
  }
}

export async function signInWithGitHub(): Promise<void> {
  throw new AuthError("GitHub sign-in is not yet configured. Please use email and password.");
}

export async function signOut() {
  try { await api.auth.logout(); } catch { /* local sign-out still works */ }
  clearStoredToken();
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("nuvora:auth"));
}

/** undefined = still loading, null = signed out */
export function useSession(): AuthUser | null | undefined {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  useEffect(() => {
    const sync = () => {
      const cached = read<AuthUser | null>(SESSION_KEY, null);
      if (!getStoredToken()) {
        localStorage.removeItem(SESSION_KEY);
        setUser(null);
      } else setUser(cached);
    };
    sync();
    window.addEventListener("nuvora:auth", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("nuvora:auth", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return user;
}

export async function requestPasswordReset(email: string): Promise<void> {
  try { await api.auth.requestPasswordReset(email); } catch { /* Don't reveal whether an email has an account. */ }
}

/** True for accounts created with email and password (GitHub demo accounts have none). */
export const hasPassword = (id: string) => {
  const user = read<AuthUser | null>(SESSION_KEY, null);
  return user?.id === id && !user.githubConnected;
};

export async function updateProfile(input: { name: string; email: string }): Promise<AuthUser> {
  const session = read<AuthUser | null>(SESSION_KEY, null);
  if (!session) throw new AuthError("You're signed out. Log in again.");
  if (input.email.trim().toLowerCase() !== session.email.toLowerCase()) {
    throw new AuthError("Changing your email requires your current password. Update your name separately.");
  }
  try {
    const updated = await api.auth.updateProfile({ name: input.name, email: session.email });
    saveSession(updated);
    return updated;
  } catch (error) {
    if (error instanceof ApiError) throw new AuthError(error.message, error.status === 409 ? "email-taken" : "unknown");
    throw new AuthError("Network error. Please try again.", "network");
  }
}

export async function changePassword(_input: { current: string; next: string }): Promise<void> {
  throw new AuthError("Password changes are not available through the API yet.");
}
