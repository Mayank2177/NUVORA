"use client";

import { useEffect, useMemo, useState } from "react";
import type { Evidence, EvidenceType, Provenance } from "@/lib/data";
import type { Project } from "@/lib/store";
import type { SkillLevel } from "@/lib/market";

/* ============ levels ============ */

export type Level = 0 | 1 | 2 | 3 | 4;
export const LEVEL_LABEL = ["Self-declared", "Learned", "Practiced", "Applied", "Verified"] as const;
export const LEVEL_RULE = [
  "No evidence is linked to this skill yet.",
  "At least one linked item: a course, a note or a first commit.",
  "Two build points or more, with at least one item made by a person.",
  "Four build points or more, plus a published project, or a merged pull request alongside tests.",
  "Work in this skill was validated by an employer.",
] as const;
export const LEVEL_BADGE = ["bg-slate-100 text-slate-700", "bg-sky-50 text-sky-700", "bg-brand-50 text-brand-700", "bg-violet-50 text-violet-700", "bg-emerald-50 text-emerald-700"] as const;
export const LEVEL_BAR = ["bg-slate-300", "bg-sky-500", "bg-brand-600", "bg-violet-500", "bg-emerald-500"] as const;

/* ============ types ============ */

export type Verification = { id: string; skill: string; taskTitle: string; company: string; at: string };
export type SkillEvidence = {
  id: string; text: string; type: EvidenceType; provenance: Provenance; project: string; date: string;
  via: "mention" | "project"; weight: number;
};
export type SkillResult = {
  name: string; declared: SkillLevel; level: Level; points: number; evidence: SkillEvidence[];
  verified: Verification[]; projects: string[]; next: string; backed: boolean;
};
type ProjectInput = { project: Project; evidence: Evidence[]; published: boolean };

/* ============ matching rules ============
   Keyword-based and approximate. A real analysis would read the code itself.
   "project" scope: build work in a project that mentions the skill counts towards it.
   "item" scope: only items that mention the skill (or are of the listed types) count. */

type Rule = { name: string; terms: string[]; types?: EvidenceType[]; scope: "project" | "item" };
const RULES: Rule[] = [
  { name: "JavaScript", terms: ["javascript", "js", "react", "typescript", "node", "jest", "npm", "next.js", "nextjs"], scope: "project" },
  { name: "TypeScript", terms: ["typescript", "tsx"], scope: "project" },
  { name: "React", terms: ["react", "jsx", "next.js", "nextjs"], scope: "project" },
  { name: "Node.js", terms: ["node", "node.js", "nodejs", "express", "backend", "server", "api", "endpoint"], scope: "project" },
  { name: "Python", terms: ["python", "django", "flask", "pandas", "fastapi"], scope: "project" },
  { name: "SQL", terms: ["sql", "postgres", "postgresql", "mysql", "sqlite", "database", "query", "queries"], scope: "project" },
  { name: "APIs", terms: ["api", "apis", "endpoint", "rest", "graphql", "webhook"], scope: "project" },
  { name: "HTML and CSS", terms: ["html", "css", "tailwind", "responsive", "layout"], scope: "project" },
  { name: "Web performance", terms: ["performance", "lighthouse", "load time", "latency", "slow", "cache", "cached", "caching"], scope: "project" },
  { name: "Testing", terms: ["test", "tests", "testing", "jest", "vitest", "unit test", "integration test"], types: ["Test"], scope: "item" },
  { name: "Git", terms: ["git", "branch", "merge"], types: ["Commit", "Pull request"], scope: "item" },
];
const RULE_BY_KEY = Object.fromEntries(RULES.map((r) => [r.name.toLowerCase(), r]));

const BUILD: EvidenceType[] = ["Commit", "Pull request", "Test", "Blocker resolved", "AI session"];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matcher = (terms: string[]) => new RegExp(`(^|[^a-z0-9])(${terms.map(esc).join("|")})([^a-z0-9]|$)`, "i");
const half = (n: number) => String(Math.round(n * 2) / 2);
const EXPECTED: Record<SkillLevel, Level> = { Beginner: 1, Intermediate: 2, Advanced: 3 };

