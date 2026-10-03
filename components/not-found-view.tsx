"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Layers, LayoutGrid, Rocket, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import { useSession } from "@/lib/auth";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const STEPS = [
  { label: "Idea" },
  { label: "Learn" },
  { label: "Build" },
  { label: "This page", missing: true },
  { label: "Publish" },
];

const SHORTCUTS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Projects", href: "/projects", icon: LayoutGrid },
  { label: "Evidence", href: "/evidence", icon: ShieldCheck },
  { label: "Publish", href: "/publish", icon: Rocket },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function NotFoundView() {
  const router = useRouter();
  const user = useSession(); // undefined = loading, null = signed out
  const reduce = useReducedMotion();

  const fade = (delay: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay, ease: EASE } };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-white">
      <div className="bg-dots pointer-events-none absolute inset-0" aria-hidden />

      <header className="relative mx-auto flex h-16 w-full max-w-5xl items-center px-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Nuvora home">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/30">
            <Layers size={17} strokeWidth={2.4} />
          </span>
          <span className="text-lg font-bold tracking-tight">Nuvora</span>
        </Link>
      </header>

      <main id="main" className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-5 pb-24 pt-8 text-center">
        {/* The journey, with one step missing */}
        <ol className="flex w-full items-start" aria-label="A journey with a missing step">
          {STEPS.map((s, i) => {
            const last = i === STEPS.length - 1;
            const next = STEPS[i + 1];
            const broken = s.missing || next?.missing;
            return (
              <li key={s.label} className={`flex items-start ${last ? "" : "flex-1"}`}>
                <motion.div
                  className="flex w-12 flex-col items-center gap-2 sm:w-20"
                  initial={reduce ? false : { opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.1 + i * 0.12, ease: EASE }}
                >
                  <span className="relative grid h-8 w-8 place-items-center">
                    {s.missing && !reduce && (
                      <motion.span
                        className="absolute inset-0 rounded-full border-2 border-brand-500"
                        animate={{ scale: [1, 1.7], opacity: [0.5, 0] }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                        aria-hidden
                      />
                    )}
                    <span
                      className={`relative grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${
                        s.missing ? "border-2 border-dashed border-brand-500 bg-brand-50 text-brand-600" : "bg-slate-900 text-white"
                      }`}
                    >
                      {s.missing ? "?" : i + 1}
                    </span>
                  </span>
                  <span className={`text-[11px] leading-tight sm:text-xs ${s.missing ? "font-semibold text-brand-700" : "text-slate-500"}`}>{s.label}</span>
                </motion.div>

                {!last && (
                  <motion.span
                    aria-hidden
                    className={`mt-[15px] h-0 flex-1 border-t-2 ${broken ? "border-dashed border-slate-300" : "border-brand-200"}`}
                    initial={reduce ? false : { opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    style={{ originX: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 + i * 0.12, ease: EASE }}
                  />
                )}
              </li>
            );
          })}
        </ol>

        <motion.h1 {...fade(0.7)} className="mt-14 text-4xl font-semibold leading-tight sm:text-5xl">
          This page isn&apos;t part of the journey.
        </motion.h1>
        <motion.p {...fade(0.8)} className="mt-4 max-w-md text-lg leading-relaxed text-slate-600">
          <span className="sr-only">Error 404. </span>
          The link may be broken, or the page may have moved. Nothing was lost: your projects and evidence are exactly where you left them.
        </motion.p>

        <motion.div {...fade(0.9)} className="mt-9 flex flex-wrap justify-center gap-3">
          <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
            <Link
              href={user ? "/dashboard" : "/"}
              className="group inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-colors hover:bg-brand-600"
            >
              {user ? "Back to dashboard" : "Go to home"} <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
          <motion.button
            type="button" onClick={() => router.back()} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <ArrowLeft size={16} /> Go back
          </motion.button>
        </motion.div>

        {user === null && (
          <motion.p {...fade(1)} className="mt-6 text-sm text-slate-600">
            Looking for your work?{" "}
            <Link href="/login" className="font-semibold text-brand-600 hover:underline">Log in</Link>
          </motion.p>
        )}

        {user && (
          <motion.nav {...fade(1)} aria-label="Quick links" className="mt-10">
            <p className="text-sm text-slate-500">Or jump straight to</p>
            <ul className="mt-3 flex flex-wrap justify-center gap-2">
              {SHORTCUTS.map(({ label, href, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-700"
                  >
                    <Icon size={14} /> {label}
                  </Link>
                </li>
              ))}
            </ul>
          </motion.nav>
        )}
      </main>
    </div>
  );
}