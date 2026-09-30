"use client";

import { useEffect, useState } from "react";
import {
  Bot, BookOpen, Camera, Check, FlaskConical, GitCommit, GitPullRequest, Lightbulb, type LucideIcon,
} from "lucide-react";
import type { Project, Stage } from "@/lib/store";

export type Provenance = "Human" | "AI-assisted" | "Collaborator" | "External";
export type EvidenceType =
  | "Commit" | "Pull request" | "Test" | "Screenshot" | "Decision" | "Learning" | "AI session" | "Blocker resolved";

export type Evidence = {
  id: string;
  type: EvidenceType;
  text: string;
  date: string; // ISO
  source: string;
  provenance: Provenance;
  stage: Stage;
  public?: boolean; // undefined means private
};

export type Blocker = {
  id: string;
  title: string;
  status: "open" | "resolved";
  attempts: string[];
  solution?: string;
  createdAt: string;
  resolvedAt?: string;
};

export type ProjectData = { evidence: Evidence[]; blockers: Blocker[] };

export type NewEvidence = Omit<Evidence, "id" | "date"> & { date?: string };

export const PROV_STYLE: Record<Provenance, string> = {
  Human: "bg-emerald-50 text-emerald-700",
  "AI-assisted": "bg-violet-50 text-violet-700",
  Collaborator: "bg-amber-50 text-amber-700",
  External: "bg-sky-50 text-sky-700",
};

export const TYPE_ICON: Record<EvidenceType, LucideIcon> = {
  Commit: GitCommit,
  "Pull request": GitPullRequest,
  Test: FlaskConical,
  Screenshot: Camera,
  Decision: Lightbulb,
  Learning: BookOpen,
  "AI session": Bot,
  "Blocker resolved": Check,
};

/* ---------- storage ---------- */

const EVENT = "nuvora:data";
const key = (pid: string) => `nuvora:data:${pid}`;
const uid = () => crypto.randomUUID();
const daysAgo = (d: number, h = 0) => new Date(Date.now() - d * 86_400_000 - h * 3_600_000).toISOString();

/** MOCK: stands in for real GitHub activity until an API is connected. */
function seed(p: Pick<Project, "repo">): ProjectData {
  const ev: Evidence[] = [
    { id: uid(), type: "Decision", text: "Defined the project goal and target users", date: daysAgo(6), source: "Nuvora", provenance: "Human", stage: "Idea" },
    { id: uid(), type: "Learning", text: "Read the documentation for the core framework", date: daysAgo(5), source: "Browser attach", provenance: "External", stage: "Learn" },
  ];
  const blockers: Blocker[] = [];
  if (p.repo) {
    ev.push(
      { id: uid(), type: "Commit", text: "Initial project setup", date: daysAgo(4), source: p.repo, provenance: "Human", stage: "Build" },
      { id: uid(), type: "Commit", text: "Add authentication flow", date: daysAgo(3), source: p.repo, provenance: "Human", stage: "Build" },
      { id: uid(), type: "AI session", text: "Debugged environment configuration", date: daysAgo(2, 3), source: "Claude Code", provenance: "AI-assisted", stage: "Build" },
      { id: uid(), type: "Pull request", text: "Merge authentication feature", date: daysAgo(1), source: p.repo, provenance: "Collaborator", stage: "Build" },
      { id: uid(), type: "Commit", text: "Build dashboard layout", date: daysAgo(0, 2), source: p.repo, provenance: "Human", stage: "Build" },
    );
    blockers.push({
      id: uid(),
      title: "Authentication fails in production",
      status: "open",
      attempts: ["Checked environment variables", "Checked the auth config", "Tested locally: works"],
      createdAt: daysAgo(1, 5),
    });
  }
  return { evidence: ev, blockers };
}

function read(pid: string): ProjectData | null {
  try {
    const raw = localStorage.getItem(key(pid));
    return raw ? (JSON.parse(raw) as ProjectData) : null;
  } catch {
    return null;
  }
}

function write(pid: string, data: ProjectData) {
  localStorage.setItem(key(pid), JSON.stringify(data));
  window.dispatchEvent(new Event(EVENT));
}

/* ---------- hook ---------- */

export function useProjectData(project: Project | null) {
  const pid = project?.id;
  const repo = project?.repo ?? null;
  const stage = project?.stage;
  const [data, setData] = useState<ProjectData | null>(null);

  useEffect(() => {
    if (!pid) {
      setData(null);
      return;
    }
    const sync = () => {
      let d = read(pid);
      if (!d) {
        d = seed({ repo });
        write(pid, d);
      }
      setData(d);
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [pid, repo]);

  const mutate = (fn: (d: ProjectData) => ProjectData) => {
    if (!pid) return;
    write(pid, fn(read(pid) ?? seed({ repo })));
  };

  const addBlocker = (title: string) =>
    mutate((d) => ({
      ...d,
      blockers: [{ id: uid(), title, status: "open", attempts: [], createdAt: new Date().toISOString() }, ...d.blockers],
    }));

  const resolveBlocker = (id: string, solution: string) =>
    mutate((d) => {
      const b = d.blockers.find((x) => x.id === id);
      if (!b) return d;
      const now = new Date().toISOString();
      return {
        blockers: d.blockers.map((x) => (x.id === id ? { ...x, status: "resolved" as const, solution, resolvedAt: now } : x)),
        evidence: [
          { id: uid(), type: "Blocker resolved" as const, text: `${b.title}: ${solution}`, date: now, source: "Nuvora", provenance: "Human" as const, stage: stage ?? "Build" },
          ...d.evidence,
        ],
      };
    });

  const addEvidence = (e: NewEvidence) =>
    mutate((d) => ({
      ...d,
      evidence: [{ ...e, id: uid(), date: e.date ?? new Date().toISOString() }, ...d.evidence],
    }));

  const removeEvidence = (id: string) =>
    mutate((d) => ({ ...d, evidence: d.evidence.filter((e) => e.id !== id) }));

  const toggleEvidencePublic = (id: string) =>
    mutate((d) => ({ ...d, evidence: d.evidence.map((e) => (e.id === id ? { ...e, public: !e.public } : e)) }));

  const addAttempt = (id: string, attempt: string) =>
    mutate((d) => ({
      ...d,
      blockers: d.blockers.map((b) => (b.id === id ? { ...b, attempts: [...b.attempts, attempt] } : b)),
    }));

  const removeBlocker = (id: string) =>
    mutate((d) => ({ ...d, blockers: d.blockers.filter((b) => b.id !== id) }));
    return { data, addBlocker, resolveBlocker, addEvidence, removeEvidence, toggleEvidencePublic, addAttempt, removeBlocker };
}