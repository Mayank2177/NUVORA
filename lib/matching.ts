"use client";

import { USERS_KEY } from "@/lib/auth";
import { analyseSkill, loadInput, loadVerifications, type Level } from "@/lib/capability";
import { DEMO_DEV } from "@/lib/demo";
import type { DevRecord, Task } from "@/lib/market";

/* ============ the score ============
   Transparent and rule-based, not AI. For each skill the task needs, the developer earns a weight
   from the level their EVIDENCE supports. The score is the average, as a percentage.
   Skills they only claim count for a little. Employers see evidence the developer made public. */

const WEIGHT = [0.15, 0.4, 0.7, 0.9, 1] as const; // L0 (self-declared) to L4 (verified)

export type SkillMatch = { skill: string; level: Level; items: number; declared: boolean; weight: number; verified: boolean };
export type Match = { score: number; label: "Strong" | "Good" | "Partial" | "Weak"; skills: SkillMatch[]; strong: string[]; gaps: string[] };
export type Prep = { input: ReturnType<typeof loadInput>; verifs: ReturnType<typeof loadVerifications> };

export const prep = (uid: string): Prep => ({ input: loadInput(uid), verifs: loadVerifications(uid) });

export const labelFor = (score: number): Match["label"] => (score >= 75 ? "Strong" : score >= 50 ? "Good" : score >= 25 ? "Partial" : "Weak");

export function matchTask(task: Pick<Task, "skills">, p: Prep, declared: string[], publicOnly: boolean): Match {
  const dec = new Set(declared.map((d) => d.trim().toLowerCase()));
  const skills: SkillMatch[] = task.skills.map((name) => {
    const r = analyseSkill({ name, level: "Beginner" }, p.input, p.verifs, publicOnly);
    const isDeclared = dec.has(name.trim().toLowerCase());
    const weight = r.level > 0 ? WEIGHT[r.level] : isDeclared ? WEIGHT[0] : 0;
    return { skill: name, level: r.level, items: r.evidence.length, declared: isDeclared, weight, verified: r.verified.length > 0 };
  });
  const score = skills.length ? Math.round((skills.reduce((n, s) => n + s.weight, 0) / skills.length) * 100) : 0;
  return {
    score, label: labelFor(score), skills,
    strong: skills.filter((s) => s.level >= 3).map((s) => s.skill),
    gaps: skills.filter((s) => s.level <= 1).map((s) => s.skill),
  };
}

/* ============ developer directory ============ */

export type Dev = { userId: string; name: string; rec: DevRecord };

export function listDevelopers(): Dev[] {
  let users: { id: string; name: string }[] = [];
  try {
    users = JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]");
  } catch {
    users = [];
  }
  const out: Dev[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith("nuvora:dev:")) continue;
    try {
      const rec = JSON.parse(localStorage.getItem(k) ?? "null") as DevRecord | null;
      if (!rec?.userId) continue;
      const name = rec.name ?? users.find((u) => u.id === rec.userId)?.name ?? (rec.userId === DEMO_DEV.id ? DEMO_DEV.name : "Developer");
      out.push({ userId: rec.userId, name, rec });
    } catch {
      /* skip unreadable records */
    }
  }
  return out;
}

export const getDeveloper = (uid: string) => listDevelopers().find((d) => d.userId === uid) ?? null;