"use client";

import { useEffect, useState } from "react";

export type Role = "developer" | "employer";
export type AuthUser = { id: string; name: string; email: string; role: Role };

export class AuthError extends Error {
  constructor(message: string, public code: "email-taken" | "invalid" | "network" | "unknown" = "unknown") {
    super(message);
  }
}

type StoredUser = AuthUser & { password: string };

const SESSION_KEY = "nuvora:session";
export const USERS_KEY = "nuvora:users";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Accounts created before roles existed are developers. */
const roleOf = (r: unknown): Role => (r === "employer" ? "employer" : "developer");
const toPublic = (u: StoredUser): AuthUser => ({ id: u.id, name: u.name, email: u.email, role: roleOf(u.role) });

export function startSession(user: AuthUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event("nuvora:auth"));
}

export async function signUp(input: { name: string; email: string; password: string; role: Role }): Promise<AuthUser> {
  await wait(800);
  const users = read<StoredUser[]>(USERS_KEY, []);
  const email = input.email.toLowerCase();
  if (email === "taken@test.com" || users.some((u) => u.email === email)) {
    throw new AuthError("An account with this email already exists. Log in instead.", "email-taken");
  }
  const user: StoredUser = { id: crypto.randomUUID(), name: input.name, email, password: input.password, role: input.role };
  localStorage.setItem(USERS_KEY, JSON.stringify([...users, user]));
  const safe = toPublic(user);
  startSession(safe);
  return safe;
}

export async function signIn(input: { email: string; password: string }): Promise<AuthUser> {
  await wait(700);
  const match = read<StoredUser[]>(USERS_KEY, []).find(
    (u) => u.email === input.email.toLowerCase() && u.password === input.password,
  );
  if (!match) throw new AuthError("Email or password is incorrect.", "invalid");
  const safe = toPublic(match);
  startSession(safe);
  return safe;
}

/** GitHub sign-in is for developers. */
export async function signInWithGitHub(): Promise<AuthUser> {
  await wait(700);
  const user: AuthUser = { id: "gh-demo", name: "Demo Developer", email: "demo@github.dev", role: "developer" };
  startSession(user);
  return user;
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("nuvora:auth"));
}

/** undefined = still loading, null = signed out */
export function useSession(): AuthUser | null | undefined {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  useEffect(() => {
    const sync = () => {
      const s = read<AuthUser | null>(SESSION_KEY, null);
      setUser(s ? { ...s, role: roleOf(s.role) } : null);
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
  await wait(800);
  // Always resolves, so the UI never reveals whether an email has an account.
  void email;
}

/** True for accounts created with email and password (GitHub and demo accounts have none). */
export const hasPassword = (id: string) => read<StoredUser[]>(USERS_KEY, []).some((u) => u.id === id);

export async function updateProfile(input: { name: string; email: string }): Promise<AuthUser> {
  await wait(500);
  const session = read<AuthUser | null>(SESSION_KEY, null);
  if (!session) throw new AuthError("You're signed out. Log in again.");
  const users = read<StoredUser[]>(USERS_KEY, []);
  const email = input.email.toLowerCase();
  const mine = users.find((u) => u.id === session.id);

  if (!mine) {
    // GitHub and demo accounts: the name can change, the email is fixed
    const safe: AuthUser = { ...session, role: roleOf(session.role), name: input.name };
    startSession(safe);
    return safe;
  }
  if (email === "taken@test.com" || users.some((u) => u.id !== mine.id && u.email === email)) {
    throw new AuthError("Another account already uses this email.", "email-taken");
  }
  localStorage.setItem(USERS_KEY, JSON.stringify(users.map((u) => (u.id === mine.id ? { ...u, name: input.name, email } : u))));
  const safe: AuthUser = { ...toPublic(mine), name: input.name, email };
  startSession(safe);
  return safe;
}

export async function changePassword(input: { current: string; next: string }): Promise<void> {
  await wait(600);
  const session = read<AuthUser | null>(SESSION_KEY, null);
  const users = read<StoredUser[]>(USERS_KEY, []);
  const me = users.find((u) => u.id === session?.id);
  if (!me) throw new AuthError("This account signs in with GitHub, so it has no password to change.");
  if (me.password !== input.current) throw new AuthError("Your current password is incorrect.", "invalid");
  localStorage.setItem(USERS_KEY, JSON.stringify(users.map((u) => (u.id === me.id ? { ...u, password: input.next } : u))));
}