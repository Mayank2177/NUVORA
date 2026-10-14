"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { AuthError, completeMfaSignIn } from "@/lib/auth";
import { homeFor } from "@/lib/market";

export default function MfaLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await completeMfaSignIn(code.trim());
      router.replace(await homeFor(user));
    } catch (cause) {
      setError(cause instanceof AuthError ? cause.message : "Could not verify your code. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-3xl font-semibold">Two-step verification</h1>
      <p className="mt-2 text-slate-600">Enter a code from your authenticator app or one of your recovery codes.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</p>}
        <label htmlFor="code" className="block text-sm font-medium text-slate-700">Authenticator or recovery code</label>
        <input id="code" autoFocus autoComplete="one-time-code" maxLength={32} value={code} onChange={(event) => setCode(event.target.value)} required
          className="-mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-lg tracking-widest text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" />
        <button type="submit" disabled={loading || !code.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {loading ? <><Loader2 size={18} className="animate-spin" /> Verifying…</> : <>Verify and sign in <ArrowRight size={16} /></>}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600"><Link href="/login" className="font-semibold text-brand-600 hover:underline">Back to login</Link></p>
    </>
  );
}
