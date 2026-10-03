"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Layers, UserX } from "lucide-react";
import { collectProjects, getPublicProfile, type ProfileProject, type PublicProfile } from "@/lib/profile";
import { ProfileView } from "@/components/profile-view";

type Loaded = { profile: PublicProfile; projects: ProfileProject[] } | null;

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [data, setData] = useState<Loaded | undefined>(undefined); // undefined = loading

  useEffect(() => {
    const profile = getPublicProfile(username);
    setData(profile ? { profile, projects: collectProjects(profile.userId, profile.hidden) } : null);
  }, [username]);

  return (
    <div className="min-h-screen bg-slate-50/60">
      <header className="border-b border-slate-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Nuvora home">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white"><Layers size={17} strokeWidth={2.4} /></span>
            <span className="text-lg font-bold tracking-tight">Nuvora</span>
          </Link>
          <Link href="/signup" className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600">Start a project</Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl pb-16 sm:px-5 sm:pt-6">
        {data === undefined && <div className="mx-auto mt-24 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" role="status" aria-label="Loading" />}

        {data === null && (
          <div className="mx-5 mt-16 rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <UserX className="mx-auto text-slate-400" size={36} />
            <h1 className="mt-4 text-xl font-semibold">This profile isn&apos;t available</h1>
            <p className="mx-auto mt-2 max-w-sm text-slate-600">It may be private, or the link may be mistyped. In this demo, profiles are only visible in the browser that created them.</p>
            <Link href="/" className="mt-6 inline-flex items-center gap-2 font-semibold text-brand-600 hover:underline">Go to Nuvora <ArrowRight size={15} /></Link>
          </div>
        )}

        {data && <ProfileView profile={data.profile} projects={data.projects} />}
      </main>
    </div>
  );
}