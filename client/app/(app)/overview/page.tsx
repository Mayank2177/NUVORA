"use client";
import Image from "next/image";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, animate, m, useMotionValue, useTransform } from "framer-motion";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Compass, GitBranch, Loader2, Plus, ShieldCheck, Users } from "lucide-react";
import { useSession } from "@/lib/auth";
import { STAGES, useProjects, type Project } from "@/lib/store";
import { PROV_STYLE, TYPE_ICON, useProjectData, type Blocker, type Evidence } from "@/lib/data";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ---------- helpers ---------- */

function rel(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

type Next = { title: string; why: string; cta: string; href?: string; advance?: boolean };

/** Rule-based guidance. Every suggestion carries its reason. */
function nextAction(p: Project, ev: Evidence[], bl: Blocker[]): Next {
  const idx = STAGES.indexOf(p.stage);
  const open = bl.filter((b) => b.status === "open");
  const has = (t: Evidence["type"]) => ev.some((e) => e.type === t);

  if (open.length)
    return {
      title: `Resolve: ${open[0].title}`,
      why: `You have ${open.length} open blocker${open.length > 1 ? "s" : ""}. Clearing it keeps you moving, and the fix becomes evidence.`,
      cta: "Go to blockers", href: "#blockers",
    };
  if (ev.length < 3)
    return { title: "Add your first evidence", why: "Your project has very little on record, so there is not much to build a story from yet.", cta: "Open evidence", href: "/evidence" };
  if (p.stage === "Build" && !has("Test"))
    return { title: "Add tests for what you've built", why: `You're in Build with ${ev.filter((e) => e.type === "Commit").length} commits but no test results. Tests make your work verifiable.`, cta: "Open build", href: "/build" };
  if (p.stage === "Document" && !has("Screenshot"))
    return { title: "Capture a screenshot of your work", why: "You're documenting the project but have no visuals yet. Screenshots make the story easy to follow.", cta: "Open evidence", href: "/evidence" };
  if (p.stage === "Publish" || p.stage === "Demonstrate")
    return { title: "Preview your project story", why: "You've reached the stage where your evidence can become a public page. Nothing goes public until you choose.", cta: "Open publish", href: "/publish" };
  if (idx < STAGES.length - 1)
    return { title: `Move on to ${STAGES[idx + 1]}`, why: `You have ${ev.filter((e) => e.stage === p.stage).length} evidence items in ${p.stage} and no open blockers. Advance when you've met that stage's exit condition.`, cta: `Start ${STAGES[idx + 1]}`, advance: true };
  return { title: "Share what you learned", why: "You've completed the journey. Turning it into a contribution helps others and credits you.", cta: "Open publish", href: "/publish" };
}

function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${Math.round(v)}${suffix}`);
  useEffect(() => {
    const c = animate(mv, to, { duration: 1.1, ease: "easeOut" });
    return () => c.stop();
  }, [to, mv]);
  return <m.span>{text}</m.span>;
}

/* ---------- sections ---------- */

function Stat({ label, children, delay }: { label: string; children: React.ReactNode; delay: number }) {
  return (
    <m.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.5, ease: EASE }}
      className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      {children}
    </m.div>
  );
}

function JourneyStrip({ project, onPick }: { project: Project; onPick: (s: Project["stage"]) => void }) {
  const idx = STAGES.indexOf(project.stage);
  return (
    <section aria-label="Journey" className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Your journey</h2>
        <p className="text-sm text-slate-500">Select a stage to update where you are. Skipping or going back is fine.</p>
      </div>
      <ol className="mt-5 flex gap-2 overflow-x-auto pb-2">
        {STAGES.map((s, i) => {
          const done = i < idx;
          const current = i === idx;
          return (
            <li key={s} className="shrink-0">
              <button onClick={() => onPick(s)} aria-current={current ? "step" : undefined}
                className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  current ? "text-white" : done ? "bg-brand-50 text-brand-700 hover:bg-brand-100" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                }`}>
                {current && <m.span className="absolute inset-0 rounded-xl bg-slate-900" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                <span className="relative flex items-center gap-1.5">{done && <Check size={14} />}{s}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function BlockersCard({ blockers, onAdd, onResolve }: { blockers: Blocker[]; onAdd: (t: string) => void; onResolve: (id: string, s: string) => void }) {
  const [draft, setDraft] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);
  const [solution, setSolution] = useState("");
  const open = blockers.filter((b) => b.status === "open");

  return (
    <section id="blockers" className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold"><AlertTriangle size={18} className="text-amber-500" /> Blockers</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{open.length} open</span>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { onAdd(draft.trim()); setDraft(""); } }} className="mt-4 flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What's blocking you?" aria-label="Log a blocker"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
        <button type="submit" disabled={!draft.trim()} aria-label="Add blocker"
          className="grid w-11 place-items-center rounded-xl bg-slate-900 text-white transition-colors hover:bg-brand-600 disabled:opacity-40"><Plus size={18} /></button>
      </form>

      <ul className="mt-4 space-y-3">
        <AnimatePresence initial={false} mode="popLayout">
          {open.map((b) => (
            <m.li key={b.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: 24 }}
              className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
              <p className="font-medium">{b.title}</p>
              {b.attempts.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {b.attempts.map((a) => <li key={a} className="flex gap-2"><span className="text-slate-400">•</span>{a}</li>)}
                </ul>
              )}
              {resolving === b.id ? (
                <form onSubmit={(e) => { e.preventDefault(); if (solution.trim()) { onResolve(b.id, solution.trim()); setResolving(null); setSolution(""); } }} className="mt-3 space-y-2">
                  <textarea autoFocus rows={2} value={solution} onChange={(e) => setSolution(e.target.value)} placeholder="What fixed it?" aria-label="Solution"
                    className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
                  <div className="flex gap-2">
                    <button type="submit" disabled={!solution.trim()} className="rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Mark as resolved</button>
                    <button type="button" onClick={() => setResolving(null)} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white">Cancel</button>
                  </div>
                </form>
              ) : (
                <button onClick={() => setResolving(b.id)} className="mt-3 text-sm font-semibold text-brand-600 hover:underline">Resolve this</button>
              )}
            </m.li>
          ))}
        </AnimatePresence>
      </ul>

      {open.length === 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 size={20} className="shrink-0" /> Nothing is blocking you. Log a blocker above the moment something gets in the way.
        </div>
      )}
    </section>
  );
}

