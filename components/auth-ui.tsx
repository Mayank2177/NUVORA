"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Briefcase, Code2, Loader2 } from "lucide-react";
import type { AuthUser, Role } from "@/lib/auth";
import { startDemo } from "@/lib/demo";

export const inputCls = (invalid: boolean) =>
  `w-full rounded-xl border bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-4 ${
    invalid
      ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
      : "border-slate-200 hover:border-slate-300 focus:border-brand-500 focus:ring-brand-100"
  }`;

export const GitHubMark = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
    <path d="M12 .5A11.5 11.5 0 0 0 .5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
  </svg>
);

export function Field({
  id, label, error, action, children,
}: { id: string; label: string; error?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
        {action}
      </div>
      {children}
      <AnimatePresence>
        {error && (
          <motion.p
            id={`${id}-error`} role="alert"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="mt-1.5 flex items-center gap-1.5 overflow-hidden text-sm text-rose-600"
          >
            <AlertCircle size={14} /> {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

const ROLES: { value: Role; title: string; body: string; icon: typeof Code2 }[] = [
  { value: "developer", title: "I'm a developer", body: "Build projects, collect evidence, and get matched to real work.", icon: Code2 },
  { value: "employer", title: "I'm hiring", body: "Describe what your business needs and find proven developers.", icon: Briefcase },
];

export function RoleCards({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div role="radiogroup" aria-label="I am signing up as" className="grid gap-3 sm:grid-cols-2">
      {ROLES.map((r) => {
        const on = value === r.value;
        return (
          <button
            key={r.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(r.value)}
            className={`relative rounded-2xl border p-4 text-left transition-colors ${on ? "border-brand-500 bg-brand-50/60 ring-4 ring-brand-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
          >
            <span className={`grid h-9 w-9 place-items-center rounded-xl ${on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}><r.icon size={18} /></span>
            <span className="mt-3 block text-sm font-semibold">{r.title}</span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-600">{r.body}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One-click demo accounts with data on both sides of the marketplace. */
export function DemoLogin({ onDone, disabled }: { onDone: (u: AuthUser) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState<Role | null>(null);

  async function go(role: Role) {
    setBusy(role);
    onDone(await startDemo(role));
  }

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
      <p className="text-sm font-semibold">Just exploring?</p>
      <p className="mt-0.5 text-xs text-slate-500">Open a demo account with sample projects and tasks already filled in. No signup needed.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {ROLES.map((r) => (
          <button
            key={r.value} type="button" onClick={() => go(r.value)} disabled={disabled || busy !== null}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:border-brand-500 hover:text-brand-700 disabled:opacity-60"
          >
            {busy === r.value ? <Loader2 size={16} className="animate-spin" /> : <r.icon size={16} />}
            Try as {r.value === "developer" ? "a developer" : "an employer"}
          </button>
        ))}
      </div>
    </div>
  );
}