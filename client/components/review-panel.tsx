"use client";

import { useState } from "react";
import { AlertCircle, Check, ClipboardCheck } from "lucide-react";
import { useSession } from "@/lib/auth";
import type { Task } from "@/lib/market";
import { reviewSubmission, useSubmissions, type Submission } from "@/lib/submissions";
import { ReviewNote, SubmissionView } from "@/components/submission-ui";

const inputCls = "w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";

function ReviewForm({ sub, task, employerId }: { sub: Submission; task: Task; employerId: string }) {
  const [met, setMet] = useState<boolean[]>(() => sub.criteria.map(() => false));
  const [feedback, setFeedback] = useState("");
  const [impact, setImpact] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const all = met.every(Boolean);

  async function decide(decision: "approved" | "changes_requested") {
    const e = await reviewSubmission(sub.id, task.id, employerId, { decision, feedback, impact, met: sub.criteria.filter((_, i) => met[i]).map((c) => c.text) });
    if (e) { setError(e); setConfirm(false); }
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="mt-8 border-t border-slate-100 pt-6">
      <h3 className="font-semibold">Your review</h3>
      <p className="mt-1 text-sm text-slate-600">Check each criterion against the work. Tick the ones that are met.</p>
      <ul className="mt-4 space-y-3">
        {sub.criteria.map((c, i) => (
          <li key={c.text} className="rounded-xl border border-slate-100 p-3">
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" checked={met[i]} onChange={() => setMet(met.map((m, j) => (j === i ? !m : m)))} className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-600" />
              <span><span className="font-medium">{c.text}</span><span className="mt-1 block text-slate-600"><span className="font-medium text-slate-700">Developer says: </span>{c.how}</span></span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-5">
        <label htmlFor="feedback" className="mb-1.5 block text-sm font-medium text-slate-700">Feedback {all ? "(optional)" : "(required to request changes)"}</label>
        <textarea id="feedback" rows={3} value={feedback} maxLength={600} onChange={(e) => { setFeedback(e.target.value); setError(""); }} placeholder="What's good, and what needs to change?" className={inputCls} />
      </div>
      <div className="mt-4">
        <label htmlFor="impact" className="mb-1.5 block text-sm font-medium text-slate-700">Business impact (optional)</label>
        <textarea id="impact" rows={2} value={impact} maxLength={300} onChange={(e) => { setImpact(e.target.value); setError(""); }} placeholder="What changed for your business? For example: pages now load in half the time." className={inputCls} />
        <p className="mt-1 text-xs text-slate-500">Only the developer sees this. It is not added to their public profile.</p>
      </div>

      {error && <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-rose-600"><AlertCircle size={14} className="shrink-0" /> {error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {confirm ? (
          <>
            <button type="button" onClick={() => decide("approved")} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Confirm approval</button>
            <button type="button" onClick={() => setConfirm(false)} className="px-3 py-2.5 text-sm font-medium text-slate-600">Cancel</button>
            <p className="basis-full text-sm text-slate-600">Approving marks the task complete and verifies {task.skills.join(", ")} for {sub.devName}. This can&apos;t be undone.</p>
          </>
        ) : (
          <>
            <button type="button" disabled={!all} onClick={() => setConfirm(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700 disabled:opacity-50 disabled:shadow-none"><Check size={16} /> Approve</button>
            <button type="button" onClick={() => decide("changes_requested")} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">Request changes</button>
            {!all && <p className="text-sm text-slate-500">Tick every criterion to approve.</p>}
          </>
        )}
      </div>
    </form>
  );
}

export function ReviewPanel({ task }: { task: Task }) {
  const user = useSession();
  const subs = useSubmissions();
  if (!subs || !user) return null;

  const list = subs.filter((s) => s.taskId === task.id).sort((a, b) => b.round - a.round);
  const latest = list[0];
  const history = list.filter((s) => s !== latest && s.review);
  const shell = "mt-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8";

  return (
    <section className={shell} aria-label="Work review">
      <h2 className="flex items-center gap-2 font-semibold"><ClipboardCheck size={18} className="text-brand-600" /> Work review</h2>

      {!latest && <p className="mt-3 text-sm text-slate-600">Waiting for the developer to submit their work. You&apos;ll review it here.</p>}

      {latest && task.status === "in_review" && (
        <>
          <div className="mt-4"><SubmissionView sub={latest} /></div>
          <ReviewForm key={latest.id} sub={latest} task={task} employerId={user.id} />
        </>
      )}

      {latest && task.status === "changes_requested" && latest.review && (
        <>
          <p className="mb-4 mt-2 text-sm text-slate-600">You asked for changes. Waiting for {latest.devName} to resubmit.</p>
          <ReviewNote review={latest.review} sub={latest} />
        </>
      )}

      {latest && task.status === "completed" && latest.review && (
        <>
          <p className="mb-4 mt-2 text-sm text-slate-600">Approved. {latest.devName}&apos;s skills were verified, and the work was added to their evidence (private until they share it).</p>
          <ReviewNote review={latest.review} sub={latest} />
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-semibold text-brand-600">View the submission</summary>
            <div className="mt-4"><SubmissionView sub={latest} /></div>
          </details>
        </>
      )}

      {history.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Earlier rounds ({history.length})</summary>
          <ul className="mt-3 space-y-4">{history.map((s) => <li key={s.id}><p className="mb-2 text-xs text-slate-500">Round {s.round}</p>{s.review && <ReviewNote review={s.review} sub={s} />}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
