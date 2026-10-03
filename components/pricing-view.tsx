"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Info, Layers, Minus, Plus } from "lucide-react";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ---------- content (placeholder prices: edit freely) ---------- */

type Plan = {
  id: "free" | "pro" | "team";
  name: string;
  blurb: string;
  monthly: number;
  yearly: number; // per month, billed yearly
  perUser?: boolean;
  featured?: boolean;
  cta: string;
  features: string[];
  soon?: string[];
};

const PLANS: Plan[] = [
  {
    id: "free", name: "Free", blurb: "For trying the journey on your first project.", monthly: 0, yearly: 0, cta: "Start for free",
    features: ["1 active project", "Evidence timeline with provenance", "Tasks, blockers and decisions", "Code workspace (JavaScript)", "Public project page and profile", "Community support"],
  },
  {
    id: "pro", name: "Pro", blurb: "For builders who ship and want to be found.", monthly: 12, yearly: 9, featured: true, cta: "Start with Pro",
    features: ["Everything in Free", "Unlimited projects", "Unlimited published pages", "Secret scan before publishing", "Export all your data", "Priority support"],
    soon: ["Live GitHub sync", "Custom domain"],
  },
  {
    id: "team", name: "Team", blurb: "For small teams and cohorts building together.", monthly: 24, yearly: 19, perUser: true, cta: "Start with Team",
    features: ["Everything in Pro", "Shared projects", "Collaborator attribution on evidence", "Team profile page"],
    soon: ["Roles and permissions", "Cohort progress overview"],
  },
];

type Cell = boolean | string;
const TABLE: { group: string; rows: { label: string; v: [Cell, Cell, Cell]; soon?: boolean }[] }[] = [
  {
    group: "Projects",
    rows: [
      { label: "Active projects", v: ["1", "Unlimited", "Unlimited"] },
      { label: "Evidence items", v: ["Unlimited", "Unlimited", "Unlimited"] },
      { label: "Tasks, blockers, decisions and designs", v: [true, true, true] },
    ],
  },
  {
    group: "Build",
    rows: [
      { label: "Code workspace with test runner", v: [true, true, true] },
      { label: "AI assistant with approval before changes", v: [true, true, true], soon: true },
      { label: "Live GitHub sync", v: [false, true, true], soon: true },
    ],
  },
  {
    group: "Publish",
    rows: [
      { label: "Public project page", v: ["1 page", "Unlimited", "Unlimited"] },
      { label: "Public profile", v: [true, true, true] },
      { label: "Secret and personal-data scan", v: [true, true, true] },
      { label: "Custom domain", v: [false, true, true], soon: true },
    ],
  },
  {
    group: "Teams",
    rows: [
      { label: "Shared projects", v: [false, false, true], soon: true },
      { label: "Collaborator attribution", v: [false, false, true], soon: true },
    ],
  },
  {
    group: "Your data",
    rows: [
      { label: "Export everything as JSON", v: [true, true, true] },
      { label: "Priority support", v: [false, true, true] },
    ],
  },
];

const FAQ = [
  { q: "Do I need a card to start?", a: "No. The Free plan needs only an account. Billing isn't live yet, so every plan on this page is free to use while Nuvora is in early access." },
  { q: "Is my work private?", a: "Yes. Everything is private by default. Only the evidence you switch on and the pages you publish become public, and you can unpublish at any time." },
  { q: "Where is my data stored?", a: "In this version, in your own browser. You can download a full copy any time from Settings. Cloud accounts are planned, and we'll update our Privacy Policy before they launch." },
  { q: "What does Soon mean?", a: "Those features are in development and aren't available yet. Plans and prices may change before they launch." },
  { q: "Can I change or cancel my plan?", a: "Once billing launches you'll be able to switch plans or cancel from Settings. Until then there's nothing to cancel." },
];

/* ---------- pieces ---------- */

function Soon() {
  return <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Soon</span>;
}

function Price({ plan, yearly }: { plan: Plan; yearly: boolean }) {
  const reduce = useReducedMotion();
  const dy = reduce ? 0 : 18;
  const value = yearly ? plan.yearly : plan.monthly;
  return (
    <div>
      <div className="mt-6 flex items-end gap-1">
        <span className="mt-2 self-start text-lg text-slate-500">$</span>
        <div className="h-12 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={value} initial={{ y: dy, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -dy, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE }} className="block text-5xl font-semibold leading-none"
            >
              {value}
            </motion.span>
          </AnimatePresence>
        </div>
        <span className="pb-1 text-sm text-slate-500">{plan.monthly === 0 ? "forever" : plan.perUser ? "per user / month" : "per month"}</span>
      </div>
      <p className="mt-2 h-5 text-sm text-slate-500">
        {plan.monthly === 0 ? "No card needed" : yearly ? `Billed $${plan.yearly * 12} per year` : "Billed monthly"}
      </p>
    </div>
  );
}