function Activity({ evidence }: { evidence: Evidence[] }) {
  const items = [...evidence].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 6);
  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-brand-600" /> Recent evidence</h2>
        <Link href="/evidence" className="text-sm font-semibold text-brand-600 hover:underline">View all</Link>
      </div>
      <ul className="mt-4 space-y-1">
        <AnimatePresence initial={false}>
          {items.map((e, i) => {
            const Icon = TYPE_ICON[e.type];
            return (
              <m.li key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.4, ease: EASE }}
                className="flex gap-3 rounded-xl p-2.5 transition-colors hover:bg-slate-50">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Icon size={17} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <p className="truncate text-sm font-medium">{e.text}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROV_STYLE[e.provenance]}`}>{e.provenance}</span>
                  </div>
                  <p className="text-xs text-slate-500">{e.type} · {rel(e.date)} · {e.source} · {e.stage}</p>
                </div>
              </m.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6" role="status" aria-label="Loading project">
      <div className="h-48 rounded-3xl bg-slate-200/60" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={`placeholder-${i}`} className="h-28 rounded-2xl bg-slate-200/60" />)}</div>
      <div className="h-40 rounded-3xl bg-slate-200/60" />
    </div>
  );
}

/* ---------- page ---------- */

export default function DashboardPage() {
  const router = useRouter();
  const user = useSession();
  const { projects, active, ready, update } = useProjects((s) => ({ projects: s.projects, active: s.active, ready: s.ready, update: s.update }));
  const { data, addBlocker, resolveBlocker } = useProjectData(active);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (ready && projects.length === 0) router.replace("/new");
  }, [ready, projects.length, router]);

  if (!ready || !active || !data) return projects.length === 0 && ready ? <Loader2 className="mx-auto mt-24 animate-spin text-slate-400" /> : <Skeleton />;

  const idx = STAGES.indexOf(active.stage);
  const progress = Math.round(((idx + 1) / STAGES.length) * 100);
  const openCount = data.blockers.filter((b) => b.status === "open").length;
  const days = Math.max(1, Math.ceil((now - new Date(active.createdAt).getTime()) / 86_400_000));
  const next = nextAction(active, data.evidence, data.blockers);

  return (
    <div className="space-y-6">
      {/* Project header */}
      <m.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
        className="grid overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm md:grid-cols-[1fr_280px]">
        <div className="p-7">
          <p className="text-sm text-slate-500">{greeting()}, {user?.name.split(" ")[0]}</p>
          <h1 className="mt-1 text-3xl font-semibold">{active.name}</h1>
          <p className="mt-3 max-w-xl text-slate-600">{active.goal}</p>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 font-medium text-white"><Compass size={14} /> {active.stage}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-slate-700"><Users size={14} /> {active.users}</span>
            {active.repo && <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-700"><GitBranch size={14} /> {active.repo}</span>}
          </div>
        </div>
        <div className="relative hidden md:block" aria-hidden>
          <Image src="/images/marketing/overview.webp" alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/10 to-transparent" />
        </div>
      </m.section>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Progress" delay={0.05}>
          <p className="mt-2 text-3xl font-semibold"><CountUp to={progress} suffix="%" /></p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Journey progress">
            <m.div className="h-full rounded-full bg-brand-600" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 1.1, ease: EASE }} />
          </div>
        </Stat>
        <Stat label="Evidence items" delay={0.1}>
          <p className="mt-2 text-3xl font-semibold"><CountUp to={data.evidence.length} /></p>
          <p className="mt-3 text-xs text-slate-500">{data.evidence.filter((e) => e.provenance === "AI-assisted").length} AI-assisted</p>
        </Stat>
        <Stat label="Open blockers" delay={0.15}>
          <p className={`mt-2 text-3xl font-semibold ${openCount ? "text-amber-600" : ""}`}><CountUp to={openCount} /></p>
          <p className="mt-3 text-xs text-slate-500">{data.blockers.filter((b) => b.status === "resolved").length} resolved</p>
        </Stat>
        <Stat label="Days on project" delay={0.2}>
          <p className="mt-2 text-3xl font-semibold"><CountUp to={days} /></p>
          <p className="mt-3 text-xs text-slate-500">Stage {idx + 1} of {STAGES.length}</p>
        </Stat>
      </div>

      {/* Next step */}
      <m.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.6, ease: EASE }}
        className="relative overflow-hidden rounded-3xl bg-slate-900 p-7 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-500/30 blur-3xl" aria-hidden />
        <div className="relative grid items-end gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <p className="text-sm font-medium text-slate-400">Next step</p>
            <AnimatePresence mode="wait">
              <m.div key={next.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
                <h2 className="mt-1 text-2xl font-semibold sm:text-3xl">{next.title}</h2>
                <p className="mt-3 max-w-2xl leading-relaxed text-slate-300"><span className="font-medium text-white">Why: </span>{next.why}</p>
              </m.div>
            </AnimatePresence>
          </div>
          {next.advance ? (
            <button onClick={() => update(active.id, { stage: STAGES[idx + 1] })}
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-brand-50">
              {next.cta} <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </button>
          ) : (
            <Link href={next.href!} className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-brand-50">
              {next.cta} <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </Link>
          )}
        </div>
        <p className="relative mt-6 text-xs text-slate-500">Suggestions are rule-based and never act without your approval.</p>
      </m.section>

      <JourneyStrip project={active} onPick={(s) => update(active.id, { stage: s })} />

      <div className="grid gap-6 lg:grid-cols-2">
        <BlockersCard blockers={data.blockers} onAdd={addBlocker} onResolve={resolveBlocker} />
        <Activity evidence={data.evidence} />
      </div>
    </div>
  );
}
