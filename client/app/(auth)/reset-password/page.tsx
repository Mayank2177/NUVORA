"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthError, confirmPasswordReset } from "@/lib/auth";

export default function ResetPasswordPage() {
  return <Suspense fallback={<p className="text-center text-slate-500">Loading reset link…</p>}><ResetPasswordForm /></Suspense>;
}

function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!token) return setError("This reset link is missing its token. Request a new one.");
    if (password.length < 12) return setError("Use at least 12 characters for your password.");
    if (password !== confirm) return setError("The passwords do not match.");

    setLoading(true);
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
    } catch (cause) {
      setError(cause instanceof AuthError ? cause.message : "Could not reset your password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check size={30} /></span>
        <h1 className="mt-6 text-2xl font-semibold">Password updated</h1>
        <p className="mt-2 text-slate-600">Your password has been changed. Log in with your new password.</p>
        <Link href="/login" className="mt-8 inline-flex items-center gap-2 font-semibold text-brand-600 hover:underline"><ArrowLeft size={16} /> Back to log in</Link>
      </div>
    );
  }

  return (
    <>
      <Link href="/forgot-password" className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={15} /> Request a new link</Link>
      <h1 className="text-3xl font-semibold">Choose a new password</h1>
      <p className="mt-2 text-slate-600">Use at least 12 characters. This will replace your current password.</p>

      <form onSubmit={submit} noValidate className="mt-8 space-y-4">
        {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</p>}
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">New password</label>
        <div className="relative -mt-2">
          <input id="password" type={show ? "text" : "password"} autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} maxLength={256} required
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-12 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
          <button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-slate-800">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
        <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700">Confirm new password</label>
        <input id="confirm-password" type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={256} required
          className="-mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
        <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700 disabled:opacity-60">
          {loading ? <><Loader2 size={18} className="animate-spin" /> Updating password…</> : <>Update password <ArrowRight size={16} /> </>}
        </button>
      </form>
    </>
  );
}
