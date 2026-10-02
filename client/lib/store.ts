"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/auth";
import { api, fromApiStage } from "@/lib/api-client";

export const STAGES = [
  "Idea", "Problem solving", "Research", "Learn", "Practice", "Prototype", "Build",
  "Validate", "Document", "Publish", "Portfolio", "Demonstrate", "Opportunity", "Contribution",
] as const;
export type Stage = (typeof STAGES)[number];

export type Project = {
  id: string; name: string; goal: string; users: string; constraints: string;
  stage: Stage; repo: string | null; createdAt: string;
};
export type NewProject = Omit<Project, "id" | "createdAt">;

type ApiProject = {
  id: string;
  name: string;
  goal?: string | null;
  users?: string | null;
  constraints?: string | null;
  stage?: string | null;
  repo?: string | null;
  created_at?: string;
  createdAt?: string;
};

const activeKey = (uid: string) => `nuvora:active:${uid}`;
const EVENT = "nuvora:projects";
const fromApiProject = (p: ApiProject): Project => ({
  id: p.id, name: p.name, goal: p.goal ?? "", users: p.users ?? "", constraints: p.constraints ?? "",
  stage: fromApiStage(p.stage ?? "Idea") as Stage, repo: p.repo ?? null,
  createdAt: p.created_at ?? p.createdAt ?? new Date().toISOString(),
});

type State = { projects: Project[]; activeId: string | null; ready: boolean };

export function useProjects() {
  const user = useSession();
  const uid = user?.id;
  const [state, setState] = useState<State>({ projects: [], activeId: null, ready: false });
  const [tick, setTick] = useState(0);

  // Called by event listeners and exposed to callers; it only bumps a counter
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Subscribe to external change signals
  useEffect(() => {
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  // Fetch whenever the user changes or a refresh is requested
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    api.projects.list()
      .then((result) => {
        if (cancelled) return;
        const projects = result.projects.map(fromApiProject);
        const stored = localStorage.getItem(activeKey(uid));
        const activeId = projects.find((p) => p.id === stored)?.id ?? projects[0]?.id ?? null;
        setState({ projects, activeId, ready: true });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Could not load projects from the API", error);
        setState((current) => ({ ...current, ready: true }));
      });
    return () => { cancelled = true; };
  }, [uid, tick]);

  // Derived during render, so no setState is needed for these two cases
  const view: State =
    user === undefined ? { projects: [], activeId: null, ready: false }
    : !uid ? { projects: [], activeId: null, ready: true }
    : state;

  const create = useCallback(async (input: NewProject): Promise<Project> => {
    if (!uid) throw new Error("Not signed in");
    const { project } = await api.projects.create(input);
    const created = fromApiProject(project);
    localStorage.setItem(activeKey(uid), created.id);
    setState((current) => ({ projects: [created, ...current.projects], activeId: created.id, ready: true }));
    window.dispatchEvent(new Event(EVENT));
    return created;
  }, [uid]);

  const update = useCallback(async (id: string, patch: Partial<Omit<Project, "id" | "createdAt">>) => {
    const { stage, ...rest } = patch;
    const payload = { ...rest, ...(stage ? { stage } : {}) };
    const { project } = await api.projects.update(id, payload);
    const updated = fromApiProject(project);
    setState((current) => ({ ...current, projects: current.projects.map((p) => p.id === id ? updated : p) }));
    window.dispatchEvent(new Event(EVENT));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    if (!uid) return;
    await api.projects.delete(id);
    const next = state.projects.filter((project) => project.id !== id);
    const wasActive = localStorage.getItem(activeKey(uid)) === id;
    if (wasActive) {
      if (next[0]) localStorage.setItem(activeKey(uid), next[0].id);
      else localStorage.removeItem(activeKey(uid));
    }
    setState((current) => ({ ...current, projects: next, activeId: wasActive ? next[0]?.id ?? null : current.activeId }));
    window.dispatchEvent(new Event(EVENT));
  }, [state.projects, uid]);

  const setActive = useCallback((id: string) => {
    if (!uid) return;
    localStorage.setItem(activeKey(uid), id);
    setState((current) => ({ ...current, activeId: id }));
    window.dispatchEvent(new Event(EVENT));
  }, [uid]);

  return { ...view, active: view.projects.find((p) => p.id === view.activeId) ?? null, create, setActive, update, remove, refresh };
}
