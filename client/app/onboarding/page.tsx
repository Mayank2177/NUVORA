"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Layers, Loader2, Plus, X } from "lucide-react";
import { signOut, useSession } from "@/lib/auth";
import { loadDevRecord, saveDevRecord, type SkillLevel } from "@/lib/market";
import { loadProfile, saveProfile } from "@/lib/profile";
import { api } from "@/lib/api";
import { Field, GitHubMark, inputCls } from "@/components/auth-ui";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const STEPS = ["About you", "Goals", "Interests", "Skills", "GitHub"];
const LEVELS: SkillLevel[] = ["Beginner", "Intermediate", "Advanced"];

const GOALS = [
  "Get my first developer job", "Get freelance or contract work", "Build a strong portfolio",
  "Learn a new technology", "Ship my own product", "Contribute to open source",
];
const INTERESTS = [
  "Web development", "Web performance", "APIs and backend", "Mobile apps", "Data and AI",
  "Education technology", "Developer tools", "Security", "Design systems", "Automation",
];
const SKILL_IDEAS = ["JavaScript", "TypeScript", "React", "Node.js", "Python", "SQL", "HTML and CSS", "Git", "Testing", "APIs"];

type Skill = { name: string; level: SkillLevel };
type Gh = { state: "idle" | "checking" | "ok" | "error"; repos?: number; message?: string };

