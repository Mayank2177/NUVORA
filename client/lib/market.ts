"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { AuthUser } from "@/lib/auth";

/* ============ types ============ */

export type SkillLevel = "Beginner" | "Intermediate" | "Advanced";

/** Developer onboarding. Skills here are self-declared (L0) until evidence backs them up. */
export type DevRecord = {
  userId: string;
  name?: string;
  goals: string[];
  interests: string[];
  skills: { name: string; level: SkillLevel }[];
  githubHandle: string;
  openToWork: boolean; // discoverable by employers. Off by default.
  completedAt: string;
  createdAt?: string;
  updatedAt?: string;
};

export type EmployerRecord = {
  userId: string;
  company: string;
  industry: string;
  teamSize: string;
  website: string;
  needs: string[];
  completedAt: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Complexity = "Small" | "Medium" | "Large";
export type TaskStatus = "draft" | "open" | "assigned" | "in_review" | "changes_requested" | "completed" | "closed";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  draft: "Draft",
  open: "Open",
  assigned: "Assigned",
  in_review: "In review",
  changes_requested: "Changes requested",
  completed: "Completed",
  closed: "Closed",
};

/** A business need after "task digestion" turns it into structured work. */
export type Task = {
  id: string;
  employerId: string;
  company: string;
  rawNeed: string; // what the employer originally wrote
  title: string;
  summary: string;
  requirements: string[];
  skills: string[];
  complexity: Complexity;
  scope: string;
  acceptance: string[];
  status: TaskStatus;
  assigneeId?: string;
  createdAt: string;
  publishedAt?: string;
};

type ApiTask = {
  id: string;
  employerId: string;
  company?: string;
  rawNeed?: string;
  title: string;
  summary?: string;
  requirements?: string[];
  skillsRequired?: string[];
  complexity: Complexity;
  scope?: string;
  acceptance?: string[];
  status: TaskStatus;
  assigneeId?: string;
  createdAt: string;
  publishedAt?: string;
};

/* ============ onboarding API ============ */

