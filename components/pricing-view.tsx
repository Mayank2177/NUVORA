"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Briefcase, Check, Code2, Info, Layers, Minus, Plus, ShieldCheck } from "lucide-react";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/* ---------- content (placeholder prices and limits: edit freely) ---------- */

type Audience = "developers" | "employers";
type Cell = boolean | string;
type Plan = {
  id: string; name: string; blurb: string; monthly: number; yearly: number; // yearly = per month, billed yearly
  featured?: boolean; cta: string; features: string[]; soon?: string[];
};
type Row = { label: string; v: Cell[]; soon?: boolean };
type Block = { heading: string; sub: string; plans: Plan[]; table: { group: string; rows: Row[] }[] };

const DATA: Record<Audience, Block> = {
  developers: {
    heading: "Build your proof. Pay when you outgrow one project.",
    sub: "Start free and see your evidence become a capability profile. Upgrade when you're juggling more projects and pages.",
    plans: [
      {
        id: "dev-free", name: "Free", blurb: "For your first project and your first matches.", monthly: 0, yearly: 0, cta: "Start for free",
        features: ["1 active project", "Evidence timeline with provenance", "Capability levels, with the evidence behind each", "Code workspace (JavaScript)", "Public project page and profile", "Opportunities, match details and task submissions"],
      },
      {
        id: "dev-pro", name: "Pro", blurb: "For developers building a body of work.", monthly: 9, yearly: 7, featured: true, cta: "Start with Pro",
        features: ["Everything in Free", "Unlimited projects", "Unlimited published project pages", "Priority support"],
        soon: ["Custom domain for your profile", "Downloadable capability report"],
      },
    ],
    table: [
      { group: "Projects", rows: [{ label: "Active projects", v: ["1", "Unlimited"] }, { label: "Evidence items", v: ["Unlimited", "Unlimited"] }, { label: "Published project pages", v: ["1", "Unlimited"] }] },
      { group: "Capability", rows: [{ label: "Levels measured from evidence", v: [true, true] }, { label: "Public profile", v: [true, true] }, { label: "Opportunities and match details", v: [true, true] }, { label: "Submit work and earn L4", v: [true, true] }] },
      { group: "More", rows: [{ label: "Export all your data", v: [true, true] }, { label: "Priority support", v: [false, true] }, { label: "Custom domain", v: [false, true], soon: true }] },
    ],
  },
  employers: {
    heading: "Pay for the problems you need solved.",
    sub: "Describe a need, find developers proven by their work, and review what they deliver. Plans are priced by how many tasks you run at once.",
    plans: [
      {
        id: "emp-starter", name: "Starter", blurb: "For a business with one problem to solve.", monthly: 29, yearly: 24, cta: "Start with Starter",
        features: ["1 active task at a time", "Plain-words task structuring, reviewed by you", "Candidate results with the reasons shown", "Invite and assign developers", "Work review and approval"],
      },
      {
        id: "emp-growth", name: "Growth", blurb: "For a team with steady technical needs.", monthly: 79, yearly: 65, featured: true, cta: "Start with Growth",
        features: ["Everything in Starter", "Up to 10 active tasks", "Priority support"], soon: ["Saved shortlists of developers"],
      },
      {
        id: "emp-team", name: "Team", blurb: "For companies running work in parallel.", monthly: 199, yearly: 169, cta: "Start with Team",
        features: ["Everything in Growth", "Unlimited active tasks"], soon: ["Multiple team members", "Roles and permissions", "Shared task templates"],
      },
    ],
    table: [
      { group: "Tasks", rows: [{ label: "Active tasks", v: ["1", "10", "Unlimited"] }, { label: "Plain-words task structuring", v: [true, true, true] }, { label: "Edit and publish tasks", v: [true, true, true] }] },
      { group: "Finding developers", rows: [{ label: "Candidate results with reasons", v: [true, true, true] }, { label: "View developers' public evidence", v: [true, true, true] }, { label: "Invite and assign", v: [true, true, true] }] },
      { group: "Reviewing work", rows: [{ label: "Review against acceptance criteria", v: [true, true, true] }, { label: "Verify developers' skills on approval", v: [true, true, true] }] },
      { group: "Teams and support", rows: [{ label: "Team members", v: ["1", "1", "Unlimited"], soon: true }, { label: "Roles and permissions", v: [false, false, true], soon: true }, { label: "Priority support", v: [false, true, true] }] },
    ],
  },
};

