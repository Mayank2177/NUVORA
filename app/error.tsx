"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowRight, Layers, RotateCcw } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="relative flex min-h-screen flex-col bg-white">
      <div className="bg-dots pointer-events-none absolute inset-0" aria-hidden />
      <header className="relative mx-auto flex h-16 w-full max-w-5xl items-center px-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Nuvora home">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/30"><Layers size={17} strokeWidth={2.4} /></span>
          <span className="text-lg font-bold tracking-tight">Nuvora</span>
        </Link>
      </header>

      <main id="main" className="relative mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-5 pb-24 text-center">
        <motion.span initial={reduce ? false : { scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="grid h-16 w-16 place-items-center rounded-full bg-amber-50 text-amber-600"><AlertTriangle size={28} /></motion.span>
        <motion.h1 initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }} className="mt-6 text-4xl font-semibold">Something went wrong.</motion.h1>
        <motion.p initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className="mt-4 text-lg leading-relaxed text-slate-600">
          This page hit an unexpected problem. Your projects, evidence and tasks are saved in this browser, so nothing was lost. Try again, and if it keeps happening, go back to the start.
        </motion.p>
        <motion.div initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }} className="mt-9 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-colors hover:bg-brand-600"><RotateCcw size={16} /> Try again</button>
          <Link href="/" className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50">Go to home <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></Link>
        </motion.div>
        {error.digest && <p className="mt-8 text-xs text-slate-400">Reference: {error.digest}</p>}
      </main>
    </div>
  );
}