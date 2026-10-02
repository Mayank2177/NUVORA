"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthError, signInWithGitHub, signUp } from "@/lib/auth";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN_LENGTH = 12;

type Fields = { name: string; email: string; password: string };
type Errors = Partial<Record<keyof Fields | "terms", string>>;

function validate(f: Fields, terms: boolean): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = "Enter your full name.";
  if (!EMAIL_RE.test(f.email)) e.email = "Enter a valid email address, like you@example.com.";
  if (f.password.length < PASSWORD_MIN_LENGTH) e.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (!terms) e.terms = "Accept the terms to create your account.";
  return e;
}

function strength(p: string) {
  const checks = [p.length >= PASSWORD_MIN_LENGTH, /[a-z]/.test(p) && /[A-Z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p)];
  const score = checks.filter(Boolean).length;
  const label = ["Too weak", "Weak", "Fair", "Good", "Strong"][score];
  const color = ["bg-slate-200", "bg-rose-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"][score];
  return { score, label, color };
}

const GitHubMark = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
    <path d="M12 .5A11.5 11.5 0 0 0 .5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
  </svg>
);

function Field({
  id, label, error, children,
}: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
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

const inputCls = (invalid: boolean) =>
  `w-full rounded-xl border bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-4 ${
    invalid
      ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
      : "border-slate-200 hover:border-slate-300 focus:border-brand-500 focus:ring-brand-100"
  }`;

export default function SignupPage() {
  const router = useRouter();
  const [f, setF] = useState<Fields>({ name: "", email: "", password: "" });
  const [terms, setTerms] = useState(false);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState<"email" | "github" | null>(null);
  const [done, setDone] = useState(false);
  const pw = useMemo(() => strength(f.password), [f.password]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const errs = validate(f, terms);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading("email");
    try {
      await signUp({ name: f.name.trim(), email: f.email.trim(), password: f.password });
      setDone(true);
      setTimeout(() => router.push("/login"), 1800);
    } catch (err) {
      setFormError(err instanceof AuthError ? err.message : "Something went wrong. Check your connection and try again.");
      setLoading(null);
    }
  }

  async function onGitHub() {
    setFormError("");
    setLoading("github");
    try {
      await signInWithGitHub();
      router.push("/new");
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
        <h1 className="mt-6 text-2xl font-semibold">If this email can be registered, your account is ready.</h1>
        <p className="mt-2 text-slate-600">Please log in to continue.</p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
      <h1 className="text-3xl font-semibold">Create your account</h1>
      <p className="mt-2 text-slate-600">Start your first project in under two minutes. Free, and private by default.</p>

      <button
        type="button" onClick={onGitHub} disabled={loading !== null}
        className="mt-8 flex w-full items-center justify-center gap-2.5 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
      >
        {loading === "github" ? <Loader2 size={18} className="animate-spin" /> : <GitHubMark />}
        Continue with GitHub
      </button>

      <div className="my-6 flex items-center gap-4 text-sm text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> or sign up with email <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
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

        <Field id="email" label="Email" error={errors.email}>
          <input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={f.email} onChange={set("email")}
            aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} className={inputCls(!!errors.email)} />
        </Field>

        <Field id="password" label="Password" error={errors.password}>
          <div className="relative">
            <input id="password" type={show ? "text" : "password"} autoComplete="new-password" placeholder="At least 12 characters"
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

      <p className="mt-8 text-center text-sm text-slate-600">
        Already have an account? <Link href="/login" className="font-semibold text-brand-600 hover:underline">Log in</Link>
      </p>
    </motion.div>
  );
}
