"use client";

import { SLUG_RE, getPublishedSlug, getSnapshot, slugify, type Snapshot } from "@/lib/publish";
import type { Project } from "@/lib/store";
import type { AuthUser } from "@/lib/auth";

export type Profile = {
  userId: string;
  username: string;
  headline: string;
  bio: string;
  location: string;
  website: string;
  github: string; // handle only
  linkedin: string; // full URL
  skills: string[];
  hidden: string[]; // project ids kept off the profile
  isPublic: boolean;
  joinedAt: string;
  updatedAt: string;
};
export type PublicProfile = Profile & { name: string };
export type ProfileProject = { id: string; slug: string; snap: Snapshot; hidden: boolean };
export type FieldErrors = Partial<Record<"username" | "headline" | "bio" | "location" | "website" | "github" | "linkedin", string>>;

const pKey = (uid: string) => `nuvora:profile:${uid}`;
const pubKey = (username: string) => `nuvora:profile-public:${username}`;

function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const isHttpUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};
export const githubUrl = (handle: string) => `https://github.com/${handle}`;
const HANDLE_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** Who owns this username right now, or null if it's free. */
function ownerOfUsername(username: string): string | null {
  const pub = get<PublicProfile>(pubKey(username));
  if (pub) return pub.userId;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("nuvora:profile:")) {
      const p = get<Profile>(k);
      if (p?.username === username) return p.userId;
    }
  }
  return null;
}

export function usernameError(username: string, uid: string): string {
  if (username.length < 3) return "Use 3 or more characters.";
  if (!SLUG_RE.test(username)) return "Use lowercase letters, numbers and single hyphens.";
  const owner = ownerOfUsername(username);
  return owner && owner !== uid ? "That username is taken. Try another." : "";
}

export function defaultProfile(user: AuthUser): Profile {
  const base = slugify(user.name) || "user";
  let username = base.length >= 3 ? base : `${base}-user`;
  for (let n = 2; usernameError(username, user.id); n++) username = `${base}-${n}`;
  const now = new Date().toISOString();
  return {
    userId: user.id, username, headline: "", bio: "", location: "", website: "", github: "", linkedin: "",
    skills: [], hidden: [], isPublic: false, joinedAt: now, updatedAt: now,
  };
}

export const loadProfile = (user: AuthUser): Profile => get<Profile>(pKey(user.id)) ?? defaultProfile(user);

export function getPublicProfile(username: string): PublicProfile | null {
  return get<PublicProfile>(pubKey(username));
}

/** Saves the private copy, and keeps the public copy in sync (or removes it). */
export function saveProfile(user: AuthUser, p: Profile): Profile {
  const prev = get<Profile>(pKey(user.id));
  const next: Profile = { ...p, updatedAt: new Date().toISOString() };
  localStorage.setItem(pKey(user.id), JSON.stringify(next));
  if (prev && prev.username !== next.username) localStorage.removeItem(pubKey(prev.username));
  if (next.isPublic) localStorage.setItem(pubKey(next.username), JSON.stringify({ ...next, name: user.name }));
  else localStorage.removeItem(pubKey(next.username));
  return next;
}

export function validateProfile(p: Profile): FieldErrors {
  const e: FieldErrors = {};
  const u = usernameError(p.username, p.userId);
  if (u) e.username = u;
  if (p.headline.length > 80) e.headline = "Keep it under 80 characters.";
  if (p.bio.length > 400) e.bio = "Keep it under 400 characters.";
  if (p.location.length > 60) e.location = "Keep it under 60 characters.";
  if (p.website && !isHttpUrl(p.website)) e.website = "Start the link with https://";
  if (p.github && !HANDLE_RE.test(p.github)) e.github = "Enter just your GitHub username.";
  if (p.linkedin && !isHttpUrl(p.linkedin)) e.linkedin = "Paste the full LinkedIn link, starting with https://";
  return e;
}

/** Live read of a user's published projects. Public pages show them without needing a login. */
export function collectProjects(userId: string, hidden: string[] = [], includeHidden = false): ProfileProject[] {
  const projects = get<Project[]>(`nuvora:projects:${userId}`) ?? [];
  const out: ProfileProject[] = [];
  for (const p of projects) {
    const slug = getPublishedSlug(p.id);
    const snap = slug ? getSnapshot(slug) : null;
    if (!slug || !snap) continue;
    const isHidden = hidden.includes(p.id);
    if (isHidden && !includeHidden) continue;
    out.push({ id: p.id, slug, snap, hidden: isHidden });
  }
  return out.sort((a, b) => +new Date(b.snap.publishedAt) - +new Date(a.snap.publishedAt));
}

export function profileStats(list: ProfileProject[]) {
  const ev = list.flatMap((p) => p.snap.evidence);
  const human = ev.filter((e) => e.provenance === "Human").length;
  return {
    projects: list.length,
    evidence: ev.length,
    humanPct: ev.length ? Math.round((human / ev.length) * 100) : 0,
    blockers: list.reduce((n, p) => n + p.snap.blockers.length, 0),
  };
}