export async function loadDevRecord(uid: string): Promise<DevRecord | null> {
  try {
    const response = await api.get(`/api/onboarding/developer/${uid}`);
    return response as DevRecord;
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Smart save that automatically uses POST for create, PATCH for update */
export async function saveDevRecordSmart(uid: string, r: Omit<DevRecord, "userId" | "completedAt" | "createdAt" | "updatedAt">): Promise<boolean> {
  const existing = await loadDevRecord(uid);
  return saveDevRecord(r, existing !== null);
}

/** Smart save that automatically uses POST for create, PATCH for update */
export async function saveEmployerRecordSmart(uid: string, r: Omit<EmployerRecord, "userId" | "completedAt" | "createdAt" | "updatedAt">): Promise<boolean> {
  const existing = await loadEmployerRecord(uid);
  return saveEmployerRecord(r, existing !== null);
}
export async function saveDevRecord(r: Omit<DevRecord, "userId" | "completedAt" | "createdAt" | "updatedAt">, isUpdate: boolean = false): Promise<boolean> {
  try {
    // Use PATCH for updates, POST for creates
    if (isUpdate) {
      await api.patch("/api/onboarding/developer", r);
    } else {
      await api.post("/api/onboarding/developer", r);
    }
    // Don''t dispatch storage event - it causes infinite loops with hooks
    return true;
  } catch {
    return false;
  }
}

export async function loadEmployerRecord(uid: string): Promise<EmployerRecord | null> {
  try {
    const response = await api.get(`/api/onboarding/employer/${uid}`);
    return response as EmployerRecord;
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function saveEmployerRecord(r: Omit<EmployerRecord, "userId" | "completedAt" | "createdAt" | "updatedAt">, isUpdate: boolean = false): Promise<boolean> {
  try {
    // Use PATCH for updates, POST for creates  
    if (isUpdate) {
      await api.patch("/api/onboarding/employer", r);
    } else {
      await api.post("/api/onboarding/employer", r);
    }
    // Don''t dispatch storage event - it causes infinite loops with useEmployerRecord hook
    // The hook will be updated through component state after successful save
    return true;
  } catch {
    return false;
  }
}

/* ============ marketplace tasks API ============ */

export async function loadTasks(): Promise<Task[]> {
  const response = await api.get("/api/tasks");
  const data = response as { tasks: ApiTask[]; total: number };
  return data.tasks.map(toTask);
}

function toTask(t: ApiTask): Task {
  return {
    id: t.id,
    employerId: t.employerId,
    company: t.company || "",
    rawNeed: t.rawNeed || "",
    title: t.title,
    summary: t.summary || "",
    requirements: t.requirements || [],
    skills: t.skillsRequired || [],
    complexity: t.complexity as Complexity,
    scope: t.scope || "",
    acceptance: t.acceptance || [],
    status: t.status as TaskStatus,
    assigneeId: t.assigneeId,
    createdAt: t.createdAt,
    publishedAt: t.publishedAt,
  };
}

function notifyTasksChanged() {
  window.dispatchEvent(new Event("nuvora:market-tasks"));
  try { localStorage.setItem("nuvora:market-tasks-event", String(Date.now())); } catch { /* storage may be unavailable */ }
}

export async function upsertTask(task: Partial<Task> & { id?: string }): Promise<Task> {
  const payload = {
    title: task.title || "",
    description: task.summary || task.rawNeed || task.title || "",
    company: task.company || "",
    rawNeed: task.rawNeed || "",
    summary: task.summary || "",
    requirements: task.requirements || [],
    skillsRequired: task.skills || [],
    complexity: task.complexity,
    scope: task.scope || "",
    acceptance: task.acceptance || [],
    status: task.status || "draft",
  };

  const saved = task.id
    ? await api.put<ApiTask>("/api/tasks/" + task.id, payload)
    : await api.post<ApiTask>("/api/tasks", payload);
  notifyTasksChanged();
  return toTask(saved);
}

export async function removeTask(id: string): Promise<void> {
  await api.delete(`/api/tasks/${id}`);
  notifyTasksChanged();
}

// Deprecated: keeping for backwards compatibility
export const saveTasks = async (_tasks: Task[]) => {
  void _tasks;
  // This function is no longer needed with API-based approach
  // Individual tasks are saved via upsertTask
  return true;
};

/* ============ hooks ============ */

export function useDevRecord(uid?: string): DevRecord | null | undefined {
  const [value, setValue] = useState<DevRecord | null | undefined>(undefined);
  
  useEffect(() => {
    if (!uid) {
      return;
    }
    
    const sync = async () => {
      try {
        const record = await loadDevRecord(uid);
        setValue(record);
      } catch (error) {
        console.error("Failed to load developer record:", error);
        setValue(undefined);
      }
    };
    
    sync();
    
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("storage", sync);
    };
  }, [uid]);
  
  return uid ? value : undefined;
}

export function useEmployerRecord(uid?: string): EmployerRecord | null | undefined {
  const [value, setValue] = useState<EmployerRecord | null | undefined>(undefined);
  
  useEffect(() => {
    if (!uid) {
      return;
    }
    
    let mounted = true;
    
    const sync = async () => {
      try {
        const record = await loadEmployerRecord(uid);
        if (mounted) setValue(record);
      } catch (error: unknown) {
        // 404 is expected for employers who haven''t completed onboarding
        if (mounted && error instanceof ApiError && error.status === 404) {
          setValue(null);
        } else if (mounted) {
          console.error("Failed to load employer record:", error);
          setValue(undefined);
        }
      }
    };
    
    sync();
    
    const handleStorageEvent = (e: Event) => {
      // Only refetch on real storage events from other tabs
      if (e instanceof StorageEvent) {
        sync();
      }
    };
    
    window.addEventListener("storage", handleStorageEvent);
    return () => {
      mounted = false;
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [uid]);
  
  return uid ? value : undefined;
}

/** undefined while loading, otherwise the list (possibly empty). */
export function useMarketTasks(): Task[] | undefined {
  const [value, setValue] = useState<Task[] | undefined>(undefined);
  
  useEffect(() => {
    let mounted = true;
    const sync = async () => {
      try {
        const tasks = await loadTasks();
        if (mounted) setValue(tasks);
      } catch (error) {
        console.error("Failed to load tasks:", error);
        if (mounted) setValue(undefined);
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === "nuvora:market-tasks-event") void sync();
    };
    const onVisibility = () => { if (document.visibilityState === "visible") void sync(); };
    sync();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void sync(); }, 30_000);
    window.addEventListener("nuvora:market-tasks", sync);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener("nuvora:market-tasks", sync);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  
  return value;
}

/* ============ where each role lands ============
   Flip these to true as the onboarding pages are built (next batches). */

export const READY = { devOnboarding: true, employerOnboarding: true };

export async function homeFor(user: AuthUser): Promise<string> {
  if (user.role === "employer") {
    const record = await loadEmployerRecord(user.id);
    return READY.employerOnboarding && !record ? "/employer/onboarding" : "/employer";
  }
  const record = await loadDevRecord(user.id);
  return READY.devOnboarding && !record ? "/onboarding" : "/dashboard";
}
