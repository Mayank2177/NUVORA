"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);

  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-50/60">
      <Sidebar mobileOpen={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-100 bg-white/80 px-4 backdrop-blur-xl lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 hover:bg-slate-100">
            <Menu size={22} />
          </button>
          <Link href="/" className="flex items-center gap-2" aria-label="Nuvora home">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
              <Layers size={15} strokeWidth={2.4} />
            </span>
            <span className="font-bold tracking-tight">Nuvora</span>
          </Link>
          <span className="w-10" />
        </header>
        <main id="main" className={`mx-auto px-5 py-8 sm:px-8 sm:py-10 ${pathname.startsWith("/build/workspace") ? "max-w-[1400px]" : "max-w-5xl"}`}>
          <Suspense fallback={<div className="animate-pulse space-y-5" role="status" aria-label="Loading content"><div className="h-8 w-48 rounded-lg bg-slate-200" /><div className="h-64 rounded-2xl bg-slate-100" /></div>}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
