"use client";

import { STAGES, type Project, type Stage } from "@/lib/store";
import type { Blocker, Evidence } from "@/lib/data";

export type Story = { problem: string; process: string; build: string; challenges: string; result: string };
export type Draft = { slug: string; story: Story | null; includeBlockers: boolean };
export type Snapshot = {
  projectId: string;
  slug: string;
  name: string;
  goal: string;
  users: string;
  stage: Stage;
  repo: string | null;
  author: string;
  publishedAt: string;
  story: Story;
  evidence: Evidence[];
  blockers: Blocker[];
};

export const STORY_LABELS: Record<keyof Story, string> = {
  problem: "The problem",
  process: "The process",
  build: "The build",
  challenges: "Challenges",
  result: "The result",
};

/* ---------- storage ---------- */

const draftKey = (pid: string) => `nuvora:pubdraft:${pid}`;
const snapKey = (slug: string) => `nuvora:public:${slug}`;
const pubKey = (pid: string) => `nuvora:published:${pid}`;

function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const loadDraft = (pid: string) => get<Draft>(draftKey(pid));
export const saveDraft = (pid: string, d: Draft) => localStorage.setItem(draftKey(pid), JSON.stringify(d));
export const getSnapshot = (slug: string) => get<Snapshot>(snapKey(slug));
export const getPublishedSlug = (pid: string) => get<string>(pubKey(pid));

export function slugTaken(slug: string, pid: string) {
  const s = getSnapshot(slug);
  return !!s && s.projectId !== pid;
}

export function publishSnapshot(s: Snapshot) {
  const prev = getPublishedSlug(s.projectId);
  if (prev && prev !== s.slug) localStorage.removeItem(snapKey(prev));
  localStorage.setItem(snapKey(s.slug), JSON.stringify(s));
  localStorage.setItem(pubKey(s.projectId), JSON.stringify(s.slug));
}

export function unpublish(pid: string) {
  const slug = getPublishedSlug(pid);
  if (slug) localStorage.removeItem(snapKey(slug));
  localStorage.removeItem(pubKey(pid));
}

/* ---------- slug ---------- */

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* ---------- safety scan ---------- */

export const SECRET_RE = /(sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|(password|secret|api[_-]?key|token)\s*[:=]\s*\S+)/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;

/** secrets block publishing. personal info only warns. */
export function scan(story: Story, evidence: Evidence[], blockers: Blocker[]) {
  const secrets: string[] = [];
  const personal: string[] = [];
  const check = (where: string, text: string) => {
    if (SECRET_RE.test(text)) secrets.push(where);
    if (EMAIL_RE.test(text)) personal.push(where);
  };
  (Object.keys(story) as (keyof Story)[]).forEach((k) => check(`Story: ${STORY_LABELS[k]}`, story[k]));
  evidence.forEach((e) => check(`Evidence: ${e.text.slice(0, 40)}`, `${e.text} ${e.source}`));
  blockers.forEach((b) => check(`Blocker: ${b.title.slice(0, 40)}`, `${b.title} ${b.solution ?? ""} ${b.attempts.join(" ")}`));
  return { secrets, personal };
}

/* ---------- story generation (rule-based) ---------- */

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
const list = (a: string[]) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);

export function generateStory(p: Pick<Project, "name" | "goal" | "users" | "constraints" | "stage">, ev: Evidence[], blockers: Blocker[]): Story {
  const of = (t: Evidence["type"]) => ev.filter((e) => e.type === t);
  const ai = ev.filter((e) => e.provenance === "AI-assisted").length;
  const human = ev.filter((e) => e.provenance === "Human").length;

  const problem = [
    sentence(p.goal),
    `It is built for ${p.users.replace(/[.]$/, "")}.`,
    p.constraints ? `Constraints: ${sentence(p.constraints)}` : "",
  ].filter(Boolean).join(" ");

  const learning = of("Learning");
  const decisions = of("Decision");
  const seen = STAGES.filter((s) => ev.some((e) => e.stage === s));
  const process = [
    learning.length ? `Learned from ${plural(learning.length, "resource")}: ${list(learning.slice(0, 3).map((e) => e.text))}.` : "",
    decisions.length ? `Key decisions: ${list(decisions.slice(0, 3).map((e) => e.text))}.` : "",
    !learning.length && !decisions.length
      ? seen.length > 1 ? `The work moved through ${seen.length} stages, from ${seen[0]} to ${seen[seen.length - 1]}.` : "The process is still being documented."
      : "",
  ].filter(Boolean).join(" ");

  const parts = [
    of("Commit").length && plural(of("Commit").length, "commit"),
    of("Pull request").length && plural(of("Pull request").length, "pull request"),
    of("Test").length && plural(of("Test").length, "test result"),
    of("Screenshot").length && plural(of("Screenshot").length, "screenshot"),
  ].filter(Boolean) as string[];
  const build = ev.length
    ? [
        parts.length ? `The build is backed by ${list(parts)}.` : "",
        `Of ${plural(ev.length, "public evidence item")}, ${human} ${human === 1 ? "was" : "were"} made by a human and ${ai} with AI assistance. Every item shows its provenance.`,
      ].filter(Boolean).join(" ")
    : "No build evidence is public yet.";

  const challenges = blockers
    .map((b) => `${b.title}. Solved by: ${sentence(b.solution ?? "resolved")}`)
    .join("\n\n");

  const result = ev.length
    ? `${p.name} is currently in the ${p.stage} stage, with ${plural(ev.length, "public evidence item")}${blockers.length ? ` and ${plural(blockers.length, "resolved blocker")}` : ""} on record.`
    : "Make some evidence public to show what has been achieved.";

  return { problem, process, build, challenges, result };
}