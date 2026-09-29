"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowRight, Check, FileText, GitCommit, Loader2 } from "lucide-react";
import { STAGES, useProjects, type Stage } from "@/lib/store";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

type Fields = { name: string; goal: string; users: string; constraints: string; stage: Stage; repo: string };
type Errors = Partial<Record<keyof Fields, string>>;
type Repo = { status: "idle" | "checking" | "ok" | "error"; commits?: number; prs?: number; message?: string };

const inputCls = (invalid: boolean) =>
  `w-full rounded-xl border bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-4 ${
    invalid ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-slate-200 hover:border-slate-300 focus:border-brand-500 focus:ring-brand-100"
  }`;

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      <AnimatePresence>
        {error && (
          <motion.p id={`${id}-error`} role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="mt-1.5 flex items-center gap-1.5 overflow-hidden text-sm text-rose-600">
            <AlertCircle size={14} /> {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function Preview({ f }: { f: Fields }) {
  const Line = ({ h, v, placeholder }: { h: string; v: string; placeholder: string }) => (
    <div className="mt-3">
      <p className="font-semibold text-slate-900">## {h}</p>
      {v.trim() ? <p className="whitespace-pre-wrap break-words text-slate-700">{v}</p> : <p className="italic text-slate-300">{placeholder}</p>}
    </div>
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <span className="flex gap-1.5" aria-hidden>
          <i className="h-2.5 w-2.5 rounded-full bg-slate-300" /><i className="h-2.5 w-2.5 rounded-full bg-slate-300" /><i className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        </span>
        <span className="ml-2 flex items-center gap-1.5 font-mono text-xs text-slate-500"><FileText size={13} /> PROJECT.md</span>
      </div>
      <div className="p-5 font-mono text-xs leading-6">
        <p className="text-base font-bold text-slate-900"># {f.name.trim() || <span className="font-normal italic text-slate-300">Project name</span>}</p>
        <Line h="Goal" v={f.goal} placeholder="What are you building?" />
        <Line h="Users" v={f.users} placeholder="Who is it for?" />
        <Line h="Constraints" v={f.constraints} placeholder="Time, team size, budget…" />
        <div className="mt-3">
          <p className="font-semibold text-slate-900">## Current Stage</p>
          <motion.p key={f.stage} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="text-brand-600">{f.stage}</motion.p>
        </div>
        {f.repo.trim() && <Line h="Repository" v={f.repo} placeholder="" />}
      </div>
    </div>
  );
}

export default function NewProjectPage() {
  const router = useRouter();
  const { projects, create } = useProjects();
  const [f, setF] = useState<Fields>({ name: "", goal: "", users: "", constraints: "", stage: "Think", repo: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [repo, setRepo] = useState<Repo>({ status: "idle" });
  const [done, setDone] = useState(false);
  const first = projects.length === 0;

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
    if (k === "repo") setRepo({ status: "idle" });
  };

  async function connectRepo() {
    const v = f.repo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
    if (!/^[\w.-]+\/[\w.-]+$/.test(v)) {
      setRepo({ status: "error", message: "Use the format owner/repository, like ada/eduboost-ai." });
      return;
    }
    setRepo({ status: "checking" });
    await new Promise((r) => setTimeout(r, 900)); // MOCK: replace with a real GitHub API call later
    const h = [...v].reduce((a, c) => a + c.charCodeAt(0), 0);
    setF((p) => ({ ...p, repo: v }));
    setRepo({ status: "ok", commits: 12 + (h % 40), prs: 2 + (h % 7) });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    if (f.name.trim().length < 2) errs.name = "Give your project a name.";
    if (f.goal.trim().length < 10) errs.goal = "Describe the goal in at least a sentence.";
    if (!f.users.trim()) errs.users = "Say who this is for.";
    if (f.repo.trim() && repo.status !== "ok") errs.repo = "Connect the repository, or clear this field to skip it.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    create({
      name: f.name.trim(), goal: f.goal.trim(), users: f.users.trim(), constraints: f.constraints.trim(),
      stage: f.stage, repo: repo.status === "ok" ? f.repo : null,
    });
    setDone(true);
    setTimeout(() => router.push("/dashboard"), 1100);
  }

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }}
        className="grid min-h-[60vh] place-items-center text-center">
        <div>
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
            className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <Check size={30} strokeWidth={2.5} />
          </motion.span>
          <h1 className="mt-6 text-2xl font-semibold">{f.name} is ready.</h1>
          <p className="mt-2 text-slate-600">Opening your project overview…</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
      <h1 className="text-3xl font-semibold">{first ? "Set up your first project" : "Create a new project"}</h1>
      <p className="mt-2 max-w-xl text-slate-600">
        Tell Nuvora what you&apos;re building. This becomes the context every tool and every stage of your journey shares.
      </p>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <Field id="name" label="Project name" error={errors.name}>
            <input id="name" value={f.name} onChange={set("name")} placeholder="EduBoost AI" autoFocus maxLength={60}
              aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} className={inputCls(!!errors.name)} />
          </Field>

          <Field id="goal" label="Goal" hint="One or two sentences on what you want to build and why." error={errors.goal}>
            <textarea id="goal" rows={3} value={f.goal} onChange={set("goal")} placeholder="Build an AI-powered learning platform."
              aria-invalid={!!errors.goal} aria-describedby={errors.goal ? "goal-error" : undefined} className={`${inputCls(!!errors.goal)} resize-none`} />
          </Field>

          <Field id="users" label="Who is it for?" error={errors.users}>
            <input id="users" value={f.users} onChange={set("users")} placeholder="African students and developers"
              aria-invalid={!!errors.users} aria-describedby={errors.users ? "users-error" : undefined} className={inputCls(!!errors.users)} />
          </Field>

          <Field id="constraints" label="Constraints (optional)" hint="Team size, deadlines, budget, tools you must use.">
            <textarea id="constraints" rows={2} value={f.constraints} onChange={set("constraints")} placeholder="Small team. Limited development time."
              className={`${inputCls(false)} resize-none`} />
          </Field>

          <div>
            <p id="stage-label" className="mb-1.5 text-sm font-medium text-slate-700">Where are you right now?</p>
            <div role="radiogroup" aria-labelledby="stage-label" className="flex flex-wrap gap-2">
              {STAGES.map((s) => {
                const on = f.stage === s;
                return (
                  <button key={s} type="button" role="radio" aria-checked={on} onClick={() => setF((p) => ({ ...p, stage: s }))}
                    className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${on ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {on && <motion.span layoutId="new-stage" className="absolute inset-0 rounded-full bg-slate-900" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                    <span className="relative">{s}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">You can skip, repeat or change stages any time.</p>
          </div>

          <Field id="repo" label="GitHub repository (optional)" hint="Read-only. Nuvora turns commits and pull requests into evidence and never writes to your repo." error={errors.repo}>
            <div className="flex gap-2">
              <input id="repo" value={f.repo} onChange={set("repo")} placeholder="owner/repository"
                aria-invalid={!!errors.repo} aria-describedby={errors.repo ? "repo-error" : undefined} className={inputCls(!!errors.repo)} />
              <button type="button" onClick={connectRepo} disabled={!f.repo.trim() || repo.status === "checking"}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50">
                {repo.status === "checking" ? <Loader2 size={16} className="animate-spin" /> : <GitCommit size={16} />} Connect
              </button>
            </div>
            <AnimatePresence>
              {repo.status === "ok" && (
                <motion.p role="status" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                  <Check size={16} className="shrink-0" /> Found {repo.commits} commits and {repo.prs} pull requests. They&apos;ll appear as evidence.
                </motion.p>
              )}
              {repo.status === "error" && (
                <motion.p role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 flex items-center gap-1.5 text-sm text-rose-600">
                  <AlertCircle size={14} /> {repo.message}
                </motion.p>
              )}
            </AnimatePresence>
          </Field>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <motion.button type="submit" whileTap={{ scale: 0.98 }}
              className="group inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700">
              Create project <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </motion.button>
            {!first && <Link href="/dashboard" className="px-3 py-3 text-sm font-medium text-slate-600 hover:text-slate-900">Cancel</Link>}
          </div>
        </form>

        <div className="lg:sticky lg:top-8">
          <p className="mb-3 text-sm font-medium text-slate-500">Live preview of your project context</p>
          <Preview f={f} />
        </div>
      </div>
    </motion.div>
  );
}