/* ============ storage ============ */

import { api } from "@/lib/api";

/**
 * Loads all projects and their evidence for capability analysis.
 * Fetches data from the backend API.
 */
export async function loadInput(uid: string): Promise<ProjectInput[]> {
  // Fetch all projects for the user
  const projectsResponse = await api.get(`/api/projects?user_id=${uid}`);
  const projects = (projectsResponse as { projects: Project[] }).projects || [];

  // Fetch evidence and publishing status for each project in parallel.
  return Promise.all(projects.map(async (project) => {
    const [evidenceData, publishedData] = await Promise.all([
      api.get(`/api/projects/${project.id}/evidence`),
      api.get(`/api/projects/${project.id}/publish/status`),
    ]);
    return {
      project,
      evidence: (evidenceData as { evidence: Evidence[] }).evidence || [],
      published: !!publishedData,
    };
  }));
}

export async function loadVerifications(uid: string): Promise<Verification[]> {
  const response = await api.get(`/api/skills/verifications?user_id=${uid}`);
  const data = response as { verifications: { id: string; skill: string; taskTitle: string; company: string; at: string }[]; total: number };
  return data.verifications.map((v) => ({
    id: v.id,
    skill: v.skill,
    taskTitle: v.taskTitle,
    company: v.company,
    at: v.at,
  }));
}

/** Called when an employer validates completed work (step 6 of the build). 
 * Note: This is now handled automatically by the backend when reviewing submissions,
 * but keeping this function for backwards compatibility. */
export function addVerification() {
  // Verifications are now created automatically by the backend during submission review
  // This function is deprecated but kept for backwards compatibility
  console.warn("addVerification is deprecated - verifications are now created automatically by the backend");
  window.dispatchEvent(new Event("nuvora:market"));
}

/* ============ analysis (pure) ============ */

export function analyseSkill(
  skill: { name: string; level: SkillLevel }, projects: ProjectInput[], verifs: Verification[], publicOnly: boolean,
): SkillResult {
  const key = skill.name.trim().toLowerCase();
  const rule = RULE_BY_KEY[key] ?? { name: skill.name, terms: [key], scope: "project" as const };
  const re = matcher(rule.terms);
  const items: SkillEvidence[] = [];
  const seen = new Set<string>();
  const projectNames: string[] = [];
  let shipped = false;

  for (const p of projects) {
    const ev = p.evidence.filter((e) => !publicOnly || e.public);
    const direct = (e: Evidence) => re.test(`${e.text} ${e.source}`) || !!rule.types?.includes(e.type);
    const desc = `${p.project.name} ${p.project.goal} ${p.project.constraints} ${p.project.repo ?? ""}`;
    // Employers only see a project's description if it is published
    const linked = rule.scope === "project" && ((!publicOnly || p.published) && re.test(desc) || ev.some(direct));

    let used = false;
    for (const e of ev) {
      if (!BUILD.includes(e.type) && e.type !== "Learning") continue;
      const via = direct(e) ? "mention" : linked && e.type !== "Learning" ? "project" : null;
      if (!via) continue;
      const id = `${e.type}|${e.text.trim().toLowerCase()}`;
      if (seen.has(id)) continue; // the same item counts once
      seen.add(id);
      used = true;
      items.push({
        id: e.id, text: e.text, type: e.type, provenance: e.provenance, project: p.project.name, date: e.date, via,
        weight: e.type === "Learning" ? 0 : e.provenance === "AI-assisted" ? 0.5 : 1,
      });
    }
    if (used) {
      projectNames.push(p.project.name);
      if (p.published) shipped = true;
    }
  }

  const build = items.filter((i) => i.type !== "Learning");
  const points = build.reduce((n, i) => n + i.weight, 0);
  const human = build.filter((i) => i.provenance !== "AI-assisted").length;
  const hasPR = items.some((i) => i.type === "Pull request");
  const hasTest = items.some((i) => i.type === "Test");
  const verified = verifs.filter((v) => v.skill.trim().toLowerCase() === key);

  let level: Level = 0;
  if (items.length > 0) level = 1;
  if (points >= 2 && human >= 1) level = 2;
  if (points >= 4 && human >= 1 && (shipped || (hasPR && hasTest))) level = 3;
  if (verified.length > 0) level = 4;

  let next: string;
  if (level === 0) next = `Add evidence that mentions ${skill.name}: a commit, a test or a course note.`;
  else if (level === 1) next = points < 2 ? `Reach 2 build points (you have ${half(points)}). AI-assisted items count half.` : "Add at least one item you made yourself, without AI.";
  else if (level === 2) {
    const parts: string[] = [];
    if (points < 4) parts.push(`${half(4 - points)} more build points`);
    if (!(shipped || (hasPR && hasTest))) parts.push("a published project, or a merged pull request alongside tests");
    next = `Add ${parts.join(" and ")}.`;
  } else if (level === 3) next = "Complete a task validated by an employer to reach L4.";
  else next = "Verified by an employer. Keep building to keep it current.";

  return {
    name: skill.name, declared: skill.level, level, points, evidence: items.sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    verified, projects: projectNames, next, backed: level >= EXPECTED[skill.level],
  };
}

