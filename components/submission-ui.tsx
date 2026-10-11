"use client";

import { AlertTriangle, Check, ExternalLink, FlaskConical, X } from "lucide-react";
import type { Check as CheckItem, Review, Submission, TestRun } from "@/lib/submissions";

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function CheckList({ checks }: { checks: CheckItem[] }) {
  return (
    <ul className="space-y-2.5" aria-label="Automated checks">
      {checks.map((c) => (
        <li key={c.id} className="flex gap-2.5 text-sm">
          <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${c.status === "pass" ? "bg-emerald-500 text-white" : c.status === "warn" ? "bg-amber-100 text-amber-700" : "bg-rose-500 text-white"}`}>
            {c.status === "pass" ? <Check size={12} strokeWidth={3} /> : c.status === "warn" ? <AlertTriangle size={11} /> : <X size={12} strokeWidth={3} />}
          </span>
          <span>
            <span className="font-medium">{c.label}</span>
            <span className="sr-only"> ({c.status === "pass" ? "passed" : c.status === "warn" ? "warning" : "failed"})</span>
            <span className="block text-slate-600">{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TestSummary({ t }: { t: TestRun }) {
  const ok = t.total > 0 && t.failures.length === 0;
  return (
    <div className={`rounded-xl p-3 text-sm ${ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
      <p className="flex flex-wrap items-center gap-2 font-medium"><FlaskConical size={15} /> {t.file} in {t.project}: {t.passed} of {t.total} passing</p>
      {t.failures.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs">{t.failures.map((f) => <li key={f} className="break-words">{f}</li>)}</ul>}
      <p className="mt-1 text-xs opacity-70">Run {fmt(t.ranAt)} in {t.ms} ms, using the developer&apos;s own workspace.</p>
    </div>
  );
}

export function SubmissionView({ sub }: { sub: Submission }) {
  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">Round {sub.round} · submitted {fmt(sub.submittedAt)} by {sub.devName}</p>
      <div>
        <h3 className="text-sm font-semibold">What they did</h3>
        <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{sub.summary}</p>
        {sub.link && (
          <a href={sub.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
            <span className="truncate">{sub.link}</span> <ExternalLink size={14} className="shrink-0" />
          </a>
        )}
      </div>
      {sub.tests && <TestSummary t={sub.tests} />}
      <div><h3 className="mb-2 text-sm font-semibold">Automated checks</h3><CheckList checks={sub.checks} /></div>
    </div>
  );
}

export function ReviewNote({ review, sub }: { review: Review; sub: Submission }) {
  const approved = review.decision === "approved";
  return (
    <div className={`rounded-2xl p-4 text-sm ${approved ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
      <p className="font-semibold">{approved ? "Approved" : "Changes requested"} · {fmt(review.at)}</p>
      {review.feedback && <p className="mt-1.5 whitespace-pre-wrap break-words">{review.feedback}</p>}
      {!approved && (
        <ul className="mt-3 space-y-1">
          {sub.criteria.map((c) => {
            const met = review.met.includes(c.text);
            return <li key={c.text} className="flex gap-2">{met ? <Check size={15} className="mt-0.5 shrink-0" /> : <X size={15} className="mt-0.5 shrink-0" />}<span>{c.text}{met ? "" : " (not yet met)"}</span></li>;
          })}
        </ul>
      )}
      {review.impact && <p className="mt-3"><span className="font-semibold">Business impact: </span>{review.impact}</p>}
    </div>
  );
}