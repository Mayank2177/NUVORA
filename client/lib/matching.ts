"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { analyseSkill, loadInput, loadVerifications, type Level } from "@/lib/capability";
import type { DevRecord, Task } from "@/lib/market";

/* ============ the score ============
   Transparent and rule-based, not AI. For each skill the task needs, the developer earns a weight
   from the level their EVIDENCE supports. The score is the average, as a percentage.
   Skills they only claim count for a little. Employers see evidence the developer made public. */

const WEIGHT = [0.15, 0.4, 0.7, 0.9, 1] as const; // L0 (self-declared) to L4 (verified)

export type SkillMatch = { skill: string; level: Level; items: number; declared: boolean; weight: number; verified: boolean };
export type Match = { score: number; label: "Strong" | "Good" | "Partial" | "Weak"; skills: SkillMatch[]; strong: string[]; gaps: string[] };
export type Prep = { input: Awaited<ReturnType<typeof loadInput>>; verifs: Awaited<ReturnType<typeof loadVerifications>> };

export const prep = (input: Prep["input"], verifs: Prep["verifs"]): Prep => ({ input, verifs });

export async function loadPrep(uid: string): Promise<Prep> {
  const [input, verifs] = await Promise.all([loadInput(uid), loadVerifications(uid)]);
  return prep(input, verifs);
}

export function usePrep(uid?: string): Prep | null {
  const [state, setState] = useState<{ uid: string; value: Prep } | null>(null);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    void loadPrep(uid).then((value) => { if (active) setState({ uid, value }); });
    return () => { active = false; };
  }, [uid]);
  return uid && state?.uid === uid ? state.value : null;
}

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

/** List developers discoverable for an employer-owned task. */
export async function listDevelopers(taskId: string): Promise<Dev[]> {
  const response = await api.get<{ candidates: { userId: string }[] }>(`/api/tasks/${taskId}/candidates`);
  const developers = await Promise.all(response.candidates.map(({ userId }) => getDeveloper(userId)));
  return developers.filter((developer): developer is Dev => developer !== null);
}

export async function getDeveloper(uid: string): Promise<Dev | null> {
  try {
    const response = await api.get(`/api/onboarding/developer/${uid}`);
    const rec = response as DevRecord;
    return {
      userId: rec.userId,
      name: rec.name || "Developer",
      rec,
    };
  } catch {
    return null;
  }
}