const FAQ = [
  { q: "Can paying improve a developer's ranking or level?", a: "No. Levels come only from evidence, and L4 only from work an employer approved. Match scores are calculated the same way for every developer. A paid plan raises limits like the number of projects or active tasks. It never raises a score." },
  { q: "Do I need a card to start?", a: "No. Billing isn't live yet, so every plan on this page is free to use while Nuvora is in early access. Nothing is charged." },
  { q: "Who pays whom for a task?", a: "In this version, Nuvora doesn't process payments between employers and developers. How a task is compensated is agreed between the two of them. Plan fees on this page are what you'd pay Nuvora for the platform." },
  { q: "Is my work private?", a: "Yes. Everything is private by default. Developers choose what employers can see and whether they can be found at all, and you can unpublish any time." },
  { q: "What does Soon mean?", a: "Those features are in development and aren't available yet. Plans, prices and limits may change before billing launches, and we'll tell you first." },
  { q: "Can I change or cancel my plan?", a: "Once billing launches you'll be able to switch plans or cancel from Settings. Until then there's nothing to cancel." },
];

/* ---------- pieces ---------- */

const Soon = () => <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Soon</span>;

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
            <motion.span key={value} initial={{ y: dy, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -dy, opacity: 0 }} transition={{ duration: 0.22, ease: EASE }} className="block text-5xl font-semibold leading-none">{value}</motion.span>
          </AnimatePresence>
        </div>
        <span className="pb-1 text-sm text-slate-500">{plan.monthly === 0 ? "forever" : "per month"}</span>
      </div>
      <p className="mt-2 h-5 text-sm text-slate-500">{plan.monthly === 0 ? "No card needed" : yearly ? `Billed $${plan.yearly * 12} per year` : "Billed monthly"}</p>
    </div>
  );
}

function PlanCard({ plan, yearly, i, role }: { plan: Plan; yearly: boolean; i: number; role: string }) {
  return (
    <motion.li initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 + i * 0.1, ease: EASE }}
      className={`relative flex flex-col rounded-3xl border bg-white p-7 ${plan.featured ? "border-brand-500 shadow-xl shadow-brand-500/10 ring-4 ring-brand-50" : "border-slate-100 shadow-sm"}`}>
      {plan.featured && <span className="absolute -top-3 left-7 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
      <h2 className="text-xl font-semibold">{plan.name}</h2>
      <p className="mt-1 text-sm text-slate-600">{plan.blurb}</p>
      <Price plan={plan} yearly={yearly} />
      <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} className="mt-6">
        <Link href={`/signup?role=${role}&plan=${plan.id}`} className={`group flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors ${plan.featured ? "bg-brand-600 text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700" : "bg-slate-900 text-white hover:bg-brand-600"}`}>
          {plan.cta} <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
        </Link>
      </motion.div>
      <ul className="mt-7 space-y-3 border-t border-slate-100 pt-6 text-sm">
        {plan.features.map((f) => <li key={f} className="flex items-start gap-3 text-slate-700"><Check size={17} className="mt-0.5 shrink-0 text-brand-600" aria-hidden /> {f}</li>)}
        {plan.soon?.map((f) => <li key={f} className="flex items-start gap-3 text-slate-500"><Check size={17} className="mt-0.5 shrink-0 text-slate-300" aria-hidden /> <span>{f}<Soon /></span></li>)}
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
        <button onClick={onToggle} aria-expanded={open} aria-controls={`${id}-panel`} id={`${id}-btn`} className="flex w-full items-center justify-between gap-4 py-5 text-left font-semibold transition-colors hover:text-brand-700">
          {q}
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600" aria-hidden><motion.span animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}><Plus size={15} /></motion.span></span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={`${id}-panel`} role="region" aria-labelledby={`${id}-btn`} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
            <p className="max-w-2xl pb-5 leading-relaxed text-slate-600">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- page ---------- */

