"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useSession } from "@/lib/auth";
import { api, ApiError, AuthenticationError } from "@/lib/api";

export const STAGES = [
  "Idea", "Problem solving", "Research", "Learn", "Practice", "Prototype", "Build",
  "Validate", "Document", "Publish", "Portfolio", "Demonstrate", "Opportunity", "Contribution",
] as const;
export type Stage = (typeof STAGES)[number];

const LEGACY: Record<string, Stage> = { Think: "Idea", "Get unstuck": "Problem solving" };

export type Project = {
  id: string;
  name: string;
  goal: string;
  users: string;
  constraints: string;
  stage: Stage;
  repo: string | null; // "owner/repo"
  createdAt: string;
  updatedAt?: string;
  status?: "draft" | "published" | "archived";
  slug?: string;
  commitCount?: number;
  evidenceCount?: number;
};
export type NewProject = Omit<Project, "id" | "createdAt" | "updatedAt" | "status" | "slug" | "commitCount" | "evidenceCount">;

/* ---------- API Types ---------- */

type ApiProject = {
  id: string;
  name: string;
  goal: string;
  users: string;
  constraints: string | null;
  stage: string;
  repo: string | null;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "published" | "archived";
  slug: string;
  commitCount?: number;
  evidenceCount?: number;
};

