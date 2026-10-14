"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Info, ShieldCheck } from "lucide-react";
import { useSession } from "@/lib/auth";
import { useMarketTasks } from "@/lib/market";
import { latestOffer, useOffers } from "@/lib/offers";
import { getDeveloper, matchTask, usePrep } from "@/lib/matching";
import { analyseSkill, LEVEL_BADGE, LEVEL_LABEL } from "@/lib/capability";
import { PROV_STYLE, TYPE_ICON } from "@/lib/data";
import { HowScored, LABEL_STYLE, ScoreRing, SkillBreakdown } from "@/components/match-ui";
import { OfferAction } from "@/components/candidates";

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function DeveloperPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-slate-200/60" role="status" aria-label="Loading developer" />}>
      <DeveloperView />
    </Suspense>
  );
}

function DeveloperView() {
  const { id } = useParams<{ id: string }>();
  const user = useSession();
  const tasks = useMarketTasks();
  const offers = useOffers();
  const taskId = useSearchParams().get("task");

  const [loadedDev, setLoadedDev] = useState<{ id: string; value: Awaited<ReturnType<typeof getDeveloper>> } | null>(null);
  useEffect(() => {
    let active = true;
    void getDeveloper(id).then((result) => { if (active) setLoadedDev({ id, value: result }); });
    return () => { active = false; };
  }, [id]);
  const dev = loadedDev?.id === id ? loadedDev.value : undefined;
  const p = usePrep(dev?.userId);

  if (!user || !tasks || !offers || dev === undefined) return <div className="h-96 animate-pulse rounded-3xl bg-slate-200/60" role="status" aria-label="Loading developer" />;

  const myTasks = tasks.filter((t) => t.employerId === user.id);
  const related = offers.filter((o) => o.devId === id && myTasks.some((t) => t.id === o.taskId) && (o.status === "pending" || o.status === "accepted"));
  const allowed = !!dev && (dev.rec.openToWork || related.length > 0);

  if (!dev || !p || !allowed) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
        <p className="font-semibold">This developer isn&apos;t available</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">They may have chosen not to be discoverable. Developers are visible to you only when they&apos;ve opted in or shown interest in one of your tasks.</p>
        <Link href="/employer" className="mt-5 inline-flex rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Back to dashboard</Link>
      </div>
    );
  }

  const task = myTasks.find((t) => t.id === taskId);
  const m = task ? matchTask(task, p, dev.rec.skills.map((s) => s.name), true) : null;
  const skills = dev.rec.skills.map((s) => analyseSkill(s, p.input, p.verifs, true)).sort((a, b) => b.level - a.level || b.points - a.points);
  const projects = p.input
    .map(({ project, evidence }) => ({ name: project.name, items: evidence.filter((e) => e.public).sort((a, b) => +new Date(b.date) - +new Date(a.date)) }))
    .filter((x) => x.items.length > 0);
  const publicCount = projects.reduce((n, x) => n + x.items.length, 0);
  const initials = dev.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={task ? `/employer/tasks/${task.id}` : "/employer"} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={14} /> {task ? "Back to task" : "Dashboard"}</Link>

      <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-slate-900 text-xl font-semibold text-white" aria-hidden>{initials}</span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold">{dev.name}</h1>
            <p className="text-sm text-slate-500">
              {dev.rec.githubHandle && <a href={`https://github.com/${dev.rec.githubHandle}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600">github.com/{dev.rec.githubHandle}</a>}
              {dev.rec.githubHandle && " · "}{dev.rec.openToWork ? "Open to work" : "Showed interest in your task"}
            </p>
          </div>
        </div>
        <ul className="mt-5 grid grid-cols-3 gap-3 text-center" aria-label="Summary">
          {[{ n: skills.filter((s) => s.level >= 2).length, l: "Skills at L2 or higher" }, { n: publicCount, l: "Public evidence" }, { n: p.verifs.length, l: "Verified by employers" }].map((s) => (
            <li key={s.l} className="rounded-2xl bg-slate-50 p-3"><p className="text-2xl font-semibold">{s.n}</p><p className="text-xs text-slate-500">{s.l}</p></li>
          ))}
        </ul>
        <p className="mt-4 flex gap-2.5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600"><Info size={15} className="mt-0.5 shrink-0" /> You&apos;re seeing only what this developer chose to make public. Levels are measured from that evidence.</p>
      </section>

      {task && m ? (
        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center gap-5">
            <ScoreRing score={m.score} />
            <div className="min-w-0 flex-1">
              <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">Fit for &ldquo;{task.title}&rdquo; <span className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${LABEL_STYLE[m.label]}`}>{m.label} match</span></h2>
              <p className="mt-1 text-sm text-slate-600">{m.strong.length ? `Strong in ${m.strong.join(", ")}.` : "None of the required skills reach L3."} {m.gaps.length ? `Gaps: ${m.gaps.join(", ")}.` : ""}</p>
            </div>
            <OfferAction taskId={task.id} dev={{ id: dev.userId, name: dev.name }} offer={latestOffer(offers, task.id, dev.userId)} open={task.status === "open"} />
          </div>
          <div className="mt-6"><SkillBreakdown match={m} you={false} /></div>
          <div className="mt-4"><HowScored /></div>
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">Open this developer from a task&apos;s candidate list to see how they fit it and to invite them.</p>
      )}

      <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-brand-600" /> Skills, measured from evidence</h2>
        {skills.length === 0 ? <p className="mt-3 text-sm text-slate-600">No skills listed.</p> : (
          <ul className="mt-4 space-y-2">
            {skills.map((s) => (
              <li key={s.name} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 p-3">
                <span className="mr-1 font-medium">{s.name}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_BADGE[s.level]}`}>L{s.level} {LEVEL_LABEL[s.level]}</span>
                <span className="ml-auto text-xs text-slate-500">{s.evidence.length} public item{s.evidence.length === 1 ? "" : "s"} · they say {s.declared}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="font-semibold">Public evidence</h2>
        {projects.length === 0 ? <p className="mt-3 text-sm text-slate-600">Nothing has been made public yet.</p> : projects.map((proj) => (
          <div key={proj.name} className="mt-5">
            <h3 className="text-sm font-semibold text-slate-500">{proj.name}</h3>
            <ul className="mt-2 space-y-2">
              {proj.items.map((e) => {
                const Icon = TYPE_ICON[e.type];
                return (
                  <li key={e.id} className="flex gap-3 rounded-xl border border-slate-100 p-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><Icon size={15} /></span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="break-words text-sm font-medium">{e.text}</p><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROV_STYLE[e.provenance]}`}>{e.provenance}</span></div>
                      <p className="text-xs text-slate-500">{e.type} · {fmt(e.date)} · {e.source}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
