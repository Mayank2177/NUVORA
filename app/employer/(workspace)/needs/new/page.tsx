"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowRight, Check, Info, Loader2, Sparkles } from "lucide-react";
import { useSession } from "@/lib/auth";
import { upsertTask, useEmployerRecord, type Task } from "@/lib/market";
import { EXAMPLES, digestNeed } from "@/lib/digest";
import { SECRET_RE } from "@/lib/publish";
import { TaskEditor, type Intent, type TaskFields } from "@/components/task-ui";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const PHASES = ["Requirements", "Skills", "Complexity", "Scope", "Acceptance criteria"];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function NewNeedPage() {
  const router = useRouter();
  const user = useSession();
  const rec = useEmployerRecord(user?.id);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [phase, setPhase] = useState(-1); // -1 = writing, 0..4 = digesting, 5 = review
  const [fields, setFields] = useState<TaskFields | null>(null);
  const [saveError, setSaveError] = useState("");

  async function digest(e: React.FormEvent) {
    e.preventDefault();
    const text = raw.trim();
    if (text.length < 10) return setError("Say a little more. A sentence about the problem is enough.");
    if (SECRET_RE.test(text)) return setError("This looks like it contains a password or key. Tasks are visible to developers, so remove it.");
    setError("");
    const d = digestNeed(text);
    for (let i = 0; i < PHASES.length; i++) { setPhase(i); await wait(380); }
    setFields({ title: d.title, summary: d.summary, requirements: d.requirements, skills: d.skills, complexity: d.complexity, scope: d.scope, acceptance: d.acceptance });
    setPhase(5);
  }

  function save(f: TaskFields, intent: Intent) {
    if (!user || !rec) return;
    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(), employerId: user.id, company: rec.company, rawNeed: raw.trim(), ...f,
      status: intent === "publish" ? "open" : "draft", createdAt: now, publishedAt: intent === "publish" ? now : undefined,
    };
    if (!upsertTask(task)) return setSaveError("Your browser storage is full, so the task couldn't be saved.");
    router.push(`/employer/tasks/${task.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
        <h1 className="text-3xl font-semibold">Describe a business need</h1>
        <p className="mt-2 text-slate-600">Write it the way you&apos;d say it to a colleague. We&apos;ll turn it into requirements, skills, scope and acceptance criteria, and you review everything before it goes live.</p>
      </motion.div>

      {phase === -1 && (
        <motion.form onSubmit={digest} noValidate initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <label htmlFor="need" className="mb-1.5 block text-sm font-medium text-slate-700">What do you need?</label>
          <textarea id="need" autoFocus rows={4} value={raw} maxLength={600} onChange={(e) => { setRaw(e.target.value); setError(""); }} aria-invalid={!!error}
            placeholder="Our website is slow, especially on phones, and customers are leaving." className={`w-full resize-none rounded-xl border bg-white px-4 py-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-4 ${error ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 hover:border-slate-300 focus:border-brand-500 focus:ring-brand-100"}`} />
          <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500"><span>Don&apos;t include passwords or private customer data.</span><span>{raw.length}/600</span></div>
          {error && <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-rose-600"><AlertCircle size={14} className="shrink-0" /> {error}</p>}

          <p className="mt-5 text-sm text-slate-500">Or start from an example</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map((x) => (
              <li key={x}><button type="button" onClick={() => { setRaw(x); setError(""); }} className="rounded-full border border-slate-200 px-3.5 py-1.5 text-sm text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-700">{x}</button></li>
            ))}
          </ul>

          <button type="submit" className="group mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700">
            <Sparkles size={16} /> Turn it into a task <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </button>
        </motion.form>
      )}

      {phase >= 0 && phase < 5 && (
        <div role="status" aria-live="polite" className="rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
          <p className="font-semibold">Structuring your need…</p>
          <p className="mt-1 text-sm text-slate-500">&ldquo;{raw.trim()}&rdquo;</p>
          <ul className="mt-5 space-y-3">
            {PHASES.map((p, i) => (
              <li key={p} className={`flex items-center gap-3 text-sm transition-colors ${i <= phase ? "text-slate-900" : "text-slate-300"}`}>
                <span className={`grid h-6 w-6 place-items-center rounded-full ${i < phase ? "bg-emerald-500 text-white" : i === phase ? "bg-brand-50 text-brand-600" : "bg-slate-100"}`}>
                  {i < phase ? <Check size={13} strokeWidth={3} /> : i === phase ? <Loader2 size={13} className="animate-spin" /> : null}
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      <AnimatePresence>
        {phase === 5 && fields && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="space-y-4">
            <p className="flex gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <Info size={18} className="mt-0.5 shrink-0" />
              <span><span className="font-semibold">Review this draft.</span> It was written by simple rules from your words, not by a person or an AI model, so it can be wrong or generic. Edit anything, and make the acceptance criteria specific to you.</span>
            </p>
            {saveError && <p role="alert" className="flex items-center gap-1.5 text-sm text-rose-600"><AlertCircle size={14} /> {saveError}</p>}
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
              <TaskEditor initial={fields} onSave={save} onCancel={() => { setPhase(-1); setFields(null); }}
                actions={[{ label: "Publish task", intent: "publish" }, { label: "Save as draft", intent: "draft" }]} />
            </div>
            <p className="text-xs text-slate-500">Publishing makes the task visible to matching developers. You can unpublish it any time before work is assigned.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}