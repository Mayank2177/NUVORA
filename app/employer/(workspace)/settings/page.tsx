"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Download, Eye, EyeOff, Loader2, LogOut, Trash2 } from "lucide-react";
import { AuthError, changePassword, hasPassword, signOut, updateProfile, useSession } from "@/lib/auth";
import { deleteEmployerAccount, downloadText, exportEmployerData } from "@/lib/account";
import { loadTasks, saveEmployerRecord, saveTasks, useEmployerRecord } from "@/lib/market";
import { isHttpUrl } from "@/lib/profile";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INDUSTRIES = ["Logistics", "Retail and e-commerce", "Education", "Health", "Finance", "Media", "Agriculture", "Manufacturing", "Non-profit", "Other"];
const SIZES = ["Just me", "2 to 10", "11 to 50", "51 to 200", "200+"];

const inputCls = (invalid = false) =>
  `w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-4 disabled:bg-slate-50 disabled:text-slate-500 ${
    invalid ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-slate-200 hover:border-slate-300 focus:border-brand-500 focus:ring-brand-100"
  }`;

function Card({ title, hint, children, danger = false }: { title: string; hint: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className={`rounded-3xl border bg-white p-6 shadow-sm ${danger ? "border-rose-100" : "border-slate-100"}`}>
      <h2 className={`font-semibold ${danger ? "text-rose-700" : ""}`}>{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{hint}</p>
      <div className="mt-5">{children}</div>
    </motion.section>
  );
}
const Err = ({ id, msg }: { id?: string; msg: string }) => (
  <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm text-rose-600"><AlertCircle size={14} className="shrink-0" /> {msg}</p>
);
const label = "mb-1.5 block text-sm font-medium text-slate-700";

export default function EmployerSettingsPage() {
  const router = useRouter();
  const user = useSession();
  const rec = useEmployerRecord(user?.id);

  const [co, setCo] = useState<{ company: string; website: string; industry: string; teamSize: string } | null>(null);
  const [coErr, setCoErr] = useState<{ company?: string; website?: string }>({});
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [acctErr, setAcctErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [typed, setTyped] = useState("");
  const [flash, setFlash] = useState("");

  if (!user || !rec) return <div className="h-64 animate-pulse rounded-3xl bg-slate-200/60" role="status" aria-label="Loading settings" />;

  const toast = (m: string) => { setFlash(m); setTimeout(() => setFlash(""), 2600); };
  const c = co ?? { company: rec.company, website: rec.website, industry: rec.industry, teamSize: rec.teamSize };
  const coDirty = c.company.trim() !== rec.company || c.website.trim() !== rec.website || c.industry !== rec.industry || c.teamSize !== rec.teamSize;
  const passwordAccount = hasPassword(user.id);
  const nameVal = name ?? user.name;
  const emailVal = email ?? user.email;
  const acctDirty = nameVal.trim() !== user.name || emailVal.trim().toLowerCase() !== user.email;

  function saveCompany(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof coErr = {};
    if (c.company.trim().length < 2) errs.company = "Enter your company name.";
    if (c.website.trim() && !isHttpUrl(c.website.trim())) errs.website = "Start the link with https://";
    setCoErr(errs);
    if (Object.keys(errs).length) return;
    const company = c.company.trim();
    saveEmployerRecord({ ...rec!, company, website: c.website.trim(), industry: c.industry, teamSize: c.teamSize });
    if (company !== rec!.company) saveTasks(loadTasks().map((t) => (t.employerId === user!.id ? { ...t, company } : t)));
    setCo(null);
    toast("Company details saved.");
  }

  async function saveAccount(e: React.FormEvent) {
    e.preventDefault();
    if (nameVal.trim().length < 2) return setAcctErr("Enter your full name.");
    if (passwordAccount && !EMAIL_RE.test(emailVal)) return setAcctErr("Enter a valid email address.");
    setSaving(true);
    setAcctErr("");
    try {
      await updateProfile({ name: nameVal.trim(), email: emailVal.trim() });
      setName(null);
      setEmail(null);
      toast("Account updated.");
    } catch (err) {
      setAcctErr(err instanceof AuthError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pw.current) return setPwErr("Enter your current password.");
    if (pw.next.length < 8) return setPwErr("Use at least 8 characters for the new password.");
    if (pw.next === pw.current) return setPwErr("Choose a password different from the current one.");
    if (pw.confirm !== pw.next) return setPwErr("The new passwords don't match.");
    setPwSaving(true);
    setPwErr("");
    try {
      await changePassword({ current: pw.current, next: pw.next });
      setPw({ current: "", next: "", confirm: "" });
      toast("Password changed.");
    } catch (err) {
      setPwErr(err instanceof AuthError ? err.message : "Something went wrong. Try again.");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="mt-2 text-slate-600">{rec.company} · {user.email}</p>
      </motion.div>

      <Card title="Company" hint="Developers see this on your tasks.">
        <form onSubmit={saveCompany} noValidate className="space-y-4">
          <div>
            <label htmlFor="co-name" className={label}>Company name</label>
            <input id="co-name" value={c.company} maxLength={60} onChange={(e) => { setCo({ ...c, company: e.target.value }); setCoErr({}); }} aria-invalid={!!coErr.company} className={inputCls(!!coErr.company)} />
            {coErr.company && <Err msg={coErr.company} />}
          </div>
          <div>
            <label htmlFor="co-web" className={label}>Website (optional)</label>
            <input id="co-web" inputMode="url" value={c.website} onChange={(e) => { setCo({ ...c, website: e.target.value }); setCoErr({}); }} aria-invalid={!!coErr.website} className={inputCls(!!coErr.website)} />
            {coErr.website && <Err msg={coErr.website} />}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="co-ind" className={label}>Industry</label>
              <select id="co-ind" value={INDUSTRIES.includes(c.industry) ? c.industry : "Other"} onChange={(e) => setCo({ ...c, industry: e.target.value })} className={inputCls()}>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}</select>
            </div>
            <div>
              <label htmlFor="co-size" className={label}>Team size</label>
              <select id="co-size" value={c.teamSize} onChange={(e) => setCo({ ...c, teamSize: e.target.value })} className={inputCls()}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select>
            </div>
          </div>
          <button type="submit" disabled={!coDirty} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700 disabled:opacity-50 disabled:shadow-none">Save company</button>
        </form>
      </Card>

      <Card title="Account" hint="Your name and sign-in email.">
        <form onSubmit={saveAccount} noValidate className="space-y-4">
          {acctErr && <Err msg={acctErr} />}
          <div>
            <label htmlFor="a-name" className={label}>Full name</label>
            <input id="a-name" value={nameVal} autoComplete="name" onChange={(e) => { setName(e.target.value); setAcctErr(""); }} className={inputCls()} />
          </div>
          <div>
            <label htmlFor="a-email" className={label}>Email</label>
            <input id="a-email" type="email" value={emailVal} disabled={!passwordAccount} autoComplete="email" onChange={(e) => { setEmail(e.target.value); setAcctErr(""); }} className={inputCls()} />
            {!passwordAccount && <p className="mt-1.5 text-xs text-slate-500">This account has no password, so the email can&apos;t be changed.</p>}
          </div>
          <button type="submit" disabled={!acctDirty || saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {saving && <Loader2 size={16} className="animate-spin" />} Save account
          </button>
        </form>
      </Card>

      {passwordAccount && (
        <Card title="Password" hint="Use at least 8 characters.">
          <form onSubmit={savePassword} noValidate className="space-y-4">
            {pwErr && <Err msg={pwErr} />}
            {([["current", "Current password", "current-password"], ["next", "New password", "new-password"], ["confirm", "Confirm new password", "new-password"]] as const).map(([k, l, ac]) => (
              <div key={k}>
                <label htmlFor={`pw-${k}`} className={label}>{l}</label>
                <div className="relative">
                  <input id={`pw-${k}`} type={showPw ? "text" : "password"} autoComplete={ac} value={pw[k]} onChange={(e) => { setPw({ ...pw, [k]: e.target.value }); setPwErr(""); }} className={`${inputCls()} pr-12`} />
                  {k === "current" && (
                    <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide passwords" : "Show passwords"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-slate-800">{showPw ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                  )}
                </div>
              </div>
            ))}
            <button type="submit" disabled={pwSaving} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">{pwSaving && <Loader2 size={16} className="animate-spin" />} Change password</button>
          </form>
        </Card>
      )}

      <Card title="Your data" hint="Everything you've added lives in this browser. Download a copy any time.">
        <div className="flex flex-wrap gap-3">
          <button onClick={() => { downloadText(`nuvora-employer-export-${new Date().toISOString().slice(0, 10)}.json`, exportEmployerData(user)); toast("Export downloaded."); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"><Download size={16} /> Export my data</button>
          <button onClick={() => { signOut(); router.push("/"); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"><LogOut size={16} /> Log out</button>
        </div>
      </Card>

      <Card danger title="Delete account" hint="Permanently removes your company, tasks, invitations and review history from this browser. Developers you've already verified keep their verification and the evidence it created. This can't be undone.">
        <AnimatePresence mode="wait" initial={false}>
          {confirmDel ? (
            <motion.div key="c" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              <label htmlFor="del" className={label}>Type <span className="font-mono font-semibold">DELETE</span> to confirm</label>
              <input id="del" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={inputCls()} />
              <div className="flex items-center gap-2">
                <button onClick={() => { deleteEmployerAccount(user); router.replace("/"); }} disabled={typed !== "DELETE"} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"><Trash2 size={16} /> Delete everything</button>
                <button onClick={() => { setConfirmDel(false); setTyped(""); }} className="px-3 py-2.5 text-sm font-medium text-slate-600">Cancel</button>
              </div>
            </motion.div>
          ) : (
            <motion.button key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"><Trash2 size={16} /> Delete my account</motion.button>
          )}
        </AnimatePresence>
      </Card>

      <AnimatePresence>
        {flash && (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-2xl">
            <Check size={16} className="text-emerald-400" /> {flash}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}