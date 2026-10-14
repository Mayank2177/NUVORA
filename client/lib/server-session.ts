import "server-only";

import { cookies } from "next/headers";
import type { AuthUser } from "@/lib/auth";
import { normalizeSnapshot } from "@/lib/snapshot";
import type { ProfileProject, PublicProfile } from "@/lib/profile";

const API_ORIGIN = process.env.NUVORA_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4117";

export async function getInitialSession(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  if (!cookieStore.has("nuvora_session")) return null;
  const response = await fetch(`${API_ORIGIN}/api/auth/me`, {
    headers: { cookie: cookieStore.toString() },
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  return await response.json() as AuthUser;
}

export async function getInitialEmployerRecord(uid: string) {
  const cookieStore = await cookies();
  const response = await fetch(`${API_ORIGIN}/api/onboarding/employer/${encodeURIComponent(uid)}`, {
    headers: { cookie: cookieStore.toString() },
    cache: "no-store",
  }).catch(() => null);
  return response?.ok ? await response.json() : null;
}

export async function getPublicSnapshot(slug: string) {
  const response = await fetch(`${API_ORIGIN}/api/public/${encodeURIComponent(slug)}`, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  const body = await response.json() as { snapshot: Record<string, unknown> };
  return normalizeSnapshot(body.snapshot);
}

export async function getPublicProfileByUsername(username: string): Promise<PublicProfile | null> {
  const response = await fetch(`${API_ORIGIN}/api/users/username/${encodeURIComponent(username)}/detailed-profile`, { cache: "no-store" }).catch(() => null);
  return response?.ok ? await response.json() as PublicProfile : null;
}

export async function getPublicProfileProjects(username: string, hidden: string[] = []): Promise<ProfileProject[]> {
  const response = await fetch(`${API_ORIGIN}/api/public/users/${encodeURIComponent(username)}`, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return [];
  const body = await response.json() as { projects: { id: string; slug: string }[] };
  const projects = await Promise.all(body.projects.map(async ({ id, slug }) => {
    if (hidden.includes(id)) return null;
    const snap = await getPublicSnapshot(slug);
    return snap ? { id, slug, snap, hidden: false } : null;
  }));
  return projects.filter((project): project is ProfileProject => project !== null);
}
