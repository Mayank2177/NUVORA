"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Layers, Loader2, LogOut, Plus } from "lucide-react";
import { signOut, useSession } from "@/lib/auth";
import { useEmployerRecord } from "@/lib/market";

const NAV = [
  { label: "Dashboard", href: "/employer", exact: true },
  { label: "New need", href: "/employer/needs/new", exact: false },
  { label: "Settings", href: "/employer/settings", exact: false },
];

export function EmployerShell({ children }: { children: React.ReactNode }) {
  const user = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const rec = useEmployerRecord(user?.id);

  useEffect(() => {
    if (user === null) router.replace("/login");
    else if (user && user.role !== "employer") router.replace("/dashboard");
    else if (user && rec === null) router.replace("/employer/onboarding");
  }, [user, rec, router]);

  if (!user || user.role !== "employer" || !rec) {
    return <div className="grid min-h-screen place-items-center text-slate-500" role="status"><Loader2 className="animate-spin" aria-label="Loading" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50/60">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-5">
          <Link href="/employer" className="flex items-center gap-2.5" aria-label="Nuvora employer dashboard">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/30"><Layers size={17} strokeWidth={2.4} /></span>
            <span className="hidden text-lg font-bold tracking-tight sm:block">Nuvora</span>
          </Link>
          <nav aria-label="Employer" className="flex flex-1 items-center gap-1">
            {NAV.map((n) => {
              const on = n.exact ? pathname === n.href : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className="relative rounded-full px-4 py-2 text-sm font-medium">
                  {on && <motion.span layoutId="emp-nav" className="absolute inset-0 rounded-full bg-brand-50" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  <span className={`relative ${on ? "text-brand-700" : "text-slate-600 hover:text-slate-900"}`}>{n.label}</span>
                </Link>
              );
            })}
          </nav>
          <Link href="/employer/needs/new" className="hidden items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 sm:inline-flex"><Plus size={15} /> Describe a need</Link>
          <div className="hidden min-w-0 text-right md:block">
            <p className="truncate text-sm font-semibold">{rec.company}</p>
            <p className="truncate text-xs text-slate-500">{user.name}</p>
          </div>
          <button onClick={() => { signOut(); router.push("/"); }} aria-label="Log out" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><LogOut size={18} /></button>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-5 py-10">{children}</main>
    </div>
  );
}