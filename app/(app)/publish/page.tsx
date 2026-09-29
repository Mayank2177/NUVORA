"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowUpRight, Check, Copy, EyeOff, Globe, Loader2, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useSession } from "@/lib/auth";
import { useProjects, type Project } from "@/lib/store";
import { PROV_STYLE, TYPE_ICON, useProjectData, type ProjectData } from "@/lib/data";
import {
  SLUG_RE, STORY_LABELS, generateStory, getPublishedSlug, getSnapshot, loadDraft, publishSnapshot,
  saveDraft, scan, slugTaken, slugify, unpublish, type Draft, type Snapshot, type Story,
} from "@/lib/publish";
import { ProjectStory } from "@/components/project-story";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const inputCls = (invalid = false) =>
  `w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-4 ${
    invalid ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-slate-200 hover:border-slate-300 focus:border-brand-500 focus:ring-brand-100"
  }`;

function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-brand-600" : "bg-slate-300"}`}>
      <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }} className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${on ? "right-0.5" : "left-0.5"}`} />
    </button>
  );
}

function Step({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-semibold text-white">{n}</span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-slate-500">{hint}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/* ---------- editor ---------- */

type Actions = Pick<ReturnType<typeof useProjectData>, "toggleEvidencePublic">;

function Editor({ project, data, toggleEvidencePublic }: { project: Project; data: ProjectData } & Actions) {
  const user = useSession();
  const pid = project.id;

  const [draft, setDraft] = useState<Draft>(() => loadDraft(pid) ?? { slug: slugify(project.name), story: null, includeBlockers: true });
  const [pubSlug, setPubSlug] = useState<string | null>(() => getPublishedSlug(pid));
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  useEffect(() => saveDraft(pid, draft), [pid, draft]);

  const publicEv = useMemo(() => data.evidence.filter((e) => e.public), [data.evidence]);
  const resolved = useMemo(() => (draft.includeBlockers ? data.blockers.filter((b) => b.status === "resolved") : []), [data.blockers, draft.includeBlockers]);
  const generated = useMemo(() => generateStory(project, publicEv, resolved), [project, publicEv, resolved]);
  const story: Story = draft.story ?? generated;
  const findings = useMemo(() => scan(story, publicEv, resolved), [story, publicEv, resolved]);

  const slugError = !SLUG_RE.test(draft.slug) || draft.slug.length < 3
    ? "Use 3 or more lowercase letters, numbers and hyphens."
    : slugTaken(draft.slug, pid) ? "That address is already taken. Try another." : "";

  const blocked = findings.secrets.length > 0 || !!slugError || publicEv.length === 0;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/p/${pubSlug ?? draft.slug}`;

  const snapshot: Snapshot = useMemo(() => ({
    projectId: pid, slug: draft.slug, name: project.name, goal: project.goal, users: project.users, stage: project.stage,
    repo: project.repo, author: user?.name ?? "Anonymous",
    publishedAt: getSnapshot(draft.slug)?.publishedAt ?? new Date().toISOString(),
    story, evidence: publicEv, blockers: resolved,
  }), [pid, draft.slug, project, user?.name, story, publicEv, resolved]);

  const setStory = (k: keyof Story, v: string) => setDraft((d) => ({ ...d, story: { ...story, [k]: v } }));

  function setAll(value: boolean) {
    data.evidence.filter((e) => !!e.public !== value).forEach((e) => toggleEvidencePublic(e.id));
  }

  async function onPublish() {
    if (blocked) return;
    setPublishing(true);
    await new Promise((r) => setTimeout(r, 800));
    publishSnapshot({ ...snapshot, publishedAt: new Date().toISOString() });
    setPubSlug(draft.slug);
    setPublishing(false);
  }

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
  }

  const checks = [
    { ok: publicEv.length > 0, text: publicEv.length ? `${publicEv.length} evidence items selected` : "Select at least one evidence item to make public" },
    { ok: findings.secrets.length === 0, text: findings.secrets.length ? `Possible secret found in ${findings.secrets[0]}. Remove it to continue.` : "Secret scan passed: no keys or passwords found" },
    { ok: !slugError, text: slugError || "Page address is available" },
  ];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Publish</h1>
          <p className="mt-2 max-w-xl text-slate-600">Turn {project.name} into a project story. Everything stays private until you publish, and you choose exactly what is shown.</p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium ${pubSlug ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          {pubSlug ? <Globe size={15} /> : <EyeOff size={15} />} {pubSlug ? "Published" : "Private draft"}
        </span>
      </motion.div>

      <AnimatePresence>
        {pubSlug && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <Check size={18} className="shrink-0 text-emerald-600" />
              <p className="min-w-0 flex-1 truncate font-mono text-sm text-emerald-900">{url}</p>
              <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />} {copied ? "Copied" : "Copy link"}
              </button>
              <Link href={`/p/${pubSlug}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">
                View page <ArrowUpRight size={14} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <Step n={1} title="Choose what becomes public" hint="Only items switched on appear on your page.">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-600">{publicEv.length} of {data.evidence.length} public</p>
              <div className="flex gap-1 text-sm font-medium">
                <button onClick={() => setAll(true)} className="rounded-lg px-2.5 py-1 text-brand-600 hover:bg-brand-50">Select all</button>
                <button onClick={() => setAll(false)} className="rounded-lg px-2.5 py-1 text-slate-600 hover:bg-slate-100">Select none</button>
              </div>
            </div>
            <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {[...data.evidence].sort((a, b) => +new Date(b.date) - +new Date(a.date)).map((e) => {
                const Icon = TYPE_ICON[e.type];
                return (
                  <li key={e.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><Icon size={15} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.text}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROV_STYLE[e.provenance]}`}>{e.provenance}</span>
                    </div>
                    <Switch on={!!e.public} label={`Make "${e.text}" public`} onChange={() => toggleEvidencePublic(e.id)} />
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <div>
                <p className="text-sm font-medium">Include resolved blockers as challenges</p>
                <p className="text-xs text-slate-500">{data.blockers.filter((b) => b.status === "resolved").length} resolved. Open blockers are never shown.</p>
              </div>
              <Switch on={draft.includeBlockers} label="Include resolved blockers" onChange={() => setDraft((d) => ({ ...d, includeBlockers: !d.includeBlockers }))} />
            </div>
          </Step>

          <Step n={2} title="Review your story" hint="Generated from your project and public evidence. Edit anything you like.">
            <div className="space-y-4">
              {(Object.keys(STORY_LABELS) as (keyof Story)[]).map((k) => (
                <div key={k}>
                  <label htmlFor={`story-${k}`} className="mb-1.5 block text-sm font-medium text-slate-700">{STORY_LABELS[k]}</label>
                  <textarea id={`story-${k}`} rows={k === "challenges" ? 4 : 3} value={story[k]} onChange={(e) => setStory(k, e.target.value)}
                    placeholder={k === "challenges" ? "Resolve a blocker to add a challenge here." : ""} className={`${inputCls()} resize-y`} />
                </div>
              ))}
              {draft.story && (
                <button onClick={() => setDraft((d) => ({ ...d, story: null }))} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:underline">
                  <RotateCcw size={14} /> Regenerate from evidence
                </button>
              )}
            </div>
          </Step>

          <Step n={3} title="Check and publish" hint="We scan everything public before it goes live.">
            <div>
              <label htmlFor="slug" className="mb-1.5 block text-sm font-medium text-slate-700">Page address</label>
              <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
                <span className="hidden bg-slate-50 px-3 py-2.5 text-sm text-slate-500 sm:block">/p/</span>
                <input id="slug" value={draft.slug} onChange={(e) => setDraft((d) => ({ ...d, slug: slugify(e.target.value) }))}
                  aria-invalid={!!slugError} className="w-full px-3 py-2.5 text-sm focus:outline-none" />
              </div>
            </div>

            <ul className="mt-4 space-y-2" aria-label="Pre-publish checks">
              {checks.map((c) => (
                <li key={c.text} className={`flex items-start gap-2.5 text-sm ${c.ok ? "text-slate-700" : "text-rose-700"}`}>
                  {c.ok ? <ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-600" /> : <ShieldAlert size={17} className="mt-0.5 shrink-0" />} {c.text}
                </li>
              ))}
            </ul>
            {findings.personal.length > 0 && (
              <p className="mt-3 flex items-start gap-2.5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                <AlertCircle size={17} className="mt-0.5 shrink-0" /> An email address appears in {findings.personal[0]}. Check that you want it public.
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <motion.button onClick={onPublish} disabled={blocked || publishing} whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700 disabled:opacity-50">
                {publishing ? <><Loader2 size={18} className="animate-spin" /> Publishing…</> : <><Globe size={18} /> {pubSlug ? "Update published page" : "Publish project"}</>}
              </motion.button>
              {pubSlug && (confirmOff ? (
                <span className="flex items-center gap-2 text-sm">
                  <button onClick={() => { unpublish(pid); setPubSlug(null); setConfirmOff(false); }} className="rounded-lg bg-rose-600 px-3 py-2 font-semibold text-white hover:bg-rose-700">Take page offline</button>
                  <button onClick={() => setConfirmOff(false)} className="px-2 py-2 font-medium text-slate-600">Cancel</button>
                </span>
              ) : (
                <button onClick={() => setConfirmOff(true)} className="px-3 py-3 text-sm font-medium text-slate-600 hover:text-rose-600">Unpublish</button>
              ))}
            </div>
          </Step>
        </div>

        <aside className="xl:sticky xl:top-8" aria-label="Live preview">
          <p className="mb-3 text-sm font-medium text-slate-500">Live preview of your public page</p>
          <div className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
            <ProjectStory snap={snapshot} />
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------- page ---------- */

export default function PublishPage() {
  const router = useRouter();
  const { projects, active, ready } = useProjects();
  const { data, toggleEvidencePublic } = useProjectData(active);

  useEffect(() => {
    if (ready && projects.length === 0) router.replace("/new");
  }, [ready, projects.length, router]);

  if (!ready || !active || !data) {
    return (
      <div className="animate-pulse space-y-4" role="status" aria-label="Loading">
        <div className="h-10 w-48 rounded-xl bg-slate-200/60" />
        <div className="grid gap-6 xl:grid-cols-2"><div className="h-96 rounded-3xl bg-slate-200/60" /><div className="h-96 rounded-3xl bg-slate-200/60" /></div>
      </div>
    );
  }
  return <Editor key={active.id} project={active} data={data} toggleEvidencePublic={toggleEvidencePublic} />;
}