"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { m } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, Check, FlaskConical, Loader2, Play, Send, ShieldCheck } from "lucide-react";
import { useSession } from "@/lib/auth";
import { useMarketTasks, type Task } from "@/lib/market";
import { useProjects } from "@/lib/store";
import { loadWs, runProject } from "@/lib/workspace";
import { buildChecks, submitWork, useSubmissions, type Submission, type TestRun } from "@/lib/submissions";
import { LEVEL_BADGE } from "@/lib/capability";
import { StatusBadge } from "@/components/task-ui";
import { CheckList, ReviewNote, SubmissionView, TestSummary } from "@/components/submission-ui";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";
const card = "rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8";

function SubmitForm({ task, dev, prev }: { task: Task; dev: { id: string; name: string }; prev?: Submission }) {
  const { projects, active } = useProjects((s) => ({ projects: s.projects, active: s.active }));
  const [summary, setSummary] = useState(prev?.summary ?? "");
  const [link, setLink] = useState(prev?.link ?? "");
  const [how, setHow] = useState<string[]>(() => task.acceptance.map((a) => prev?.criteria.find((c) => c.text === a)?.how ?? ""));
  const [pid, setPid] = useState(active?.id ?? projects[0]?.id ?? "");
  const [file, setFile] = useState("");
  const [tests, setTests] = useState<TestRun | null>(null);
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const testFiles = useMemo(() => (pid ? Object.keys(loadWs(pid).files).filter((f) => /\.test\.m?js$/.test(f)).sort() : []), [pid]);
  const chosen = testFiles.includes(file) ? file : testFiles[0] ?? "";
  const criteria = task.acceptance.map((text, i) => ({ text, how: how[i] ?? "" }));
  const checks = buildChecks({ summary, link, criteria, tests });
  const blocked = checks.some((c) => c.status === "fail");

  async function runTests() {
    if (!chosen) return;
    setRunning(true);
    const r = await runProject(loadWs(pid).files, chosen);
    const passed = r.tests.filter((t) => t.ok).length;
    setTests({
      project: projects.find((p) => p.id === pid)?.name ?? "", file: chosen, passed, total: r.tests.length, ranAt: new Date().toISOString(), ms: r.ms,
      failures: [...r.tests.filter((t) => !t.ok).map((t) => `${t.name}: ${t.error ?? "failed"}`), ...(r.fatal ? [r.fatal] : [])],
    });
    setRunning(false);
  }

  async function send() {
    setError("");
    setSending(true);
    const e = await submitWork(task, dev, { summary, link, criteria, tests });
    if (e) setError(e);
    setSending(false);
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate className="space-y-8">
      <div>
        <label htmlFor="summary" className="mb-1.5 block text-sm font-medium text-slate-700">What did you do?</label>
        <textarea id="summary" rows={4} value={summary} maxLength={800} onChange={(e) => setSummary(e.target.value)} placeholder="Explain the problem you found, what you changed and why." className={`${inputCls} resize-none`} />
      </div>
      <div>
        <label htmlFor="link" className="mb-1.5 block text-sm font-medium text-slate-700">Link to the work (optional)</label>
        <input id="link" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://github.com/company/repo/pull/42" className={inputCls} />
        <p className="mt-1.5 text-xs text-slate-500">A pull request, deployed demo or branch. Don&apos;t paste secrets.</p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-slate-700">How is each acceptance criterion met?</legend>
        <ul className="mt-3 space-y-4">
          {task.acceptance.map((a, i) => (
            <li key={a}>
              <label htmlFor={`how-${i}`} className="flex gap-2 text-sm text-slate-800"><Check size={16} className="mt-0.5 shrink-0 text-brand-600" /> {a}</label>
              <textarea id={`how-${i}`} rows={2} value={how[i] ?? ""} maxLength={400} onChange={(e) => setHow(how.map((h, j) => (j === i ? e.target.value : h)))} placeholder="Say how you met this and how you checked it." className={`${inputCls} mt-2 resize-none`} />
            </li>
          ))}
        </ul>
      </fieldset>

      <section aria-label="Run tests" className="rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
        <h2 className="flex items-center gap-2 font-semibold"><FlaskConical size={17} className="text-brand-600" /> Run tests (optional)</h2>
        <p className="mt-1 text-sm text-slate-600">Run a test file from your code workspace. The result goes to the employer. If tests fail, fix them and run again before you can submit.</p>
        {testFiles.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No test files found in this project&apos;s workspace. <Link href="/build/workspace" className="font-semibold text-brand-600 hover:underline">Open the code workspace</Link> and add a file ending in .test.js.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <select aria-label="Project" value={pid} onChange={(e) => { setPid(e.target.value); setTests(null); }} className={`${inputCls} !w-auto`}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select aria-label="Test file" value={chosen} onChange={(e) => { setFile(e.target.value); setTests(null); }} className={`${inputCls} !w-auto`}>
              {testFiles.map((f) => <option key={f}>{f}</option>)}
            </select>
            <button type="button" onClick={runTests} disabled={running} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
              {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Run tests
            </button>
          </div>
        )}
        {tests && <div className="mt-3"><TestSummary t={tests} /></div>}
      </section>

      <section aria-label="Automated checks" aria-live="polite">
        <h2 className="mb-3 font-semibold">Automated checks</h2>
        <CheckList checks={checks} />
      </section>

      {error && <p role="alert" className="flex items-center gap-1.5 text-sm text-rose-600"><AlertCircle size={14} /> {error}</p>}
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
        <button type="button" onClick={send} disabled={blocked || sending} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:shadow-none">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {prev ? "Resubmit for review" : "Submit for review"}
        </button>
        {blocked && <p className="text-sm text-slate-600">Fix the failing checks above to submit.</p>}
      </div>
    </form>
  );
}

