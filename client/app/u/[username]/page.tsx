import type { Metadata } from "next";
import PublicProfilePage from "@/components/public-profile-page";
import { getPublicProfileByUsername, getPublicProfileProjects } from "@/lib/server-session";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const profile = await getPublicProfileByUsername(username);
  const title = profile ? `${profile.name} (@${username}) · Nuvora` : `${username} · Nuvora profile`;
  const description = profile?.headline || `Public developer profile and project evidence for ${username}.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
  };
}

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getPublicProfileByUsername(username);
  const projects = profile ? await getPublicProfileProjects(username, profile.hidden) : [];
  return <PublicProfilePage username={username} profile={profile} projects={projects} />;
}
