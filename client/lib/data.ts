"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, BookOpen, Camera, Check, FlaskConical, GitCommit, GitPullRequest, Lightbulb, type LucideIcon } from "lucide-react";
import type { Project, Stage } from "@/lib/store";
import { api, fromApiStage } from "@/lib/api-client";

export type Provenance = "Human" | "AI-assisted" | "Collaborator" | "External";
export type EvidenceType = "Commit" | "Pull request" | "Test" | "Screenshot" | "Decision" | "Learning" | "AI session" | "Blocker resolved";
export type Evidence = { id: string; type: EvidenceType; text: string; date: string; source: string; provenance: Provenance; stage: Stage; public?: boolean };
export type Blocker = { id: string; title: string; status: "open" | "resolved"; attempts: string[]; solution?: string; createdAt: string; resolvedAt?: string };
export type ProjectData = { evidence: Evidence[]; blockers: Blocker[] };
export type NewEvidence = Omit<Evidence, "id" | "date"> & { date?: string };

export const PROV_STYLE: Record<Provenance, string> = {
  Human: "bg-emerald-50 text-emerald-700", "AI-assisted": "bg-violet-50 text-violet-700",
  Collaborator: "bg-amber-50 text-amber-700", External: "bg-sky-50 text-sky-700",
};
export const TYPE_ICON: Record<EvidenceType, LucideIcon> = {
  Commit: GitCommit, "Pull request": GitPullRequest, Test: FlaskConical, Screenshot: Camera,
  Decision: Lightbulb, Learning: BookOpen, "AI session": Bot, "Blocker resolved": Check,
};

const mapEvidence = (raw: unknown): Evidence => {
  const e = raw as Record<string, unknown>;
  return {
    id: String(e.id ?? ""), type: String(e.type ?? "Learning") as EvidenceType,
    text: String(e.text ?? e.title ?? ""), date: String(e.date ?? e.when ?? e.created_at ?? new Date().toISOString()),
    source: String(e.source ?? ""), provenance: String(e.provenance ?? (e.aiAssisted ? "AI-assisted" : "Human")) as Provenance,
    stage: fromApiStage(String(e.stage ?? "Learn")) as Stage, public: Boolean(e.public ?? e.publish),
  };
};
const mapBlocker = (raw: unknown): Blocker => {
  const b = raw as Record<string, unknown>;
  return {
    id: String(b.id ?? ""), title: String(b.title ?? ""), status: b.status === "resolved" ? "resolved" : "open",
    attempts: Array.isArray(b.attempts) ? b.attempts.map(String) : [],
    solution: typeof b.solution === "string" ? b.solution : undefined,
    createdAt: String(b.created_at ?? b.createdAt ?? ""),
    resolvedAt: typeof (b.resolved_at ?? b.resolvedAt) === "string" ? String(b.resolved_at ?? b.resolvedAt) : undefined,
  };
};
const event = () => typeof window !== "undefined" && window.dispatchEvent(new Event("nuvora:data"));

export function useProjectData(project: Project | null) {
  const pid = project?.id;
  const [data, setData] = useState<ProjectData | null>(null);
  const [revision] = useState(0);

  const refresh = useCallback(async () => {
    if (!pid) { setData(null); return; }
    try {
      const [e, b, c] = await Promise.all([api.evidence.list(pid), api.blockers.list(pid), api.commits.list(pid)]);
      const commits: Evidence[] = c.commits.map((commit) => ({
        id: commit.id,
        type: "Commit",
        text: commit.message,
        date: commit.when,
        source: commit.author ?? project?.repo ?? "GitHub",
        provenance: "External",
        stage: project?.stage ?? "Build",
        public: false,
      }));
      setData({ evidence: [...e.evidence.map(mapEvidence), ...commits], blockers: b.blockers.map(mapBlocker) });
    } catch (error) { console.error("Could not load project data from the API", error); setData({ evidence: [], blockers: [] }); }
  }, [pid, project?.repo, project?.stage]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setData(null); void refresh(); }, [refresh, revision]);
  const mutate = async (operation: () => Promise<unknown>) => {
    await operation();
    await refresh();
    event();
  };

  return {
    data,
    refresh,
    addBlocker: (title: string) => mutate(() => api.blockers.create(pid!, title)),
    resolveBlocker: (id: string, solution: string) => mutate(() => api.blockers.resolve(id, solution)),
    addEvidence: (e: NewEvidence) => mutate(() => api.evidence.create(pid!, { ...e, date: e.date ?? new Date().toISOString() })),
    removeEvidence: (id: string) => mutate(() => api.evidence.delete(id)),
    toggleEvidencePublic: (id: string) => mutate(() => api.evidence.togglePublic(id)),
    addAttempt: (id: string, attempt: string) => mutate(() => api.blockers.addAttempt(id, attempt)),
    removeBlocker: (id: string) => mutate(() => api.blockers.delete(id)),
  };
}


