import Link from "next/link";
import { Layers } from "lucide-react";

export const CONTACT_EMAIL = "support@nuvora.dev";

export type LegalSection = { id: string; title: string; body: React.ReactNode };

export function LegalLayout({
  title, intro, updated, sections, other,
}: {
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
  other: { label: string; href: string };
}) {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Nuvora home">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/30">
              <Layers size={17} strokeWidth={2.4} />
            </span>
            <span className="text-lg font-bold tracking-tight">Nuvora</span>
          </Link>
          <nav aria-label="Account" className="flex items-center gap-2 text-sm font-medium">
            <Link href="/login" className="rounded-full px-4 py-2 text-slate-600 transition-colors hover:text-slate-900">Log in</Link>
            <Link href="/signup" className="rounded-full bg-slate-900 px-5 py-2 font-semibold text-white transition-colors hover:bg-brand-600">Start a project</Link>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-semibold sm:text-5xl">{title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">{intro}</p>
          <p className="mt-3 text-sm text-slate-500">Last updated {updated}</p>
        </div>

        <div className="mt-14 grid gap-12 lg:grid-cols-[220px_1fr]">
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-24">
              <p className="mb-3 text-sm font-semibold">On this page</p>
              <ul className="space-y-2 border-l border-slate-100 text-sm">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-0.5 pl-4 text-slate-500 transition-colors hover:border-brand-500 hover:text-slate-900">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <article className="max-w-2xl space-y-12">
            {sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
                <h2 id={`${s.id}-h`} className="text-xl font-semibold">{s.title}</h2>
                <div className="leading-relaxed text-slate-700 [&_a]:font-medium [&_a]:text-brand-600 [&_a:hover]:underline [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-slate-900 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
                  {s.body}
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>

      <footer className="border-t border-slate-100">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} Nuvora</p>
          <ul className="flex gap-6">
            <li><Link href={other.href} className="hover:text-slate-900">{other.label}</Link></li>
            <li><Link href="/" className="hover:text-slate-900">Back to home</Link></li>
          </ul>
        </div>
      </footer>
    </div>
  );
}