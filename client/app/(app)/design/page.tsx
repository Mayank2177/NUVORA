"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import { AlertCircle, Check, ExternalLink, ImagePlus, Lightbulb, PenTool, Plus, Trash2, X } from "lucide-react";
import { STAGES } from "@/lib/store";
import { useProjects } from "@/lib/store";
import { useProjectData } from "@/lib/data";
import {
  KINDS, TOOLS, detectTool, isHttpUrl, resizeImage, useDesign,
  type Design, type Kind, type Tool,
} from "@/lib/design";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const inputCls = (invalid = false) =>
  `w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-4 ${
    invalid ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-slate-200 hover:border-slate-300 focus:border-brand-500 focus:ring-brand-100"
  }`;

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function Err({ msg }: { msg: string }) {
  return (
    <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-rose-600">
      <AlertCircle size={14} className="shrink-0" /> {msg}
    </p>
  );
}

/* ---------- add design ---------- */

type AddDesign = (d: Omit<Design, "id" | "createdAt">) => boolean;

function DesignForm({ stage, onSave, onClose }: { stage: (typeof STAGES)[number]; onSave: (d: Parameters<AddDesign>[0], toEvidence: boolean) => boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Kind>("Wireframe");
  const [tool, setTool] = useState<Tool>("Figma");
  const [url, setUrl] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [note, setNote] = useState("");
  const [toEvidence, setToEvidence] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setError("");
    try {
      setImage(await resizeImage(f));
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't read that image.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 2) return setError("Give this design a title.");
    if (!url.trim() && !image) return setError("Add a link to the design, a screenshot, or both.");
    if (url.trim() && !isHttpUrl(url.trim())) return setError("The link should start with http:// or https://");
    const ok = onSave({ title: title.trim(), kind, tool, url: url.trim(), image, note: note.trim(), stage }, toEvidence);
    if (!ok) setError("Your browser storage is full. Try a smaller image, or remove an older design.");
  }

  return (
    <m.form onSubmit={submit} noValidate initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Add a design</h2>
          <button type="button" onClick={onClose} aria-label="Close form" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="d-title" className="mb-1.5 block text-sm font-medium text-slate-700">Title</label>
            <input id="d-title" value={title} onChange={(e) => { setTitle(e.target.value); setError(""); }} maxLength={80} placeholder="Dashboard wireframe v1" className={inputCls()} />
          </div>
          <div>
            <label htmlFor="d-kind" className="mb-1.5 block text-sm font-medium text-slate-700">What is it?</label>
            <select id="d-kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={inputCls()}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          </div>
          <div>
            <label htmlFor="d-tool" className="mb-1.5 block text-sm font-medium text-slate-700">Made with</label>
            <select id="d-tool" value={tool} onChange={(e) => setTool(e.target.value as Tool)} className={inputCls()}>{TOOLS.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="d-url" className="mb-1.5 block text-sm font-medium text-slate-700">Link (optional if you add a screenshot)</label>
            <input id="d-url" value={url} inputMode="url" placeholder="https://www.figma.com/file/…" className={inputCls()}
              onChange={(e) => { setUrl(e.target.value); setError(""); const t = detectTool(e.target.value); if (t) setTool(t); }} />
          </div>

          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-medium text-slate-700">Screenshot (optional)</p>
            {image ? (
              <div className="relative overflow-hidden rounded-2xl border border-slate-200">
                <Image src={image} alt="Selected design preview" width={800} height={448} unoptimized className="max-h-56 w-full object-cover" />
                <button type="button" onClick={() => setImage(undefined)} aria-label="Remove screenshot" className="absolute right-2 top-2 rounded-full bg-slate-900/80 p-1.5 text-white hover:bg-slate-900"><X size={14} /></button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm font-medium text-slate-600 transition-colors hover:border-brand-500 hover:text-brand-700 disabled:opacity-60">
                <ImagePlus size={18} /> {busy ? "Processing image…" : "Choose an image"}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={pick} className="sr-only" aria-label="Upload a screenshot" />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="d-note" className="mb-1.5 block text-sm font-medium text-slate-700">Notes (optional)</label>
            <textarea id="d-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="What does this show, and what changed since the last version?" className={`${inputCls()} resize-none`} />
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-slate-600">
          <input type="checkbox" checked={toEvidence} onChange={(e) => setToEvidence(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-600" />
          <span>Also add to my evidence timeline. It stays private until you make it public.</span>
        </label>

        {error && <Err msg={error} />}

        <div className="mt-5 flex items-center gap-3">
          <button type="submit" disabled={busy} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700 disabled:opacity-60">Save design</button>
          <button type="button" onClick={onClose} className="px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900">Cancel</button>
        </div>
      </div>
    </m.form>
  );
}

/* ---------- design card ---------- */

function DesignCard({ d, onRemove }: { d: Design; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <m.li initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.4, ease: EASE }}
      className="flex flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
        {d.image ? (
          <m.img src={d.image} alt={`${d.title} preview`} loading="lazy" className="h-full w-full object-cover" whileHover={{ scale: 1.04 }} transition={{ duration: 0.6, ease: EASE }} />
        ) : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-brand-50 to-slate-100 text-brand-600"><PenTool size={34} /></div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700 backdrop-blur">{d.kind}</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="break-words font-semibold">{d.title}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{d.tool} · {d.stage} · {date(d.createdAt)}</p>
        {d.note && <p className="mt-3 break-words text-sm text-slate-600">{d.note}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          {d.url ? (
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
              Open in {d.tool} <ExternalLink size={14} />
            </a>
          ) : <span />}
          {confirm ? (
            <span className="flex items-center gap-1">
              <button onClick={onRemove} className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">Delete</button>
              <button onClick={() => setConfirm(false)} aria-label="Cancel delete" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={14} /></button>
            </span>
          ) : (
            <button onClick={() => setConfirm(true)} aria-label={`Delete design: ${d.title}`} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button>
          )}
        </div>
      </div>
    </m.li>
  );
}

/* ---------- page ---------- */

export default function DesignPage() {
  const router = useRouter();
  const { projects, active, ready } = useProjects((s) => ({ projects: s.projects, active: s.active, ready: s.ready }));
  const { addEvidence } = useProjectData(active);
  const { designs, decisions, error: designError, addDesign, removeDesign, addDecision, removeDecision } = useDesign(active?.id);

  const [tab, setTab] = useState<"designs" | "decisions">("designs");
  const [adding, setAdding] = useState(false);
  const [decision, setDecision] = useState("");
  const [reason, setReason] = useState("");
  const [decEvidence, setDecEvidence] = useState(true);
  const [decError, setDecError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    if (ready && projects.length === 0) router.replace("/new");
  }, [ready, projects.length, router]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  if (!ready || !active || !designs || !decisions) {
    if (designError) return <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{designError}</p>;
    return (
      <div className="animate-pulse space-y-4" role="status" aria-label="Loading design">
        <div className="h-10 w-48 rounded-xl bg-slate-200/60" />
        <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <div key={`placeholder-${i}`} className="h-72 rounded-3xl bg-slate-200/60" />)}</div>
      </div>
    );
  }

  function saveDesign(d: Parameters<AddDesign>[0], toEvidence: boolean) {
    if (!addDesign(d)) return false;
    if (toEvidence) {
      void addEvidence({ type: "Screenshot", text: `${d.kind}: ${d.title}`, source: d.tool, provenance: "Human", stage: d.stage, public: false })
        .catch(() => setFlash("Design saved, but its evidence item could not be added."));
    }
    setAdding(false);
    setFlash(toEvidence ? "Design saved and added to evidence." : "Design saved.");
    return true;
  }

  async function submitDecision(e: React.FormEvent) {
    e.preventDefault();
    if (decision.trim().length < 5) return setDecError("State the decision in a short sentence.");
    if (reason.trim().length < 5) return setDecError("Add the reason. It is what makes a decision useful later.");
    if (!addDecision({ decision: decision.trim(), reason: reason.trim(), stage: active!.stage })) return setDecError("Your browser storage is full. Remove an older item and try again.");
    if (decEvidence) {
      try {
        await addEvidence({ type: "Decision", text: `${decision.trim()}. Reason: ${reason.trim()}`, source: "Nuvora", provenance: "Human", stage: active!.stage, public: false });
      } catch {
        setDecError("Decision is saved, but its evidence item could not be added.");
        return;
      }
    }
    setDecision("");
    setReason("");
    setDecError("");
    setFlash(decEvidence ? "Decision recorded and added to evidence." : "Decision recorded.");
  }

  return (
    <div className="space-y-6">
      <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Design</h1>
          <p className="mt-2 max-w-xl text-slate-600">Keep the sketches, mockups and decisions behind {active.name} in one place, so the reasoning isn&apos;t lost when the work moves on.</p>
        </div>
        {tab === "designs" && (
          <button onClick={() => setAdding((a) => !a)} aria-expanded={adding}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-colors hover:bg-brand-600">
            <Plus size={16} /> Add design
          </button>
        )}
      </m.div>

      <div role="tablist" aria-label="Design sections" className="flex gap-2">
        {([["designs", `Designs ${designs.length}`], ["decisions", `Decisions ${decisions.length}`]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === k ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {tab === k && <m.span className="absolute inset-0 rounded-full bg-slate-900" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {tab === "designs" ? (
        <>
          <AnimatePresence>{adding && <DesignForm stage={active.stage} onSave={saveDesign} onClose={() => setAdding(false)} />}</AnimatePresence>

          {designs.length === 0 && !adding ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600"><PenTool size={22} /></span>
              <p className="mt-4 font-semibold">No designs yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">Add a link to your Figma, Excalidraw or Balsamiq file, or upload a screenshot of a sketch.</p>
              <button onClick={() => setAdding(true)} className="mt-5 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">Add your first design</button>
            </div>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence initial={false} mode="popLayout">
                {designs.map((d) => <DesignCard key={d.id} d={d} onRemove={() => removeDesign(d.id)} />)}
              </AnimatePresence>
            </ul>
          )}
        </>
      ) : (
        <>
          <form onSubmit={submitDecision} noValidate className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold"><Lightbulb size={18} className="text-brand-600" /> Record a decision</h2>
            <p className="mt-1 text-sm text-slate-500">Write down what you chose and why. Future you (and anyone reading your story) will want the reason.</p>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="dec" className="mb-1.5 block text-sm font-medium text-slate-700">Decision</label>
                <input id="dec" value={decision} onChange={(e) => { setDecision(e.target.value); setDecError(""); }} maxLength={120} placeholder="Use Firebase instead of Supabase" className={inputCls(!!decError && decision.trim().length < 5)} />
              </div>
              <div>
                <label htmlFor="why" className="mb-1.5 block text-sm font-medium text-slate-700">Reason</label>
                <textarea id="why" rows={2} value={reason} onChange={(e) => { setReason(e.target.value); setDecError(""); }} maxLength={300}
                  placeholder="The team already has Firebase experience and needs authentication and Firestore." className={`${inputCls(!!decError && reason.trim().length < 5)} resize-none`} />
              </div>
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-slate-600">
              <input type="checkbox" checked={decEvidence} onChange={(e) => setDecEvidence(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-600" />
              <span>Also add to my evidence timeline (private until you make it public).</span>
            </label>
            {decError && <Err msg={decError} />}
            <button type="submit" className="mt-5 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700">Record decision</button>
          </form>

          {decisions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center">
              <p className="font-semibold">No decisions recorded</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">Tools, libraries, trade-offs, things you decided not to build. Anything you might be asked about later.</p>
            </div>
          ) : (
            <ol className="relative space-y-4 border-l-2 border-slate-100 pl-6">
              <AnimatePresence initial={false} mode="popLayout">
                {decisions.map((d) => (
                  <m.li key={d.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.4, ease: EASE }} className="relative">
                    <span className="absolute -left-[33px] top-5 h-3 w-3 rounded-full border-2 border-white bg-brand-600 ring-2 ring-brand-100" aria-hidden />
                    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-500">Decision</p>
                          <p className="break-words font-semibold">{d.decision}</p>
                          <p className="mt-3 text-sm font-medium text-slate-500">Reason</p>
                          <p className="break-words text-slate-700">{d.reason}</p>
                          <p className="mt-3 text-xs text-slate-500">{d.stage} · {date(d.createdAt)}</p>
                        </div>
                        {confirmId === d.id ? (
                          <span className="flex items-center gap-1">
                            <button onClick={() => { removeDecision(d.id); setConfirmId(null); }} className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">Delete</button>
                            <button onClick={() => setConfirmId(null)} aria-label="Cancel delete" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={14} /></button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmId(d.id)} aria-label={`Delete decision: ${d.decision}`} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button>
                        )}
                      </div>
                    </div>
                  </m.li>
                ))}
              </AnimatePresence>
            </ol>
          )}
        </>
      )}

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
