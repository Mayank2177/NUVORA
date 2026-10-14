"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, m } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react";
import { requestPasswordReset } from "@/lib/auth";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_SECONDS = 30;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Countdown for the "Resend" button
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send() {
    setError("");
    if (!EMAIL_RE.test(email)) {
      setError("Enter a valid email address, like you@example.com.");
      return;
    }
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
      setCooldown(RESEND_SECONDS);
    } catch {
      setError("We couldn't send the email. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send();
  }

  return (
    <AnimatePresence mode="wait">
      {sent ? (
        <m.div
          key="sent"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="text-center"
        >
          <m.span
            initial={{ scale: 0, rotate: -12 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
            className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-600"
          >
            <MailCheck size={30} />
          </m.span>
          <h1 className="mt-6 text-2xl font-semibold">Check your inbox</h1>
          <p className="mt-2 text-slate-600">
            If an account exists for <span className="font-medium text-slate-900">{email}</span>, we&apos;ve sent a link to reset your password.
          </p>

          <div className="mt-8 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
            Nothing yet? Check your spam folder, or{" "}
            {cooldown > 0 ? (
              <span className="text-slate-500" aria-live="polite">resend in {cooldown}s.</span>
            ) : (
              <button onClick={send} disabled={loading} className="font-semibold text-brand-600 hover:underline disabled:opacity-60">
                {loading ? "Sending…" : "send it again"}
              </button>
            )}
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 text-sm">
            <button onClick={() => { setSent(false); setError(""); }} className="font-medium text-slate-600 hover:text-slate-900">
              Use a different email
            </button>
            <Link href="/login" className="inline-flex items-center gap-2 font-semibold text-brand-600 hover:underline">
              <ArrowLeft size={15} /> Back to log in
            </Link>
          </div>
        </m.div>
      ) : (
        <m.div
          key="form"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <Link href="/login" className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900">
            <ArrowLeft size={15} /> Back to log in
          </Link>
          <h1 className="text-3xl font-semibold">Reset your password</h1>
          <p className="mt-2 text-slate-600">Enter the email you signed up with and we&apos;ll send you a link to choose a new password.</p>

          <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
              <input
                id="email" type="email" autoComplete="email" autoFocus placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
                aria-invalid={!!error} aria-describedby={error ? "email-error" : undefined}
                className={`w-full rounded-xl border bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-4 ${
                  error
                    ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                    : "border-slate-200 hover:border-slate-300 focus:border-brand-500 focus:ring-brand-100"
                }`}
              />
              <AnimatePresence>
                {error && (
                  <m.p
                    id="email-error" role="alert"
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="mt-1.5 flex items-center gap-1.5 overflow-hidden text-sm text-rose-600"
                  >
                    <AlertCircle size={14} /> {error}
                  </m.p>
                )}
              </AnimatePresence>
            </div>

            <m.button
              type="submit" disabled={loading} whileTap={{ scale: 0.98 }}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {loading ? (
                <><Loader2 size={18} className="animate-spin" /> Sending link…</>
              ) : (
                <>Send reset link <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></>
              )}
            </m.button>
          </form>
        </m.div>
      )}
    </AnimatePresence>
  );
}