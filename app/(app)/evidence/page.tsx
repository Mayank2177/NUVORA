"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Eye, EyeOff, Plus, Search, ShieldAlert, Trash2, X } from "lucide-react";
import { STAGES, useProjects, type Stage } from "@/lib/store";
import {
  PROV_STYLE, TYPE_ICON, useProjectData,
  type Evidence, type EvidenceType, type Provenance,
} from "@/lib/data";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const PROVENANCE: Provenance[] = ["Human", "AI-assisted", "Collaborator", "External"];
const PROV_BAR: Record<Provenance, string> = {
  Human: "bg-emerald-500",
  "AI-assisted": "bg-violet-500",
  Collaborator: "bg-amber-500",
  External: "bg-sky-500",
};
const TYPES: EvidenceType[] = ["Commit", "Pull request", "Test", "Screenshot", "Decision", "Learning", "AI session", "Blocker resolved"];
const MANUAL_TYPES = TYPES.filter((t) => t !== "Blocker resolved");

// Basic check for values that should never be published
const SECRET_RE = /(sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|(password|secret|api[_-]?key|token)\s*[:=]\s*\S+)/i;

const inputCls = (invalid = false) =>
  `w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-4 ${
    invalid ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-slate-200 hover:border-slate-300 focus:border-brand-500 focus:ring-brand-100"
  }`;

