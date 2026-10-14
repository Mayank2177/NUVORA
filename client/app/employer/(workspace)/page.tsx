"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import { ArrowRight, Plus } from "lucide-react";
import { useSession } from "@/lib/auth";
import { useEmployerRecord, useMarketTasks, type TaskStatus } from "@/lib/market";
import { StatusBadge } from "@/components/task-ui";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const PROGRESS: TaskStatus[] = ["assigned", "in_review", "changes_requested"];
const TABS = [
  { id: "all", label: "All", match: () => true },
  { id: "open", label: "Open", match: (s: TaskStatus) => s === "open" },
  { id: "draft", label: "Drafts", match: (s: TaskStatus) => s === "draft" },
  { id: "progress", label: "In progress", match: (s: TaskStatus) => PROGRESS.includes(s) },
  { id: "done", label: "Completed", match: (s: TaskStatus) => s === "completed" },
] as const;

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

export default function EmployerDashboard() {
  const user = useSession();
  const rec = useEmployerRecord(user?.id);
  const all = useMarketTasks();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");

  const mine = useMemo(() => (all ?? []).filter((t) => t.employerId === user?.id).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)), [all, user?.id]);
  const current = TABS.find((t) => t.id === tab)!;
  const list = mine.filter((t) => current.match(t.status));
  const count = (id: (typeof TABS)[number]["id"]) => mine.filter((t) => TABS.find((x) => x.id === id)!.match(t.status)).length;

  if (!all || !rec) return <div className="h-64 animate-pulse rounded-3xl bg-slate-200/60" role="status" aria-label="Loading dashboard" />;

  return (
    <div className="space-y-8">
      <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{rec.industry} · {rec.teamSize} people</p>
          <h1 className="mt-1 text-3xl font-semibold">{rec.company}</h1>
          <p className="mt-2 max-w-xl text-slate-600">Describe a problem in your own words. Nuvora turns it into a clear task developers can act on.</p>
        </div>
        <Link href="/employer/needs/new" className="group inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-colors hover:bg-brand-600">
          <Plus size={16} /> Describe a business need
        </Link>
      </m.div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Summary">
        {[
          { n: count("open"), l: "Open tasks" }, { n: count("draft"), l: "Drafts" },
          { n: count("progress"), l: "In progress" }, { n: count("done"), l: "Completed" },
        ].map((s, i) => (
          <m.li key={s.l} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.05, duration: 0.5, ease: EASE }} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-3xl font-semibold">{s.n}</p><p className="mt-1 text-sm text-slate-500">{s.l}</p>
          </m.li>
        ))}
      </ul>

      <section aria-label="Tasks">
        <div role="tablist" aria-label="Filter tasks" className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === t.id ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {tab === t.id && <m.span className="absolute inset-0 rounded-full bg-slate-900" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
              <span className="relative">{t.label} <span className="text-slate-400">{count(t.id)}</span></span>
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <p className="font-semibold">{mine.length === 0 ? "No tasks yet" : "Nothing here"}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">{mine.length === 0 ? "Start with a sentence like “Our website is slow”. We'll do the structuring." : "No tasks match this filter."}</p>
            {mine.length === 0 && <Link href="/employer/needs/new" className="mt-5 inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Describe your first need</Link>}
          </div>
        ) : (
          <ul className="mt-5 space-y-3">
            {list.map((t, i) => (
              <m.li key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.4, ease: EASE }}>
                <Link href={`/employer/tasks/${t.id}`} className="group block rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="mr-1 font-semibold">{t.title}</h2>
                    <StatusBadge status={t.status} />
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{t.complexity}</span>
                    <ArrowRight size={16} className="ml-auto text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-slate-500" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">You wrote &ldquo;{t.rawNeed}&rdquo; · created {ago(t.createdAt)}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-700">{t.summary}</p>
                  <ul className="mt-3 flex flex-wrap gap-1.5">{t.skills.slice(0, 5).map((s) => <li key={s} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">{s}</li>)}</ul>
                </Link>
              </m.li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}