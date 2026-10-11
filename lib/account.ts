"use client";

import { USERS_KEY, signOut, type AuthUser } from "@/lib/auth";
import { loadOffers, saveOffers } from "@/lib/offers";
import { loadSubmissions, saveSubmissions } from "@/lib/submissions";
import { loadTasks, saveTasks, type Task, type TaskStatus } from "@/lib/market";
import type { Project } from "@/lib/store";

function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/* ============ projects ============ */

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

/* ============ downloads ============ */

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ============ developer account ============ */

/** Everything the user has created, as readable JSON. Passwords are never included. */
export function exportAccountData(user: AuthUser): string {
  const projects = get<Project[]>(`nuvora:projects:${user.id}`) ?? [];
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), account: { name: user.name, email: user.email }, projects: projects.map(projectBundle) },
    null,
    2,
  );
}
const IN_PROGRESS: TaskStatus[] = ["assigned", "in_review", "changes_requested"];
/** Removes every project, published page, offer and submission, then the account itself. */
/** Removes every project, published page, offer and submission, then the account itself. */
export function deleteAccount(user: AuthUser) {
  const projects = get<Project[]>(`nuvora:projects:${user.id}`) ?? [];
  projects.forEach((p) => deleteProjectData(p.id)); // includes the "Client work" project from approved tasks

  // Take the public profile page offline
  const profile = get<{ username?: string }>(`nuvora:profile:${user.id}`);
  if (profile?.username) localStorage.removeItem(`nuvora:profile-public:${profile.username}`);

  // Unfinished tasks go back to the employer as open, so they aren't stuck on a deleted account
  saveTasks(
    loadTasks().map((t): Task =>
      t.assigneeId === user.id && IN_PROGRESS.includes(t.status) ? { ...t, status: "open", assigneeId: undefined } : t,
    ),
  );

  localStorage.removeItem(`nuvora:projects:${user.id}`);
  localStorage.removeItem(`nuvora:active:${user.id}`);
  localStorage.removeItem(`nuvora:dev:${user.id}`);
  localStorage.removeItem(`nuvora:profile:${user.id}`);
  localStorage.removeItem(`nuvora:verified:${user.id}`);
  saveOffers(loadOffers().filter((o) => o.devId !== user.id));
  saveSubmissions(loadSubmissions().filter((s) => s.devId !== user.id));
  const users = get<(AuthUser & { password: string })[]>(USERS_KEY) ?? [];
  localStorage.setItem(USERS_KEY, JSON.stringify(users.filter((u) => u.id !== user.id)));
  signOut();
}

/* ============ employer account ============ */

export function exportEmployerData(user: AuthUser): string {
  const tasks = loadTasks().filter((t) => t.employerId === user.id);
  const ids = new Set(tasks.map((t) => t.id));
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      account: { name: user.name, email: user.email },
      company: get(`nuvora:employer:${user.id}`),
      tasks,
      offers: loadOffers().filter((o) => ids.has(o.taskId)),
      submissions: loadSubmissions().filter((s) => ids.has(s.taskId)),
    },
    null,
    2,
  );
}

/** Removes the employer's company, tasks, offers and submissions, then the account itself. */
export function deleteEmployerAccount(user: AuthUser) {
  const ids = new Set(loadTasks().filter((t) => t.employerId === user.id).map((t) => t.id));
  saveTasks(loadTasks().filter((t) => !ids.has(t.id)));
  saveOffers(loadOffers().filter((o) => !ids.has(o.taskId)));
  saveSubmissions(loadSubmissions().filter((s) => !ids.has(s.taskId)));
  localStorage.removeItem(`nuvora:employer:${user.id}`);
  const users = get<(AuthUser & { password: string })[]>(USERS_KEY) ?? [];
  localStorage.setItem(USERS_KEY, JSON.stringify(users.filter((u) => u.id !== user.id)));
  signOut();
}