"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/auth";

export const STAGES = [
  "Think", "Learn", "Practice", "Get unstuck", "Prototype", "Build",
  "Validate", "Document", "Publish", "Demonstrate", "Opportunity", "Contribution",
] as const;
export type Stage = (typeof STAGES)[number];

export type Project = {
  id: string;
  name: string;
  goal: string;
  users: string;
  constraints: string;
  stage: Stage;
  repo: string | null; // "owner/repo"
  createdAt: string;
};
export type NewProject = Omit<Project, "id" | "createdAt">;

const EVENT = "nuvora:projects";
const listKey = (uid: string) => `nuvora:projects:${uid}`;
const activeKey = (uid: string) => `nuvora:active:${uid}`;

function readList(uid: string): Project[] {
  try {
    const raw = localStorage.getItem(listKey(uid));
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}

type State = { projects: Project[]; activeId: string | null; ready: boolean };

export function useProjects() {
  const user = useSession();
  const uid = user?.id;
  const [state, setState] = useState<State>({ projects: [], activeId: null, ready: false });

  useEffect(() => {
    if (!uid) return;
    const sync = () => {
      const projects = readList(uid);
      const stored = localStorage.getItem(activeKey(uid));
      const activeId = projects.find((p) => p.id === stored)?.id ?? projects[0]?.id ?? null;
      setState({ projects, activeId, ready: true });
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [uid]);

  const create = useCallback(
    (input: NewProject): Project => {
      if (!uid) throw new Error("Not signed in");
      const project: Project = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      localStorage.setItem(listKey(uid), JSON.stringify([project, ...readList(uid)]));
      localStorage.setItem(activeKey(uid), project.id);
      window.dispatchEvent(new Event(EVENT));
      return project;
    },
    [uid],
  );

  const update = useCallback(
    (id: string, patch: Partial<Omit<Project, "id" | "createdAt">>) => {
      if (!uid) return;
      const next = readList(uid).map((p) => (p.id === id ? { ...p, ...patch } : p));
      localStorage.setItem(listKey(uid), JSON.stringify(next));
      window.dispatchEvent(new Event(EVENT));
    },
    [uid],
  );

  const setActive = useCallback(
    (id: string) => {
      if (!uid) return;
      localStorage.setItem(activeKey(uid), id);
      window.dispatchEvent(new Event(EVENT));
    },
    [uid],
  );

  return {
    ...state,
    active: state.projects.find((p) => p.id === state.activeId) ?? null,
    create,
    setActive,
    update, // <- add this
  };
}