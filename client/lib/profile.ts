"use client";

import { api, ApiError } from "@/lib/api";
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
export type FieldErrors = Partial<Record<"username" | "headline" | "bio" | "location" | "website" | "github" | "linkedin" | "skills" | "hidden", string>>;

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
async function ownerOfUsername(username: string, currentUserId: string): Promise<string | null> {
  try {
    // Try to fetch the profile by username
    const profile = await api.get(`/api/users/username/${username}/detailed-profile`);
    const data = profile as Profile;
    return data.userId === currentUserId ? null : data.userId;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function usernameError(username: string, uid: string): Promise<string> {
  if (username.length < 3) return "Use 3 or more characters.";
  if (!SLUG_RE.test(username)) return "Use lowercase letters, numbers and single hyphens.";
  const owner = await ownerOfUsername(username, uid);
  return owner && owner !== uid ? "That username is taken. Try another." : "";
}

export function defaultProfile(user: AuthUser): Profile {
  const base = slugify(user.name) || "user";
  const username = base.length >= 3 ? base : `${base}-user`;
  const now = new Date().toISOString();
  return {
    userId: user.id, username, headline: "", bio: "", location: "", website: "", github: "", linkedin: "",
    skills: [], hidden: [], isPublic: false, joinedAt: now, updatedAt: now,
  };
}

export async function loadProfile(user: AuthUser): Promise<Profile> {
  try {
    const response = await api.get(`/api/users/${user.id}/detailed-profile`);
    const profile = response as Partial<Profile>;
    return {
      ...defaultProfile(user),
      ...profile,
      skills: Array.isArray(profile.skills) ? profile.skills : [],
      hidden: Array.isArray(profile.hidden) ? profile.hidden : [],
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return defaultProfile(user);
    throw error;
  }
}

export async function getPublicProfile(username: string): Promise<PublicProfile | null> {
  try {
    const response = await api.get(`/api/users/username/${username}/detailed-profile`);
    const profile = response as Profile;
    // Add name from the user data (backend should include it)
    return { ...profile, name: username } as PublicProfile;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Saves the profile via API. */
export async function saveProfile(user: AuthUser, p: Profile): Promise<Profile> {
  try {
    const response = await api.put(`/api/users/${user.id}/detailed-profile`, {
      username: p.username,
      headline: p.headline,
      bio: p.bio,
      location: p.location,
      website: p.website,
      github: p.github,
      linkedin: p.linkedin,
      skills: p.skills,
      hidden: p.hidden,
      isPublic: p.isPublic,
    });
    return response as Profile;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Failed to save profile");
  }
}

export async function setProfileVisibility(user: AuthUser, isPublic: boolean): Promise<Profile> {
  return await api.put<Profile>(`/api/users/${user.id}/detailed-profile`, { isPublic });
}

export async function validateProfile(p: Profile): Promise<FieldErrors> {
  const e: FieldErrors = {};
  const u = await usernameError(p.username, p.userId);
  if (u) e.username = u;
  if (p.username.length > 39) e.username = "Use 39 characters or fewer.";
  if (p.headline.length > 80) e.headline = "Keep it under 80 characters.";
  if (p.bio.length > 400) e.bio = "Keep it under 400 characters.";
  if (p.location.length > 60) e.location = "Keep it under 60 characters.";
  if (p.skills.length > 30) e.skills = "Remove skills until 30 or fewer remain.";
  if (p.hidden.length > 100) e.hidden = "A profile can hide at most 100 projects.";
  if (p.website && !isHttpUrl(p.website)) e.website = "Start the link with https://";
  if (p.website && (() => { try { const u = new URL(p.website); return !!u.username || !!u.password; } catch { return false; } })()) e.website = "Remove embedded credentials from this URL.";
  if (p.linkedin.length > 500) e.linkedin = "Keep the link under 500 characters.";
  if (p.github && !HANDLE_RE.test(p.github)) e.github = "Enter just your GitHub username.";
  if (p.linkedin && !isHttpUrl(p.linkedin)) e.linkedin = "Paste the full LinkedIn link, starting with https://";
  if (p.linkedin && (() => { try { const u = new URL(p.linkedin); return !!u.username || !!u.password; } catch { return false; } })()) e.linkedin = "Remove embedded credentials from this URL.";
  return e;
}

/** Live read of a user's published projects. Public pages show them without needing a login. */
export async function collectProjects(projects: Project[], hidden: string[] = [], includeHidden = false): Promise<ProfileProject[]> {
  const out = await Promise.all(projects.map(async (project) => {
    const slug = await getPublishedSlug(project.id);
    const snap = slug ? await getSnapshot(slug) : null;
    if (!slug || !snap) return null;
    const isHidden = hidden.includes(project.id);
    if (isHidden && !includeHidden) return null;
    return { id: project.id, slug, snap, hidden: isHidden };
  }));
  return out.filter((p): p is ProfileProject => p !== null)
    .sort((a, b) => +new Date(b.snap.publishedAt) - +new Date(a.snap.publishedAt));
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
