"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isHttpUrl } from "@/lib/profile";
import { SECRET_RE } from "@/lib/publish";
import type { Task } from "@/lib/market";

export type CheckStatus = "pass" | "fail" | "warn";
export type Check = { id: string; label: string; status: CheckStatus; detail: string };
export type TestRun = {
  project: string;
  file: string;
  passed: number;
  total: number;
  failures: string[];
  ranAt: string;
  ms: number;
};
export type Review = {
  decision: "approved" | "changes_requested";
  feedback: string;
  impact: string;
  met: string[];
  at: string;
};
export type Submission = {
  id: string;
  taskId: string;
  devId: string;
  devName: string;
  round: number;
  submittedAt: string;
  summary: string;
  link: string;
  criteria: { text: string; how: string }[];
  tests: TestRun | null;
  checks: Check[];
  review?: Review;
};

const EVENT = "nuvora:market";
type ApiSubmission = {
  id: string;
  taskId: string;
  developerId: string;
  devName?: string;
  round?: number;
  submittedAt: string;
  summary?: string;
  link?: string;
  criteria?: Submission["criteria"];
  tests?: TestRun | null;
  checks?: Check[];
  review?: Review;
};
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

// ========== API functions ==========

export async function loadSubmissions(): Promise<Submission[]> {
  const response = await api.get("/api/tasks/submissions");
  return (response as ApiSubmission[]).map(mapSubmission);
}

export async function loadTaskSubmissions(taskId: string): Promise<Submission[]> {
  const response = await api.get(`/api/tasks/${taskId}/submissions`);
  return (response as ApiSubmission[]).map(mapSubmission);
}

function mapSubmission(s: ApiSubmission): Submission {
  return {
    id: s.id,
    taskId: s.taskId,
    devId: s.developerId,
    devName: s.devName || "",
    round: s.round || 1,
    submittedAt: s.submittedAt,
    summary: s.summary || "",
    link: s.link || "",
    criteria: s.criteria || [],
    tests: s.tests || null,
    checks: s.checks || [],
    review: s.review || undefined,
  };
}

// ========== Hook for reactivity ==========

export function useSubmissions(): Submission[] | undefined {
  const [v, setV] = useState<Submission[] | undefined>(undefined);
  useEffect(() => {
    const sync = async () => {
      try {
        const subs = await loadSubmissions();
        setV(subs);
      } catch (error) {
        console.error("Failed to load submissions:", error);
        setV(undefined);
      }
    };
    sync();
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener(EVENT, sync);
    };
  }, []);
  return v;
}

/* ============ automated checks ============
   These check that the submission is complete and honest, and report any tests the developer ran.
   They don't judge the quality of the code. That is the employer's review. */

export type CheckInput = {
  summary: string;
  link: string;
  criteria: { text: string; how: string }[];
  tests: TestRun | null;
};

export function buildChecks(i: CheckInput): Check[] {
  const out: Check[] = [];
  const s = i.summary.trim();
  out.push({
    id: "summary",
    label: "Summary of the work",
    status: s.length >= 20 ? "pass" : "fail",
    detail:
      s.length >= 20
        ? "Written."
        : "Describe what you did in at least 20 characters.",
  });

  const done = i.criteria.filter((c) => c.how.trim().length >= 5).length;
  out.push({
    id: "criteria",
    label: "Every acceptance criterion addressed",
    status: done === i.criteria.length ? "pass" : "fail",
    detail: `${done} of ${i.criteria.length} explained.`,
  });

  const l = i.link.trim();
  out.push({
    id: "link",
    label: "Link to the work",
    status: !l ? "warn" : isHttpUrl(l) ? "pass" : "fail",
    detail: !l
      ? "No link added. A pull request or demo link lets the employer inspect the work."
      : isHttpUrl(l)
        ? "Looks valid."
        : "The link should start with https://",
  });

  const leaked = SECRET_RE.test(
    [i.summary, i.link, ...i.criteria.map((c) => c.how)].join("\n")
  );
  out.push({
    id: "secrets",
    label: "No keys or passwords",
    status: leaked ? "fail" : "pass",
    detail: leaked
      ? "Something looks like a key or password. Remove it."
      : "Nothing suspicious found.",
  });

  const t = i.tests;
  if (!t)
    out.push({
      id: "tests",
      label: "Automated tests",
      status: "warn",
      detail:
        "Not run. Optional, but passing tests make your work verifiable.",
    });
  else if (t.total === 0 && t.failures.length === 0)
    out.push({
      id: "tests",
      label: "Automated tests",
      status: "warn",
      detail: "The file ran but contains no tests.",
    });
  else if (t.total > 0 && t.failures.length === 0)
    out.push({
      id: "tests",
      label: "Automated tests",
      status: "pass",
      detail: `${t.passed} of ${t.total} passing.`,
    });
  else
    out.push({
      id: "tests",
      label: "Automated tests",
      status: "fail",
      detail:
        t.total > 0
          ? `${t.total - t.passed} of ${t.total} failing. Fix them, run again, then submit.`
          : "The tests couldn't run. Fix the error, run again, then submit.",
    });
  return out;
}

/* ============ developer: submit ============ */

export async function submitWork(
  task: Pick<Task, "id">,
  dev: { id: string; name: string },
  input: CheckInput
): Promise<string | null> {
  try {
    const checks = buildChecks(input);
    if (checks.some((c) => c.status === "fail")) {
      return "Fix the failing checks before submitting.";
    }

    await api.post(`/api/tasks/${task.id}/submit`, {
      summary: input.summary.trim(),
      link: input.link.trim(),
      submissionUrl: input.link.trim(),
      notes: "",
      criteria: input.criteria.map((c) => ({ text: c.text, how: c.how.trim() })),
      tests: input.tests,
      checks: checks,
    });

    window.dispatchEvent(new Event(EVENT));
    return null;
  } catch (error: unknown) {
    return errorText(error, "Failed to submit work.");
  }
}

/* ============ employer: review ============ */

export async function reviewSubmission(
  subId: string,
  taskId: string,
  employerId: string,
  input: {
    decision: Review["decision"];
    feedback: string;
    impact: string;
    met: string[];
  }
): Promise<string | null> {
  try {
    // Validate inputs
    const approve = input.decision === "approved";
    if (!approve && input.feedback.trim().length < 10) {
      return "Say what needs to change so the developer can fix it.";
    }
    if (SECRET_RE.test(`${input.feedback}\n${input.impact}`)) {
      return "This looks like it contains a password or key. Remove it before saving.";
    }

    await api.post(`/api/tasks/${taskId}/submissions/${subId}/review`, {
      decision: input.decision,
      feedback: input.feedback.trim(),
      impact: input.impact.trim(),
      met: input.met,
    });

    window.dispatchEvent(new Event(EVENT));
    return null;
  } catch (error: unknown) {
    return errorText(error, "Failed to review submission.");
  }
}
