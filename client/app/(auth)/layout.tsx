import Image from "next/image";
import Link from "next/link";
import { Layers, ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="flex w-fit items-center gap-2.5" aria-label="Nuvora home">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/30">
            <Layers size={17} strokeWidth={2.4} />
          </span>
          <span className="text-lg font-bold tracking-tight">Nuvora</span>
        </Link>
        <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          {children}
        </main>
        <p className="text-center text-xs text-slate-400">© {new Date().getFullYear()} Nuvora</p>
      </div>

      <aside className="relative hidden overflow-hidden lg:block" aria-hidden>
        <Image src="/images/marketing/team.webp" alt="" fill sizes="(min-width: 1024px) 50vw, 0px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/85 via-slate-900/20 to-slate-900/10" />
        <div className="absolute inset-x-10 bottom-10 space-y-6 text-white">
          <div className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md">
            <div className="flex items-center gap-2 text-sm font-medium text-white/80">
              <ShieldCheck size={16} /> Evidence you can trust
            </div>
            <p className="mt-2 font-medium leading-relaxed">
              Every commit, decision and screenshot is tagged with where it came from, so your project story is backed by proof.
            </p>
          </div>
          <p className="text-3xl font-semibold leading-tight">Learn it. Build it. Prove it. Keep the context.</p>
        </div>
      </aside>
    </div>
  );
}
