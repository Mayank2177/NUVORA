"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Download, Eye, EyeOff, Loader2, LogOut, Trash2 } from "lucide-react";
import { AuthError, changePassword, hasPassword, signOut, updateProfile, useSession } from "@/lib/auth";
import { deleteAccount, downloadText, exportAccountData } from "@/lib/account";
import { useProjects } from "@/lib/store";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const inputCls = (invalid = false) =>
  `w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-4 disabled:bg-slate-50 disabled:text-slate-500 ${
    invalid ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-slate-200 hover:border-slate-300 focus:border-brand-500 focus:ring-brand-100"
  }`;

function Card({ title, hint, children, danger = false }: { title: string; hint: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className={`rounded-3xl border bg-white p-6 shadow-sm ${danger ? "border-rose-100" : "border-slate-100"}`}>
      <h2 className={`font-semibold ${danger ? "text-rose-700" : ""}`}>{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{hint}</p>
      <div className="mt-5">{children}</div>
    </motion.section>
  );
}

function Err({ id, msg }: { id?: string; msg: string }) {
  return <p id={id} role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm text-rose-600"><AlertCircle size={14} className="shrink-0" /> {msg}</p>;
}

export default function SettingsPage() {
  const router = useRouter();
  const user = useSession();
  const { projects } = useProjects();

  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<{ name?: string; email?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [pwErr, setPwErr] = useState<{ current?: string; next?: string; confirm?: string; form?: string }>({});
  const [pwSaving, setPwSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const [flash, setFlash] = useState("");

  if (!user) return <div className="h-64 animate-pulse rounded-3xl bg-slate-200/60" role="status" aria-label="Loading settings" />;

  const passwordAccount = hasPassword(user.id);
  const nameVal = name ?? user.name;
  const emailVal = email ?? user.email;
  const dirty = nameVal.trim() !== user.name || emailVal.trim().toLowerCase() !== user.email;
  const initials = user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  function toast(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(""), 2600);
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof profileErr = {};
    if (nameVal.trim().length < 2) errs.name = "Enter your full name.";
    if (passwordAccount && !EMAIL_RE.test(emailVal)) errs.email = "Enter a valid email address.";
    setProfileErr(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await updateProfile({ name: nameVal.trim(), email: emailVal.trim() });
      setName(null);
      setEmail(null);
      toast("Profile updated.");
    } catch (err) {
      setProfileErr({ form: err instanceof AuthError ? err.message : "Something went wrong. Try again." });
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof pwErr = {};
    if (!pw.current) errs.current = "Enter your current password.";
    if (pw.next.length < 8) errs.next = "Use at least 8 characters.";
    else if (pw.next === pw.current) errs.next = "Choose a password different from the current one.";
    if (pw.confirm !== pw.next) errs.confirm = "The passwords don't match.";
    setPwErr(errs);
    if (Object.keys(errs).length) return;
    setPwSaving(true);
    try {
      await changePassword({ current: pw.current, next: pw.next });
      setPw({ current: "", next: "", confirm: "" });
      toast("Password changed.");
    } catch (err) {
      setPwErr({ form: err instanceof AuthError ? err.message : "Something went wrong. Try again." });
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="flex flex-wrap items-center gap-5">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-slate-900 text-xl font-semibold text-white" aria-hidden>{initials}</span>
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="mt-1 truncate text-slate-600">{user.name} · {user.email}</p>
          <p className="mt-1 text-xs text-slate-500">
            Signed in with {passwordAccount ? "email" : "GitHub"} · {projects.length} project{projects.length === 1 ? "" : "s"}
          </p>
        </div>
      </motion.div>

      <Card title="Profile" hint="How you appear in Nuvora and on pages you publish.">
        <form onSubmit={saveProfile} noValidate className="space-y-4">
          {profileErr.form && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={16} className="mt-0.5 shrink-0" /> {profileErr.form}</p>}
          <div>
            <label htmlFor="s-name" className="mb-1.5 block text-sm font-medium text-slate-700">Full name</label>
            <input id="s-name" value={nameVal} autoComplete="name" onChange={(e) => { setName(e.target.value); setProfileErr({}); }}
              aria-invalid={!!profileErr.name} aria-describedby={profileErr.name ? "s-name-err" : undefined} className={inputCls(!!profileErr.name)} />
            {profileErr.name && <Err id="s-name-err" msg={profileErr.name} />}
          </div>
          <div>
            <label htmlFor="s-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <input id="s-email" type="email" value={emailVal} autoComplete="email" disabled={!passwordAccount} onChange={(e) => { setEmail(e.target.value); setProfileErr({}); }}
              aria-invalid={!!profileErr.email} aria-describedby={profileErr.email ? "s-email-err" : undefined} className={inputCls(!!profileErr.email)} />
            {!passwordAccount && <p className="mt-1.5 text-xs text-slate-500">Your email is managed by GitHub.</p>}
            {profileErr.email && <Err id="s-email-err" msg={profileErr.email} />}
          </div>
          <button type="submit" disabled={!dirty || saving}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:shadow-none">
            {saving && <Loader2 size={16} className="animate-spin" />} Save changes
          </button>
        </form>
      </Card>

      <Card title="Password" hint={passwordAccount ? "Use at least 8 characters." : "You sign in with GitHub, so there is no password to manage."}>
        {passwordAccount ? (
          <form onSubmit={savePassword} noValidate className="space-y-4">
            {pwErr.form && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle size={16} className="mt-0.5 shrink-0" /> {pwErr.form}</p>}
            {([["current", "Current password", "current-password"], ["next", "New password", "new-password"], ["confirm", "Confirm new password", "new-password"]] as const).map(([k, label, ac]) => (
              <div key={k}>
                <label htmlFor={`pw-${k}`} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
                <div className="relative">
                  <input id={`pw-${k}`} type={showPw ? "text" : "password"} autoComplete={ac} value={pw[k]}
                    onChange={(e) => { setPw((p) => ({ ...p, [k]: e.target.value })); setPwErr({}); }}
                    aria-invalid={!!pwErr[k]} aria-describedby={pwErr[k] ? `pw-${k}-err` : undefined} className={`${inputCls(!!pwErr[k])} pr-12`} />
                  {k === "current" && (
                    <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide passwords" : "Show passwords"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-slate-800">
                      {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  )}
                </div>
                {pwErr[k] && <Err id={`pw-${k}-err`} msg={pwErr[k]!} />}
              </div>
            ))}
            <button type="submit" disabled={pwSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60">
              {pwSaving && <Loader2 size={16} className="animate-spin" />} Change password
            </button>
          </form>
        ) : null}
      </Card>

      <Card title="Your data" hint="Everything you've added lives in this browser. Download a copy any time.">
        <div className="flex flex-wrap gap-3">
          <button onClick={() => { downloadText(`nuvora-export-${new Date().toISOString().slice(0, 10)}.json`, exportAccountData(user)); toast("Export downloaded."); }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50">
            <Download size={16} /> Export my data
          </button>
          <button onClick={() => { signOut(); router.push("/"); }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50">
            <LogOut size={16} /> Log out
          </button>
        </div>
      </Card>

      <Card danger title="Delete account" hint="Permanently removes your account, projects, evidence and published pages from this browser. This can't be undone.">
        <AnimatePresence mode="wait" initial={false}>
          {confirmDelete ? (
            <motion.div key="c" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              <label htmlFor="del" className="block text-sm font-medium text-slate-700">Type <span className="font-mono font-semibold">DELETE</span> to confirm</label>
              <input id="del" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={inputCls()} />
              <div className="flex items-center gap-2">
                <button onClick={() => { deleteAccount(user); router.replace("/"); }} disabled={typed !== "DELETE"}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-40">
                  <Trash2 size={16} /> Delete everything
                </button>
                <button onClick={() => { setConfirmDelete(false); setTyped(""); }} className="px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900">Cancel</button>
              </div>
            </motion.div>
          ) : (
            <motion.button key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50">
              <Trash2 size={16} /> Delete my account
            </motion.button>
          )}
        </AnimatePresence>
      </Card>

      <AnimatePresence>
        {flash && (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-2xl">
            <Check size={16} className="text-emerald-400" /> {flash}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}