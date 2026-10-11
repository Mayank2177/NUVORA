"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Layers, Loader2, Plus } from "lucide-react";
import { signOut, useSession } from "@/lib/auth";
import { loadEmployerRecord, saveEmployerRecord } from "@/lib/market";
import { isHttpUrl } from "@/lib/profile";
import { Field, inputCls } from "@/components/auth-ui";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const STEPS = ["Company", "Team", "Technical needs"];
const INDUSTRIES = ["Logistics", "Retail and e-commerce", "Education", "Health", "Finance", "Media", "Agriculture", "Manufacturing", "Non-profit", "Other"];
const SIZES = ["Just me", "2 to 10", "11 to 50", "51 to 200", "200+"];
const NEEDS = ["Web performance", "Internal tools", "Integrations", "Websites", "Mobile apps", "Data and reporting", "Automation", "Bug fixes", "Security"];

export default function EmployerOnboardingPage() {
  const router = useRouter();
  const user = useSession();
  const reduce = useReducedMotion();
  const dx = reduce ? 0 : 24;

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [other, setOther] = useState("");
  const [size, setSize] = useState("");
  const [needs, setNeeds] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (user === null) router.replace("/login");
    else if (user && user.role !== "employer") router.replace("/dashboard");
    else if (user && !done && loadEmployerRecord(user.id)) router.replace("/employer");
  }, [user, done, router]);

  if (!user || user.role !== "employer") {
    return <div className="grid min-h-screen place-items-center text-slate-500" role="status"><Loader2 className="animate-spin" aria-label="Loading" /></div>;
  }
  const me = user;

  const industryValue = industry === "Other" ? other.trim() : industry;
  const extra = needs.filter((n) => !NEEDS.includes(n));
  const toggleNeed = (n: string) => { setNeeds((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length < 6 ? [...p, n] : p)); setError(""); };
  const addCustom = () => {
    const t = custom.trim().slice(0, 40);
    if (t && needs.length < 6 && !needs.some((n) => n.toLowerCase() === t.toLowerCase())) setNeeds([...needs, t]);
    setCustom("");
  };

  function validate(): string {
    if (step === 0) {
      if (company.trim().length < 2) return "Enter your company name.";
      if (website.trim() && !isHttpUrl(website.trim())) return "Start the website link with https://";
      if (!industry) return "Pick an industry.";
      if (industry === "Other" && other.trim().length < 2) return "Tell us your industry.";
    }
    if (step === 1 && !size) return "Pick your team size.";
    if (step === 2 && needs.length === 0) return "Pick at least one kind of technical work you need.";
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

  function finish() {
    const e = validate();
    setError(e);
    if (e) return;
    saveEmployerRecord({ userId: me.id, company: company.trim(), industry: industryValue, teamSize: size, website: website.trim(), needs, completedAt: new Date().toISOString() });
    setDone(true);
    setTimeout(() => router.push("/employer"), 1200);
  }

  const variants = { enter: (d: number) => ({ opacity: 0, x: d * dx }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: -d * dx }) };

  if (done) {
    return (
      <div className="grid min-h-screen place-items-center px-5">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }} className="text-center">
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }} className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check size={30} strokeWidth={2.5} /></motion.span>
          <h1 className="mt-6 text-2xl font-semibold">{company.trim()} is ready.</h1>
          <p className="mt-2 text-slate-600">Opening your employer dashboard…</p>
        </motion.div>
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
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label="Setup progress">
          <motion.div className="h-full rounded-full bg-brand-600" animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} transition={{ duration: 0.5, ease: EASE }} />
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div key={step} custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25, ease: EASE }}>
              {step === 0 && (
                <div className="space-y-5">
                  <div><h1 className="text-2xl font-semibold">Tell us about your company</h1><p className="mt-1.5 text-slate-600">Developers see this when they review your tasks.</p></div>
                  <Field id="company" label="Company name"><input id="company" autoFocus value={company} maxLength={60} onChange={(e) => { setCompany(e.target.value); setError(""); }} placeholder="Acme Logistics" className={inputCls(false)} /></Field>
                  <Field id="website" label="Website (optional)"><input id="website" inputMode="url" value={website} onChange={(e) => { setWebsite(e.target.value); setError(""); }} placeholder="https://example.com" className={inputCls(false)} /></Field>
                  <Field id="industry" label="Industry">
                    <select id="industry" value={industry} onChange={(e) => { setIndustry(e.target.value); setError(""); }} className={inputCls(false)}>
                      <option value="">Choose one</option>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                    </select>
                  </Field>
                  {industry === "Other" && <Field id="other" label="Your industry"><input id="other" value={other} maxLength={40} onChange={(e) => { setOther(e.target.value); setError(""); }} className={inputCls(false)} /></Field>}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  <div><h1 className="text-2xl font-semibold">How big is your team?</h1><p className="mt-1.5 text-slate-600">It helps developers understand who they&apos;ll work with.</p></div>
                  <div role="radiogroup" aria-label="Team size" className="grid gap-2 sm:grid-cols-2">
                    {SIZES.map((s) => (
                      <button key={s} type="button" role="radio" aria-checked={size === s} onClick={() => { setSize(s); setError(""); }}
                        className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${size === s ? "border-brand-500 bg-brand-50/60 ring-4 ring-brand-50" : "border-slate-200 hover:border-slate-300"}`}>{s}</button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div><h1 className="text-2xl font-semibold">What technical work do you need?</h1><p className="mt-1.5 text-slate-600">Pick the kinds of problems you expect to have. You&apos;ll describe real ones next.</p></div>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Technical needs">
                    {[...NEEDS, ...extra].map((n) => {
                      const on = needs.includes(n);
                      return (
                        <button key={n} type="button" aria-pressed={on} onClick={() => toggleNeed(n)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>{on && <Check size={14} />} {n}</button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <input value={custom} aria-label="Add your own" placeholder="Add your own" onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} className={inputCls(false)} />
                    <button type="button" onClick={addCustom} disabled={!custom.trim()} aria-label="Add" className="grid w-12 shrink-0 place-items-center rounded-xl bg-slate-900 text-white hover:bg-brand-600 disabled:opacity-40"><Plus size={18} /></button>
                  </div>
                  <p className="text-xs text-slate-500">{needs.length} of 6 selected</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {error && <p role="alert" className="mt-5 flex items-center gap-1.5 text-sm text-rose-600"><AlertCircle size={14} className="shrink-0" /> {error}</p>}

          <div className="mt-8 flex items-center justify-between gap-3">
            {step > 0 ? <button type="button" onClick={() => go(-1)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"><ArrowLeft size={16} /> Back</button> : <span />}
            {step === STEPS.length - 1 ? (
              <motion.button type="button" onClick={finish} whileTap={{ scale: 0.98 }} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700">Finish setup <Check size={16} /></motion.button>
            ) : (
              <motion.button type="button" onClick={() => go(1)} whileTap={{ scale: 0.98 }} className="group inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600">Continue <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></motion.button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}