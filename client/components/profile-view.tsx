"use client";
import Image from "next/image";

import Link from "next/link";
import { m } from "framer-motion";
import { ArrowUpRight, CalendarDays, Globe, Link2, MapPin } from "lucide-react";
import { githubUrl, profileStats, type ProfileProject, type PublicProfile } from "@/lib/profile";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const GRADIENTS = [
  "from-brand-500 to-brand-700", "from-violet-500 to-fuchsia-600", "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600", "from-sky-500 to-blue-600", "from-rose-500 to-pink-600",
];
const gradient = (s: string) => GRADIENTS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];
const safeExternalUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const BAR: Record<string, string> = { Human: "bg-emerald-500", "AI-assisted": "bg-violet-500", Collaborator: "bg-amber-500", External: "bg-sky-500" };

const GitHubMark = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
    <path d="M12 .5A11.5 11.5 0 0 0 .5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
  </svg>
);

function ProjectCard({ p, i }: { p: ProfileProject; i: number }) {
  const ev = p.snap.evidence;
  const human = ev.length ? Math.round((ev.filter((e) => e.provenance === "Human").length / ev.length) * 100) : 0;
  return (
    <m.li initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06, duration: 0.5, ease: EASE }} whileHover={{ y: -4 }}>
      <Link href={`/p/${p.slug}`} className="group flex h-full flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm transition-shadow hover:shadow-lg hover:shadow-slate-900/5">
        <div className={`relative grid h-28 place-items-center bg-gradient-to-br ${gradient(p.snap.name)}`}>
          <span className="text-4xl font-bold text-white/90" aria-hidden>{p.snap.name[0]?.toUpperCase()}</span>
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700">{p.snap.stage}</span>
          <ArrowUpRight size={18} className="absolute right-3 top-3 text-white/80 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
        <div className="flex flex-1 flex-col p-5">
          <h3 className="break-words font-semibold">{p.snap.name}</h3>
          <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{p.snap.goal}</p>
          <div className="mt-auto pt-4">
            {ev.length > 0 && (
              <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                {Object.keys(BAR).map((k) => {
                  const n = ev.filter((e) => e.provenance === k).length;
                  return n ? <span key={k} className={BAR[k]} style={{ width: `${(n / ev.length) * 100}%` }} /> : null;
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">
              {ev.length} evidence {ev.length === 1 ? "item" : "items"}{ev.length > 0 && ` · ${human}% human-made`}
            </p>
          </div>
        </div>
      </Link>
    </m.li>
  );
}

export function ProfileView({
  profile, projects, owner = false, action,
}: { profile: PublicProfile; projects: ProfileProject[]; owner?: boolean; action?: React.ReactNode }) {
  const s = profileStats(projects);
  const initials = profile.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const joined = new Date(profile.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const links = [
    profile.website && safeExternalUrl(profile.website) && { icon: Globe, label: profile.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), href: safeExternalUrl(profile.website)! },
    profile.github && safeExternalUrl(githubUrl(profile.github)) && { icon: null, label: `github.com/${profile.github}`, href: safeExternalUrl(githubUrl(profile.github))! },
    profile.linkedin && safeExternalUrl(profile.linkedin) && { icon: Link2, label: "LinkedIn", href: safeExternalUrl(profile.linkedin)! },
  ].filter(Boolean) as { icon: typeof Globe | null; label: string; href: string }[];

  return (
    <article>
      <div className="relative h-40 overflow-hidden sm:h-52 sm:rounded-3xl">
        <Image src="/images/marketing/landing-cta.webp" alt="" fill sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 via-slate-900/10 to-transparent" />
      </div>

      <div className="px-5 sm:px-2">
        <div className="-mt-14 flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-end gap-4">
            <m.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: EASE }}
              className="grid h-28 w-28 shrink-0 place-items-center rounded-full border-4 border-white bg-slate-900 text-3xl font-semibold text-white shadow-lg" aria-hidden>
              {initials}
            </m.span>
            <div className="min-w-0 pb-1">
              <h1 className="break-words text-3xl font-semibold">{profile.name}</h1>
              <p className="text-sm text-slate-500">@{profile.username}</p>
            </div>
          </div>
          {action && <div className="pb-1">{action}</div>}
        </div>

        {profile.headline && <p className="mt-4 max-w-2xl text-lg text-slate-700">{profile.headline}</p>}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-500">
          {profile.location && <span className="inline-flex items-center gap-1.5"><MapPin size={14} /> {profile.location}</span>}
          <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} /> Joined {joined}</span>
        </div>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-5 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm" aria-label="About">
            <section>
              <h2 className="font-semibold">About</h2>
              {profile.bio ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{profile.bio}</p>
                : <p className="mt-2 text-sm text-slate-500">{owner ? "Add a short bio so people know who you are." : "No bio yet."}</p>}
            </section>
            {(profile.skills ?? []).length > 0 && (
              <section>
                <h2 className="font-semibold">Skills</h2>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {(profile.skills ?? []).map((k) => <li key={k} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">{k}</li>)}
                </ul>
              </section>
            )}
            {links.length > 0 && (
              <section>
                <h2 className="font-semibold">Links</h2>
                <ul className="mt-2 space-y-2">
                  {links.map((l) => (
                    <li key={l.href}>
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-2 text-sm font-medium text-slate-700 hover:text-brand-600">
                        {l.icon ? <l.icon size={16} className="shrink-0" /> : <GitHubMark />} <span className="truncate">{l.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>

          <div className="min-w-0 space-y-6">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Profile stats">
              {[
                { n: s.projects, l: s.projects === 1 ? "Project" : "Projects" },
                { n: s.evidence, l: "Evidence items" },
                { n: `${s.humanPct}%`, l: "Human-made" },
                { n: s.blockers, l: "Blockers solved" },
              ].map((x) => (
                <li key={x.l} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <p className="text-2xl font-semibold">{x.n}</p>
                  <p className="text-xs text-slate-500">{x.l}</p>
                </li>
              ))}
            </ul>

            <section aria-label="Projects">
              <h2 className="mb-4 text-xl font-semibold">Projects</h2>
              {projects.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
                  <p className="font-semibold">{owner ? "No projects on your profile yet" : "No projects yet"}</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
                    {owner ? "Publish a project and it will appear here, with the evidence behind it." : "Published projects will show up here."}
                  </p>
                  {owner && <Link href="/publish" className="mt-5 inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Go to Publish</Link>}
                </div>
              ) : (
                <ul className="grid gap-5 sm:grid-cols-2">{projects.map((p, i) => <ProjectCard key={p.id} p={p} i={i} />)}</ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </article>
  );
}
