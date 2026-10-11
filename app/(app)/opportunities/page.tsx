"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, EyeOff } from "lucide-react";
import { useSession } from "@/lib/auth";
import { useDevRecord, useMarketTasks, type Task } from "@/lib/market";
import { useOffers, reconsider, type Offer } from "@/lib/offers";
import { matchTask, prep, type Match } from "@/lib/matching";
import { LABEL_STYLE, ScoreRing } from "@/components/match-ui";
import { StatusBadge } from "@/components/task-ui";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const TABS = [
  { id: "matches", label: "Matches" }, { id: "invites", label: "Invitations" },
  { id: "active", label: "Active work" }, { id: "passed", label: "Passed" },
] as const;
type TabId = (typeof TABS)[number]["id"];

type Row = { task: Task; m: Match; offer?: Offer };

function OpportunityCard({ row, i, to, extra }: { row: Row; i: number; to: string; extra?: React.ReactNode }) {
  const { task, m, offer } = row;
  const chip =
    offer?.origin === "invite" && offer.status === "pending" ? { t: "Invited", c: "bg-brand-50 text-brand-700" }
    : offer?.origin === "interest" && offer.status === "pending" ? { t: "Interest sent", c: "bg-violet-50 text-violet-700" }
    : null;
  return (
    <motion.li initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.4, ease: EASE }}>
      <div className="group flex flex-wrap items-center gap-5 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
        <Link href={to} className="flex min-w-0 flex-1 basis-72 items-start gap-4">
          <ScoreRing score={m.score} size={64} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{task.title}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LABEL_STYLE[m.label]}`}>{m.label} match</span>
              {chip && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${chip.c}`}>{chip.t}</span>}
              {task.assigneeId && <StatusBadge status={task.status} />}
            </span>
            <span className="mt-1 block text-sm text-slate-500">{task.company} · {task.complexity} · {task.scope}</span>
            <span className="mt-2 flex flex-wrap gap-1.5">
              {m.skills.map((s) => (
                <span key={s.skill} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.level >= 2 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{s.skill}</span>
              ))}
            </span>
          </span>
        </Link>
        {extra ?? <Link href={to} aria-label={`Open ${task.title}`} className="text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-slate-500"><ArrowRight size={18} /></Link>}
      </div>
    </motion.li>
  );
}

export default function OpportunitiesPage() {
  const router = useRouter();
  const user = useSession();
  const rec = useDevRecord(user?.id);
  const tasks = useMarketTasks();
  const offers = useOffers();
  const [tab, setTab] = useState<TabId>("matches");
  const p = useMemo(() => (user ? prep(user.id) : null), [user, tasks, offers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rec === null) router.replace("/onboarding");
  }, [rec, router]);

  const data = useMemo(() => {
    if (!user || !rec || !tasks || !offers || !p) return null;
    const mine = offers.filter((o) => o.devId === user.id);
    const declared = rec.skills.map((s) => s.name);
    const row = (task: Task, offer?: Offer): Row => ({ task, m: matchTask(task, p, declared, true), offer });
    const newest = (id: string) => mine.filter((o) => o.taskId === id).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    const byScore = (a: Row, b: Row) => b.m.score - a.m.score;

    const matches = tasks
      .filter((t) => t.status === "open" && !["declined", "accepted"].includes(newest(t.id)?.status ?? ""))
      .map((t) => row(t, newest(t.id))).sort(byScore);
    const invites = mine
      .filter((o) => o.origin === "invite" && o.status === "pending")
      .flatMap((o) => { const t = tasks.find((x) => x.id === o.taskId); return t && t.status === "open" ? [row(t, o)] : []; });
    const active = tasks.filter((t) => t.assigneeId === user.id).map((t) => row(t)).sort(byScore);
    const passed = mine
      .filter((o) => o.status === "declined")
      .flatMap((o) => { const t = tasks.find((x) => x.id === o.taskId); return t ? [row(t, o)] : []; });
    return { matches, invites, active, passed };
  }, [user, rec, tasks, offers, p]);

  if (!user || !rec || !data) {
    return (
      <div className="animate-pulse space-y-4" role="status" aria-label="Loading opportunities">
        <div className="h-10 w-64 rounded-xl bg-slate-200/60" />
        {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-3xl bg-slate-200/60" />)}
      </div>
    );
  }

  const list = data[tab];
  const counts: Record<TabId, number> = { matches: data.matches.length, invites: data.invites.length, active: data.active.length, passed: data.passed.length };
  const empty: Record<TabId, string> = {
    matches: "No open tasks right now. New ones appear here as employers publish them.",
    invites: "No invitations. When an employer invites you, it shows up here.",
    active: "Nothing in progress. Accept an invitation or get assigned to start work.",
    passed: "Nothing here. Tasks you pass on are kept here in case you change your mind.",
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
        <h1 className="text-3xl font-semibold">Opportunities</h1>
        <p className="mt-2 max-w-xl text-slate-600">Real tasks from businesses, ranked by how well your evidence fits. Each score shows its reasons.</p>
      </motion.div>

      {!rec.openToWork && (
        <p className="flex gap-2.5 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <EyeOff size={18} className="mt-0.5 shrink-0 text-slate-500" />
          <span>You&apos;re hidden from employers, so they can&apos;t find you in candidate searches. You can still browse here and show interest in a task. <Link href="/dashboard" className="font-semibold text-brand-600 hover:underline">Change visibility</Link></span>
        </p>
      )}

      <div role="tablist" aria-label="Opportunity views" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === t.id ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {tab === t.id && <motion.span layoutId="opp-tab" className="absolute inset-0 rounded-full bg-slate-900" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
            <span className="relative">{t.label} <span className="text-slate-400">{counts[t.id]}</span></span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-600">{empty[tab]}</div>
      ) : (
        <ul className="space-y-4">
          <AnimatePresence initial={false}>
            {list.map((r, i) => (
              <OpportunityCard
                key={`${tab}-${r.task.id}`} row={r} i={i}
                to={tab === "active" ? `/work/${r.task.id}` : `/opportunities/${r.task.id}`}
                extra={tab === "passed" && r.offer?.origin === "interest" ? (
                  <button onClick={() => reconsider(r.offer!.id)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">Reconsider</button>
                ) : undefined}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}