function PlanCard({ plan, yearly, i }: { plan: Plan; yearly: boolean; i: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 + i * 0.1, ease: EASE }}
      className={`relative flex flex-col rounded-3xl border bg-white p-7 ${plan.featured ? "border-brand-500 shadow-xl shadow-brand-500/10 ring-4 ring-brand-50 lg:-my-3 lg:py-10" : "border-slate-100 shadow-sm"}`}
    >
      {plan.featured && (
        <span className="absolute -top-3 left-7 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">Most popular</span>
      )}
      <h2 className="text-xl font-semibold">{plan.name}</h2>
      <p className="mt-1 text-sm text-slate-600">{plan.blurb}</p>
      <Price plan={plan} yearly={yearly} />

      <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} className="mt-6">
        <Link
          href={`/signup?plan=${plan.id}`}
          className={`group flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors ${
            plan.featured ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700" : "bg-slate-900 text-white hover:bg-brand-600"
          }`}
        >
          {plan.cta} <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
        </Link>
      </motion.div>

      <ul className="mt-7 space-y-3 border-t border-slate-100 pt-6 text-sm">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-slate-700">
            <Check size={17} className="mt-0.5 shrink-0 text-brand-600" aria-hidden /> {f}
          </li>
        ))}
        {plan.soon?.map((f) => (
          <li key={f} className="flex items-start gap-3 text-slate-500">
            <Check size={17} className="mt-0.5 shrink-0 text-slate-300" aria-hidden /> <span>{f}<Soon /></span>
          </li>
        ))}
      </ul>
    </motion.li>
  );
}

function CellView({ v }: { v: Cell }) {
  if (v === true) return <><Check size={18} className="mx-auto text-brand-600" aria-hidden /><span className="sr-only">Included</span></>;
  if (v === false) return <><Minus size={18} className="mx-auto text-slate-300" aria-hidden /><span className="sr-only">Not included</span></>;
  return <span className="text-sm text-slate-700">{v}</span>;
}

