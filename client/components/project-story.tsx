import Image from "next/image";
import { GitBranch, Users } from "lucide-react";
import { PROV_STYLE, TYPE_ICON } from "@/lib/evidence-ui";
import type { Provenance } from "@/lib/data";
import { STORY_LABELS } from "@/lib/publish-ui";
import type { Snapshot, Story } from "@/lib/publish";

const PROV_BAR: Record<Provenance, string> = {
  Human: "bg-emerald-500",
  "AI-assisted": "bg-violet-500",
  Collaborator: "bg-amber-500",
  External: "bg-sky-500",
};
const PROVS: Provenance[] = ["Human", "AI-assisted", "Collaborator", "External"];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-3 leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

const Text = ({ s }: { s: string }) => (s.trim() ? <p className="max-w-prose whitespace-pre-wrap break-words">{s}</p> : null);

export function ProjectStory({ snap }: { snap: Snapshot }) {
  const ev = [...snap.evidence].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const counts = PROVS.map((p) => ({ p, n: ev.filter((e) => e.provenance === p).length }));
  const s: Story = snap.story;

  return (
    <article>
      <div className="relative h-48 overflow-hidden sm:h-60">
        <Image src="/images/marketing/workspace.webp" alt="" fill sizes="(min-width: 1280px) 1152px, calc(100vw - 2rem)" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/50 to-transparent" />
      </div>

      <div className="-mt-16 px-6 pb-10 sm:px-10">
        <div className="relative">
          <h1 className="text-3xl font-semibold sm:text-4xl">{snap.name}</h1>
          <p className="mt-3 max-w-prose text-lg text-slate-600">{snap.goal}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-slate-900 px-3 py-1.5 font-medium text-white">{snap.stage}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-slate-700"><Users size={14} /> {snap.users}</span>
            {snap.repo && <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-700"><GitBranch size={14} /> {snap.repo}</span>}
          </div>
          <p className="mt-4 text-sm text-slate-500">By {snap.author}</p>
        </div>

        <Block title={STORY_LABELS.problem}><Text s={s.problem} /></Block>
        <Block title={STORY_LABELS.process}><Text s={s.process} /></Block>
        <Block title={STORY_LABELS.build}><Text s={s.build} /></Block>
        {s.challenges.trim() && <Block title={STORY_LABELS.challenges}><Text s={s.challenges} /></Block>}

        <Block title="Evidence">
          {ev.length === 0 ? (
            <p className="text-slate-500">No evidence has been made public.</p>
          ) : (
            <>
              <div className="flex h-2.5 max-w-prose overflow-hidden rounded-full bg-slate-100" role="img" aria-label={counts.map((c) => `${c.p}: ${c.n}`).join(", ")}>
                {counts.map(({ p, n }) => n > 0 && <div key={p} className={PROV_BAR[p]} style={{ width: `${(n / ev.length) * 100}%` }} />)}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                {counts.filter((c) => c.n > 0).map(({ p, n }) => (
                  <li key={p} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${PROV_BAR[p]}`} />{p} {n}</li>
                ))}
              </ul>
              <ul className="mt-5 space-y-2.5">
                {ev.map((e) => {
                  const Icon = TYPE_ICON[e.type];
                  return (
                    <li key={e.id} className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3.5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Icon size={17} /></span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="break-words text-sm font-medium text-slate-900">{e.text}</p>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROV_STYLE[e.provenance]}`}>{e.provenance}</span>
                        </div>
                        <p className="text-xs text-slate-500">{e.type} · {new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {e.source}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Block>

        <Block title={STORY_LABELS.result}><Text s={s.result} /></Block>
      </div>
    </article>
  );
}