/* ============ hook ============ */

function useDataVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((n) => n + 1);
    const names = ["nuvora:data", "nuvora:projects", "nuvora:market", "storage"];
    names.forEach((n) => window.addEventListener(n, bump));
    return () => {
      names.forEach((n) => window.removeEventListener(n, bump));
    };
  }, []);
  return v;
}

const EMPTY = { results: [] as SkillResult[], suggestions: [] as SkillResult[], counts: { all: 0, pub: 0 }, verifications: [] as Verification[], loading: true, error: null as string | null };

/** publicOnly = what an employer could see. */
export function useCapability(uid: string | undefined, skills: { name: string; level: SkillLevel }[], publicOnly: boolean) {
  const version = useDataVersion();
  const key = skills.map((s) => `${s.name}:${s.level}`).join("|");
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [input, setInput] = useState<ProjectInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const requestKey = uid ? `${uid}:${version}` : "";
  const [loadedKey, setLoadedKey] = useState("");
  
  useEffect(() => {
    if (!uid) return;
    let active = true;
    Promise.all([
      loadInput(uid),
      loadVerifications(uid)
    ]).then(([inputData, verifs]) => {
      if (!active) return;
      setInput(inputData);
      setVerifications(verifs);
      setError(null);
      setLoadedKey(requestKey);
    }).catch((reason: unknown) => {
      if (!active) return;
      console.error("Failed to load capability data:", reason);
      setError("Could not load capability data. Please try again.");
      setLoadedKey(requestKey);
    });
    return () => { active = false; };
  }, [uid, version, requestKey]);
  
  return useMemo(() => {
    const isLoading = !!uid && loadedKey !== requestKey;
    if (!uid || isLoading || error) return { ...EMPTY, loading: isLoading, error: isLoading ? null : error };
    const all = input.flatMap((p) => p.evidence);
    const declared = new Set(skills.map((s) => s.name.trim().toLowerCase()));
    return {
      results: skills.map((s) => analyseSkill(s, input, verifications, publicOnly)),
      suggestions: RULES.filter((r) => !declared.has(r.name.toLowerCase()))
        .map((r) => analyseSkill({ name: r.name, level: "Beginner" }, input, verifications, publicOnly))
        .filter((r) => r.level >= 1),
      counts: { all: all.length, pub: all.filter((e) => e.public).length },
      verifications,
      loading: false,
      error: null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key, version, requestKey, loadedKey, publicOnly, verifications, input, error]);
}
