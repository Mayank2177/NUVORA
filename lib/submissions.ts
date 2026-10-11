"use client";

import { useEffect, useState } from "react";
import { addVerification } from "@/lib/capability";
import { loadTasks, upsertTask, type Task } from "@/lib/market";
import { isHttpUrl } from "@/lib/profile";
import { SECRET_RE } from "@/lib/publish";
import type { Evidence } from "@/lib/data";
import type { Project } from "@/lib/store";

export type CheckStatus = "pass" | "fail" | "warn";
export type Check = { id: string; label: string; status: CheckStatus; detail: string };
export type TestRun = { project: string; file: string; passed: number; total: number; failures: string[]; ranAt: string; ms: number };
export type Review = { decision: "approved" | "changes_requested"; feedback: string; impact: string; met: string[]; at: string };
export type Submission = {
  id: string; taskId: string; devId: string; devName: string; round: number; submittedAt: string;
  summary: string; link: string; criteria: { text: string; how: string }[]; tests: TestRun | null; checks: Check[]; review?: Review;
};

const KEY = "nuvora:market:submissions";
const EVENT = "nuvora:market";
const FULL = "Couldn't save. Your browser storage is full.";
const now = () => new Date().toISOString();

export function loadSubmissions(): Submission[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Submission[]) : [];
  } catch {
    return [];
  }
}

