import type { Metadata } from "next";
import PublicProjectPage from "@/components/public-project-page";
import { getPublicSnapshot } from "@/lib/server-session";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await getPublicSnapshot(slug);
  const title = snapshot?.name ?? `Project ${slug}`;
  const description = snapshot?.goal || "A published project story with evidence showing how the work was made.";
  return { title, description, openGraph: { title, description, type: "article" } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicProjectPage snap={await getPublicSnapshot(slug)} />;
}