type ProjectListResponse = {
  projects: ApiProject[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type ProjectEnvelope = {
  project: ApiProject;
};

/* ---------- Helper Functions ---------- */

function toFrontendProject(apiProject: ApiProject): Project {
  return {
    id: apiProject.id,
    name: apiProject.name,
    goal: apiProject.goal || "",
    users: apiProject.users || "General developers",
    constraints: apiProject.constraints || "",
    stage: (LEGACY[apiProject.stage] ?? apiProject.stage) as Stage,
    repo: apiProject.repo,
    createdAt: apiProject.createdAt,
    updatedAt: apiProject.updatedAt,
    status: apiProject.status,
    slug: apiProject.slug,
    commitCount: apiProject.commitCount,
    evidenceCount: apiProject.evidenceCount,
  };
}

function toApiProjectCreate(input: NewProject) {
  return {
    name: input.name,
    goal: input.goal || undefined,
    users: input.users || "General developers",
    constraints: input.constraints || undefined,
    stage: input.stage,
    repo: input.repo || undefined,
  };
}

function toApiProjectUpdate(patch: Partial<Omit<Project, "id" | "createdAt">>) {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.goal !== undefined) update.goal = patch.goal;
  if (patch.users !== undefined) update.users = patch.users;
  if (patch.constraints !== undefined) update.constraints = patch.constraints;
  if (patch.stage !== undefined) update.stage = patch.stage;
  if (patch.repo !== undefined) update.repo = patch.repo;
  return update;
}

/* ---------- Active Project Storage ---------- */

// Store active project ID in localStorage for persistence across page loads
const activeKey = (uid: string) => `nuvora:active:${uid}`;

function getActiveId(uid: string): string | null {
  try {
    return localStorage.getItem(activeKey(uid));
  } catch {
    return null;
  }
}

function setActiveId(uid: string, projectId: string) {
  try {
    localStorage.setItem(activeKey(uid), projectId);
  } catch {
    // LocalStorage full, continue without persistence
  }
}

function clearActiveId(uid: string) {
  try {
    localStorage.removeItem(activeKey(uid));
  } catch {
    // Ignore errors
  }
}

/* ---------- Shared projects store ---------- */

/*
 * ONE store for the whole app (previously every component that called
 * useProjects() had its own state and its own /api/projects request).
 *
 * Why it matters:
 *  - Requests: one fetch is shared by the sidebar, the page, and anything else.
 *  - Redirect bug: `ready` used to flip to true while the session was still loading,
 *    or after a failed request, with an empty list. Pages treat
 *    "ready && no projects" as "send the user to /new", so they bounced users
 *    who had projects. `ready` now means "projects were loaded successfully for
 *    the signed-in user" (or the user is signed out).
 *  - After create(), every subscriber sees the new project immediately instead of
 *    waiting for its own refetch.
 */

/** Other modules (e.g. capability.ts) listen for this; the store itself does not. */
const EVENT = "nuvora:projects";
const STALE_AFTER_MS = 30_000; // revalidate in the background when a page mounts after this long
const MAX_AUTO_RETRIES = 3;

type StoreState = {
  uid: string | null; // whose data this is
  projects: Project[];
  activeId: string | null;
  ready: boolean; // loaded successfully for `uid`
  loading: boolean;
  error: string | null;
};

const INITIAL: StoreState = { uid: null, projects: [], activeId: null, ready: false, loading: false, error: null };
const NO_PROJECTS: Project[] = [];

let store: StoreState = INITIAL;
let lastLoadedAt = 0;
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;
let inflightUid: string | null = null;
let storageListenerInstalled = false;
const listeners = new Set<() => void>();

function setStore(next: StoreState | ((s: StoreState) => StoreState)) {
  store = typeof next === "function" ? next(store) : next;
  listeners.forEach((l) => l());
}

function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!storageListenerInstalled && typeof window !== "undefined") {
    storageListenerInstalled = true;
    // Cross-tab: follow the active project chosen in another tab. No refetch needed.
    window.addEventListener("storage", (e) => {
      if (!store.uid || e.key !== activeKey(store.uid) || !e.newValue) return;
      if (e.newValue !== store.activeId && store.projects.some((p) => p.id === e.newValue)) {
        setStore((s) => ({ ...s, activeId: e.newValue }));
      }
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => store;
const getServerSnapshot = () => INITIAL;

function clearRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function isRetryable(error: unknown) {
  if (error instanceof AuthenticationError) return false;
  if (error instanceof ApiError) return error.status === 429 || error.status >= 500;
  return true; // network failure
}

function scheduleRetry(uid: string) {
  if (retries >= MAX_AUTO_RETRIES) return;
  clearRetry();
  const delay = 2000 * 2 ** retries++; // 2s, 4s, 8s
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (store.uid === uid) void loadProjects(uid);
  }, delay);
}

function loadProjects(uid: string, force = false): Promise<void> {
  if (inflight && inflightUid === uid) return inflight;
  inflightUid = uid;
  // Only show a loading state for the first load; later refreshes happen silently.
  if (!store.ready) setStore((s) => ({ ...s, loading: true, error: null }));

  const run: Promise<void> = (async () => {
    try {
      const response = await api.get<ProjectListResponse>(
        "/api/projects?limit=100&sort=recent",
        force ? { fresh: true } : undefined,
      );
      if (store.uid !== uid) return; // user changed while we were loading
      const projects = response.projects.map(toFrontendProject);
      const stored = getActiveId(uid);
      const activeId =
        projects.find((p) => p.id === store.activeId)?.id ??
        projects.find((p) => p.id === stored)?.id ??
        projects[0]?.id ??
        null;
      lastLoadedAt = Date.now();
      retries = 0;
      setStore((s) => ({ ...s, projects, activeId, ready: true, loading: false, error: null }));
    } catch (error) {
      if (store.uid !== uid) return;
      console.error("Failed to fetch projects:", error);
      const message = error instanceof ApiError ? error.message : "Failed to load projects";
      // Keep any projects we already have and DO NOT mark ready: a failed request is not
      // the same thing as "this user has no projects" (which would redirect them to /new).
      setStore((s) => ({ ...s, loading: false, error: message }));
      if (isRetryable(error)) scheduleRetry(uid);
    }
  })().finally(() => {
    if (inflight === run) {
      inflight = null;
      inflightUid = null;
    }
  });
  inflight = run;
  return run;
}

/** Bind the store to the current user (called by the hook once the session is known). */
function syncUser(uid: string | null) {
  if (store.uid !== uid) {
    clearRetry();
    retries = 0;
    lastLoadedAt = 0;
    setStore({ ...INITIAL, uid, ready: uid === null }); // signed out: nothing to load
  }
  if (!uid) return;
  if (!store.ready || Date.now() - lastLoadedAt > STALE_AFTER_MS) void loadProjects(uid);
}

/* ---------- Mutations (module-level so every component shares them) ---------- */

async function createProject(input: NewProject): Promise<Project> {
  const uid = store.uid;
  if (!uid) throw new Error("Not signed in");
  try {
    const response = await api.post<ProjectEnvelope>("/api/projects", toApiProjectCreate(input));
    const project = toFrontendProject(response.project);
    const hadLoaded = store.ready;
    setActiveId(uid, project.id);
    lastLoadedAt = Date.now();
    // Publish to every subscriber right now: sidebar, current page and the next page.
    setStore((s) =>
      s.uid !== uid
        ? s
        : {
            ...s,
            projects: [project, ...s.projects.filter((p) => p.id !== project.id)],
            activeId: project.id,
            ready: true,
            loading: false,
            error: null,
          },
    );
    announce();
    // If the initial load had failed we only know about the new project: fill in the rest.
    if (!hadLoaded) void loadProjects(uid, true);
    return project;
  } catch (error) {
    console.error("Failed to create project:", error);
    throw error instanceof ApiError ? error : new Error("Failed to create project");
  }
}

async function updateProject(id: string, patch: Partial<Omit<Project, "id" | "createdAt">>) {
  const uid = store.uid;
  if (!uid) return;
  setStore((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  try {
    await api.patch(`/api/projects/${id}`, toApiProjectUpdate(patch));
    announce();
  } catch (error) {
    console.error("Failed to update project:", error);
    void loadProjects(uid, true); // roll back the optimistic change from the server's truth
    throw error instanceof ApiError ? error : new Error("Failed to update project");
  }
}

async function removeProject(id: string) {
  const uid = store.uid;
  if (!uid) return;
  setStore((s) => {
    const next = s.projects.filter((p) => p.id !== id);
    let activeId = s.activeId;
    if (s.activeId === id) {
      activeId = next[0]?.id ?? null;
      if (activeId) setActiveId(uid, activeId);
      else clearActiveId(uid);
    }
    return { ...s, projects: next, activeId };
  });
  try {
    await api.delete(`/api/projects/${id}`);
    announce();
  } catch (error) {
    console.error("Failed to delete project:", error);
    void loadProjects(uid, true);
    throw error instanceof ApiError ? error : new Error("Failed to delete project");
  }
}

function setActiveProject(id: string) {
  const uid = store.uid;
  if (!uid) return;
  setActiveId(uid, id);
  setStore((s) => ({ ...s, activeId: id }));
}

function refreshProjects() {
  if (!store.uid) return;
  retries = 0;
  void loadProjects(store.uid, true);
}

/* ---------- Hook ---------- */

export type ProjectsView = {
  projects: Project[];
  activeId: string | null;
  ready: boolean;
  loading: boolean;
  error: string | null;
  active: Project | null;
  create: typeof createProject;
  setActive: typeof setActiveProject;
  update: typeof updateProject;
  remove: typeof removeProject;
  refresh: typeof refreshProjects;
};

const selectProjectsView = (view: ProjectsView) => view;

function sameSelection(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return aKeys.length === bKeys.length && aKeys.every((key) => Object.is(left[key], right[key]));
}

export function useProjects(): ProjectsView;
export function useProjects<T>(selector: (view: ProjectsView) => T): T;
export function useProjects<T>(selector?: (view: ProjectsView) => T): T | ProjectsView {
  const select = selector ?? selectProjectsView;
  const user = useSession(); // undefined = session still loading
  const sessionLoading = user === undefined;
  const uid = user?.id ?? null;

  useEffect(() => {
    if (sessionLoading) return; // wait: an unknown user is NOT "a user with no projects"
    syncUser(uid);
  }, [sessionLoading, uid]);

  const viewOf = useCallback((snap: StoreState): ProjectsView => {
    // The store may still hold the previous user's data for a render or two.
    const mine = !sessionLoading && snap.uid === uid;
    const projects = mine ? snap.projects : NO_PROJECTS;
    const activeId = mine ? snap.activeId : null;
    return {
    projects,
    activeId,
    ready: !sessionLoading && (uid === null || (mine && snap.ready)),
    loading: mine ? snap.loading : uid !== null,
    error: mine ? snap.error : null,
    active: projects.find((p) => p.id === activeId) ?? null,
    create: createProject,
    setActive: setActiveProject,
    update: updateProject,
    remove: removeProject,
    refresh: refreshProjects,
    };
  }, [sessionLoading, uid]);
  const selected = useRef(select(viewOf(getSnapshot())));
  const getSelected = useCallback(() => {
    const next = select(viewOf(getSnapshot()));
    if (!sameSelection(selected.current, next)) selected.current = next;
    return selected.current;
  }, [select, viewOf]);
  const getServerSelected = useCallback(() => select(viewOf(getServerSnapshot())), [select, viewOf]);
  return useSyncExternalStore(subscribe, getSelected, getServerSelected);
}
