"use client";

import { useEffect, useState } from "react";

export type AuthUser = { id: string; name: string; email: string };

export class AuthError extends Error {
  constructor(message: string, public code: "email-taken" | "invalid" | "network" | "unknown" = "unknown") {
    super(message);
  }
}

const SESSION_KEY = "nuvora:session";
const USERS_KEY = "nuvora:users";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

type StoredUser = AuthUser & { password: string };

function saveSession(user: AuthUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event("nuvora:auth"));
}

export async function signUp(input: { name: string; email: string; password: string }): Promise<AuthUser> {
  await wait(800);
  const users = read<StoredUser[]>(USERS_KEY, []);
  const email = input.email.toLowerCase();
  if (email === "taken@test.com" || users.some((u) => u.email === email)) {
    throw new AuthError("An account with this email already exists. Log in instead.", "email-taken");
  }
  const user: StoredUser = { id: crypto.randomUUID(), name: input.name, email, password: input.password };
  localStorage.setItem(USERS_KEY, JSON.stringify([...users, user]));
  const { password: _pw, ...safe } = user;
  saveSession(safe);
  return safe;
}

export async function signIn(input: { email: string; password: string }): Promise<AuthUser> {
  await wait(700);
  const match = read<StoredUser[]>(USERS_KEY, []).find(
    (u) => u.email === input.email.toLowerCase() && u.password === input.password,
  );
  if (!match) throw new AuthError("Email or password is incorrect.", "invalid");
  const { password: _pw, ...safe } = match;
  saveSession(safe);
  return safe;
}

export async function signInWithGitHub(): Promise<void> {
  await wait(700);
  saveSession({ id: "gh-demo", name: "Demo Developer", email: "demo@github.dev" });
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("nuvora:auth"));
}

/** undefined = still loading, null = signed out */
export function useSession(): AuthUser | null | undefined {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  useEffect(() => {
    const sync = () => setUser(read<AuthUser | null>(SESSION_KEY, null));
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