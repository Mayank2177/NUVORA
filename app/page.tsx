"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import {
  ArrowRight, BadgeCheck, Bot, ClipboardCheck, EyeOff, FileSearch, GitCommit, Layers, Lock, Menu, ShieldCheck,
  Sparkles, Target, Users, X, Check, Code2, Briefcase, type LucideIcon,
} from "lucide-react";
import { useSession } from "@/lib/auth";
import { homeFor } from "@/lib/market";
import { DemoLogin } from "@/components/auth-ui";
import { LEVEL_BADGE, LEVEL_BAR, LEVEL_LABEL, LEVEL_RULE } from "@/lib/capability";
import { PROV_STYLE, type Provenance } from "@/lib/data";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const U = (id: string, w = 1400) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;
const IMG = {
  hero: U("1461749280684-dccba630e2f6"), problem: U("1484480974693-6ca0a78fb36b"),
  dev: U("1498050108023-c5249f4df085"), emp: U("1522071820081-009f0129c71c"), cta: U("1519389950473-47ba0277781c"),
};

const NAV = [
  { label: "How it works", href: "#loop" }, { label: "For developers", href: "#developers" },
  { label: "For employers", href: "#employers" }, { label: "Evidence", href: "#evidence" }, { label: "Pricing", href: "/pricing" },
];

/* ---------- building blocks ---------- */

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }} transition={{ duration: 0.65, delay, ease: EASE }}>
      {children}
    </motion.div>
  );
}

function Photo({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={`overflow-hidden rounded-3xl bg-slate-100 ${className}`}>
      <motion.img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" initial={reduce ? false : { scale: 1.08 }}
        whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ duration: 1.4, ease: EASE }} />
    </div>
  );
}

function Head({ title, sub, center = false }: { title: string; sub: string; center?: boolean }) {
  return (
    <Reveal className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <h2 className="text-3xl font-semibold leading-tight sm:text-4xl md:text-[2.75rem]">{title}</h2>
      <p className="mt-4 text-lg leading-relaxed text-slate-600">{sub}</p>
    </Reveal>
  );
}

function Btn({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "ghost" | "light" }) {
  const styles = {
    primary: "bg-slate-900 text-white hover:bg-brand-600 shadow-lg shadow-slate-900/10",
    ghost: "border border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50",
    light: "bg-white text-slate-900 hover:bg-brand-50",
  }[variant];
  return (
    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} className="inline-block">
      <Link href={href} className={`group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors ${styles}`}>{children}</Link>
    </motion.div>
  );
}

function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Nuvora home">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/30"><Layers size={17} strokeWidth={2.4} /></span>
      <span className={`text-lg font-bold tracking-tight ${light ? "text-white" : ""}`}>Nuvora</span>
    </Link>
  );
}

/* ---------- navbar ---------- */