export function PricingView() {
  const [who, setWho] = useState<Audience>("developers");
  const [yearly, setYearly] = useState(true);
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotion();
  const block = DATA[who];
  const paid = block.plans.filter((p) => p.monthly > 0);
  const save = Math.max(...paid.map((p) => Math.round((1 - p.yearly / p.monthly) * 100)));
  const cols = block.plans.length;

  const toggle = <T extends string | boolean>(name: string, opts: readonly (readonly [T, string])[], value: T, set: (v: T) => void, layout: string) => (
    <div role="radiogroup" aria-label={name} className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
      {opts.map(([val, label]) => (
        <button key={label} role="radio" aria-checked={value === val} onClick={() => set(val)} className={`relative rounded-full px-5 py-2 text-sm font-medium transition-colors ${value === val ? "text-white" : "text-slate-600 hover:text-slate-900"}`}>
          {value === val && <motion.span layoutId={layout} className="absolute inset-0 rounded-full bg-slate-900" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  );

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
            <Link href="/signup" className="rounded-full bg-slate-900 px-5 py-2 font-semibold text-white transition-colors hover:bg-brand-600">Get started</Link>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="relative overflow-hidden px-5 pb-14 pt-16 text-center sm:pt-24">
          <div className="bg-dots pointer-events-none absolute inset-0 -z-10" aria-hidden />
          <div className="flex justify-center">{toggle("Pricing for", [["developers", "For developers"], ["employers", "For employers"]] as const, who, setWho, "who-pill")}</div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={who} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
              <h1 className="mx-auto mt-8 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">{block.heading}</h1>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-600">{block.sub}</p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex justify-center">
            {toggle("Billing period", [[false, "Monthly"], [true, `Yearly · save ${save}%`]] as const, yearly, setYearly, "bill-pill")}
          </div>
          <p className="mx-auto mt-5 flex max-w-lg items-start justify-center gap-2 text-sm text-slate-500"><Info size={16} className="mt-0.5 shrink-0" /><span>Pricing preview. Billing isn&apos;t live yet, so every plan is free to use during early access.</span></p>
        </section>

        <section aria-label="Plans" className={`mx-auto px-5 ${cols === 2 ? "max-w-4xl" : "max-w-6xl"}`}>
          <ul key={who} className={`grid items-start gap-6 ${cols === 2 ? "md:grid-cols-2" : "lg:grid-cols-3"}`}>
            {block.plans.map((p, i) => <PlanCard key={p.id} plan={p} yearly={yearly} i={i} role={who === "developers" ? "developer" : "employer"} />)}
          </ul>
        </section>

        <section aria-label="Our promise" className="mx-auto mt-16 max-w-3xl px-5">
          <div className="flex gap-4 rounded-3xl border border-brand-100 bg-brand-50/60 p-6">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white"><ShieldCheck size={20} /></span>
            <div>
              <h2 className="font-semibold">Paying never changes a score.</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">A capability level only comes from evidence, and the top level only from work an employer approved. Match scores are calculated the same way for everyone. Plans change limits, never rankings, so a profile means the same thing whether its owner pays or not.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="compare-h" className="mx-auto mt-24 max-w-5xl px-5">
          <h2 id="compare-h" className="flex flex-wrap items-center justify-center gap-3 text-center text-3xl font-semibold sm:text-4xl">
            Compare plans <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">{who === "developers" ? <Code2 size={14} /> : <Briefcase size={14} />} {who === "developers" ? "Developers" : "Employers"}</span>
          </h2>
          <div className="mt-10 overflow-x-auto rounded-3xl border border-slate-100 shadow-sm">
            <table className="w-full min-w-[560px] border-collapse bg-white text-left">
              <caption className="sr-only">Feature comparison of the {who} plans</caption>
              <thead>
                <tr className="border-b border-slate-100">
                  <th scope="col" className="px-6 py-4 text-sm font-medium text-slate-500">Feature</th>
                  {block.plans.map((p) => <th key={p.id} scope="col" className={`px-4 py-4 text-center text-sm font-semibold ${p.featured ? "bg-brand-50/60 text-brand-700" : ""}`}>{p.name}</th>)}
                </tr>
              </thead>
              {block.table.map((g) => (
                <tbody key={g.group}>
                  <tr><th colSpan={cols + 1} scope="colgroup" className="bg-slate-50 px-6 py-2.5 text-sm font-semibold text-slate-700">{g.group}</th></tr>
                  {g.rows.map((r) => (
                    <tr key={r.label} className="border-t border-slate-100">
                      <th scope="row" className="px-6 py-3.5 text-sm font-normal text-slate-700">{r.label}{r.soon && <Soon />}</th>
                      {r.v.map((cell, i) => <td key={i} className={`px-4 py-3.5 text-center ${block.plans[i].featured ? "bg-brand-50/40" : ""}`}><CellView v={cell} /></td>)}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </section>

        <section aria-labelledby="faq-h" className="mx-auto mt-24 max-w-3xl px-5">
          <h2 id="faq-h" className="text-center text-3xl font-semibold sm:text-4xl">Questions, answered</h2>
          <div className="mt-8 border-t border-slate-100">{FAQ.map((f, i) => <FaqItem key={f.q} id={`faq-${i}`} q={f.q} a={f.a} open={open === i} onToggle={() => setOpen(open === i ? null : i)} />)}</div>
          <p className="mt-6 text-center text-sm text-slate-500">Read the <Link href="/terms" className="font-medium text-brand-600 hover:underline">Terms</Link> and <Link href="/privacy" className="font-medium text-brand-600 hover:underline">Privacy Policy</Link>.</p>
        </section>

        <section className="mx-auto my-24 max-w-4xl px-5">
          <div className="rounded-[2rem] bg-slate-900 px-6 py-16 text-center sm:px-12">
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">Start with the work, not a sales call.</h2>
            <p className="mx-auto mt-4 max-w-md text-slate-300">Create an account in under two minutes. No card needed.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}><Link href="/signup?role=developer" className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-brand-50"><Code2 size={16} /> I&apos;m a developer</Link></motion.div>
              <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}><Link href="/signup?role=employer" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"><Briefcase size={16} /> I&apos;m hiring</Link></motion.div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} Nuvora</p>
          <ul className="flex gap-6"><li><Link href="/" className="hover:text-slate-900">Home</Link></li><li><Link href="/terms" className="hover:text-slate-900">Terms</Link></li><li><Link href="/privacy" className="hover:text-slate-900">Privacy</Link></li></ul>
        </div>
      </footer>
    </div>
  );
}