export function saveSubmissions(list: Submission[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

export function useSubmissions(): Submission[] | undefined {
  const [v, setV] = useState<Submission[] | undefined>(undefined);
  useEffect(() => {
    const sync = () => setV(loadSubmissions());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return v;
}

/* ============ automated checks ============
   These check that the submission is complete and honest, and report any tests the developer ran.
   They don't judge the quality of the code. That is the employer's review. */

export type CheckInput = { summary: string; link: string; criteria: { text: string; how: string }[]; tests: TestRun | null };

export function buildChecks(i: CheckInput): Check[] {
  const out: Check[] = [];
  const s = i.summary.trim();
  out.push({ id: "summary", label: "Summary of the work", status: s.length >= 20 ? "pass" : "fail", detail: s.length >= 20 ? "Written." : "Describe what you did in at least 20 characters." });

  const done = i.criteria.filter((c) => c.how.trim().length >= 5).length;
  out.push({ id: "criteria", label: "Every acceptance criterion addressed", status: done === i.criteria.length ? "pass" : "fail", detail: `${done} of ${i.criteria.length} explained.` });

  const l = i.link.trim();
  out.push({
    id: "link", label: "Link to the work", status: !l ? "warn" : isHttpUrl(l) ? "pass" : "fail",
    detail: !l ? "No link added. A pull request or demo link lets the employer inspect the work." : isHttpUrl(l) ? "Looks valid." : "The link should start with https://",
  });

  const leaked = SECRET_RE.test([i.summary, i.link, ...i.criteria.map((c) => c.how)].join("\n"));
  out.push({ id: "secrets", label: "No keys or passwords", status: leaked ? "fail" : "pass", detail: leaked ? "Something looks like a key or password. Remove it." : "Nothing suspicious found." });

  const t = i.tests;
  if (!t) out.push({ id: "tests", label: "Automated tests", status: "warn", detail: "Not run. Optional, but passing tests make your work verifiable." });
  else if (t.total === 0 && t.failures.length === 0) out.push({ id: "tests", label: "Automated tests", status: "warn", detail: "The file ran but contains no tests." });
  else if (t.total > 0 && t.failures.length === 0) out.push({ id: "tests", label: "Automated tests", status: "pass", detail: `${t.passed} of ${t.total} passing.` });
  else out.push({ id: "tests", label: "Automated tests", status: "fail", detail: t.total > 0 ? `${t.total - t.passed} of ${t.total} failing. Fix them, run again, then submit.` : "The tests couldn't run. Fix the error, run again, then submit." });
  return out;
}

/* ============ developer: submit ============ */

export function submitWork(task: Pick<Task, "id">, dev: { id: string; name: string }, input: CheckInput): string | null {
  const t = loadTasks().find((x) => x.id === task.id);
  if (!t || t.assigneeId !== dev.id) return "This task isn't assigned to you.";
  if (t.status !== "assigned" && t.status !== "changes_requested") return "This task isn't accepting a submission right now.";
  const checks = buildChecks(input);
  if (checks.some((c) => c.status === "fail")) return "Fix the failing checks before submitting.";
  const all = loadSubmissions();
  const sub: Submission = {
    id: crypto.randomUUID(), taskId: t.id, devId: dev.id, devName: dev.name, round: all.filter((s) => s.taskId === t.id).length + 1,
    submittedAt: now(), summary: input.summary.trim(), link: input.link.trim(),
    criteria: input.criteria.map((c) => ({ text: c.text, how: c.how.trim() })), tests: input.tests, checks,
  };
  if (!saveSubmissions([sub, ...all])) return FULL;
  return upsertTask({ ...t, status: "in_review" }) ? null : FULL;
}

/* ============ employer: review ============ */

/** Approved work becomes career evidence. It's private until the developer chooses to share it. */
function addCareerEvidence(devId: string, task: Task) {
  const pid = `client-work-${devId}`;
  try {
    const lk = `nuvora:projects:${devId}`;
    const projects: Project[] = JSON.parse(localStorage.getItem(lk) ?? "[]");
    if (!projects.some((p) => p.id === pid)) {
      projects.push({
        id: pid, name: "Client work", goal: "Real tasks completed for businesses through Nuvora, validated by the people who asked for them.",
        users: "Businesses", constraints: "", stage: "Contribution", repo: null, createdAt: now(),
      });
      localStorage.setItem(lk, JSON.stringify(projects));
    }
    const dk = `nuvora:data:${pid}`;
    const data = JSON.parse(localStorage.getItem(dk) ?? '{"evidence":[],"blockers":[]}') as { evidence: Evidence[]; blockers: unknown[] };
    data.evidence.unshift({
      id: crypto.randomUUID(), type: "Pull request",
      text: `Delivered "${task.title}" for ${task.company}, approved by the employer (${task.skills.join(", ")})`,
      date: now(), source: "Nuvora validated task", provenance: "External", stage: "Contribution", public: false,
    });
    localStorage.setItem(dk, JSON.stringify(data));
    window.dispatchEvent(new Event("nuvora:projects"));
    window.dispatchEvent(new Event("nuvora:data"));
  } catch {
    /* storage full: the verification still counts */
  }
}

export function reviewSubmission(
  subId: string, employerId: string, input: { decision: Review["decision"]; feedback: string; impact: string; met: string[] },
): string | null {
  const all = loadSubmissions();
  const sub = all.find((s) => s.id === subId);
  const task = loadTasks().find((t) => t.id === sub?.taskId);
  if (!sub || !task) return "Submission not found.";
  if (task.employerId !== employerId) return "This isn't your task.";
  if (task.status !== "in_review" || sub.review) return "This submission was already reviewed.";

  const approve = input.decision === "approved";
  if (approve && input.met.length !== sub.criteria.length) return "Tick every acceptance criterion before approving.";
  if (!approve && input.feedback.trim().length < 10) return "Say what needs to change so the developer can fix it.";
  if (SECRET_RE.test(`${input.feedback}\n${input.impact}`)) return "This looks like it contains a password or key. Remove it before saving.";

  const review: Review = { decision: input.decision, feedback: input.feedback.trim(), impact: input.impact.trim(), met: input.met, at: now() };
  if (!saveSubmissions(all.map((s) => (s.id === subId ? { ...s, review } : s)))) return FULL;
  if (!upsertTask({ ...task, status: approve ? "completed" : "changes_requested" })) return FULL;

  if (approve) {
    task.skills.forEach((skill) => addVerification(sub.devId, { skill, taskTitle: task.title, company: task.company }));
    addCareerEvidence(sub.devId, task);
  }
  return null;
}