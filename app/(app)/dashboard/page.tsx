"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Compass, EyeOff, Folder, Globe, Plus, ShieldCheck, X } from "lucide-react";
import { useSession } from "@/lib/auth";
import { useProjects } from "@/lib/store";
import { STAGES } from "@/lib/store";
import { STAGE_INFO, useTasks } from "@/lib/tasks";
import { LEVEL_BADGE, LEVEL_LABEL, useCapability } from "@/lib/capability";
import { projectStats } from "@/lib/account";
import { saveDevRecord, useDevRecord, type DevRecord, type SkillLevel } from "@/lib/market";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const LEVELS: SkillLevel[] = ["Beginner", "Intermediate", "Advanced"];
const TABS = [
  { id: "journey", label: "My Journey", icon: Compass },
  { id: "projects", label: "My Projects", icon: Folder },
  { id: "capability", label: "My Capability", icon: ShieldCheck },
] as const;
type TabId = (typeof TABS)[number]["id"];

const LEVEL_STYLE: Record<SkillLevel, string> = {
  Beginner: "bg-slate-100 text-slate-700",
  Intermediate: "bg-sky-50 text-sky-700",
  Advanced: "bg-violet-50 text-violet-700",
};
const MARKS = [
  { l: "L0", t: "Self-declared" }, { l: "L1", t: "Learned" }, { l: "L2", t: "Practiced" },
  { l: "L3", t: "Applied or shipped" }, { l: "L4", t: "Externally verified" },
];

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";

function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-brand-600" : "bg-slate-300"}`}>
      <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }} className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${on ? "right-0.5" : "left-0.5"}`} />
    </button>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-slate-100 bg-white p-6 shadow-sm ${className}`}>{children}</section>;
}

