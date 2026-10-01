"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle, Check, ChevronsUpDown, Hammer, Layers, LayoutDashboard, LayoutGrid, ListChecks,
  Lock, LogOut, PenTool, Plus, Rocket, Settings, ShieldCheck, X,
} from "lucide-react";
import { signOut, useSession } from "@/lib/auth";
import { useProjects } from "@/lib/store";

const NAV = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Tasks", href: "/tasks", icon: ListChecks },
  { label: "Design", href: "/design", icon: PenTool },
  { label: "Build", href: "/build", icon: Hammer },
  { label: "Blockers", href: "/blockers", icon: AlertTriangle },
  { label: "Evidence", href: "/evidence", icon: ShieldCheck },
  { label: "Publish", href: "/publish", icon: Rocket },
];

function Content({ id, onNavigate }: { id: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSession();
  const { projects, active, setActive } = useProjects();
  const [menu, setMenu] = useState(false);

  const initials = (user?.name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const newActive = pathname === "/new";
  const projectsActive = pathname.startsWith("/projects");

  return (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 px-6 py-5" aria-label="Nuvora home">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/30">
          <Layers size={17} strokeWidth={2.4} />
        </span>
        <span className="text-lg font-bold tracking-tight">Nuvora</span>
      </Link>

      {/* Project selector */}
      <div className="relative px-3">
        <button
          onClick={() => setMenu((o) => !o)} aria-haspopup="listbox" aria-expanded={menu}
          className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 text-left transition-colors hover:border-slate-300"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700">
            {active ? active.name[0].toUpperCase() : "?"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{active?.name ?? "No project yet"}</span>
            <span className="block truncate text-xs text-slate-500">{active ? `Stage: ${active.stage}` : "Create one to begin"}</span>
          </span>
          <ChevronsUpDown size={16} className="shrink-0 text-slate-400" />
        </button>

        <AnimatePresence>
          {menu && (
            <>
              <button aria-label="Close project menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />
              <motion.ul
                role="listbox" aria-label="Projects"
                initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-x-3 top-full z-20 mt-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
              >
                {projects.map((p) => (
                  <li key={p.id}>
                    <button
                      role="option" aria-selected={p.id === active?.id}
                      onClick={() => { setActive(p.id); setMenu(false); onNavigate?.(); }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="truncate">{p.name}</span>
                      {p.id === active?.id && <Check size={15} className="text-brand-600" />}
                    </button>
                  </li>
                ))}
                <li className={projects.length ? "mt-1 border-t border-slate-100 pt-1" : ""}>
                  <Link
                    href="/new" onClick={() => { setMenu(false); onNavigate?.(); }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50"
                  >
                    <Plus size={15} /> New project
                  </Link>
                </li>
                <li>
                  <Link
                    href="/projects" onClick={() => { setMenu(false); onNavigate?.(); }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <LayoutGrid size={15} /> Manage projects
                  </Link>
                </li>
              </motion.ul>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav aria-label="Project" className="mt-6 flex-1 space-y-1 overflow-y-auto px-3">
        <p className="px-3 pb-1 text-xs font-medium text-slate-400">Workspace</p>
        {NAV.map(({ label, href, icon: Icon }) => {
          if (!active) {
            return (
              <div key={href} aria-disabled="true" title="Create a project first"
                className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300">
                <Icon size={18} /> {label} <Lock size={13} className="ml-auto" />
              </div>
            );
          }
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} onClick={onNavigate} aria-current={isActive ? "page" : undefined}
              className="relative block rounded-xl px-3 py-2.5 text-sm font-medium">
              {isActive && (
                <motion.span layoutId={`nav-${id}`} className="absolute inset-0 rounded-xl bg-brand-50"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }} />
              )}
              <span className={`relative flex items-center gap-3 transition-colors ${isActive ? "text-brand-700" : "text-slate-600 hover:text-slate-900"}`}>
                <Icon size={18} /> {label}
              </span>
            </Link>
          );
        })}

        <Link href="/new" onClick={onNavigate} aria-current={newActive ? "page" : undefined}
          className={`mt-4 flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 text-sm font-medium transition-colors ${
            newActive ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"
          }`}>
          <Plus size={18} /> New project
        </Link>

        <Link href="/projects" onClick={onNavigate} aria-current={projectsActive ? "page" : undefined}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
            projectsActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:text-slate-900"
          }`}>
          <LayoutGrid size={18} /> All projects
        </Link>
      </nav>

      {/* User: the profile area opens Settings, logout stays a separate button */}
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-1">
          <Link
            href="/settings"
            onClick={onNavigate}
            aria-label="Open settings"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 transition-colors ${
              pathname.startsWith("/settings") ? "bg-brand-50" : "hover:bg-slate-50"
            }`}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white">{initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{user?.name}</span>
              <span className="block truncate text-xs text-slate-500">{user?.email}</span>
            </span>
            <Settings size={16} className="shrink-0 text-slate-400" />
          </Link>
          <button
            aria-label="Log out"
            onClick={() => { signOut(); router.push("/"); }}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onClose]);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-100 bg-white lg:block">
        <Content id="desktop" />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <div key="mobile" className="lg:hidden">
            <motion.div
              className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
            />
            <motion.aside
              role="dialog" aria-modal="true" aria-label="Navigation"
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl"
            >
              <button onClick={onClose} aria-label="Close navigation" className="absolute right-3 top-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X size={20} />
              </button>
              <Content id="mobile" onNavigate={onClose} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}