function dayLabel(key: string) {
  const d = new Date(key);
  const diff = Math.round((new Date(new Date().toDateString()).getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

const todayInput = () => new Date().toISOString().slice(0, 10);

/* ---------- add evidence ---------- */

type Draft = { type: EvidenceType; text: string; source: string; provenance: Provenance; stage: Stage; date: string };

function AddEvidence({
  defaultStage, onAdd, onClose,
}: { defaultStage: Stage; onAdd: (e: Omit<Evidence, "id" | "date"> & { date?: string }) => void; onClose: () => void }) {
  const [d, setD] = useState<Draft>({ type: "Screenshot", text: "", source: "", provenance: "Human", stage: defaultStage, date: todayInput() });
  const [error, setError] = useState("");
  const leaked = SECRET_RE.test(d.text) || SECRET_RE.test(d.source);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    if (error) setError("");
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (d.text.trim().length < 3) return setError("Describe what this evidence shows in a few words.");
    if (leaked) return setError("This looks like it contains a secret or password. Remove it before saving.");
    onAdd({
      type: d.type, text: d.text.trim(), source: d.source.trim() || "Added manually",
      provenance: d.provenance, stage: d.stage, public: false,
      date: d.date === todayInput() ? undefined : new Date(`${d.date}T12:00:00`).toISOString(),
    });
  }

  return (
    <motion.form
      onSubmit={submit} noValidate
      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden"
    >
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Add evidence</h2>
          <button type="button" onClick={onClose} aria-label="Close form" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ev-type" className="mb-1.5 block text-sm font-medium text-slate-700">Type</label>
            <select id="ev-type" value={d.type} onChange={(e) => set("type", e.target.value as EvidenceType)} className={inputCls()}>
              {MANUAL_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ev-stage" className="mb-1.5 block text-sm font-medium text-slate-700">Stage</label>
            <select id="ev-stage" value={d.stage} onChange={(e) => set("stage", e.target.value as Stage)} className={inputCls()}>
              {STAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="ev-text" className="mb-1.5 block text-sm font-medium text-slate-700">What does it show?</label>
            <input id="ev-text" value={d.text} onChange={(e) => set("text", e.target.value)} placeholder="Dashboard layout finished on mobile" maxLength={140}
              aria-invalid={!!error} className={inputCls(!!error)} />
          </div>

          <div>
            <label htmlFor="ev-source" className="mb-1.5 block text-sm font-medium text-slate-700">Source or link (optional)</label>
            <input id="ev-source" value={d.source} onChange={(e) => set("source", e.target.value)} placeholder="CleanShot, YouTube, a URL…" className={inputCls()} />
          </div>
          <div>
            <label htmlFor="ev-date" className="mb-1.5 block text-sm font-medium text-slate-700">Date</label>
            <input id="ev-date" type="date" max={todayInput()} value={d.date} onChange={(e) => set("date", e.target.value || todayInput())} className={inputCls()} />
          </div>

          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Who made it?</legend>
            <div className="flex flex-wrap gap-2">
              {PROVENANCE.map((p) => (
                <label key={p} className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
                  d.provenance === p ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}>
                  <input type="radio" name="prov" value={p} checked={d.provenance === p} onChange={() => set("provenance", p)} className="sr-only" />
                  {p}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">Be accurate. If AI wrote or fixed it, pick AI-assisted. Provenance is what makes evidence trustworthy.</p>
          </fieldset>
        </div>

        <AnimatePresence>
          {(leaked || error) && (
            <motion.p role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className={`mt-4 flex items-start gap-2 overflow-hidden rounded-xl p-3 text-sm ${leaked ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700"}`}>
              {leaked ? <ShieldAlert size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
              {leaked ? "This looks like it contains an API key or password. Remove it before saving." : error}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="mt-5 flex items-center gap-3">
          <button type="submit" className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700">Add evidence</button>
          <button type="button" onClick={onClose} className="px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900">Cancel</button>
          <p className="ml-auto text-xs text-slate-500">New evidence is private until you make it public.</p>
        </div>
      </div>
    </motion.form>
  );
}

/* ---------- item ---------- */

function Item({ e, onToggle, onRemove }: { e: Evidence; onToggle: () => void; onRemove: () => void }) {
  const Icon = TYPE_ICON[e.type];
  const [confirm, setConfirm] = useState(false);
  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.35, ease: EASE }}
      className="relative flex gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><Icon size={18} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-semibold">{e.type}</p>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROV_STYLE[e.provenance]}`}>{e.provenance}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{e.stage}</span>
        </div>
        <p className="mt-0.5 break-words text-slate-700">{e.text}</p>
        <p className="mt-1 text-xs text-slate-500">{new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} from {e.source}</p>
      </div>

      <div className="flex shrink-0 items-start gap-1">
        <button onClick={onToggle} aria-pressed={!!e.public} aria-label={e.public ? "Public. Make private" : "Private. Make public"}
          title={e.public ? "Public on your project page" : "Private"}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${e.public ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
          {e.public ? <Eye size={14} /> : <EyeOff size={14} />} {e.public ? "Public" : "Private"}
        </button>
        {confirm ? (
          <span className="flex items-center gap-1">
            <button onClick={onRemove} className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">Remove</button>
            <button onClick={() => setConfirm(false)} aria-label="Cancel removal" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={14} /></button>
          </span>
        ) : (
          <button onClick={() => setConfirm(true)} aria-label={`Remove ${e.type}: ${e.text}`} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button>
        )}
      </div>
    </motion.li>
  );
}

/* ---------- page ---------- */

export default function EvidencePage() {
  const router = useRouter();
  const { projects, active, ready } = useProjects();
  const { data, addEvidence, removeEvidence, toggleEvidencePublic } = useProjectData(active);

  const [query, setQuery] = useState("");
  const [prov, setProv] = useState<Provenance | "All">("All");
  const [type, setType] = useState<EvidenceType | "All">("All");
  const [stage, setStage] = useState<Stage | "All">("All");
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    if (ready && projects.length === 0) router.replace("/new");
  }, [ready, projects.length, router]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  const all = useMemo(() => [...(data?.evidence ?? [])].sort((a, b) => +new Date(b.date) - +new Date(a.date)), [data]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (e) =>
        (prov === "All" || e.provenance === prov) &&
        (type === "All" || e.type === type) &&
        (stage === "All" || e.stage === stage) &&
        (!q || `${e.text} ${e.source} ${e.type}`.toLowerCase().includes(q)),
    );
  }, [all, query, prov, type, stage]);

  const groups = useMemo(() => {
    const map = new Map<string, Evidence[]>();
    for (const e of items) {
      const k = new Date(e.date).toDateString();
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [items]);

  if (!ready || !active || !data) {
    return (
      <div className="animate-pulse space-y-4" role="status" aria-label="Loading evidence">
        <div className="h-10 w-64 rounded-xl bg-slate-200/60" />
        <div className="h-24 rounded-3xl bg-slate-200/60" />
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl bg-slate-200/60" />)}
      </div>
    );
  }

  const counts = PROVENANCE.map((p) => ({ p, n: all.filter((e) => e.provenance === p).length }));
  const publicCount = all.filter((e) => e.public).length;
  const filtered = prov !== "All" || type !== "All" || stage !== "All" || query.trim() !== "";
  const clear = () => { setProv("All"); setType("All"); setStage("All"); setQuery(""); };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
        className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Evidence</h1>
          <p className="mt-2 max-w-xl text-slate-600">Everything that proves what you did on {active.name}, with where it came from and who made it.</p>
        </div>
        <button onClick={() => setAdding((a) => !a)} aria-expanded={adding}
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-colors hover:bg-brand-600">
          <Plus size={16} /> Add evidence
        </button>
      </motion.div>

      <AnimatePresence>
        {adding && (
          <AddEvidence defaultStage={active.stage} onClose={() => setAdding(false)}
            onAdd={(e) => { addEvidence(e); setAdding(false); setFlash("Evidence added. It's private until you make it public."); }} />
        )}
      </AnimatePresence>

      {/* Summary */}
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.5, ease: EASE }}
        className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm" aria-label="Evidence summary">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p><span className="text-3xl font-semibold">{all.length}</span> <span className="text-slate-500">items · {publicCount} public</span></p>
          <p className="text-sm text-slate-500">Provenance breakdown</p>
        </div>
        <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img"
          aria-label={counts.map((c) => `${c.p}: ${c.n}`).join(", ")}>
          {counts.map(({ p, n }) => n > 0 && (
            <motion.div key={p} className={PROV_BAR[p]} initial={{ width: 0 }} animate={{ width: `${(n / Math.max(all.length, 1)) * 100}%` }} transition={{ duration: 0.9, ease: EASE }} />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
          {counts.map(({ p, n }) => (
            <li key={p} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${PROV_BAR[p]}`} />{p} <span className="text-slate-400">{n}</span></li>
          ))}
        </ul>
      </motion.section>

      {/* Filters */}
      <section aria-label="Filters" className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search evidence" aria-label="Search evidence" className={`${inputCls()} pl-10`} />
          </div>
          <select value={type} onChange={(e) => setType(e.target.value as EvidenceType | "All")} aria-label="Filter by type" className={`${inputCls()} !w-auto`}>
            <option value="All">All types</option>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={stage} onChange={(e) => setStage(e.target.value as Stage | "All")} aria-label="Filter by stage" className={`${inputCls()} !w-auto`}>
            <option value="All">All stages</option>
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by provenance">
          {(["All", ...PROVENANCE] as const).map((p) => (
            <button key={p} onClick={() => setProv(p)} aria-pressed={prov === p}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${prov === p ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
              {p}
            </button>
          ))}
        </div>
      </section>

      {/* Timeline */}
      <div aria-live="polite" className="sr-only">{items.length} evidence items shown</div>
      {groups.map(([key, list]) => (
        <section key={key} aria-label={dayLabel(key)}>
          <h2 className="mb-3 flex items-center gap-3 text-sm font-semibold text-slate-500">
            {dayLabel(key)} <span className="h-px flex-1 bg-slate-200" />
          </h2>
          <ul className="space-y-3">
            <AnimatePresence initial={false} mode="popLayout">
              {list.map((e) => (
                <Item key={e.id} e={e} onToggle={() => toggleEvidencePublic(e.id)} onRemove={() => removeEvidence(e.id)} />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}

      {items.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="font-semibold">{filtered ? "No evidence matches these filters" : "No evidence yet"}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
            {filtered ? "Try a different search, or clear the filters to see everything." : "Connect a repository or add your first screenshot, decision or note."}
          </p>
          <button onClick={filtered ? clear : () => setAdding(true)} className="mt-5 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
            {filtered ? "Clear filters" : "Add evidence"}
          </button>
        </div>
      )}

      {/* Toast */}
      <AnimatePresence>
        {flash && (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-2xl">
            <Check size={16} className="text-emerald-400" /> {flash}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}