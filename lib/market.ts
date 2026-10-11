"use client";

import { useEffect, useState } from "react";
import type { AuthUser } from "@/lib/auth";

/* ============ types ============ */

export type SkillLevel = "Beginner" | "Intermediate" | "Advanced";

/** Developer onboarding. Skills here are self-declared (L0) until evidence backs them up. */
export type DevRecord = {
  userId: string;
  name?: string; // <- add this
  goals: string[];
  interests: string[];
  skills: { name: string; level: SkillLevel }[];
  githubHandle: string;
  openToWork: boolean; // discoverable by employers. Off by default.
  completedAt: string;
};

export type EmployerRecord = {
  userId: string;
  company: string;
  industry: string;
  teamSize: string;
  website: string;
  needs: string[];
  completedAt: string;
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

/* ============ storage ============ */

const EVENT = "nuvora:market";
const TASKS_KEY = "nuvora:market:tasks";
const devKey = (uid: string) => `nuvora:dev:${uid}`;
const empKey = (uid: string) => `nuvora:employer:${uid}`;

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Returns false if the browser refuses to store it (usually: storage is full). */
function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

export const loadDevRecord = (uid: string) => load<DevRecord>(devKey(uid));
export const saveDevRecord = (r: DevRecord) => save(devKey(r.userId), r);
export const loadEmployerRecord = (uid: string) => load<EmployerRecord>(empKey(uid));
export const saveEmployerRecord = (r: EmployerRecord) => save(empKey(r.userId), r);

export const loadTasks = (): Task[] => load<Task[]>(TASKS_KEY) ?? [];
export const saveTasks = (tasks: Task[]) => save(TASKS_KEY, tasks);
export const upsertTask = (task: Task) => {
  const all = loadTasks();
  return saveTasks(all.some((t) => t.id === task.id) ? all.map((t) => (t.id === task.id ? task : t)) : [task, ...all]);
};
export const removeTask = (id: string) => saveTasks(loadTasks().filter((t) => t.id !== id));

/* ============ hooks ============ */

/** undefined = loading, null = nothing stored yet. */
function useRecord<T>(key: string | undefined): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    if (!key) {
      setValue(undefined);
      return;
    }
    const sync = () => setValue(load<T>(key));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [key]);
  return value;
}

export const useDevRecord = (uid?: string) => useRecord<DevRecord>(uid ? devKey(uid) : undefined);
export const useEmployerRecord = (uid?: string) => useRecord<EmployerRecord>(uid ? empKey(uid) : undefined);

/** undefined while loading, otherwise the list (possibly empty). */
export function useMarketTasks(): Task[] | undefined {
  const v = useRecord<Task[]>(TASKS_KEY);
  return v === undefined ? undefined : v ?? [];
}

/* ============ where each role lands ============
   Flip these to true as the onboarding pages are built (next batches). */

export const READY = { devOnboarding: true, employerOnboarding: true };

export function homeFor(user: AuthUser): string {
  if (user.role === "employer") return READY.employerOnboarding && !loadEmployerRecord(user.id) ? "/employer/onboarding" : "/employer";
  return READY.devOnboarding && !loadDevRecord(user.id) ? "/onboarding" : "/dashboard";
}