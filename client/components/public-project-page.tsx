import Link from "next/link";
import { ArrowRight, FileQuestion, Layers } from "lucide-react";
import type { Snapshot } from "@/lib/publish";
import { ProjectStory } from "@/components/project-story";

export default function PublicProjectPage({ snap }: { snap: Snapshot | null }) {
  return (
    <div className="min-h-screen bg-slate-50/60">
      <header className="border-b border-slate-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Nuvora home">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white"><Layers size={17} strokeWidth={2.4} /></span>
            <span className="text-lg font-bold tracking-tight">Nuvora</span>
          </Link>
          <Link href="/signup" className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600">Start a project</Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-0 py-0 sm:px-5 sm:py-10">
        {snap === null && (
          <div className="mx-6 mt-16 rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <FileQuestion className="mx-auto text-slate-400" size={36} />
            <h1 className="mt-4 text-xl font-semibold">This project page isn&apos;t available</h1>
            <p className="mx-auto mt-2 max-w-sm text-slate-600">It may be unpublished, or the link may be mistyped.</p>
            <Link href="/" className="mt-6 inline-flex items-center gap-2 font-semibold text-brand-600 hover:underline">Go to Nuvora <ArrowRight size={15} /></Link>
          </div>
        )}

        {snap && (
          <div className="overflow-hidden bg-white sm:rounded-3xl sm:border sm:border-slate-100 sm:shadow-xl sm:shadow-slate-900/5">
            <ProjectStory snap={snap} />
            <footer className="border-t border-slate-100 bg-slate-50 px-6 py-5 text-sm text-slate-500 sm:px-10">
              Published {new Date(snap.publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })} with{" "}
              <Link href="/" className="font-semibold text-brand-600 hover:underline">Nuvora</Link>. Every item shows who made it, including AI.
            </footer>
          </div>
        )}
      </main>
    </div>
  );
}
