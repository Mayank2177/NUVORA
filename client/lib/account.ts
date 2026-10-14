"use client";

import { useEffect, useState } from "react";
import { signOut, type AuthUser } from "@/lib/auth";
import { api } from "@/lib/api";
import type { Project } from "@/lib/store";

/* ============ projects ============ */

export type ProjectStats = { evidence: number; openBlockers: number; slug: string | null };

/** Load statistics from the authoritative API instead of stale browser data. */
export function useProjectStats(projects: Project[]) {
  const [stats, setStats] = useState<Record<string, ProjectStats>>({});
  const ids = projects.map(({ id }) => id).join(",");
  useEffect(() => {
    let active = true;
    const current = projects;
    void Promise.all(current.map(async ({ id }) => {
      const [summary, publishing] = await Promise.all([
        api.get<{ evidenceCount: number; openBlockersCount: number }>(`/api/projects/${id}/stats`),
        api.get<{ published: boolean; slug?: string }>(`/api/projects/${id}/publish/status`),
      ]);
      return [id, { evidence: summary.evidenceCount, openBlockers: summary.openBlockersCount, slug: publishing.published ? publishing.slug ?? null : null }] as const;
    })).then((entries) => {
      if (active) setStats(Object.fromEntries(entries));
    }).catch((error) => console.error("Failed to load project statistics:", error));
    return () => { active = false; };
  // ids is the stable dependency for project additions/removals.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  return stats;
}

async function projectBundle(p: Project) {
  const [evidence, blockers, tasks, designs, decisions, commits, workspace, publishing] = await Promise.all([
    api.get(`/api/projects/${p.id}/evidence?limit=100`),
    api.get(`/api/projects/${p.id}/blockers?limit=100`),
    api.get(`/api/projects/${p.id}/tasks?limit=100`),
    api.get(`/api/projects/${p.id}/designs?limit=100`),
    api.get(`/api/projects/${p.id}/decisions?limit=100`),
    api.get(`/api/projects/${p.id}/commits?limit=100`),
    api.get(`/api/workspace/${p.id}`),
    api.get(`/api/projects/${p.id}/publish/status`),
  ]);
  return { project: p, evidence, blockers, tasks, designs, decisions, commits, workspace, publishing };
}

export async function exportProject(p: Project): Promise<string> {
  return JSON.stringify({ exportedAt: new Date().toISOString(), ...(await projectBundle(p)) }, null, 2);
}

/* ============ downloads ============ */

/**
 * Downloads text content as a file.
 */
export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ============ developer account ============ */

/** Exports all developer projects and their saved data as JSON. */
export async function exportAccountData(user: AuthUser): Promise<string> {
  const response = await api.get<{ projects: { id: string; name: string; goal: string; users: string; constraints: string | null; stage: Project["stage"]; repo: string | null; createdAt: string; updatedAt?: string; status?: Project["status"]; slug?: string }[] }>("/api/projects?limit=100&sort=recent");
  const projects = response.projects as Project[];
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), account: { name: user.name, email: user.email }, projects: await Promise.all(projects.map(projectBundle)) },
    null,
    2,
  );
}

/**
 * Deletes the developer account and all associated data via the API.
 * This removes:
 * - All projects (evidence, blockers, tasks, designs, decisions, workspace states)
 * - Published pages
 * - Skill verifications
 * - Offers and submissions
 * - Unassigns in-progress marketplace tasks (returns them to open status)
 * - The user account itself
 */
export async function deleteAccount(): Promise<void> {
  try {
    // Call the backend API to delete the account
    await api.delete("/api/auth/me");
    
    // Sign out and revoke the server session.
    await signOut();
  } catch (error) {
    console.error("Failed to delete account:", error);
    throw error;
  }
}

/* ============ employer account ============ */

/** Exports the employer's saved company, tasks, offers, and submissions as JSON. */
export async function exportEmployerData(user: AuthUser): Promise<string> {
  const [taskResponse, offers, submissionResponse, company] = await Promise.all([
    api.get<{ tasks: { id: string; employerId: string }[] }>("/api/tasks?limit=100"),
    api.get<{ taskId: string }[]>("/api/marketplace/offers?limit=100"),
    api.get<{ taskId: string }[]>("/api/tasks/submissions"),
    api.get("/api/onboarding/employer"),
  ]);
  const userTasks = taskResponse.tasks.filter((task) => task.employerId === user.id);
  const ids = new Set(userTasks.map(({ id }) => id));
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      account: { name: user.name, email: user.email },
      company,
      tasks: userTasks,
      offers: offers.filter((o) => ids.has(o.taskId)),
      submissions: submissionResponse.filter((s) => ids.has(s.taskId)),
    },
    null,
    2,
  );
}

/**
 * Deletes the employer account and all associated data via the API.
 * This removes:
 * - Company profile
 * - All posted marketplace tasks
 * - All offers for those tasks
 * - All submissions for those tasks
 * - The user account itself
 */
export async function deleteEmployerAccount(): Promise<void> {
  try {
    // Call the backend API to delete the account (same endpoint handles both roles)
    await api.delete("/api/auth/me");
    
    // Sign out and revoke the server session.
    await signOut();
  } catch (error) {
    console.error("Failed to delete employer account:", error);
    throw error;
  }
}
