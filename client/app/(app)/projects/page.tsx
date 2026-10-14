"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import { AlertCircle, ArrowRight, Check, Download, Globe, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useProjects, type Project } from "@/lib/store";
import { Pagination } from "@/components/pagination";
import { downloadText, exportProject, useProjectStats } from "@/lib/account";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const inputCls = (invalid = false) =>
  `w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-4 ${
    invalid ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-slate-200 hover:border-slate-300 focus:border-brand-500 focus:ring-brand-100"
  }`;

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/* ---------- dialog ---------- */

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <m.button aria-label="Close dialog" className="absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <m.div role="dialog" aria-modal="true" aria-labelledby="dlg-title"
        initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={{ duration: 0.25, ease: EASE }}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="dlg-title" className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="mt-4">{children}</div>
      </m.div>
    </div>
  );
}

/* ---------- edit ---------- */

function EditDialog({ project, onSave, onClose }: { project: Project; onSave: (patch: Pick<Project, "name" | "goal" | "users" | "constraints">) => void; onClose: () => void }) {
  const [f, setF] = useState({ name: project.name, goal: project.goal, users: project.users, constraints: project.constraints });
  const [err, setErr] = useState<Partial<Record<keyof typeof f, string>>>({});
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    setErr((p) => ({ ...p, [k]: undefined }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof err = {};
    if (f.name.trim().length < 2) errs.name = "Give your project a name.";
    if (f.goal.trim().length < 10) errs.goal = "Describe the goal in at least a sentence.";
    if (!f.users.trim()) errs.users = "Say who this is for.";
    setErr(errs);
    if (Object.keys(errs).length) return;
    onSave({ name: f.name.trim(), goal: f.goal.trim(), users: f.users.trim(), constraints: f.constraints.trim() });
  }

  const rows = [
    { k: "name", label: "Project name", area: false },
    { k: "goal", label: "Goal", area: true },
    { k: "users", label: "Who is it for?", area: false },
    { k: "constraints", label: "Constraints (optional)", area: true },
  ] as const;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {rows.map((r) => (
        <div key={r.k}>
          <label htmlFor={`e-${r.k}`} className="mb-1.5 block text-sm font-medium text-slate-700">{r.label}</label>
          {r.area ? (
            <textarea id={`e-${r.k}`} rows={2} value={f[r.k]} onChange={set(r.k)} aria-invalid={!!err[r.k]} className={`${inputCls(!!err[r.k])} resize-none`} />
          ) : (
            <input id={`e-${r.k}`} autoFocus={r.k === "name"} value={f[r.k]} onChange={set(r.k)} maxLength={60} aria-invalid={!!err[r.k]} className={inputCls(!!err[r.k])} />
          )}
          {err[r.k] && <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm text-rose-600"><AlertCircle size={14} /> {err[r.k]}</p>}
        </div>
      ))}
      <p className="text-xs text-slate-500">If this project is published, press Update published page on the Publish screen to show the new details.</p>
      <div className="flex gap-2">
        <button type="submit" className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700">Save changes</button>
        <button type="button" onClick={onClose} className="px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900">Cancel</button>
      </div>
    </form>
  );
}

/* ---------- delete ---------- */

function DeleteDialog({ project, onConfirm, onClose }: { project: Project; onConfirm: () => Promise<void>; onClose: () => void }) {
  const stats = useProjectStats([project])[project.id];
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const match = typed.trim() === project.name;

  return (
    <div className="space-y-4">
      <p className="text-slate-700">
        This permanently deletes <span className="font-semibold">{project.name}</span> and everything in it. It can&apos;t be undone.
      </p>
      <ul className="space-y-1.5 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
        <li>{stats ? `${stats.evidence} evidence item${stats.evidence === 1 ? "" : "s"}` : "Evidence count unavailable"}, plus tasks, blockers, designs and decisions</li>
        <li>Your code workspace files</li>
        {stats?.slug && <li className="font-semibold">Its public page (/p/{stats.slug}) goes offline immediately</li>}
      </ul>
      <button onClick={async () => { try { downloadText(`${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-backup.json`, await exportProject(project)); } catch { alert("Could not create the project backup. Please try again."); } }}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50">
        <Download size={16} /> Download a backup first
      </button>
      <div>
        <label htmlFor="del-name" className="mb-1.5 block text-sm font-medium text-slate-700">Type <span className="font-mono font-semibold">{project.name}</span> to confirm</label>
        <input id="del-name" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={inputCls()} />
      </div>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button disabled={!match || busy} onClick={async () => { setBusy(true); setError(""); try { await onConfirm(); } catch { setError("Could not delete this project. Please try again."); setBusy(false); } }}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-40">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Delete project
        </button>
        <button onClick={onClose} className="px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900">Keep project</button>
      </div>
    </div>
  );
}

/* ---------- page ---------- */

export default function ProjectsPage() {
  const router = useRouter();
  const { projects, active, ready, setActive, update, remove } = useProjects((s) => ({ projects: s.projects, active: s.active, ready: s.ready, setActive: s.setActive, update: s.update, remove: s.remove }));
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [flash, setFlash] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 2800);
    return () => clearTimeout(t);
  }, [flash]);

  const stats = useProjectStats(projects);

  if (!ready) {
    return (
      <div className="animate-pulse space-y-4" role="status" aria-label="Loading projects">
        <div className="h-10 w-48 rounded-xl bg-slate-200/60" />
        <div className="grid gap-5 sm:grid-cols-2">{[0, 1].map((i) => <div key={`placeholder-${i}`} className="h-56 rounded-3xl bg-slate-200/60" />)}</div>
      </div>
    );
  }

  async function confirmDelete(p: Project) {
    await remove(p.id);
    setDeleting(null);
    if (projects.length === 1) router.replace("/new");
    else setFlash(`Deleted ${p.name}.`);
  }

  return (
    <div className="space-y-6">
      <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Projects</h1>
          <p className="mt-2 max-w-xl text-slate-600">Switch between projects, edit their details, or delete the ones you no longer need.</p>
        </div>
        <Link href="/new" className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-colors hover:bg-brand-600">
          <Plus size={16} /> New project
        </Link>
      </m.div>

      {projects.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="font-semibold">No projects yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">Create one to start collecting context and evidence.</p>
          <Link href="/new" className="mt-5 inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Create a project</Link>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2">
          <AnimatePresence initial={false} mode="popLayout">
            {projects.slice((page - 1) * 20, page * 20).map((p) => {
              const s = stats[p.id];
              const isActive = p.id === active?.id;
              return (
                <m.li key={p.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.4, ease: EASE }}
                  className={`flex flex-col rounded-3xl border bg-white p-6 shadow-sm ${isActive ? "border-brand-200 ring-4 ring-brand-50" : "border-slate-100"}`}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-lg font-bold text-brand-700" aria-hidden>{p.name[0]?.toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-semibold">{p.name}</h2>
                      <p className="text-xs text-slate-500">Created {fmt(p.createdAt)}</p>
                    </div>
                    {isActive && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">Current</span>}
                  </div>

                  <p className="mt-4 line-clamp-2 text-sm text-slate-600">{p.goal}</p>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-900 px-2.5 py-1 font-medium text-white">{p.stage}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{s ? s.evidence : "…"} evidence</span>
                    {!!s?.openBlockers && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{s.openBlockers} open blocker{s.openBlockers === 1 ? "" : "s"}</span>}
                    {s?.slug && (
                      <Link href={`/p/${s.slug}`} target="_blank" className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 hover:underline"><Globe size={12} /> Published</Link>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                    <button onClick={() => { setActive(p.id); router.push("/dashboard"); }}
                      className="group inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600">
                      {isActive ? "Open" : "Switch and open"} <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                    </button>
                    <button onClick={() => setEditing(p)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"><Pencil size={14} /> Edit</button>
                    <button onClick={() => setDeleting(p)} className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /> Delete</button>
                  </div>
                </m.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      <Pagination page={page} pages={Math.ceil(projects.length / 20)} onPage={setPage} />

      <AnimatePresence>
        {editing && (
          <Dialog key="edit" title="Edit project" onClose={() => setEditing(null)}>
            <EditDialog project={editing} onClose={() => setEditing(null)}
              onSave={(patch) => { update(editing.id, patch); setEditing(null); setFlash("Project updated."); }} />
          </Dialog>
        )}
        {deleting && (
          <Dialog key="delete" title="Delete this project?" onClose={() => setDeleting(null)}>
            <DeleteDialog project={deleting} onClose={() => setDeleting(null)} onConfirm={() => confirmDelete(deleting)} />
          </Dialog>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {flash && (
          <m.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-2xl">
            <Check size={16} className="text-emerald-400" /> {flash}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