function FaqItem({ q, a, open, onToggle, id }: { q: string; a: string; open: boolean; onToggle: () => void; id: string }) {
  return (
    <div className="border-b border-slate-100">
      <h3>
        <button onClick={onToggle} aria-expanded={open} aria-controls={`${id}-panel`} id={`${id}-btn`}
          className="flex w-full items-center justify-between gap-4 py-5 text-left font-semibold transition-colors hover:text-brand-700">
          {q}
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600" aria-hidden>
            <motion.span animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}><Plus size={15} /></motion.span>
          </span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={`${id}-panel`} role="region" aria-labelledby={`${id}-btn`}
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
            <p className="max-w-2xl pb-5 leading-relaxed text-slate-600">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- page ---------- */

export function PricingView() {
  const [yearly, setYearly] = useState(true);
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotion();
  const save = Math.max(...PLANS.filter((p) => p.monthly).map((p) => Math.round((1 - p.yearly / p.monthly) * 100)));

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Nuvora home">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/30"><Layers size={17} strokeWidth={2.4} /></span>
            <span className="text-lg font-bold tracking-tight">Nuvora</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-2 text-sm font-medium">
            <Link href="/" className="hidden rounded-full px-4 py-2 text-slate-600 hover:text-slate-900 sm:block">Home</Link>
            <Link href="/login" className="rounded-full px-4 py-2 text-slate-600 hover:text-slate-900">Log in</Link>
            <Link href="/signup" className="rounded-full bg-slate-900 px-5 py-2 font-semibold text-white transition-colors hover:bg-brand-600">Start a project</Link>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden px-5 pb-16 pt-16 text-center sm:pt-24">
          <div className="bg-dots pointer-events-none absolute inset-0 -z-10" aria-hidden />
          <motion.h1 initial={reduce ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}
            className="mx-auto max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
            Start free. Pay when your work outgrows one project.
          </motion.h1>
          <motion.p initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
            className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            Nuvora keeps your context and evidence connected from idea to opportunity. Pick the plan that matches how much you&apos;re building.
          </motion.p>

          <div role="radiogroup" aria-label="Billing period" className="mx-auto mt-9 inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
            {([[false, "Monthly"], [true, "Yearly"]] as const).map(([val, label]) => (
              <button key={label} role="radio" aria-checked={yearly === val} onClick={() => setYearly(val)}
                className={`relative rounded-full px-5 py-2 text-sm font-medium transition-colors ${yearly === val ? "text-white" : "text-slate-600 hover:text-slate-900"}`}>
                {yearly === val && <motion.span layoutId="billing-pill" className="absolute inset-0 rounded-full bg-slate-900" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <span className="relative flex items-center gap-2">
                  {label}
                  {val && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${yearly ? "bg-white/15 text-white" : "bg-emerald-50 text-emerald-700"}`}>Save {save}%</span>}
                </span>
              </button>
            ))}
          </div>

          <p className="mx-auto mt-5 flex max-w-lg items-start justify-center gap-2 text-sm text-slate-500">
            <Info size={16} className="mt-0.5 shrink-0" />
            <span>Pricing preview. Billing isn&apos;t live yet, so every plan is free to use during early access.</span>
          </p>
        </section>

        {/* Plans */}
        <section aria-label="Plans" className="mx-auto max-w-6xl px-5">
          <ul className="grid items-start gap-6 lg:grid-cols-3">
            {PLANS.map((p, i) => <PlanCard key={p.id} plan={p} yearly={yearly} i={i} />)}
          </ul>
        </section>

        {/* Comparison */}
        <section aria-labelledby="compare-h" className="mx-auto mt-28 max-w-5xl px-5">
          <h2 id="compare-h" className="text-center text-3xl font-semibold sm:text-4xl">Compare plans</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">Everything side by side, including what&apos;s still on the way.</p>
          <div className="mt-10 overflow-x-auto rounded-3xl border border-slate-100 shadow-sm">
            <table className="w-full min-w-[640px] border-collapse bg-white text-left">
              <caption className="sr-only">Feature comparison of the Free, Pro and Team plans</caption>
              <thead>
                <tr className="border-b border-slate-100">
                  <th scope="col" className="px-6 py-4 text-sm font-medium text-slate-500">Feature</th>
                  {PLANS.map((p) => (
                    <th key={p.id} scope="col" className={`px-4 py-4 text-center text-sm font-semibold ${p.featured ? "bg-brand-50/60 text-brand-700" : ""}`}>{p.name}</th>
                  ))}
                </tr>
              </thead>
              {TABLE.map((g) => (
                <tbody key={g.group}>
                  <tr><th colSpan={4} scope="colgroup" className="bg-slate-50 px-6 py-2.5 text-sm font-semibold text-slate-700">{g.group}</th></tr>
                  {g.rows.map((r) => (
                    <tr key={r.label} className="border-t border-slate-100">
                      <th scope="row" className="px-6 py-3.5 text-sm font-normal text-slate-700">{r.label}{r.soon && <Soon />}</th>
                      {r.v.map((cell, i) => (
                        <td key={i} className={`px-4 py-3.5 text-center ${PLANS[i].featured ? "bg-brand-50/40" : ""}`}><CellView v={cell} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq-h" className="mx-auto mt-28 max-w-3xl px-5">
          <h2 id="faq-h" className="text-center text-3xl font-semibold sm:text-4xl">Questions, answered</h2>
          <div className="mt-8 border-t border-slate-100">
            {FAQ.map((f, i) => <FaqItem key={f.q} id={`faq-${i}`} q={f.q} a={f.a} open={open === i} onToggle={() => setOpen(open === i ? null : i)} />)}
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">
            Read the <Link href="/terms" className="font-medium text-brand-600 hover:underline">Terms</Link> and <Link href="/privacy" className="font-medium text-brand-600 hover:underline">Privacy Policy</Link>.
          </p>
        </section>

        {/* CTA */}
        <section className="mx-auto my-28 max-w-4xl px-5">
          <div className="rounded-[2rem] bg-slate-900 px-6 py-16 text-center sm:px-12">
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">Start building with continuity.</h2>
            <p className="mx-auto mt-4 max-w-md text-slate-300">Create your first project in under two minutes. No card needed.</p>
            <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} className="mt-8 inline-block">
              <Link href="/signup" className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-brand-50">
                Start a project <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} Nuvora</p>
          <ul className="flex gap-6">
            <li><Link href="/" className="hover:text-slate-900">Home</Link></li>
            <li><Link href="/terms" className="hover:text-slate-900">Terms</Link></li>
            <li><Link href="/privacy" className="hover:text-slate-900">Privacy</Link></li>
          </ul>
        </div>
      </footer>
    </div>
  );
}