function Navbar() {
  const [open, setOpen] = useState(false);
  const user = useSession();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  const auth = user ? <Btn href={homeFor(user)}>Open app</Btn> : <Btn href="/signup">Get started</Btn>;

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-xl">
      <motion.div style={{ scaleX: progress }} className="absolute inset-x-0 top-0 h-0.5 origin-left bg-brand-500" />
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5" aria-label="Main">
        <Logo />
        <ul className="hidden items-center gap-7 lg:flex">
          {NAV.map((n) => <li key={n.href}><Link href={n.href} className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900">{n.label}</Link></li>)}
        </ul>
        <div className="hidden items-center gap-3 lg:flex">
          {!user && <Link href="/login" className="text-sm font-semibold text-slate-700 hover:text-slate-900">Log in</Link>}
          {auth}
        </div>
        <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu" aria-expanded={open}>{open ? <X size={22} /> : <Menu size={22} />}</button>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden border-t border-slate-100 bg-white lg:hidden">
            <ul className="space-y-1 px-5 py-4">
              {NAV.map((n) => <li key={n.href}><Link href={n.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-50">{n.label}</Link></li>)}
              {!user && <li><Link href="/login" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-50">Log in</Link></li>}
              <li className="pt-2">{auth}</li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ---------- hero ---------- */

function Float({ children, className, delay }: { children: ReactNode; className: string; delay: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={`absolute z-10 ${className}`} initial={reduce ? false : { opacity: 0, y: 18, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay, duration: 0.7, ease: EASE }}>
      <motion.div animate={reduce ? undefined : { y: [0, -7, 0] }} transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay }}
        className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white/95 p-3 pr-5 shadow-xl shadow-slate-900/10 backdrop-blur">
        {children}
      </motion.div>
    </motion.div>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  const rise = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay: d, ease: EASE } });
  return (
    <section className="relative overflow-hidden pb-20 pt-32 sm:pt-40">
      <div className="bg-dots pointer-events-none absolute inset-0 -z-10" aria-hidden />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <motion.p {...rise(0)} className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3.5 py-1.5 text-sm font-medium text-brand-700"><Sparkles size={14} /> Early access preview</motion.p>
          <motion.h1 {...rise(0.1)} className="mt-6 text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-[3.6rem]">Get hired for what you&apos;ve built, not what you&apos;ve claimed.</motion.h1>
          <motion.p {...rise(0.22)} className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            Nuvora turns your real project evidence into a capability profile, matches it to real business tasks, and adds every completed task back as proof.
          </motion.p>
          <motion.div {...rise(0.34)} className="mt-9 flex flex-wrap gap-3">
            <Btn href="/signup?role=developer"><Code2 size={16} /> I&apos;m a developer <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></Btn>
            <Btn href="/signup?role=employer" variant="ghost"><Briefcase size={16} /> I&apos;m hiring</Btn>
          </motion.div>
          <motion.p {...rise(0.45)} className="mt-5 text-sm text-slate-500">Free to start · Private by default · <Link href="#demo" className="font-medium text-brand-600 hover:underline">Try the demo, no signup</Link></motion.p>
        </div>

        <motion.div {...(reduce ? {} : { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.9, delay: 0.2, ease: EASE } })} className="relative">
          <Photo src={IMG.hero} alt="Developer writing code on a monitor" className="aspect-[4/4.4] shadow-2xl shadow-slate-900/15" />
          <Float delay={0.8} className="-left-4 top-10 sm:-left-10">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600"><ShieldCheck size={18} /></span>
            <div><p className="text-xs text-slate-500">React</p><p className="text-sm font-semibold">L3 Applied · 9 items</p></div>
          </Float>
          <Float delay={1.1} className="-right-3 top-1/2 sm:-right-8">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600"><Target size={18} /></span>
            <div><p className="text-xs text-slate-500">Speed up the customer website</p><p className="text-sm font-semibold">Strong match · 88%</p></div>
          </Float>
          <Float delay={1.4} className="-bottom-5 left-6 sm:left-12">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><BadgeCheck size={18} /></span>
            <div><p className="text-xs text-slate-500">Task approved</p><p className="text-sm font-semibold">Testing verified · L4</p></div>
          </Float>
          <p className="mt-8 text-center text-xs text-slate-500">Illustrative example, not a real person</p>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------- problem ---------- */

function Problem() {
  const cols = [
    { icon: Code2, who: "If you build", title: "Your skills are hard to prove", body: "A résumé line saying “React” looks the same whether you shipped three apps or watched one video. Good work gets lost between your editor, GitHub and a portfolio you never update." },
    { icon: Briefcase, who: "If you hire", title: "You can't tell who can do the job", body: "Self-declared skills and polished profiles say little about who can actually fix your slow website or build your internal tool. Finding out usually costs you a bad hire." },
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
      <Head title="Résumés describe. Evidence shows." sub="Both sides of hiring are guessing. Nuvora replaces guesses with a record of real work." />
      <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Reveal><Photo src={IMG.problem} alt="A desk covered in unfinished notes and sketches" className="h-full min-h-[280px]" /></Reveal>
        <div className="grid gap-5">
          {cols.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.1}>
              <div className="h-full rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><c.icon size={19} /></span>
                <p className="mt-4 text-sm font-medium text-slate-500">{c.who}</p>
                <h3 className="text-xl font-semibold">{c.title}</h3>
                <p className="mt-2 leading-relaxed text-slate-600">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- the loop ---------- */

const LOOP: { icon: LucideIcon; who: string; title: string; body: string; ex: string }[] = [
  { icon: GitCommit, who: "Developer", title: "Build and collect evidence", body: "Commits, tests, designs, decisions and solved blockers collect on your projects. Each item records who made it: you, AI, a collaborator or an outside source.", ex: "Commit · Add authentication flow · Human" },
  { icon: ShieldCheck, who: "Developer", title: "Evidence becomes capability", body: "Every skill gets a level from L0 to L4, and you can open any level to see exactly which items earned it. Work done with AI counts for less, and you decide what employers see.", ex: "Node.js · L2 Practiced · 5 evidence items" },
  { icon: FileSearch, who: "Employer", title: "Describe a need in plain words", body: "Write the problem the way you'd say it to a colleague. Nuvora structures it into requirements, skills, scope and acceptance criteria that you review and edit.", ex: "“Our website is slow” becomes a scoped task" },
  { icon: Target, who: "Both", title: "Match, with the reasons shown", body: "Developers are ranked by how well their evidence fits the skills the task needs. Every score shows its working, so you can disagree with it.", ex: "Strong match · 88% · strongest in JavaScript and React" },
  { icon: Users, who: "Developer", title: "Accept, build and submit", body: "Accept the task, do the work, and submit it against each acceptance criterion with automated checks. Employers invite or assign, and developers always choose to accept.", ex: "Submitted · 3 of 3 criteria addressed · tests passing" },
  { icon: ClipboardCheck, who: "Employer", title: "Review and verify", body: "Approve the work or ask for changes. Approved work verifies the developer's skills at L4 and becomes new evidence, so the next match starts from a stronger profile.", ex: "Approved · Testing verified · added to evidence" },
];

function Loop() {
  const [i, setI] = useState(0);
  const s = LOOP[i];
  return (
    <section id="loop" className="bg-slate-50/70 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <Head center title="One loop: learn, build, prove, contribute." sub="Each completed task becomes proof for the next one. Select a step to see what happens." />
        <div className="mt-14 grid items-start gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div role="tablist" aria-label="The Nuvora loop" aria-orientation="vertical" className="space-y-2">
            {LOOP.map((l, n) => (
              <button key={l.title} role="tab" aria-selected={n === i} onClick={() => setI(n)}
                className={`relative flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition-colors ${n === i ? "text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}>
                {n === i && <motion.span layoutId="loop-pill" className="absolute inset-0 rounded-2xl bg-slate-900" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                <span className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${n === i ? "bg-white/15" : "bg-slate-100"}`}>{n + 1}</span>
                <span className="relative text-sm font-medium">{l.title}</span>
              </button>
            ))}
          </div>

          <div role="tabpanel" className="rounded-3xl border border-slate-100 bg-white p-7 shadow-sm sm:p-9">
            <AnimatePresence mode="wait">
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: EASE }}>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600"><s.icon size={22} /></span>
                <p className="mt-5 text-sm font-medium text-slate-500">{s.who}</p>
                <h3 className="text-2xl font-semibold">{s.title}</h3>
                <p className="mt-3 max-w-xl text-lg leading-relaxed text-slate-600">{s.body}</p>
                <p className="mt-6 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700"><span className="font-medium">Example: </span>{s.ex}</p>
                {i === LOOP.length - 1 && <p className="mt-4 flex items-center gap-2 text-sm font-medium text-brand-700"><Check size={16} /> Then the loop starts again, with more proof.</p>}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- two audiences ---------- */

function Audience({ id, image, alt, tag, title, points, cta, href, flip }: {
  id: string; image: string; alt: string; tag: string; title: string; points: string[]; cta: string; href: string; flip?: boolean;
}) {
  return (
    <div id={id} className={`grid items-center gap-10 lg:grid-cols-2 ${flip ? "lg:[&>*:first-child]:order-2" : ""}`}>
      <Reveal><Photo src={image} alt={alt} className="aspect-[4/3] shadow-xl shadow-slate-900/10" /></Reveal>
      <Reveal delay={0.1}>
        <p className="text-sm font-semibold text-brand-600">{tag}</p>
        <h3 className="mt-2 text-3xl font-semibold leading-tight">{title}</h3>
        <ul className="mt-6 space-y-3">
          {points.map((p) => <li key={p} className="flex gap-3 text-slate-700"><Check size={19} className="mt-0.5 shrink-0 text-brand-600" /> {p}</li>)}
        </ul>
        <div className="mt-8"><Btn href={href}>{cta} <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></Btn></div>
      </Reveal>
    </div>
  );
}

function Audiences() {
  return (
    <section className="mx-auto max-w-6xl space-y-28 px-5 py-24 sm:py-32">
      <Audience id="developers" image={IMG.dev} alt="A laptop showing code" tag="For developers" title="Turn the work you already do into proof."
        points={["Build projects and your evidence collects as you go: commits, tests, designs and notes", "See every skill measured from the work behind it, with what to do to reach the next level", "Get matched to real tasks, and see exactly why they fit you", "Choose what employers can see. Nothing is shared until you say so"]}
        cta="Start as a developer" href="/signup?role=developer" />
      <Audience id="employers" flip image={IMG.emp} alt="A small team working together at laptops" tag="For employers" title="Describe the problem. Find who can solve it."
        points={["Write a need in plain words and review the structured task before it goes live", "See candidates ranked by evidence, with the reasons and the work behind each score", "Invite or assign, and developers confirm before they start", "Approve the work against the acceptance criteria you set"]}
        cta="Start hiring" href="/signup?role=employer" />
    </section>
  );
}

/* ---------- evidence ---------- */

const SKILLS: { name: string; level: 0 | 1 | 2 | 3 | 4; items: number }[] = [
  { name: "Testing", level: 4, items: 7 }, { name: "React", level: 3, items: 9 }, { name: "Node.js", level: 2, items: 5 }, { name: "SQL", level: 1, items: 2 },
];
const PROOF: { text: string; prov: Provenance; meta: string }[] = [
  { text: "41 integration tests for the API (passing)", prov: "Human", meta: "Test · Route Planner API" },
  { text: "Added a database index and cached the heavy query", prov: "Human", meta: "Blocker resolved · Route Planner API" },
  { text: "Debugged environment configuration", prov: "AI-assisted", meta: "AI session · counts for half" },
];

function Evidence() {
  return (
    <section id="evidence" className="bg-slate-50/70 py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2">
        <div>
          <Head title="Open any skill and see the evidence behind it." sub="Levels aren't a claim. Each one is earned from specific work, so an employer can check it, and you can see how to climb." />
          <Reveal delay={0.1}>
            <ol className="mt-8 space-y-2.5" aria-label="Capability levels">
              {LEVEL_LABEL.map((l, n) => (
                <li key={l} className="flex gap-3 text-sm"><span className={`h-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${LEVEL_BADGE[n]}`}>L{n} {l}</span><span className="text-slate-600">{LEVEL_RULE[n]}</span></li>
              ))}
            </ol>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-7">
            <p className="text-sm font-medium text-slate-500">Example profile</p>
            <ul className="mt-4 space-y-5">
              {SKILLS.map((s, n) => (
                <li key={s.name}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.name}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_BADGE[s.level]}`}>L{s.level} {LEVEL_LABEL[s.level]}</span>
                    <span className="ml-auto text-xs text-slate-500">{s.items} evidence items</span>
                  </div>
                  <div className="mt-2 flex gap-1.5" role="img" aria-label={`${s.name}: level ${s.level} of 4`}>
                    {[1, 2, 3, 4].map((b) => (
                      <span key={b} className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <motion.span className={`block h-full rounded-full ${LEVEL_BAR[s.level]}`} initial={{ width: 0 }} whileInView={{ width: b <= s.level ? "100%" : 0 }} viewport={{ once: true }} transition={{ duration: 0.7, delay: n * 0.1 + b * 0.07, ease: EASE }} />
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mb-2 mt-7 text-sm font-medium text-slate-500">What counts toward Testing</p>
            <ul className="space-y-2">
              {PROOF.map((p) => (
                <li key={p.text} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="text-sm font-medium">{p.text}</p><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROV_STYLE[p.prov]}`}>{p.prov}</span></div>
                  <p className="text-xs text-slate-500">{p.meta}</p>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- trust ---------- */

const TRUST: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Lock, title: "Private by default", body: "Your projects and evidence are private until you publish or make them public. You choose item by item." },
  { icon: EyeOff, title: "You control discovery", body: "Employers can only find you if you opt in, and they only see evidence you've made public." },
  { icon: Bot, title: "Honest about AI", body: "Every item shows who made it. Work done with AI counts for less, and the top level needs a person's work." },
  { icon: BadgeCheck, title: "Verified, not self-granted", body: "L4 only comes from work an employer approved on Nuvora. You can't give it to yourself." },
];

function Trust() {
  return (
    <section id="trust" className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
      <Head center title="Built so both sides can trust the result." sub="A profile is only worth reading if it can't be easily faked, and only worth sharing if you stay in control." />
      <ul className="mt-14 grid gap-5 sm:grid-cols-2">
        {TRUST.map((t, i) => (
          <Reveal key={t.title} delay={(i % 2) * 0.08}>
            <li className="flex h-full gap-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><t.icon size={20} /></span>
              <div><h3 className="font-semibold">{t.title}</h3><p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t.body}</p></div>
            </li>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

/* ---------- demo + final CTA ---------- */

function Demo() {
  const router = useRouter();
  return (
    <section id="demo" className="mx-auto max-w-3xl px-5 pb-24">
      <Reveal>
        <div className="rounded-3xl border border-slate-100 bg-white p-7 shadow-sm sm:p-9">
          <h2 className="text-2xl font-semibold">Try it in a minute, no signup</h2>
          <p className="mt-2 text-slate-600">Open a demo account with sample projects, evidence and tasks already filled in. Log out and try the other side to see the whole loop.</p>
          <div className="mt-6"><DemoLogin onDone={(u) => router.push(homeFor(u))} /></div>
          <p className="mt-5 text-sm leading-relaxed text-slate-500">
            Nuvora is an early preview. Everything runs in your browser with sample data, and task structuring and matching use transparent rules, not AI. Real accounts, live GitHub connection and payments are not built yet.
          </p>
        </div>
      </Reveal>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-24">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] bg-slate-900 px-6 py-20 text-center sm:px-16">
          <img src={IMG.cta} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-brand-700/60" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-semibold text-white sm:text-5xl">Learn it. Build it. Prove it. Contribute.</h2>
            <p className="mt-5 text-lg text-slate-300">Start with the work you&apos;ve already done, or the problem you need solved.</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Btn href="/signup?role=developer" variant="light"><Code2 size={16} /> I&apos;m a developer</Btn>
              <Link href="/signup?role=employer" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"><Briefcase size={16} /> I&apos;m hiring</Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 py-10 sm:flex-row">
        <div className="text-center sm:text-left"><Logo /><p className="mt-2 text-sm text-slate-500">Real work, matched to proven skill.</p></div>
        <ul className="flex flex-wrap justify-center gap-6 text-sm text-slate-600">
          {[["Pricing", "/pricing"], ["Terms", "/terms"], ["Privacy", "/privacy"], ["Log in", "/login"]].map(([l, h]) => <li key={h}><Link href={h} className="hover:text-slate-900">{l}</Link></li>)}
        </ul>
        <p className="text-sm text-slate-400">© {new Date().getFullYear()} Nuvora</p>
      </div>
    </footer>
  );
}

export default function Page() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
        <Problem />
        <Loop />
        <Audiences />
        <Evidence />
        <Trust />
        <Demo />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}