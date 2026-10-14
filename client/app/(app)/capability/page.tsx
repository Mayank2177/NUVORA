"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import { ArrowRight, ChevronDown, Eye, EyeOff, Info, Plus } from "lucide-react";
import { useSession } from "@/lib/auth";
import { saveDevRecord, useDevRecord } from "@/lib/market";
import { PROV_STYLE, TYPE_ICON } from "@/lib/data";
import { LEVEL_BADGE, LEVEL_BAR, LEVEL_LABEL, LEVEL_RULE, useCapability, type SkillResult } from "@/lib/capability";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function LevelBar({ level, name }: { level: number; name: string }) {
  return (
    <div className="flex gap-1.5" role="img" aria-label={`${name}: level ${level} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={`level-segment-${i}`} className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
          <m.span className={`block h-full rounded-full ${LEVEL_BAR[level]}`} initial={{ width: 0 }}
            animate={{ width: i <= level ? "100%" : 0 }} transition={{ duration: 0.7, delay: i * 0.08, ease: EASE }} />
        </span>
      ))}
    </div>
  );
}

function SkillCard({ r, index }: { r: SkillResult; index: number }) {
  const [open, setOpen] = useState(false);
  const id = `skill-${index}`;
  return (
    <m.li initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05, duration: 0.5, ease: EASE }}
      className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-1 text-lg font-semibold">{r.name}</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${LEVEL_BADGE[r.level]}`}>L{r.level} {LEVEL_LABEL[r.level]}</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">You said {r.declared}</span>
        <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium ${r.backed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {r.backed ? "Backed by evidence" : "Needs more evidence"}
        </span>
      </div>

      <div className="mt-4"><LevelBar level={r.level} name={r.name} /></div>
      <p className="mt-3 text-sm text-slate-700"><span className="font-medium">{r.level < 4 ? `To reach L${r.level + 1}: ` : ""}</span>{r.next}</p>

      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
        What counts ({r.evidence.length}) <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <m.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
            <div className="pt-3">
              {r.verified.length > 0 && (
                <ul className="mb-3 space-y-2">
                  {r.verified.map((v) => (
                    <li key={v.id} className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Verified by {v.company}: {v.taskTitle}</li>
                  ))}
                </ul>
              )}
              {r.evidence.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Nothing is linked yet. Add or publish evidence that mentions {r.name}.</p>
              ) : (
                <ul className="space-y-2">
                  {r.evidence.map((e) => {
                    const Icon = TYPE_ICON[e.type];
                    return (
                      <li key={e.id} className="flex gap-3 rounded-xl border border-slate-100 p-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><Icon size={15} /></span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="break-words text-sm font-medium">{e.text}</p>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROV_STYLE[e.provenance]}`}>{e.provenance}</span>
                          </div>
                          <p className="text-xs text-slate-500">
                            {e.type} · {e.project} · {fmtDate(e.date)} · {e.via === "mention" ? "mentions the skill" : "same project"}
                            {e.type === "Learning" ? " · learning item" : e.weight === 0.5 ? " · counts half (AI-assisted)" : ""}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link href="/evidence" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">Open evidence <ArrowRight size={14} /></Link>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.li>
  );
}

export default function CapabilityPage() {
  const router = useRouter();
  const user = useSession();
  const rec = useDevRecord(user?.id);
  const [view, setView] = useState<"you" | "employer">("you");
  const cap = useCapability(user?.id, rec?.skills ?? [], view === "employer");

  useEffect(() => {
    if (rec === null) router.replace("/onboarding");
  }, [rec, router]);

  if (!user || !rec) {
    return (
      <div className="animate-pulse space-y-4" role="status" aria-label="Loading capability">
        <div className="h-10 w-64 rounded-xl bg-slate-200/60" />
        <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={`placeholder-${i}`} className="h-24 rounded-2xl bg-slate-200/60" />)}</div>
        <div className="h-48 rounded-3xl bg-slate-200/60" />
      </div>
    );
  }

  const { results, suggestions, counts, verifications } = cap;
  const backed = results.filter((r) => r.backed).length;
  const top = results.reduce((m, r) => Math.max(m, r.level), 0);
  const sorted = [...results].sort((a, b) => b.level - a.level || b.points - a.points);

  function addSuggested(name: string) {
    if (!rec || rec.skills.length >= 15) return;
    saveDevRecord({ ...rec, skills: [...rec.skills, { name, level: "Intermediate" }] });
  }

  return (
    <div className="space-y-6">
      {cap.error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{cap.error}</p>}
      <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
        <h1 className="text-3xl font-semibold">Capability</h1>
        <p className="mt-2 max-w-xl text-slate-600">What your evidence actually shows. Each skill is measured from the work behind it, and you can see exactly which items earned its level.</p>
      </m.div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Summary">
        {[
          { n: `${backed} of ${results.length}`, l: "Skills backed by evidence" },
          { n: top > 0 ? `L${top}` : "None yet", l: "Highest level reached" },
          { n: `${counts.pub} of ${counts.all}`, l: "Evidence items public" },
          { n: verifications.length, l: "Verified by employers" },
        ].map((s, i) => (
          <m.li key={s.l} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.05, duration: 0.5, ease: EASE }}
            className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-3xl font-semibold">{s.n}</p>
            <p className="mt-1 text-sm text-slate-500">{s.l}</p>
          </m.li>
        ))}
      </ul>

      <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Who is looking?</h2>
            <p className="text-sm text-slate-500">Preview your profile the way an employer would see it.</p>
          </div>
          <div role="radiogroup" aria-label="Preview as" className="inline-flex rounded-full border border-slate-200 p-1">
            {([["you", "You", Eye], ["employer", "Employer", EyeOff]] as const).map(([v, label, Icon]) => (
              <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)}
                className={`relative inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${view === v ? "text-white" : "text-slate-600 hover:text-slate-900"}`}>
                {view === v && <m.span className="absolute inset-0 rounded-full bg-slate-900" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <span className="relative inline-flex items-center gap-1.5"><Icon size={14} /> {label}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="mt-4 flex gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700" aria-live="polite">
          <Info size={16} className="mt-0.5 shrink-0 text-slate-500" />
          {view === "you"
            ? "You see every evidence item, public or private."
            : `Employers only see evidence you've made public, so ${counts.all - counts.pub} of your ${counts.all} items are not counted here. ${rec.openToWork ? "" : "You're also hidden from employers right now. "}`}
          {view === "employer" && <Link href="/evidence" className="font-semibold text-brand-600 hover:underline">Make more public</Link>}
        </p>
      </section>

      {results.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="font-semibold">No skills declared yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">Add the skills you have on your dashboard, and we&apos;ll measure each one against your evidence.</p>
          <Link href="/dashboard" className="mt-5 inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Go to dashboard</Link>
        </section>
      ) : (
        <ul className="space-y-4" aria-label="Skills">{sorted.map((r, i) => <SkillCard key={`${view}-${r.name}`} r={r} index={i} />)}</ul>
      )}

      {suggestions.length > 0 && (
        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="font-semibold">Found in your evidence</h2>
          <p className="mt-1 text-sm text-slate-500">Your work mentions these skills, but they aren&apos;t on your profile yet.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <li key={s.name}>
                <button onClick={() => addSuggested(s.name)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-700">
                  <Plus size={14} /> {s.name} <span className={`rounded-full px-2 py-0.5 text-xs ${LEVEL_BADGE[s.level]}`}>L{s.level}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="font-semibold">The five levels</h2>
        <ol className="mt-4 space-y-3">
          {LEVEL_LABEL.map((l, i) => (
            <li key={l} className="flex gap-3 text-sm">
              <span className={`mt-0.5 h-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${LEVEL_BADGE[i]}`}>L{i} {l}</span>
              <span className="text-slate-700">{LEVEL_RULE[i]}</span>
            </li>
          ))}
        </ol>
        <h2 className="mt-8 font-semibold">How the measuring works</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
          <li>Commits, pull requests, tests, solved blockers and AI sessions earn build points. Courses and notes count towards L1.</li>
          <li>Work done with AI counts half, and every level above L1 needs at least one item you made yourself.</li>
          <li>The same item only counts once, so repeating it can&apos;t raise a level.</li>
          <li>Languages and tools also earn credit from other work in a project whose evidence or description mentions them.</li>
          <li>L4 only comes from work an employer validated on Nuvora. You can&apos;t grant it to yourself.</li>
          <li><span className="font-medium">This matching is keyword-based and approximate.</span> It doesn&apos;t read your code yet, so treat it as a guide and a conversation starter, not a certification.</li>
        </ul>
      </section>
    </div>
  );
}
