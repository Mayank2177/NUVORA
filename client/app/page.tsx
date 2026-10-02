"use client";
import { STAGES as STAGE_NAMES } from "@/lib/store";
import { STAGE_INFO } from "@/lib/tasks";
/* eslint-disable @next/next/no-img-element */

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import {
  AlertTriangle, ArrowRight, BookOpen, Bot, Brain, Camera, Check, Compass, FileText,
  GitCommit, Globe, Layers, Lightbulb, Link2, Lock, Menu, ShieldCheck, Sparkles, X,
  type LucideIcon,
} from "lucide-react";

/* ---------- constants ---------- */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const U = (id: string, w = 1400) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

const IMG = {
  hero: U("1461749280684-dccba630e2f6"),
  problem: U("1484480974693-6ca0a78fb36b"),
  solution: U("1522071820081-009f0129c71c"),
  journey: U("1531482615713-2afd69097998"),
  evidence: U("1551288049-bebda4e38f71"),
  story: U("1498050108023-c5249f4df085"),
  cta: U("1519389950473-47ba0277781c"),
};

const NAV = [
  { label: "Problem", href: "#problem" },
  { label: "How it works", href: "#solution" },
  { label: "Journey", href: "#journey" },
  { label: "Evidence", href: "#evidence" },
  { label: "Integrations", href: "#integrations" },
];
const STAGES = STAGE_NAMES.map((name) => ({
  name, q: STAGE_INFO[name].question, tasks: STAGE_INFO[name].tasks, exit: STAGE_INFO[name].exit,
}));
/* ---------- small building blocks ---------- */

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.65, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Photo({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-3xl bg-slate-100 ${className}`}>
      <motion.img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover"
        initial={{ scale: 1.08 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.4, ease: EASE }}
      />
    </div>
  );
}

function SectionHead({ title, sub, center = false }: { title: string; sub: string; center?: boolean }) {
  return (
    <Reveal className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <h2 className="text-3xl font-semibold leading-tight sm:text-4xl md:text-[2.75rem]">{title}</h2>
      <p className="mt-4 text-lg leading-relaxed text-slate-600">{sub}</p>
    </Reveal>
  );
}

function Button({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "ghost" | "light" }) {
  const styles = {
    primary: "bg-slate-900 text-white hover:bg-brand-600 shadow-lg shadow-slate-900/10",
    ghost: "border border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50",
    light: "bg-white text-slate-900 hover:bg-brand-50",
  }[variant];
  return (
    <motion.a
      href={href}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      className={`group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors ${styles}`}
    >
      {children}
    </motion.a>
  );
}

function Logo({ light = false }: { light?: boolean }) {
  return (
    <a href="#top" className="flex items-center gap-2.5" aria-label="Nuvora home">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/30">
        <Layers size={17} strokeWidth={2.4} />
      </span>
      <span className={`text-lg font-bold tracking-tight ${light ? "text-white" : "text-slate-900"}`}>Nuvora</span>
    </a>
  );
}

/* ---------- navbar ---------- */

function Navbar() {
  const [open, setOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-xl">
      <motion.div style={{ scaleX: progress }} className="absolute inset-x-0 top-0 h-0.5 origin-left bg-brand-500" />
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5" aria-label="Main">
        <Logo />
        <ul className="hidden items-center gap-8 md:flex">
          {NAV.map((n) => (
            <li key={n.href}>
              <a href={n.href} className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900">{n.label}</a>
            </li>
          ))}
        </ul>
        <div className="hidden md:block"><Button href="/login">Start a project</Button></div>
        <button className="rounded-lg p-2 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu" aria-expanded={open}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden border-t border-slate-100 bg-white md:hidden"
          >
            <ul className="space-y-1 px-5 py-4">
              {NAV.map((n) => (
                <li key={n.href}>
                  <a href={n.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-50">{n.label}</a>
                </li>
              ))}
              <li className="pt-2"><Button href="/signup">Start a project</Button></li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ---------- hero ---------- */

function FloatCard({ children, className, delay }: { children: ReactNode; className: string; delay: number }) {
  return (
    <motion.div
      className={`absolute z-10 ${className}`}
      initial={{ opacity: 0, y: 18, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.7, ease: EASE }}
    >
      <motion.div
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay }}
        className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white/95 p-3 pr-5 shadow-xl shadow-slate-900/10 backdrop-blur"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-32 pb-20 sm:pt-40">
      <div className="bg-dots pointer-events-none absolute inset-0 -z-10" aria-hidden />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3.5 py-1.5 text-sm font-medium text-brand-700"
          >
            <Sparkles size={14} /> The layer between the tools you already use
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
            className="mt-6 text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-[3.6rem]"
          >
            Your work shouldn&apos;t disappear between the tools you use.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.22, ease: EASE }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600"
          >
            Nuvora connects what you learn, build, solve, document and publish, keeping your context and evidence together from idea to opportunity.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.34, ease: EASE }}
            className="mt-9 flex flex-wrap gap-3"
          >
            <Button href="/signup">Start a project <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></Button>
            <Button href="#solution" variant="ghost">See how it works</Button>
          </motion.div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-6 text-sm text-slate-500">
            Free to start · Private by default · Connects to GitHub in minutes
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
          className="relative"
        >
          <Photo src={IMG.hero} alt="Developer code on a monitor" className="aspect-[4/4.4] shadow-2xl shadow-slate-900/15" />
          <FloatCard delay={0.8} className="-left-4 top-10 sm:-left-10">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><GitCommit size={18} /></span>
            <div><p className="text-xs text-slate-500">GitHub commit</p><p className="text-sm font-semibold">Implemented authentication</p></div>
          </FloatCard>
          <FloatCard delay={1.1} className="-right-3 top-1/2 sm:-right-8">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600"><Bot size={18} /></span>
            <div><p className="text-xs text-slate-500">AI-assisted</p><p className="text-sm font-semibold">Debugged Firebase config</p></div>
          </FloatCard>
          <FloatCard delay={1.4} className="-bottom-5 left-6 sm:left-12">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600"><Check size={18} /></span>
            <div><p className="text-xs text-slate-500">Blocker resolved</p><p className="text-sm font-semibold">Production env fixed</p></div>
          </FloatCard>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------- tool strip ---------- */

const TOOLS = ["GitHub", "YouTube", "Stack Overflow", "CodeCrafters", "Exercism", "Figma", "Excalidraw", "Claude Code", "Cursor", "Loom", "Vercel", "LinkedIn", "Devpost"];

function ToolStrip() {
  return (
    <section aria-label="Works with your tools" className="border-y border-slate-100 bg-slate-50/60 py-8">
      <p className="mb-5 text-center text-sm font-medium text-slate-500">Works alongside the tools you already use. We don&apos;t replace them.</p>
      <div className="marquee-mask overflow-hidden">
        <div className="animate-marquee flex w-max gap-12 pr-12">
          {[...TOOLS, ...TOOLS].map((t, i) => (
            <span key={i} className="text-lg font-semibold text-slate-400">{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- problem ---------- */

const CHAIN = [
  { tool: "YouTube", what: "You learn a concept" },
  { tool: "Stack Overflow", what: "You get stuck and search" },
  { tool: "AI assistant", what: "You paste code to fix it" },
  { tool: "GitHub", what: "You build and commit" },
  { tool: "Screenshots", what: "You capture proof by hand" },
  { tool: "Portfolio", what: "You rewrite it from memory" },
  { tool: "LinkedIn", what: "You summarise it in one line" },
];

function Problem() {
  return (
    <section id="problem" className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
      <SectionHead title="Every tool is good. The trail between them is missing." sub="You learn in one place, get unstuck in another, build in a third. By the time you publish, the story of how you got there is gone." />
      <div className="mt-14 grid items-center gap-12 lg:grid-cols-2">
        <Reveal><Photo src={IMG.problem} alt="Notes and sketches scattered across a desk" className="aspect-[4/3.4]" /></Reveal>
        <ol className="relative space-y-0">
          {CHAIN.map((c, i) => (
            <motion.li
              key={c.tool}
              initial={{ opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.07, ease: EASE }}
            >
              <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">{i + 1}</span>
                <div><p className="font-semibold">{c.tool}</p><p className="text-sm text-slate-500">{c.what}</p></div>
              </div>
              {i < CHAIN.length - 1 && (
                <div className="ml-8 flex items-center gap-3 py-1.5 text-xs font-medium text-rose-500">
                  <span className="h-5 border-l-2 border-dashed border-rose-300" />
                  Context lost
                </div>
              )}
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- solution ---------- */

const PILLARS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Brain, title: "Remember context", body: "Goals, decisions, blockers and what you already tried, kept in one PROJECT.md." },
  { icon: ShieldCheck, title: "Capture evidence", body: "Commits, tests, screenshots and notes, each tagged with where it came from." },
  { icon: Compass, title: "Guide the next step", body: "A clear answer to “what should I do next?” with the reason attached." },
  { icon: FileText, title: "Turn work into a story", body: "Your real activity becomes a project page you can publish with one click." },
];

function Solution() {
  return (
    <section id="solution" className="bg-slate-50/70 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHead center title="Nuvora sits between your tools and keeps the journey connected." sub="Connect once. From then on, every stage feeds the same record of what you tried, decided and shipped." />
        <div className="mt-14 grid items-stretch gap-6 lg:grid-cols-[1fr_1.1fr]">
          <Reveal className="grid gap-4 sm:grid-cols-2">
            {PILLARS.map((p) => (
              <motion.div
                key={p.title} whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><p.icon size={20} /></span>
                <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.body}</p>
              </motion.div>
            ))}
          </Reveal>
          <Reveal delay={0.1} className="relative">
            <Photo src={IMG.solution} alt="Team collaborating around laptops" className="h-full min-h-[340px]" />
            <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-slate-200/70 bg-white/95 p-5 font-mono text-xs leading-6 shadow-xl backdrop-blur">
              <p className="mb-1 font-sans text-sm font-semibold text-slate-900">PROJECT.md</p>
              <p><span className="text-brand-600">Goal</span>   AI-powered learning platform</p>
              <p><span className="text-brand-600">Stage</span>  Build</p>
              <p><span className="text-brand-600">Blocker</span> Firebase auth failing in prod</p>
              <p><span className="text-brand-600">Next</span>   Connect authentication</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------- journey ---------- */

function Journey() {
  const [active, setActive] = useState(STAGE_NAMES.indexOf("Build"));
  const s = STAGES[active];
  return (
    <section id="journey" className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
      <SectionHead title="One flexible journey, from first idea to real contribution." sub="Skip stages, repeat them or jump back. Nuvora keeps your context wherever you go. Pick a stage to see what it asks of you." />
      <div className="mt-12 flex flex-wrap gap-2" role="tablist" aria-label="Journey stages">
        {STAGES.map((st, i) => (
          <button
            key={st.name} role="tab" aria-selected={i === active} onClick={() => setActive(i)}
            className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${i === active ? "text-white" : i < active ? "bg-brand-50 text-brand-700 hover:bg-brand-100" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {i === active && <motion.span layoutId="stage-pill" className="absolute inset-0 rounded-full bg-slate-900" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
            <span className="relative flex items-center gap-1.5">{i < active && <Check size={13} />}{st.name}</span>
          </button>
        ))}
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
          <AnimatePresence mode="wait">
            <motion.div key={s.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: EASE }}>
              <h3 className="text-2xl font-semibold">{s.name}</h3>
              <p className="mt-4 text-sm font-medium text-slate-500">The question at this stage</p>
              <p className="mt-1 text-lg text-slate-800">{s.q}</p>
              <p className="mt-6 text-sm font-medium text-slate-500">Tasks</p>
              <ul className="mt-2 space-y-2">
                {s.tasks.map((t) => (
                  <li key={t} className="flex items-center gap-2.5 text-slate-700"><Check size={16} className="text-brand-600" />{t}</li>
                ))}
              </ul>
              <div className="mt-6 rounded-xl bg-brand-50 p-4 text-sm text-brand-700"><span className="font-semibold">Done when: </span>{s.exit}</div>
            </motion.div>
          </AnimatePresence>
        </div>
        <Photo src={IMG.journey} alt="Team planning a project on a whiteboard" className="min-h-[300px]" />
      </div>
    </section>
  );
}

/* ---------- evidence ---------- */

type Prov = "Human" | "AI-assisted" | "Collaborator" | "External";
const PROV_STYLE: Record<Prov, string> = {
  Human: "bg-emerald-50 text-emerald-700",
  "AI-assisted": "bg-violet-50 text-violet-700",
  Collaborator: "bg-amber-50 text-amber-700",
  External: "bg-sky-50 text-sky-700",
};
const EVIDENCE: { icon: LucideIcon; type: string; text: string; when: string; src: string; prov: Prov; stage: string }[] = [
  { icon: GitCommit, type: "Commit", text: "Implemented authentication", when: "Today", src: "GitHub", prov: "Human", stage: "Build" },
  { icon: Bot, type: "AI session", text: "Debugged Firebase configuration", when: "Today", src: "Claude Code", prov: "AI-assisted", stage: "Get unstuck" },
  { icon: Camera, type: "Screenshot", text: "Dashboard completed", when: "Today", src: "Folder watcher", prov: "Human", stage: "Document" },
  { icon: Lightbulb, type: "Decision", text: "Chose Firebase over Supabase, since the team knows it", when: "Yesterday", src: "Nuvora", prov: "Collaborator", stage: "Prototype" },
  { icon: BookOpen, type: "Learning", text: "Completed authentication tutorial", when: "Yesterday", src: "YouTube", prov: "External", stage: "Learn" },
  { icon: Check, type: "Blocker resolved", text: "Updated production environment variables", when: "Yesterday", src: "Nuvora", prov: "Human", stage: "Get unstuck" },
];
const FILTERS = ["All", "Human", "AI-assisted", "External"] as const;

function Evidence() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const items = EVIDENCE.filter((e) => filter === "All" || e.prov === filter);
  return (
    <section id="evidence" className="bg-slate-50/70 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHead title="Don't just claim what you can do. Show the evidence." sub="Every item on your timeline says what it is, where it came from and who made it, including when AI helped." />
        <div className="mt-12 grid items-start gap-10 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by provenance">
              {FILTERS.map((f) => (
                <button key={f} onClick={() => setFilter(f)} aria-pressed={f === filter}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${f === filter ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
                  {f}
                </button>
              ))}
            </div>
            <ul className="relative space-y-3">
              <AnimatePresence mode="popLayout">
                {items.map((e) => (
                  <motion.li key={e.text} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.35, ease: EASE }} className="flex gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><e.icon size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="font-semibold">{e.type}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROV_STYLE[e.prov]}`}>{e.prov}</span>
                      </div>
                      <p className="mt-0.5 text-slate-700">{e.text}</p>
                      <p className="mt-1 text-xs text-slate-500">{e.when} from {e.src}, during {e.stage}</p>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
          <Reveal className="space-y-6 lg:sticky lg:top-24">
            <Photo src={IMG.evidence} alt="Analytics dashboard showing project results" className="aspect-[4/3]" />
            <ul className="space-y-3 text-slate-700">
              {["Provenance on every item: human, AI-assisted, collaborator or external", "Secrets and personal data flagged before anything goes public", "Guidance that always explains why it suggests a next step"].map((t) => (
                <li key={t} className="flex gap-3"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-brand-600" />{t}</li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------- story + privacy ---------- */

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-brand-600" : "bg-slate-300"}`}>
      <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }} className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${on ? "right-0.5" : "left-0.5"}`} />
    </button>
  );
}

function Story() {
  const [vis, setVis] = useState({ Commits: true, Screenshots: true, Decisions: true, Blockers: false, "Environment variables": false });
  const keys = Object.keys(vis) as (keyof typeof vis)[];
  return (
    <section id="story" className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
      <SectionHead title="Turn raw activity into a project story people can read." sub="Choose what goes public, review the warnings, and publish. Everything stays private until you say otherwise." />
      <div className="mt-12 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="flex items-center gap-2 font-semibold"><Lock size={18} className="text-brand-600" /> Visibility</h3>
          <ul className="mt-4 divide-y divide-slate-100">
            {keys.map((k) => (
              <li key={k} className="flex items-center justify-between py-3">
                <span className="text-slate-700">{k}</span>
                <span className="flex items-center gap-3">
                  <span className="w-14 text-right text-xs text-slate-500">{vis[k] ? "Public" : "Private"}</span>
                  <Toggle on={vis[k]} label={`Make ${k} public`} onChange={() => setVis((v) => ({ ...v, [k]: !v[k] }))} />
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <p>Secret scan found 1 possible API key in <span className="font-mono">.env.example</span>. Review it before publishing.</p>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl shadow-slate-900/5">
          <div className="relative h-44">
            <img src={IMG.story} alt="Laptop showing a finished project" loading="lazy" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/10 to-transparent" />
          </div>
          <div className="space-y-5 p-7 pt-2">
            <h3 className="text-2xl font-semibold">EduBoost AI</h3>
            {[
              ["The problem", "African students lack affordable, personalised study support."],
              ["The process", "Learned auth patterns, prototyped the flow, chose Firebase after comparing options."],
              ["The build", "React and TypeScript app with Firebase auth and Firestore."],
              ["Evidence", `${vis.Commits ? "24 commits, " : ""}${vis.Screenshots ? "6 screenshots, " : ""}${vis.Decisions ? "3 decisions" : "details hidden"}`],
              ["The result", "A working platform, shipped by a team of three."],
            ].map(([h, b], i) => (
              <motion.div key={h} initial={{ opacity: 0, x: 12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.5, ease: EASE }}>
                <p className="text-sm font-semibold text-brand-700">{h}</p>
                <p className="mt-0.5 text-slate-700">{b}</p>
              </motion.div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- integrations ---------- */

const INTEGRATIONS: { icon: LucideIcon; name: string; role: string; how: string }[] = [
  { icon: GitCommit, name: "GitHub", role: "Commits, pull requests, tests", how: "Git-native" },
  { icon: BookOpen, name: "YouTube and courses", role: "What you learned", how: "Browser attach" },
  { icon: Layers, name: "Stack Overflow", role: "How you got unstuck", how: "Browser attach" },
  { icon: Layers, name: "CodeCrafters and Exercism", role: "Practice progress", how: "Git-native" },
  { icon: Lightbulb, name: "Figma, Excalidraw, Balsamiq", role: "Design files", how: "Folder watcher" },
  { icon: Bot, name: "AI coding tools", role: "Recorded as provenance", how: "MCP (planned)" },
  { icon: Camera, name: "CleanShot, OBS, Loom", role: "Screenshots and videos", how: "Folder watcher" },
  { icon: Globe, name: "Vercel, Netlify, Pages", role: "Where you publish", how: "API" },
  { icon: Link2, name: "LinkedIn, Devpost, Wellfound", role: "Where evidence gets used", how: "Manual link" },
];

function Integrations() {
  return (
    <section id="integrations" className="bg-slate-50/70 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHead center title="Connect the tools you already love." sub="Integrations are read-only by default. Anything that writes needs your explicit permission, and a manual option always exists." />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATIONS.map((t, i) => (
            <motion.div key={t.name} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: (i % 3) * 0.08, duration: 0.55, ease: EASE }} whileHover={{ y: -4 }}
              className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><t.icon size={19} /></span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{t.how}</span>
              </div>
              <h3 className="mt-4 font-semibold">{t.name}</h3>
              <p className="mt-1 text-sm text-slate-600">{t.role}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- final CTA + footer ---------- */

function CTA() {
  return (
    <section id="cta" className="mx-auto max-w-6xl px-5 py-24 sm:py-28">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] bg-slate-900 px-6 py-20 text-center sm:px-16">
          <img src={IMG.cta} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-brand-700/60" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-semibold text-white sm:text-5xl">Start building with continuity.</h2>
            <p className="mt-5 text-lg text-slate-300">Learn it. Build it. Prove it. Keep the context. Create your first project in under two minutes.</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button href="/signup" variant="light">Start a project <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></Button>
              <a href="#solution" className="inline-flex items-center rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10">See how it works</a>
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
        <div className="text-center sm:text-left">
          <Logo />
          <p className="mt-2 text-sm text-slate-500">The continuity layer for learning, building and proving what you can do.</p>
        </div>
        <ul className="flex flex-wrap justify-center gap-6 text-sm text-slate-600">
          {NAV.map((n) => <li key={n.href}><a href={n.href} className="hover:text-slate-900">{n.label}</a></li>)}
        </ul>
        <p className="text-sm text-slate-400">© {new Date().getFullYear()} Nuvora</p>
      </div>
    </footer>
  );
}

/* ---------- page ---------- */

export default function Page() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
        <ToolStrip />
        <Problem />
        <Solution />
        <Journey />
        <Evidence />
        <Story />
        <Integrations />
        <CTA />
      </main>
      <Footer />
    </>
  );
}