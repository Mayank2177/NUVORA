"use client";

import { USERS_KEY, signOut, type AuthUser } from "@/lib/auth";
import type { Project } from "@/lib/store";

function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Removes everything stored for one project, including its published page. */
export function deleteProjectData(pid: string) {
  const slug = get<string>(`nuvora:published:${pid}`);
  if (slug) localStorage.removeItem(`nuvora:public:${slug}`);
  [
    `nuvora:data:${pid}`, `nuvora:tasks:${pid}`, `nuvora:design:${pid}`,
    `nuvora:workspace:${pid}`, `nuvora:workspace2:${pid}`,
    `nuvora:pubdraft:${pid}`, `nuvora:published:${pid}`,
  ].forEach((k) => localStorage.removeItem(k));
}

export function projectStats(pid: string) {
  const d = get<{ evidence: unknown[]; blockers: { status: string }[] }>(`nuvora:data:${pid}`);
  return {
    evidence: d?.evidence.length ?? 0,
    openBlockers: d?.blockers.filter((b) => b.status === "open").length ?? 0,
    slug: get<string>(`nuvora:published:${pid}`),
  };
}

function projectBundle(p: Project) {
  const slug = get<string>(`nuvora:published:${p.id}`);
  return {
    project: p,
    data: get(`nuvora:data:${p.id}`),
    tasks: get(`nuvora:tasks:${p.id}`),
    design: get(`nuvora:design:${p.id}`),
    workspace: get(`nuvora:workspace2:${p.id}`),
    published: slug ? get(`nuvora:public:${slug}`) : null,
  };
}

export function exportProject(p: Project): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), ...projectBundle(p) }, null, 2);
}

/** Everything the user has created, as readable JSON. Passwords are never included. */
export function exportAccountData(user: AuthUser): string {
  const projects = get<Project[]>(`nuvora:projects:${user.id}`) ?? [];
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), account: { name: user.name, email: user.email }, projects: projects.map(projectBundle) },
    null,
    2,
  );
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Removes every project, published page and the account itself, then signs out. */
export function deleteAccount(user: AuthUser) {
  const projects = get<Project[]>(`nuvora:projects:${user.id}`) ?? [];
  projects.forEach((p) => deleteProjectData(p.id));
  localStorage.removeItem(`nuvora:projects:${user.id}`);
  localStorage.removeItem(`nuvora:active:${user.id}`);
  const users = get<(AuthUser & { password: string })[]>(USERS_KEY) ?? [];
  localStorage.setItem(USERS_KEY, JSON.stringify(users.filter((u) => u.id !== user.id)));
  signOut();
}