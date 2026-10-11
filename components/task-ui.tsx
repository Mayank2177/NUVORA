"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Plus, X } from "lucide-react";
import { STATUS_LABEL, type Complexity, type Task, type TaskStatus } from "@/lib/market";
import { SECRET_RE } from "@/lib/publish";

export const STATUS_STYLE: Record<TaskStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  open: "bg-emerald-50 text-emerald-700",
  assigned: "bg-sky-50 text-sky-700",
  in_review: "bg-violet-50 text-violet-700",
  changes_requested: "bg-amber-50 text-amber-700",
  completed: "bg-brand-50 text-brand-700",
  closed: "bg-slate-100 text-slate-600",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export const COMPLEXITY: Complexity[] = ["Small", "Medium", "Large"];
// Names match what the capability engine understands, so matching works best with these.
export const KNOWN_SKILLS = ["JavaScript", "TypeScript", "React", "Node.js", "Python", "SQL", "APIs", "HTML and CSS", "Web performance", "Testing", "Git"];

export type TaskFields = Pick<Task, "title" | "summary" | "requirements" | "skills" | "complexity" | "scope" | "acceptance">;
type Errors = Partial<Record<keyof TaskFields | "form", string>>;
export type Intent = "draft" | "publish" | "save";

const clean = (f: TaskFields): TaskFields => ({
  ...f,
  title: f.title.trim(), summary: f.summary.trim(), scope: f.scope.trim(),
  requirements: f.requirements.map((r) => r.trim()).filter(Boolean),
  acceptance: f.acceptance.map((a) => a.trim()).filter(Boolean),
});

export function validateFields(raw: TaskFields): Errors {
  const f = clean(raw);
  const e: Errors = {};
  if (f.title.length < 5) e.title = "Give the task a clear title.";
  if (f.summary.length < 10) e.summary = "Summarise what needs to happen in a sentence or two.";
  if (f.requirements.length === 0) e.requirements = "Add at least one requirement.";
  if (f.skills.length === 0) e.skills = "Pick at least one skill.";
  if (!f.scope) e.scope = "Say roughly how big this is.";
  if (f.acceptance.length === 0) e.acceptance = "Add at least one acceptance criterion. It's how the finished work will be judged.";
  if (SECRET_RE.test([f.title, f.summary, f.scope, ...f.requirements, ...f.acceptance].join("\n")))
    e.form = "This looks like it contains a password or key. Developers can read tasks, so remove it before saving.";
  return e;
}

const inputCls = (invalid = false) =>
  `w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-4 ${
    invalid ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-slate-200 hover:border-slate-300 focus:border-brand-500 focus:ring-brand-100"
  }`;

function Err({ id, msg }: { id?: string; msg?: string }) {
  return msg ? <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm text-rose-600"><AlertCircle size={14} className="shrink-0" /> {msg}</p> : null;
}

function ListField({ label, hint, items, onChange, placeholder, error, max = 8 }: {
  label: string; hint: string; items: string[]; onChange: (v: string[]) => void; placeholder: string; error?: string; max?: number;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">{label}</legend>
      <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      <ul className="mt-3 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <input aria-label={`${label} ${i + 1}`} value={it} placeholder={placeholder} maxLength={200}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} className={inputCls(!!error && !it.trim())} />
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
              className="grid w-10 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X size={16} /></button>
          </li>
        ))}
      </ul>
      {items.length < max && (
        <button type="button" onClick={() => onChange([...items, ""])} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"><Plus size={15} /> Add one</button>
      )}
      <Err msg={error} />
    </fieldset>
  );
}

function SkillsField({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, "").slice(0, 30);
    if (t && value.length < 8 && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setText("");
  };
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">Skills needed</legend>
      <p className="mt-0.5 text-xs text-slate-500">Pick from the list when you can. Matching works best with these names.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {value.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-full bg-slate-900 py-1.5 pl-3 pr-2 text-sm font-medium text-white">
            {s}<button type="button" onClick={() => onChange(value.filter((v) => v !== s))} aria-label={`Remove ${s}`} className="rounded-full p-0.5 hover:bg-white/20"><X size={13} /></button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {KNOWN_SKILLS.filter((s) => !value.includes(s)).map((s) => (
          <button key={s} type="button" onClick={() => add(s)} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-brand-500 hover:text-brand-700"><Plus size={12} /> {s}</button>
        ))}
      </div>
      <input aria-label="Add another skill" value={text} placeholder="Add another skill" onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(text); } }} onBlur={() => add(text)} className={`${inputCls(!!error)} mt-3`} />
      <Err msg={error} />
    </fieldset>
  );
}

export function TaskEditor({ initial, actions, onSave, onCancel }: {
  initial: TaskFields;
  actions: { label: string; intent: Intent }[];
  onSave: (f: TaskFields, intent: Intent) => void;
  onCancel?: () => void;
}) {
  const [f, setF] = useState<TaskFields>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof TaskFields>(k: K, v: TaskFields[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: undefined, form: undefined }));
  };

  function submit(intent: Intent) {
    const errs = validateFields(f);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSave(clean(f), intent);
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} noValidate className="space-y-6">
      <AnimatePresence>
        {errors.form && (
          <motion.p role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700"><AlertCircle size={17} className="mt-0.5 shrink-0" /> {errors.form}</motion.p>
        )}
      </AnimatePresence>

      <div>
        <label htmlFor="t-title" className="mb-1.5 block text-sm font-medium text-slate-700">Title</label>
        <input id="t-title" value={f.title} maxLength={90} onChange={(e) => set("title", e.target.value)} aria-invalid={!!errors.title} className={inputCls(!!errors.title)} />
        <Err msg={errors.title} />
      </div>
      <div>
        <label htmlFor="t-summary" className="mb-1.5 block text-sm font-medium text-slate-700">Summary</label>
        <textarea id="t-summary" rows={3} value={f.summary} maxLength={500} onChange={(e) => set("summary", e.target.value)} aria-invalid={!!errors.summary} className={`${inputCls(!!errors.summary)} resize-none`} />
        <Err msg={errors.summary} />
      </div>

      <ListField label="Requirements" hint="What the developer needs to do." items={f.requirements} onChange={(v) => set("requirements", v)} placeholder="Describe one requirement" error={errors.requirements} />
      <SkillsField value={f.skills} onChange={(v) => set("skills", v)} error={errors.skills} />

      <div className="grid gap-6 sm:grid-cols-2">
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Complexity</legend>
          <div role="radiogroup" aria-label="Complexity" className="mt-3 flex gap-2">
            {COMPLEXITY.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={f.complexity === c} onClick={() => set("complexity", c)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${f.complexity === c ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>{c}</button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="t-scope" className="mb-1.5 block text-sm font-medium text-slate-700">Scope</label>
          <input id="t-scope" value={f.scope} maxLength={120} onChange={(e) => set("scope", e.target.value)} aria-invalid={!!errors.scope} className={inputCls(!!errors.scope)} />
          <Err msg={errors.scope} />
        </div>
      </div>

      <ListField label="Acceptance criteria" hint="How you'll decide the work is done. Make each one checkable." items={f.acceptance} onChange={(v) => set("acceptance", v)} placeholder="Describe one thing that must be true" error={errors.acceptance} />

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
        {actions.map((a, i) => (
          <button key={a.intent} type="button" onClick={() => submit(a.intent)}
            className={i === 0 ? "rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700" : "rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"}>
            {a.label}
          </button>
        ))}
        {onCancel && <button type="button" onClick={onCancel} className="px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900">Cancel</button>}
      </div>
    </form>
  );
}