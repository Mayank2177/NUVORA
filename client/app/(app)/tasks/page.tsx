"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, PartyPopper, Plus, Trash2 } from "lucide-react";
import { STAGES, useProjects, type Stage } from "@/lib/store";
import { STAGE_INFO, useTasks, type Task } from "@/lib/tasks";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";

function Ring({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-24 w-24 shrink-0" role="img" aria-label={`${Math.round(value * 100)}% of this stage's tasks done`}>
      <svg viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-slate-100" />
        <motion.circle
          cx="40" cy="40" r={r} fill="none" strokeWidth="7" strokeLinecap="round" className="stroke-brand-600"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value) }} transition={{ duration: 0.9, ease: EASE }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-lg font-semibold">{Math.round(value * 100)}%</span>
    </div>
  );
}

function TaskRow({ t, onToggle, onRemove }: { t: Task; onToggle: () => void; onRemove: () => void }) {
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3, ease: EASE }}
      className="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm">
      <button role="checkbox" aria-checked={t.done} aria-label={`${t.done ? "Mark not done" : "Mark done"}: ${t.title}`} onClick={onToggle}
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors ${t.done ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 hover:border-brand-500"}`}>
        <AnimatePresence>
          {t.done && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}><Check size={14} strokeWidth={3} /></motion.span>}
        </AnimatePresence>
      </button>
      <span className={`min-w-0 flex-1 break-words text-sm transition-colors ${t.done ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.title}</span>
      <button onClick={onRemove} aria-label={`Delete task: ${t.title}`}
        className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
        <Trash2 size={16} />
      </button>
    </motion.li>
  );
}

export default function TasksPage() {
  const router = useRouter();
  const { projects, active, ready, update } = useProjects();
  const { tasks, addTask, toggleTask, removeTask } = useTasks(active?.id, active?.stage);

  const [tab, setTab] = useState<"current" | "all">("current");
  const [title, setTitle] = useState("");
  const [addStage, setAddStage] = useState<Stage | null>(null);

  useEffect(() => {
    if (ready && projects.length === 0) router.replace("/new");
  }, [ready, projects.length, router]);

  const stage = active?.stage;
  const info = stage ? STAGE_INFO[stage] : null;

  const groups = useMemo(() => {
    if (!tasks || !stage) return [];
    const sort = (a: Task, b: Task) => Number(a.done) - Number(b.done) || +new Date(a.createdAt) - +new Date(b.createdAt);
    const list = tab === "current" ? [stage] : STAGES.filter((s) => tasks.some((t) => t.stage === s));
    return list.map((s) => ({ stage: s, items: tasks.filter((t) => t.stage === s).sort(sort) }));
  }, [tasks, tab, stage]);

  if (!ready || !active || !tasks || !stage || !info) {
    return (
      <div className="animate-pulse space-y-4" role="status" aria-label="Loading tasks">
        <div className="h-10 w-48 rounded-xl bg-slate-200/60" />
        <div className="h-44 rounded-3xl bg-slate-200/60" />
        {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-2xl bg-slate-200/60" />)}
      </div>
    );
  }

  const current = tasks.filter((t) => t.stage === stage);
  const doneCount = current.filter((t) => t.done).length;
  const ratio = current.length ? doneCount / current.length : 0;
  const complete = current.length > 0 && doneCount === current.length;
  const nextStage = STAGES[STAGES.indexOf(stage) + 1];
  const suggestions = info.tasks.filter((s) => !current.some((t) => t.title === s));
  const totalOpen = tasks.filter((t) => !t.done).length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addTask(title.trim(), addStage ?? stage!);
    setTitle("");
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
        <h1 className="text-3xl font-semibold">Tasks</h1>
        <p className="mt-2 max-w-xl text-slate-600">
          What to do next on {active.name}, guided by the stage you&apos;re in. {totalOpen} open across all stages.
        </p>
      </motion.div>

      {/* Stage panel */}
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.5, ease: EASE }}
        className="flex flex-wrap items-center gap-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <Ring value={ratio} />
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-sm text-slate-500">Current stage</p>
          <h2 className="text-2xl font-semibold">{stage}</h2>
          <p className="mt-2 text-slate-700"><span className="font-medium">The question: </span>{info.question}</p>
          <p className="mt-1 text-sm text-slate-600"><span className="font-medium text-slate-700">Done when: </span>{info.exit}</p>
        </div>
      </motion.section>

      <AnimatePresence>
        {complete && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-4 rounded-3xl bg-slate-900 p-6 text-white">
              <PartyPopper className="shrink-0 text-brand-200" />
              <div className="min-w-0 flex-1 basis-56">
                <p className="font-semibold">{stage} tasks are all done.</p>
                <p className="mt-0.5 text-sm text-slate-300">Check the exit condition above. If it&apos;s true, you can move on. You can always come back.</p>
              </div>
              {nextStage && (
                <button onClick={() => update(active.id, { stage: nextStage })}
                  className="group inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-brand-50">
                  Move on to {nextStage} <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add */}
      <form onSubmit={submit} className="flex flex-wrap gap-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
        <label htmlFor="task-title" className="sr-only">New task</label>
        <input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Add a task" className={`${inputCls} min-w-[220px] flex-1`} />
        <label htmlFor="task-stage" className="sr-only">Stage</label>
        <select id="task-stage" value={addStage ?? stage} onChange={(e) => setAddStage(e.target.value as Stage)} className={`${inputCls} !w-auto`}>
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <button type="submit" disabled={!title.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-40">
          <Plus size={16} /> Add
        </button>
      </form>

      <div role="tablist" aria-label="Task view" className="flex gap-2">
        {([["current", `${stage} (${current.length})`], ["all", `All stages (${tasks.length})`]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === k ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {tab === k && <motion.span layoutId="task-tab" className="absolute inset-0 rounded-full bg-slate-900" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {/* Lists */}
      {groups.map((g) => (
        <section key={g.stage} aria-label={`${g.stage} tasks`}>
          {tab === "all" && (
            <h2 className="mb-3 flex items-center gap-3 text-sm font-semibold text-slate-500">
              {g.stage} {g.stage === stage && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">Current</span>}
              <span className="h-px flex-1 bg-slate-200" />
            </h2>
          )}
          <ul className="space-y-2.5">
            <AnimatePresence initial={false} mode="popLayout">
              {g.items.map((t) => <TaskRow key={t.id} t={t} onToggle={() => toggleTask(t.id)} onRemove={() => removeTask(t.id)} />)}
            </AnimatePresence>
          </ul>
        </section>
      ))}

      {tab === "current" && current.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <p className="font-semibold">No tasks for {stage} yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">Add your own above, or start from the suggestions below.</p>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <section aria-label="Suggested tasks" className="rounded-3xl border border-slate-100 bg-slate-50/70 p-6">
          <h2 className="font-semibold">Suggested for {stage}</h2>
          <p className="mt-1 text-sm text-slate-500">Tap to add. These are common tasks at this stage.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} onClick={() => addTask(s, stage)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-700">
                <Plus size={14} /> {s}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}