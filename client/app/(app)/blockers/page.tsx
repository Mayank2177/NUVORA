"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Plus, Trash2, X } from "lucide-react";
import { useProjects } from "@/lib/store";
import { useProjectData, type Blocker } from "@/lib/data";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";

function since(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function took(a: string, b: string) {
  const m = Math.max(1, Math.round((+new Date(b) - +new Date(a)) / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} hr` : `${Math.round(h / 24)} days`;
}

/* ---------- card ---------- */

type Handlers = {
  onAttempt: (id: string, text: string) => void;
  onResolve: (id: string, solution: string) => void;
  onRemove: (id: string) => void;
};

function BlockerCard({ b, onAttempt, onResolve, onRemove }: { b: Blocker } & Handlers) {
  const [attempt, setAttempt] = useState("");
  const [solution, setSolution] = useState("");
  const [mode, setMode] = useState<"idle" | "resolve" | "delete">("idle");
  const open = b.status === "open";

  return (
    <m.li initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.4, ease: EASE }}
      className={`rounded-3xl border p-6 shadow-sm ${open ? "border-amber-100 bg-white" : "border-emerald-100 bg-white"}`}
    >
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${open ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
          {open ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-semibold">{b.title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {open ? `Open since ${since(b.createdAt)}` : `Resolved in ${took(b.createdAt, b.resolvedAt ?? b.createdAt)}`}
          </p>
        </div>
        {mode === "delete" ? (
          <span className="flex items-center gap-1">
            <button onClick={() => onRemove(b.id)} className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">Delete</button>
            <button onClick={() => setMode("idle")} aria-label="Cancel delete" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={14} /></button>
          </span>
        ) : (
          <button onClick={() => setMode("delete")} aria-label={`Delete blocker: ${b.title}`} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600">
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* What you've tried */}
      <div className="mt-5">
        <p className="text-sm font-medium text-slate-700">What you&apos;ve tried</p>
        {b.attempts.length > 0 ? (
          <ol className="mt-2 space-y-1.5">
            {b.attempts.map((a, i) => (
              <li key={`${i}-${a}`} className="flex gap-2.5 text-sm text-slate-700">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">{i + 1}</span>
                <span className="break-words">{a}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Nothing recorded yet. Noting each attempt makes the fix easier to explain later.</p>
        )}

        {open && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (attempt.trim()) { onAttempt(b.id, attempt.trim()); setAttempt(""); } }}
            className="mt-3 flex gap-2"
          >
            <input value={attempt} onChange={(e) => setAttempt(e.target.value)} placeholder="Add something you tried" aria-label="Add an attempt" className={inputCls} />
            <button type="submit" disabled={!attempt.trim()} aria-label="Add attempt"
              className="grid w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-white transition-colors hover:bg-brand-600 disabled:opacity-40">
              <Plus size={18} />
            </button>
          </form>
        )}
      </div>

      {/* Resolution */}
      {open ? (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <AnimatePresence mode="wait" initial={false}>
            {mode === "resolve" ? (
              <m.form key="f" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                onSubmit={(e) => { e.preventDefault(); if (solution.trim()) { onResolve(b.id, solution.trim()); } }} className="space-y-3">
                <label htmlFor={`sol-${b.id}`} className="block text-sm font-medium text-slate-700">What fixed it?</label>
                <textarea id={`sol-${b.id}`} autoFocus rows={3} value={solution} onChange={(e) => setSolution(e.target.value)}
                  placeholder="Updated the production environment variables." className={`${inputCls} resize-none`} />
                <div className="flex items-center gap-2">
                  <button type="submit" disabled={!solution.trim()} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50">Mark as resolved</button>
                  <button type="button" onClick={() => setMode("idle")} className="px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900">Cancel</button>
                </div>
                <p className="text-xs text-slate-500">The fix is saved to your evidence timeline as a private item.</p>
              </m.form>
            ) : (
              <m.button key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMode("resolve")}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600">
                <Check size={16} /> Resolve this blocker
              </m.button>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">Solution</p>
          <p className="mt-1 break-words text-sm text-emerald-800">{b.solution}</p>
          <Link href="/evidence" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:underline">
            Saved to evidence <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </m.li>
  );
}

/* ---------- page ---------- */

export default function BlockersPage() {
  const router = useRouter();
  const { projects, active, ready } = useProjects((s) => ({ projects: s.projects, active: s.active, ready: s.ready }));
  const { data, addBlocker, resolveBlocker, addAttempt, removeBlocker } = useProjectData(active);
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (ready && projects.length === 0) router.replace("/new");
  }, [ready, projects.length, router]);

  if (!ready || !active || !data) {
    return (
      <div className="animate-pulse space-y-4" role="status" aria-label="Loading blockers">
        <div className="h-10 w-56 rounded-xl bg-slate-200/60" />
        <div className="h-20 rounded-3xl bg-slate-200/60" />
        {[0, 1].map((i) => <div key={`placeholder-${i}`} className="h-56 rounded-3xl bg-slate-200/60" />)}
      </div>
    );
  }

  const open = data.blockers.filter((b) => b.status === "open");
  const resolved = data.blockers.filter((b) => b.status === "resolved").sort((a, b) => +new Date(b.resolvedAt ?? 0) - +new Date(a.resolvedAt ?? 0));
  const list = tab === "open" ? open : resolved;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addBlocker(title.trim());
    setTitle("");
    setTab("open");
  }

  return (
    <div className="space-y-6">
      <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
        <h1 className="text-3xl font-semibold">Blockers</h1>
        <p className="mt-2 max-w-xl text-slate-600">
          Record what&apos;s stopping you on {active.name}, what you tried, and how you fixed it. Every resolved blocker becomes evidence of how you solve problems.
        </p>
      </m.div>

      <m.form onSubmit={submit} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.5, ease: EASE }}
        className="flex flex-wrap gap-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
        <label htmlFor="new-blocker" className="sr-only">Describe the blocker</label>
        <input id="new-blocker" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140}
          placeholder="What's blocking you? e.g. Firebase authentication is failing in production" className={`${inputCls} min-w-[240px] flex-1`} />
        <button type="submit" disabled={!title.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-40">
          <Plus size={16} /> Log blocker
        </button>
      </m.form>

      <div role="tablist" aria-label="Blocker status" className="flex gap-2">
        {([["open", "Open", open.length], ["resolved", "Resolved", resolved.length]] as const).map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === k ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {tab === k && <m.span className="absolute inset-0 rounded-full bg-slate-900" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
            <span className="relative">{label} <span className={tab === k ? "text-slate-400" : "text-slate-400"}>{n}</span></span>
          </button>
        ))}
      </div>

      <ul className="space-y-4">
        <AnimatePresence initial={false} mode="popLayout">
          {list.map((b) => (
            <BlockerCard key={b.id} b={b} onAttempt={addAttempt} onResolve={resolveBlocker} onRemove={removeBlocker} />
          ))}
        </AnimatePresence>
      </ul>

      {list.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="font-semibold">{tab === "open" ? "Nothing is blocking you" : "No resolved blockers yet"}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
            {tab === "open" ? "When something gets in your way, log it above. You can note what you try as you go." : "Resolve a blocker and it will show up here, with the fix saved as evidence."}
          </p>
        </div>
      )}
    </div>
  );
}
