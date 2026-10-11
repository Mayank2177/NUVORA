"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Info } from "lucide-react";
import { useSession } from "@/lib/auth";
import { useDevRecord, useMarketTasks } from "@/lib/market";
import { expressInterest, passOnTask, reconsider, respondToInvite, useOffers, withdrawInterest } from "@/lib/offers";
import { matchTask, prep } from "@/lib/matching";
import { HowScored, LABEL_STYLE, ScoreRing, SkillBreakdown } from "@/components/match-ui";
import { StatusBadge } from "@/components/task-ui";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const btnDark = "inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600";
const btnLight = "inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50";

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useSession();
  const rec = useDevRecord(user?.id);
  const tasks = useMarketTasks();
  const offers = useOffers();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const p = useMemo(() => (user ? prep(user.id) : null), [user, tasks, offers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rec === null) router.replace("/onboarding");
  }, [rec, router]);

  if (!user || !rec || !tasks || !offers || !p) return <div className="h-96 animate-pulse rounded-3xl bg-slate-200/60" role="status" aria-label="Loading task" />;

  const task = tasks.find((t) => t.id === id);
  const offer = offers.filter((o) => o.devId === user.id && o.taskId === id).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  const mine = task?.assigneeId === user.id;

  if (!task || (task.status !== "open" && !mine && !offer)) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
        <p className="font-semibold">This task isn&apos;t available</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">It may have been taken, unpublished or removed.</p>
        <Link href="/opportunities" className={`${btnDark} mt-5`}>Back to opportunities</Link>
      </div>
    );
  }

  const declared = rec.skills.map((s) => s.name);
  const m = matchTask(task, p, declared, true);
  const full = matchTask(task, p, declared, false);
  const open = task.status === "open";
  const pendingInvite = offer?.origin === "invite" && offer.status === "pending";
  const interested = offer?.origin === "interest" && offer.status === "pending";
  const passed = offer?.status === "declined";
  const me = { id: user.id, name: user.name };

  const run = (fn: () => string | null, after?: () => void) => {
    const e = fn();
    setError(e ?? "");
    setConfirm(false);
    if (!e) after?.();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/opportunities" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={14} /> Opportunities</Link>

      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} />
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{task.complexity}</span>
          <span className="text-xs text-slate-500">{task.company} · {task.scope}</span>
        </div>
        <h1 className="mt-4 break-words text-3xl font-semibold">{task.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-slate-700">{task.summary}</p>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
          {mine ? (
            <Link href={`/work/${task.id}`} className={btnDark}>Open task workspace <ArrowRight size={16} /></Link>
          ) : !open ? (
            <p className="text-sm text-slate-600">This task is no longer open.</p>
          ) : pendingInvite ? (
            <>
              {confirm ? (
                <>
                  <button onClick={() => run(() => respondToInvite(offer.id, true), () => router.push(`/work/${task.id}`))} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Yes, I&apos;ll take this task</button>
                  <button onClick={() => setConfirm(false)} className="px-3 py-2.5 text-sm font-medium text-slate-600">Not yet</button>
                </>
              ) : (
                <>
                  <button onClick={() => setConfirm(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700"><Check size={16} /> Accept this task</button>
                  <button onClick={() => run(() => respondToInvite(offer.id, false))} className={btnLight}>Decline</button>
                </>
              )}
              <p className="basis-full text-sm text-slate-600">{confirm ? "Accepting commits you to deliver against the acceptance criteria below." : `${task.company} invited you to this task.`}</p>
            </>
          ) : interested ? (
            <>
              <span className="rounded-full bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700">Interest sent</span>
              <button onClick={() => run(() => withdrawInterest(offer.id))} className={btnLight}>Withdraw</button>
              <p className="basis-full text-sm text-slate-600">{task.company} can now see your public evidence and may assign this task to you.</p>
            </>
          ) : passed ? (
            <>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600">{offer.origin === "invite" ? "You declined this invitation" : "You passed on this"}</span>
              {offer.origin === "interest" && <button onClick={() => run(() => reconsider(offer.id))} className={btnLight}>Reconsider</button>}
            </>
          ) : (
            <>
              <button onClick={() => run(() => expressInterest(task.id, me))} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700">I&apos;m interested</button>
              <button onClick={() => run(() => passOnTask(task.id, me), () => router.push("/opportunities"))} className={btnLight}>Not for me</button>
              <p className="basis-full text-sm text-slate-600">Showing interest lets {task.company} see your public evidence. They decide whether to assign it to you.</p>
            </>
          )}
        </div>
        {error && <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-rose-600"><AlertCircle size={14} /> {error}</p>}
      </motion.section>

      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5, ease: EASE }} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center gap-5">
          <ScoreRing score={m.score} />
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">Why this score <span className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${LABEL_STYLE[m.label]}`}>{m.label} match</span></h2>
            <p className="mt-1 text-sm text-slate-600">
              {m.strong.length ? `Your strongest fits: ${m.strong.join(", ")}.` : "None of the required skills reach L3 yet."}{" "}
              {m.gaps.length ? `Needs work: ${m.gaps.join(", ")}.` : ""}
            </p>
          </div>
        </div>
        <div className="mt-6"><SkillBreakdown match={m} you /></div>

        {full.score > m.score && (
          <p className="mt-5 flex gap-2.5 rounded-xl bg-brand-50/60 p-3 text-sm text-slate-700">
            <Info size={16} className="mt-0.5 shrink-0 text-brand-600" />
            <span>Employers only see your <span className="font-medium">public</span> evidence. If you made everything public, this would be {full.score}%. <Link href="/evidence" className="font-semibold text-brand-600 hover:underline">Review your evidence</Link></span>
          </p>
        )}
        <div className="mt-4"><HowScored /></div>
        <Link href="/capability" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">See your full capability <ArrowRight size={14} /></Link>
      </motion.section>

      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5, ease: EASE }} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="font-semibold">Requirements</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-700">{task.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
        <h2 className="mt-7 font-semibold">Acceptance criteria</h2>
        <p className="mt-0.5 text-sm text-slate-500">How the finished work will be judged.</p>
        <ul className="mt-3 space-y-2">{task.acceptance.map((a) => <li key={a} className="flex gap-2.5 text-slate-700"><Check size={17} className="mt-0.5 shrink-0 text-brand-600" /> {a}</li>)}</ul>
      </motion.section>
    </div>
  );
}