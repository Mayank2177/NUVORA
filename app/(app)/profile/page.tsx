"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Copy, ExternalLink, EyeOff, Globe, Pencil, X } from "lucide-react";
import { useSession } from "@/lib/auth";
import { useProjects } from "@/lib/store";
import {
  collectProjects, loadProfile, saveProfile, usernameError, validateProfile,
  type FieldErrors, type Profile,
} from "@/lib/profile";
import { slugify } from "@/lib/publish";
import { ProfileView } from "@/components/profile-view";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const inputCls = (invalid = false) =>
  `w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-4 ${
    invalid ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : "border-slate-200 hover:border-slate-300 focus:border-brand-500 focus:ring-brand-100"
  }`;

function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onChange} type="button"
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-brand-600" : "bg-slate-300"}`}>
      <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }} className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${on ? "right-0.5" : "left-0.5"}`} />
    </button>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm text-rose-600"><AlertCircle size={14} className="shrink-0" /> {error}</p>}
    </div>
  );
}

function SkillsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, "").slice(0, 24);
    if (t && value.length < 12 && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setText("");
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
      <div className="flex flex-wrap gap-1.5">
        {value.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-brand-700">
            {k}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== k))} aria-label={`Remove ${k}`} className="rounded-full p-0.5 hover:bg-brand-100"><X size={12} /></button>
          </span>
        ))}
        <input id="skills" value={text} disabled={value.length >= 12} placeholder={value.length ? "" : "React, Python, UI design…"}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(text); }
            if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => add(text)}
          className="min-w-[120px] flex-1 px-2 py-1 text-sm outline-none placeholder:text-slate-400" />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const user = useSession();
  const { projects } = useProjects();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Profile | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    if (user) setProfile(loadProfile(user));
  }, [user]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const published = useMemo(() => (user && profile ? collectProjects(user.id, profile.hidden, true) : []), [user, profile, projects]);
  const visible = published.filter((p) => !p.hidden);

  if (!user || !profile) return <div className="h-96 animate-pulse rounded-3xl bg-slate-200/60" role="status" aria-label="Loading profile" />;

  const url = `${window.location.origin}/u/${profile.username}`;

  function openEditor() {
    setDraft(profile);
    setErrors({});
    setEditing(true);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !user) return;
    const errs = validateProfile(draft);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setProfile(saveProfile(user, draft));
    setEditing(false);
    setFlash("Profile saved.");
  }

  function togglePublic() {
    if (!user || !profile) return;
    if (!profile.isPublic) {
      const err = usernameError(profile.username, user.id);
      if (err) { openEditor(); setErrors({ username: err }); return; }
    }
    setProfile(saveProfile(user, { ...profile, isPublic: !profile.isPublic }));
    setFlash(profile.isPublic ? "Profile is now private." : "Profile is public.");
  }

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setDraft((d) => d && { ...d, [k]: v });
    setErrors((p) => ({ ...p, [k]: undefined }));
  };

  return (
    <div className="space-y-6">
      {/* Owner bar */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
        className="flex flex-wrap items-center gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${profile.isPublic ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
          {profile.isPublic ? <Globe size={18} /> : <EyeOff size={18} />}
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-semibold">{profile.isPublic ? "Your profile is public" : "Only you can see this profile"}</p>
          {profile.isPublic
            ? <p className="truncate font-mono text-xs text-slate-500">{url}</p>
            : <p className="text-sm text-slate-500">Turn it on to get a shareable link. It shows only your published projects.</p>}
        </div>
        {profile.isPublic && (
          <div className="flex gap-2">
            <button onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ } }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />} {copied ? "Copied" : "Copy link"}
            </button>
            <Link href={`/u/${profile.username}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              View <ExternalLink size={14} />
            </Link>
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <span className="text-sm text-slate-600">{profile.isPublic ? "Public" : "Private"}</span>
          <Switch on={profile.isPublic} onChange={togglePublic} label="Make profile public" />
        </div>
      </motion.div>

      {/* Editor */}
      <AnimatePresence>
        {editing && draft && (
          <motion.form onSubmit={save} noValidate initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
            <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Edit profile</h2>
                <button type="button" onClick={() => setEditing(false)} aria-label="Close editor" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field id="username" label="Username" error={errors.username} hint="Your link: /u/username">
                  <input id="username" value={draft.username} onChange={(e) => set("username", slugify(e.target.value))} maxLength={30} aria-invalid={!!errors.username} className={inputCls(!!errors.username)} />
                </Field>
                <Field id="location" label="Location" error={errors.location}>
                  <input id="location" value={draft.location} onChange={(e) => set("location", e.target.value)} placeholder="Lagos, Nigeria" className={inputCls(!!errors.location)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field id="headline" label="Headline" error={errors.headline} hint={`${draft.headline.length}/80`}>
                    <input id="headline" value={draft.headline} onChange={(e) => set("headline", e.target.value)} placeholder="Full-stack developer building learning tools" className={inputCls(!!errors.headline)} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field id="bio" label="Bio" error={errors.bio} hint={`${draft.bio.length}/400`}>
                    <textarea id="bio" rows={4} value={draft.bio} onChange={(e) => set("bio", e.target.value)} placeholder="What do you build, and what are you learning?" className={`${inputCls(!!errors.bio)} resize-none`} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field id="skills" label="Skills" hint="Press Enter or comma to add. Up to 12.">
                    <SkillsInput value={draft.skills} onChange={(v) => set("skills", v)} />
                  </Field>
                </div>
                <Field id="website" label="Website" error={errors.website}>
                  <input id="website" value={draft.website} onChange={(e) => set("website", e.target.value.trim())} placeholder="https://yoursite.dev" inputMode="url" aria-invalid={!!errors.website} className={inputCls(!!errors.website)} />
                </Field>
                <Field id="github" label="GitHub username" error={errors.github}>
                  <input id="github" value={draft.github} onChange={(e) => set("github", e.target.value.trim())} placeholder="ada" aria-invalid={!!errors.github} className={inputCls(!!errors.github)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field id="linkedin" label="LinkedIn link" error={errors.linkedin}>
                    <input id="linkedin" value={draft.linkedin} onChange={(e) => set("linkedin", e.target.value.trim())} placeholder="https://www.linkedin.com/in/…" inputMode="url" aria-invalid={!!errors.linkedin} className={inputCls(!!errors.linkedin)} />
                  </Field>
                </div>
              </div>

              <fieldset className="mt-6">
                <legend className="text-sm font-medium text-slate-700">Projects on your profile</legend>
                <p className="mt-0.5 text-xs text-slate-500">Only published projects can appear. Publish more from the Publish page.</p>
                {published.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">You haven&apos;t published a project yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {published.map((p) => {
                      const shown = !draft.hidden.includes(p.id);
                      return (
                        <li key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.snap.name}</span>
                          <span className="text-xs text-slate-500">{shown ? "Shown" : "Hidden"}</span>
                          <Switch on={shown} label={`Show ${p.snap.name} on profile`} onChange={() => set("hidden", shown ? [...draft.hidden, p.id] : draft.hidden.filter((h) => h !== p.id))} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </fieldset>

              <div className="mt-6 flex items-center gap-3">
                <button type="submit" className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700">Save profile</button>
                <button type="button" onClick={() => setEditing(false)} className="px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900">Cancel</button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <ProfileView
        owner
        profile={{ ...profile, name: user.name }}
        projects={visible}
        action={
          !editing && (
            <button onClick={openEditor} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-colors hover:bg-brand-600">
              <Pencil size={15} /> Edit profile
            </button>
          )
        }
      />

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



