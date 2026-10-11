"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthError, signInWithGitHub, signUp, type AuthUser, type Role } from "@/lib/auth";
import { homeFor } from "@/lib/market";
import { DemoLogin, Field, GitHubMark, RoleCards, inputCls } from "@/components/auth-ui";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Fields = { name: string; email: string; password: string };
type Errors = Partial<Record<keyof Fields | "terms", string>>;

function validate(f: Fields, terms: boolean): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = "Enter your full name.";
  if (!EMAIL_RE.test(f.email)) e.email = "Enter a valid email address, like you@example.com.";
  if (f.password.length < 8) e.password = "Use at least 8 characters.";
  if (!terms) e.terms = "Accept the terms to create your account.";
  return e;
}

function strength(p: string) {
  const checks = [p.length >= 8, /[a-z]/.test(p) && /[A-Z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p)];
  const score = checks.filter(Boolean).length;
  const label = ["Too weak", "Weak", "Fair", "Good", "Strong"][score];
  const color = ["bg-slate-200", "bg-rose-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"][score];
  return { score, label, color };
}

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("developer");
  const [f, setF] = useState<Fields>({ name: "", email: "", password: "" });
  const [terms, setTerms] = useState(false);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState<"email" | "github" | null>(null);
  const [done, setDone] = useState<AuthUser | null>(null);
  const pw = useMemo(() => strength(f.password), [f.password]);
    useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("role");
    if (r === "developer" || r === "employer") setRole(r);
  }, []);
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
  };

  function finish(user: AuthUser) {
    setDone(user);
    setTimeout(() => router.push(homeFor(user)), 1200);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const errs = validate(f, terms);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading("email");
    try {
      finish(await signUp({ name: f.name.trim(), email: f.email.trim(), password: f.password, role }));
    } catch (err) {
      setFormError(err instanceof AuthError ? err.message : "Something went wrong. Check your connection and try again.");
      setLoading(null);
    }
  }

  async function onGitHub() {
    setFormError("");
    setLoading("github");
    try {
      finish(await signInWithGitHub());
    } catch {
      setFormError("We couldn't reach GitHub. Try again or sign up with email.");
      setLoading(null);
    }
  }

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }} className="text-center">
        <motion.span
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
          className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"
        >
          <Check size={30} strokeWidth={2.5} />
        </motion.span>
        <h1 className="mt-6 text-2xl font-semibold">You&apos;re in, {done.name.split(" ")[0]}.</h1>
        <p className="mt-2 text-slate-600">{done.role === "employer" ? "Opening your employer workspace…" : "Setting up your developer workspace…"}</p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
      <h1 className="text-3xl font-semibold">Create your account</h1>
      <p className="mt-2 text-slate-600">Free to start, and private by default.</p>

      <div className="mt-6"><RoleCards value={role} onChange={setRole} /></div>

      {role === "developer" && (
        <>
          <button
            type="button" onClick={onGitHub} disabled={loading !== null}
            className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
          >
            {loading === "github" ? <Loader2 size={18} className="animate-spin" /> : <GitHubMark />}
            Continue with GitHub
          </button>
          <div className="my-6 flex items-center gap-4 text-sm text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> or sign up with email <span className="h-px flex-1 bg-slate-200" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} noValidate className={`space-y-4 ${role === "developer" ? "" : "mt-6"}`}>
        <AnimatePresence>
          {formError && (
            <motion.div
              role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700"
            >
              <AlertCircle size={17} className="mt-0.5 shrink-0" /> {formError}
            </motion.div>
          )}
        </AnimatePresence>

        <Field id="name" label="Full name" error={errors.name}>
          <input id="name" type="text" autoComplete="name" placeholder="Ada Lovelace" value={f.name} onChange={set("name")}
            aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} className={inputCls(!!errors.name)} />
        </Field>

        <Field id="email" label={role === "employer" ? "Work email" : "Email"} error={errors.email}>
          <input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={f.email} onChange={set("email")}
            aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} className={inputCls(!!errors.email)} />
        </Field>

        <Field id="password" label="Password" error={errors.password}>
          <div className="relative">
            <input id="password" type={show ? "text" : "password"} autoComplete="new-password" placeholder="At least 8 characters"
              value={f.password} onChange={set("password")} aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : "password-hint"} className={`${inputCls(!!errors.password)} pr-12`} />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-slate-800">
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {f.password && (
            <div id="password-hint" className="mt-2.5" aria-live="polite">
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <motion.span key={i} className={`h-1.5 flex-1 rounded-full ${i <= pw.score ? pw.color : "bg-slate-200"}`}
                    initial={false} animate={{ scaleY: i <= pw.score ? 1 : 0.7 }} />
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">Strength: {pw.label}. Mix upper and lower case, numbers and symbols.</p>
            </div>
          )}
        </Field>

        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-600">
            <input type="checkbox" checked={terms} onChange={(e) => { setTerms(e.target.checked); setErrors((p) => ({ ...p, terms: undefined })); }}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-600" aria-describedby={errors.terms ? "terms-error" : undefined} />
            <span>
              I agree to the <Link href="/terms" className="font-medium text-brand-600 hover:underline">Terms</Link> and{" "}
              <Link href="/privacy" className="font-medium text-brand-600 hover:underline">Privacy Policy</Link>.
            </span>
          </label>
          {errors.terms && <p id="terms-error" role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm text-rose-600"><AlertCircle size={14} /> {errors.terms}</p>}
        </div>

        <motion.button
          type="submit" disabled={loading !== null} whileTap={{ scale: 0.98 }}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {loading === "email" ? <><Loader2 size={18} className="animate-spin" /> Creating account…</> : <>Create account <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></>}
        </motion.button>
      </form>

      <div className="mt-6"><DemoLogin onDone={finish} disabled={loading !== null} /></div>

      <p className="mt-8 text-center text-sm text-slate-600">
        Already have an account? <Link href="/login" className="font-semibold text-brand-600 hover:underline">Log in</Link>
      </p>
    </motion.div>
  );
}