export default function WorkPage() {
  const { id } = useParams<{ id: string }>();
  const user = useSession();
  const tasks = useMarketTasks();
  const subs = useSubmissions();

  if (!user || !tasks || !subs) return <div className="h-64 animate-pulse rounded-3xl bg-slate-200/60" role="status" aria-label="Loading task" />;
  const task = tasks.find((t) => t.id === id && t.assigneeId === user.id);

  if (!task) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
        <p className="font-semibold">This isn&apos;t one of your tasks</p>
        <Link href="/opportunities" className="mt-4 inline-flex rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Back to opportunities</Link>
      </div>
    );
  }

  const mine = subs.filter((s) => s.taskId === task.id && s.devId === user.id).sort((a, b) => b.round - a.round);
  const latest = mine[0];
  const history = mine.filter((s) => s.review && s !== latest);
  const dev = { id: user.id, name: user.name };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/opportunities" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={14} /> Opportunities</Link>

      <m.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className={card}>
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={task.status} /><span className="text-xs text-slate-500">{task.company} · {task.scope}</span></div>
        <h1 className="mt-4 break-words text-3xl font-semibold">{task.title}</h1>
        <p className="mt-3 text-slate-700">{task.summary}</p>
        <h2 className="mt-7 font-semibold">Requirements</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-700">{task.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
        <h2 className="mt-7 font-semibold">Acceptance criteria</h2>
        <ul className="mt-3 space-y-2">{task.acceptance.map((a) => <li key={a} className="flex gap-2.5 text-slate-700"><Check size={17} className="mt-0.5 shrink-0 text-brand-600" /> {a}</li>)}</ul>
      </m.section>

      {task.status === "assigned" && (
        <section className={card} aria-label="Submit your work">
          <h2 className="text-xl font-semibold">Submit your work</h2>
          <p className="mb-6 mt-1 text-sm text-slate-600">When you&apos;re done, tell the employer what you did and how each criterion is met. Automated checks run as you fill this in.</p>
          <SubmitForm key={task.id} task={task} dev={dev} />
        </section>
      )}

      {task.status === "changes_requested" && latest?.review && (
        <section className={card} aria-label="Changes requested">
          <h2 className="text-xl font-semibold">Changes requested</h2>
          <p className="mb-4 mt-1 text-sm text-slate-600">{task.company} reviewed your work and needs a few changes. Fix them, update your answers below, and resubmit.</p>
          <ReviewNote review={latest.review} sub={latest} />
          <div className="mt-8"><SubmitForm key={latest.id} task={task} dev={dev} prev={latest} /></div>
        </section>
      )}

      {task.status === "in_review" && latest && (
        <section className={card} aria-label="Waiting for review">
          <h2 className="text-xl font-semibold">Submitted. Waiting for {task.company}.</h2>
          <p className="mb-6 mt-1 text-sm text-slate-600">They&apos;ll approve it or ask for changes. You&apos;ll see their answer here.</p>
          <SubmissionView sub={latest} />
        </section>
      )}

      {task.status === "completed" && latest?.review && (
        <section className={card} aria-label="Completed">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-600"><ShieldCheck size={22} /></span>
            <div><h2 className="text-xl font-semibold">Work approved</h2><p className="text-sm text-slate-600">{task.company} accepted your submission.</p></div>
          </div>
          <div className="mt-5"><ReviewNote review={latest.review} sub={latest} /></div>
          <h3 className="mt-7 font-semibold">Skills now verified</h3>
          <ul className="mt-3 flex flex-wrap gap-2">{task.skills.map((s) => <li key={s} className={`rounded-full px-3 py-1 text-sm font-medium ${LEVEL_BADGE[4]}`}>{s} · L4 Verified</li>)}</ul>
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">This work was added to your evidence as a private item in your &ldquo;Client work&rdquo; project. Make it public when you&apos;re ready for employers to see it.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/capability" className="group inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">See your capability <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" /></Link>
            <Link href="/evidence" className="inline-flex items-center rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">Review evidence</Link>
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section className={card} aria-label="Earlier rounds">
          <h2 className="font-semibold">Earlier rounds</h2>
          <ul className="mt-4 space-y-4">{history.map((s) => <li key={s.id}><p className="mb-2 text-xs text-slate-500">Round {s.round}</p>{s.review && <ReviewNote review={s.review} sub={s} />}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