export default function DeveloperHub() {
  const router = useRouter();
  const user = useSession();
  const rec = useDevRecord(user?.id);
  const { projects, active, ready, setActive } = useProjects();
  const { tasks } = useTasks(active?.id, active?.stage);
  const cap = useCapability(user?.id, rec?.skills ?? [], false);
  const [tab, setTab] = useState<TabId>("journey");
  const [goal, setGoal] = useState("");
  const [skillName, setSkillName] = useState("");
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("Intermediate");

  useEffect(() => {
    if (rec === null) router.replace("/onboarding");
  }, [rec, router]);

  const stats = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, projectStats(p.id)])), [projects]);

  if (!user || !rec || !ready) {
    return (
      <div className="animate-pulse space-y-4" role="status" aria-label="Loading dashboard">
        <div className="h-10 w-64 rounded-xl bg-slate-200/60" />
        <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-slate-200/60" />)}</div>
        <div className="h-64 rounded-3xl bg-slate-200/60" />
      </div>
    );
  }

  const patch = (p: Partial<DevRecord>) => saveDevRecord({ ...rec, ...p });
  const evidenceTotal = projects.reduce((n, p) => n + (stats[p.id]?.evidence ?? 0), 0);
  const withEvidence = projects.filter((p) => (stats[p.id]?.evidence ?? 0) > 0).length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const stageTasks = (tasks ?? []).filter((t) => active && t.stage === active.stage);
  const doneTasks = stageTasks.filter((t) => t.done).length;
  const stageIdx = active ? STAGES.indexOf(active.stage) : -1;

  function addGoal(e: React.FormEvent) {
    e.preventDefault();
    const t = goal.trim().slice(0, 80);
    if (!t || rec!.goals.length >= 8 || rec!.goals.some((g) => g.toLowerCase() === t.toLowerCase())) return;
    patch({ goals: [...rec!.goals, t] });
    setGoal("");
  }

  function addSkill(e: React.FormEvent) {
    e.preventDefault();
    const t = skillName.trim().slice(0, 30);
    if (!t || rec!.skills.length >= 15 || rec!.skills.some((s) => s.name.toLowerCase() === t.toLowerCase())) return;
    patch({ skills: [...rec!.skills, { name: t, level: skillLevel }] });
    setSkillName("");
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
        <p className="text-sm text-slate-500">{greeting}, {user.name.split(" ")[0]}</p>
        <h1 className="mt-1 text-3xl font-semibold">Your developer dashboard</h1>
        <p className="mt-2 max-w-xl text-slate-600">Learn, build and collect evidence. It all adds up to a capability profile employers can trust.</p>
      </motion.div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Summary">
        {[
          { n: projects.length, l: projects.length === 1 ? "Project" : "Projects" },
          { n: evidenceTotal, l: "Evidence items" },
          { n: rec.skills.length, l: "Skills declared" },
          { n: rec.openToWork ? "Visible" : "Hidden", l: "To employers" },
        ].map((s, i) => (
          <motion.li key={s.l} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.05, duration: 0.5, ease: EASE }}
            className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-3xl font-semibold">{s.n}</p>
            <p className="mt-1 text-sm text-slate-500">{s.l}</p>
          </motion.li>
        ))}
      </ul>

      <div role="tablist" aria-label="Dashboard sections" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}
            className={`relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === t.id ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {tab === t.id && <motion.span layoutId="hub-tab" className="absolute inset-0 rounded-full bg-slate-900" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
            <span className="relative inline-flex items-center gap-2"><t.icon size={15} /> {t.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className="space-y-6">

          {tab === "journey" && (
            <>
              <Card>
                <h2 className="font-semibold">Your goals</h2>
                <p className="mt-1 text-sm text-slate-500">What you&apos;re working towards. Add or remove goals any time.</p>
                {rec.goals.length > 0 ? (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {rec.goals.map((g) => (
                      <li key={g} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1.5 pl-3.5 pr-2 text-sm font-medium text-brand-700">
                        {g}
                        <button onClick={() => patch({ goals: rec.goals.filter((x) => x !== g) })} aria-label={`Remove goal: ${g}`} className="rounded-full p-0.5 hover:bg-brand-100"><X size={13} /></button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-4 text-sm text-slate-500">No goals yet. Add your first one below.</p>}
                <form onSubmit={addGoal} className="mt-4 flex gap-2">
                  <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Add a goal" aria-label="Add a goal" maxLength={80} className={inputCls} />
                  <button type="submit" disabled={!goal.trim()} aria-label="Add goal" className="grid w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-white transition-colors hover:bg-brand-600 disabled:opacity-40"><Plus size={18} /></button>
                </form>
              </Card>

              {active ? (
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-500">Current project</p>
                      <h2 className="text-xl font-semibold">{active.name}</h2>
                    </div>
                    <span className="rounded-full bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">{active.stage}</span>
                  </div>
                  <p className="mt-4 text-slate-700"><span className="font-medium">The question: </span>{STAGE_INFO[active.stage].question}</p>
                  <p className="mt-1 text-sm text-slate-600"><span className="font-medium text-slate-700">Works with: </span>{STAGE_INFO[active.stage].tool}</p>
                  <p className="mt-1 text-sm text-slate-600"><span className="font-medium text-slate-700">Tasks in this stage: </span>{doneTasks} of {stageTasks.length} done</p>

                  <ol className="mt-5 flex flex-wrap gap-1.5" aria-label="Journey stages">
                    {STAGES.map((s, i) => (
                      <li key={s} aria-current={i === stageIdx ? "step" : undefined}
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${i === stageIdx ? "bg-slate-900 text-white" : i < stageIdx ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                        {i < stageIdx && <Check size={12} />} {s}
                      </li>
                    ))}
                  </ol>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link href="/overview" className="group inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600">
                      Open project overview <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                    </Link>
                    <Link href="/tasks" className="inline-flex items-center rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">Open tasks</Link>
                  </div>
                </Card>
              ) : (
                <Card className="text-center">
                  <p className="font-semibold">Start your first project</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">Every journey begins with an idea. Create a project and Nuvora starts collecting your evidence.</p>
                  <Link href="/new" className="mt-5 inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Create a project</Link>
                </Card>
              )}
            </>
          )}

          {tab === "projects" && (
            projects.length === 0 ? (
              <Card className="text-center">
                <p className="font-semibold">No projects yet</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">Add a project from scratch, or import a GitHub repository to turn its history into evidence.</p>
                <Link href="/new" className="mt-5 inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Add a project</Link>
              </Card>
            ) : (
              <ul className="grid gap-5 sm:grid-cols-2">
                {projects.map((p) => {
                  const s = stats[p.id];
                  return (
                    <li key={p.id} className={`flex flex-col rounded-3xl border bg-white p-6 shadow-sm ${p.id === active?.id ? "border-brand-200 ring-4 ring-brand-50" : "border-slate-100"}`}>
                      <div className="flex items-start gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-lg font-bold text-brand-700" aria-hidden>{p.name[0]?.toUpperCase()}</span>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold">{p.name}</h3>
                          <p className="text-xs text-slate-500">{p.repo ?? "No repository connected"}</p>
                        </div>
                        {p.id === active?.id && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">Current</span>}
                      </div>
                      <p className="mt-4 line-clamp-2 text-sm text-slate-600">{p.goal}</p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-slate-900 px-2.5 py-1 font-medium text-white">{p.stage}</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{s?.evidence ?? 0} evidence</span>
                        {!!s?.openBlockers && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{s.openBlockers} open blocker{s.openBlockers === 1 ? "" : "s"}</span>}
                        {s?.slug && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700"><Globe size={12} /> Published</span>}
                      </div>
                      <button onClick={() => { setActive(p.id); router.push("/overview"); }}
                        className="group mt-5 inline-flex items-center gap-2 self-start rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600">
                        Open <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                      </button>
                    </li>
                  );
                })}
                <li>
                  <Link href="/new" className="grid h-full min-h-[200px] place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center transition-colors hover:border-brand-500 hover:bg-brand-50/40">
                    <span>
                      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600"><Plus size={18} /></span>
                      <span className="mt-3 block font-semibold">Add a project</span>
                      <span className="mt-1 block text-sm text-slate-600">Start from scratch or import a GitHub repo</span>
                    </span>
                  </Link>
                </li>
              </ul>
            )
          )}

          {tab === "capability" && (
            <>
              <Card>
                <h2 className="font-semibold">How your skills are measured</h2>
                <p className="mt-1 text-sm text-slate-600">Every skill starts as self-declared. As your projects back it up with real evidence, it moves up.</p>
                <ol className="mt-4 flex flex-wrap gap-2" aria-label="Capability levels">
                  {MARKS.map((m, i) => (
                    <li key={m.l} className={`rounded-full px-3 py-1.5 text-xs font-medium ${i === 0 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{m.l} {m.t}</li>
                  ))}
                </ol>
                                <p className="mt-4 rounded-xl bg-brand-50/60 p-3 text-sm text-slate-700">
                  Your skills are measured against {evidenceTotal} evidence item{evidenceTotal === 1 ? "" : "s"}.{" "}
                  <Link href="/capability" className="font-semibold text-brand-600 hover:underline">See the full breakdown</Link>
                </p>
              </Card>

              <Card>
                <h2 className="font-semibold">Your skills</h2>
                {rec.skills.length === 0 ? <p className="mt-3 text-sm text-slate-500">No skills yet. Add one below.</p> : (
                  <ul className="mt-4 space-y-2">
                    {rec.skills.map((s) => (
                      <li key={s.name} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-3">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                                                {(() => {
                          const lvl = cap.results.find((c) => c.name === s.name)?.level ?? 0;
                          return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${LEVEL_BADGE[lvl]}`}>L{lvl} {LEVEL_LABEL[lvl]}</span>;
                        })()}
                        <label className="sr-only" htmlFor={`lvl-${s.name}`}>{s.name} level</label>
                        <select id={`lvl-${s.name}`} value={s.level} onChange={(e) => patch({ skills: rec.skills.map((k) => (k.name === s.name ? { ...k, level: e.target.value as SkillLevel } : k)) })}
                          className={`rounded-full border-0 px-3 py-1 text-xs font-medium ${LEVEL_STYLE[s.level]}`}>
                          {LEVELS.map((l) => <option key={l}>{l}</option>)}
                        </select>
                        <button onClick={() => patch({ skills: rec.skills.filter((k) => k.name !== s.name) })} aria-label={`Remove ${s.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X size={15} /></button>
                      </li>
                    ))}
                  </ul>
                )}
                <form onSubmit={addSkill} className="mt-4 flex flex-wrap gap-2">
                  <input value={skillName} onChange={(e) => setSkillName(e.target.value)} placeholder="Add a skill" aria-label="Skill name" maxLength={30} className={`${inputCls} min-w-[180px] flex-1`} />
                  <select value={skillLevel} onChange={(e) => setSkillLevel(e.target.value as SkillLevel)} aria-label="Skill level" className={`${inputCls} !w-auto`}>
                    {LEVELS.map((l) => <option key={l}>{l}</option>)}
                  </select>
                  <button type="submit" disabled={!skillName.trim()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"><Plus size={16} /> Add</button>
                </form>
              </Card>

              <Card>
                <div className="flex items-start gap-4">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${rec.openToWork ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                    {rec.openToWork ? <Globe size={18} /> : <EyeOff size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">Let employers find me</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {rec.openToWork
                        ? "You're visible. Employers can see your skills and only the evidence you've made public."
                        : "You're hidden. Turn this on to be matched with real work. You always control which evidence is public."}
                    </p>
                  </div>
                  <Switch on={rec.openToWork} onChange={() => patch({ openToWork: !rec.openToWork })} label="Let employers find me" />
                </div>
              </Card>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}