function ChipPicker({ options, value, onChange, max, label }: { options: string[]; value: string[]; onChange: (v: string[]) => void; max: number; label: string }) {
  const [text, setText] = useState("");
  const custom = value.filter((v) => !options.includes(v));
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((v) => v !== o) : value.length < max ? [...value, o] : value);
  const addCustom = () => {
    const t = text.trim().slice(0, 40);
    if (t && value.length < max && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setText("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {[...options, ...custom].map((o) => {
          const on = value.includes(o);
          return (
            <button key={o} type="button" aria-pressed={on} onClick={() => toggle(o)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>
              {on && <Check size={14} />} {o}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Add your own" placeholder="Add your own"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} className={inputCls(false)} />
        <button type="button" onClick={addCustom} disabled={!text.trim()} aria-label="Add"
          className="grid w-12 shrink-0 place-items-center rounded-xl bg-slate-900 text-white transition-colors hover:bg-brand-600 disabled:opacity-40"><Plus size={18} /></button>
      </div>
      <p className="mt-2 text-xs text-slate-500">{value.length} of {max} selected</p>
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-brand-600" : "bg-slate-300"}`}>
      <m.span transition={{ type: "spring", stiffness: 500, damping: 32 }} className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${on ? "right-0.5" : "left-0.5"}`} />
    </button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const user = useSession();
  const reduce = useReducedMotion();
  const dx = reduce ? 0 : 24;

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [headline, setHeadline] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillText, setSkillText] = useState("");
  const [ghState, setGhState] = useState<Gh>({ state: "idle" });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("github");
    if (!status) return;
    const timer = window.setTimeout(() => setGhState(status === "connected"
      ? { state: "ok", message: "GitHub connected successfully." }
      : { state: "error", message: `GitHub connection failed (${params.get("reason") || "try again"}).` }), 0);
    window.history.replaceState(null, "", window.location.pathname);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;

    if (user === null) router.replace("/login");
    else if (user?.role === "employer") router.replace("/employer");
    else if (user && !done) {
      void loadDevRecord(user.id).then((record) => {
        if (active && record) router.replace("/dashboard");
      }).catch(() => {});
    }

    return () => {
      active = false;
    };
  }, [user, done, router]);

  if (!user || user.role === "employer") {
    return <div className="grid min-h-screen place-items-center text-slate-500" role="status"><Loader2 className="animate-spin" aria-label="Loading" /></div>;
  }
  const me = user;

  const addSkill = (raw: string) => {
    const t = raw.trim().slice(0, 30);
    if (t && skills.length < 15 && !skills.some((s) => s.name.toLowerCase() === t.toLowerCase())) setSkills([...skills, { name: t, level: "Intermediate" }]);
    setSkillText("");
    setError("");
  };

  async function connectGh() {
    setGhState({ state: "checking" });
    try {
      const response = await api.get<{ authorizeUrl: string; expiresIn: number }>("/api/integrations/github/authorize?return_to=onboarding", { fresh: true });
      if (response?.authorizeUrl) {
        window.location.href = response.authorizeUrl;
      } else {
        setGhState({ state: "error", message: "Invalid response from server." });
      }
    } catch (error) {
      console.error("GitHub connect error:", error);
      setGhState({ state: "error", message: "Could not connect to GitHub. Please try again." });
    }
  }

  function validate(): string {
    if (step === 0) {
      if (headline.trim().length < 3) return "Add a short headline, like \u201CFrontend developer learning APIs\u201D.";
      if (headline.length > 80) return "Keep the headline under 80 characters.";
      if (bio.length > 400) return "Keep your bio under 400 characters.";
      if (location.length > 60) return "Keep the location under 60 characters.";
    }
    if (step === 1 && goals.length === 0) return "Pick at least one goal.";
    if (step === 2 && interests.length === 0) return "Pick at least one interest.";
    if (step === 3 && skills.length === 0) return "Add at least one skill you already have.";
    return "";
  }

  function go(delta: number) {
    if (delta > 0) {
      const e = validate();
      setError(e);
      if (e) return;
    } else setError("");
    setDir(delta);
    setStep((s) => s + delta);
  }

  async function finish() {
    const e = validate();
    setError(e);
    if (e) return;
    const saved = await saveDevRecord({ goals, interests, skills, githubHandle: "", openToWork: open });
    if (!saved) return setError("Couldn't save your developer profile. Check your connection and try again.");
    const profile = await loadProfile(me);
    await saveProfile(me, { ...profile, headline: headline.trim(), location: location.trim(), bio: bio.trim(), github: "", skills: skills.map((s) => s.name).slice(0, 12) });
    setDone(true);
    setTimeout(() => router.push("/dashboard"), 1200);
  }

  const variants = {
    enter: (d: number) => ({ opacity: 0, x: d * dx }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: -d * dx }),
  };
  const last = step === STEPS.length - 1;

  if (done) {
    return (
      <div className="grid min-h-screen place-items-center px-5">
        <m.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }} className="text-center">
          <m.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
            className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check size={30} strokeWidth={2.5} /></m.span>
          <h1 className="mt-6 text-2xl font-semibold">You&apos;re all set, {me.name.split(" ")[0]}.</h1>
          <p className="mt-2 text-slate-600">Opening your dashboard…</p>
        </m.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60">
      <header className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Nuvora home">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white"><Layers size={17} strokeWidth={2.4} /></span>
            <span className="text-lg font-bold tracking-tight">Nuvora</span>
          </Link>
          <button onClick={() => { signOut(); router.push("/"); }} className="text-sm font-medium text-slate-500 hover:text-slate-900">Log out</button>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-2xl px-5 py-10">
        <p className="text-sm font-medium text-slate-500">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label="Onboarding progress">
          <m.div className="h-full rounded-full bg-brand-600" animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} transition={{ duration: 0.5, ease: EASE }} />
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <m.div key={step} custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25, ease: EASE }}>
              {step === 0 && (
                <div className="space-y-5">
                  <div>
                    <h1 className="text-2xl font-semibold">Tell us about you</h1>
                    <p className="mt-1.5 text-slate-600">This shapes your profile. You can change it any time.</p>
                  </div>
                  <Field id="headline" label="Headline" error={error && step === 0 && headline.trim().length < 3 ? error : undefined}>
                    <input id="headline" autoFocus value={headline} maxLength={80} onChange={(e) => { setHeadline(e.target.value); setError(""); }}
                      placeholder="Frontend developer learning APIs" className={inputCls(false)} />
                  </Field>
                  <Field id="location" label="Location (optional)">
                    <input id="location" value={location} maxLength={60} onChange={(e) => setLocation(e.target.value)} placeholder="Lagos, Nigeria" className={inputCls(false)} />
                  </Field>
                  <Field id="bio" label="Short bio (optional)">
                    <textarea id="bio" rows={3} value={bio} maxLength={400} onChange={(e) => setBio(e.target.value)} placeholder="What do you build, and what are you learning?" className={`${inputCls(false)} resize-none`} />
                  </Field>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <h1 className="text-2xl font-semibold">What are you aiming for?</h1>
                    <p className="mt-1.5 text-slate-600">Pick your goals. They guide what we suggest next.</p>
                  </div>
                  <ChipPicker options={GOALS} value={goals} onChange={(v) => { setGoals(v); setError(""); }} max={6} label="Goals" />
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div>
                    <h1 className="text-2xl font-semibold">What do you enjoy building?</h1>
                    <p className="mt-1.5 text-slate-600">Interests help match you with work you&apos;ll care about.</p>
                  </div>
                  <ChipPicker options={INTERESTS} value={interests} onChange={(v) => { setInterests(v); setError(""); }} max={8} label="Interests" />
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div>
                    <h1 className="text-2xl font-semibold">What can you do today?</h1>
                    <p className="mt-1.5 text-slate-600">Be honest. These start as self-declared, and your evidence will confirm or upgrade them later.</p>
                  </div>
                  <div className="flex flex-wrap gap-2" aria-label="Suggested skills">
                    {SKILL_IDEAS.filter((s) => !skills.some((k) => k.name === s)).map((s) => (
                      <button key={s} type="button" onClick={() => addSkill(s)} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-700"><Plus size={13} /> {s}</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={skillText} onChange={(e) => setSkillText(e.target.value)} aria-label="Add a skill" placeholder="Add another skill"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(skillText); } }} className={inputCls(false)} />
                    <button type="button" onClick={() => addSkill(skillText)} disabled={!skillText.trim()} aria-label="Add skill"
                      className="grid w-12 shrink-0 place-items-center rounded-xl bg-slate-900 text-white transition-colors hover:bg-brand-600 disabled:opacity-40"><Plus size={18} /></button>
                  </div>
                  {skills.length > 0 && (
                    <ul className="space-y-2">
                      {skills.map((s) => (
                        <li key={s.name} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-3">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                          <div role="radiogroup" aria-label={`${s.name} level`} className="flex gap-1">
                            {LEVELS.map((l) => (
                              <button key={l} type="button" role="radio" aria-checked={s.level === l} onClick={() => setSkills(skills.map((k) => (k.name === s.name ? { ...k, level: l } : k)))}
                                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${s.level === l ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{l}</button>
                            ))}
                          </div>
                          <button type="button" onClick={() => setSkills(skills.filter((k) => k.name !== s.name))} aria-label={`Remove ${s.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X size={15} /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {step === 4 && (
                <div className="space-y-5">
                  <div>
                    <h1 className="text-2xl font-semibold">Connect GitHub</h1>
                    <p className="mt-1.5 text-slate-600">Optional. Read-only. Your repositories become a source of evidence, and Nuvora never writes to them.</p>
                  </div>
                  <button type="button" onClick={connectGh} disabled={ghState.state === "checking"}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
                    {ghState.state === "checking" ? <Loader2 size={16} className="animate-spin" /> : <GitHubMark />} {ghState.state === "checking" ? "Connecting..." : ghState.state === "ok" ? "Reconnect GitHub" : "Connect with GitHub"}
                  </button>
                  {ghState.state === "ok" && <p role="status" className="text-sm text-emerald-700">{ghState.message}</p>}
                  {ghState.state === "error" && <p role="alert" className="flex items-center gap-1.5 text-sm text-rose-600"><AlertCircle size={14} /> {ghState.message}</p>}
                  <p className="text-sm text-slate-500">You&apos;ll be redirected to GitHub to authorize access. Nuvora only reads your repositories and never writes to them.</p>

                  <div className="flex items-start gap-4 rounded-2xl border border-slate-200 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">Let employers find me</p>
                      <p className="mt-1 text-sm text-slate-600">Off by default. When on, employers can see your skills and only the evidence you&apos;ve made public. You can change this any time.</p>
                    </div>
                    <Switch on={open} onChange={() => setOpen((o) => !o)} label="Let employers find me" />
                  </div>
                </div>
              )}
            </m.div>
          </AnimatePresence>

          {error && !(step === 0 && headline.trim().length < 3) && (
            <p role="alert" className="mt-5 flex items-center gap-1.5 text-sm text-rose-600"><AlertCircle size={14} className="shrink-0" /> {error}</p>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            {step > 0 ? (
              <button type="button" onClick={() => go(-1)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"><ArrowLeft size={16} /> Back</button>
            ) : <span />}
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-slate-500 sm:block">GitHub is optional</span>
              {last ? (
                <m.button type="button" onClick={finish} whileTap={{ scale: 0.98 }}
                  className="group inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700">
                  Finish setup <Check size={16} />
                </m.button>
              ) : (
                <m.button type="button" onClick={() => go(1)} whileTap={{ scale: 0.98 }}
                  className="group inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600">
                  Continue <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </m.button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
