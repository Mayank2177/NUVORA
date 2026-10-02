"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Bot, Check, FlaskConical, GitBranch, GitCommit, GitPullRequest, Loader2, RefreshCw, Code2, ArrowRight } from "lucide-react";
import { useSession } from "@/lib/auth";
import { useProjects } from "@/lib/store";
import { PROV_STYLE, TYPE_ICON, useProjectData, type Evidence } from "@/lib/data";
import { api } from "@/lib/api-client";
import { ConnectGithubButton } from "@/components/connect-github-button";
import { GithubNotice } from "@/components/github-notice";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const BUILD_TYPES: Evidence["type"][] = ["Commit", "Pull request", "Test"];

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";

function rel(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-label="Loading build activity">
      <div className="h-10 w-48 rounded-xl bg-slate-200/60" />
      <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-slate-200/60" />)}</div>
      <div className="h-64 rounded-3xl bg-slate-200/60" />
    </div>
  );
}

export default function BuildPage() {
  const router = useRouter();
  const user = useSession();
  const { projects, active, ready, update } = useProjects();
  const { data, addEvidence, refresh } = useProjectData(active);

  const [repoInput, setRepoInput] = useState("");
  const [repoError, setRepoError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [flash, setFlash] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState<"passing" | "failing">("passing");

  useEffect(() => {
    if (ready && projects.length === 0) router.replace("/new");
  }, [ready, projects.length, router]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const activity = useMemo(
    () => (data?.evidence ?? []).filter((e) => BUILD_TYPES.includes(e.type)).sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    [data],
  );

  if (!ready || !active || !data) return <Skeleton />;

  const count = (t: Evidence["type"]) => activity.filter((e) => e.type === t).length;
  const commits = count("Commit");
  const prs = count("Pull request");
  const tests = count("Test");
  const aiShare = activity.length ? Math.round((activity.filter((e) => e.provenance === "AI-assisted").length / activity.length) * 100) : 0;
  const openBlockers = data.blockers.filter((b) => b.status === "open").length;

  const exit = [
    { ok: commits >= 3, text: "At least 3 commits", hint: `${commits} so far` },
    { ok: prs >= 1, text: "A pull request merged", hint: `${prs} so far` },
    { ok: tests >= 1, text: "Test results recorded", hint: `${tests} so far` },
    { ok: openBlockers === 0, text: "No open blockers", hint: openBlockers ? `${openBlockers} open` : "All clear" },
  ];
  const done = exit.filter((x) => x.ok).length;

  // Last 14 days of build activity
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const n = activity.filter((e) => new Date(e.date).toDateString() === d.toDateString()).length;
    return { label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), n };
  });
  const heat = ["bg-slate-100", "bg-brand-200", "bg-brand-500", "bg-brand-700"];

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    const v = repoInput.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
    if (!REPO_RE.test(v)) return setRepoError("Use the format owner/repository, like ada/eduboost-ai.");
    try {
      await update(active!.id, { repo: v });
      setRepoInput("");
      setRepoError("");
      setFlash(`Connected ${v}. Press Sync to import activity.`);
    } catch (error) {
      console.error("Failed to update repository", error);
      setRepoError("Failed to connect repository. Please try again.");
    }
  }

    async function sync() {
    if (!active?.repo) return;
    setSyncing(true);
    try {
      const result = await api.github.sync(active.id, active.repo);
      setSyncing(false);
      setFlash(result.inserted > 0
        ? `Imported ${result.inserted} new commit${result.inserted > 1 ? "s" : ""}.`
        : "Already up to date.");
      await refresh();
    } catch (error) {
      setSyncing(false);
      if (!user?.githubConnected) {
        setFlash("GitHub not connected.");
      } else {
        setFlash("Failed to sync commits. Please try again.");
      }
      console.error("GitHub sync error:", error);
    }
  }

  function logTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testText.trim()) return;
    addEvidence({
      type: "Test", text: `${testText.trim()} (${testResult})`, source: active?.repo ?? "Added manually",
      provenance: "Human", stage: active!.stage, public: false,
    });
    setTestText("");
    setFlash("Test run saved as evidence.");
  }

  const shown = showAll ? activity : activity.slice(0, 8);

  return (
    <div className="space-y-6">
      <GithubNotice />

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
        className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Build</h1>
          <p className="mt-2 max-w-xl text-slate-600">Commits, pull requests and tests from {active.name}. Each one becomes evidence, tagged with who made it.</p>
        </div>
        {active.repo && (
          <button onClick={sync} disabled={syncing}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-colors hover:bg-brand-600 disabled:opacity-60">
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : "Sync from GitHub"}
          </button>
        )}
      </motion.div>

      {/* Repo connection */}
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06, duration: 0.5, ease: EASE }}
        className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        {!user?.githubConnected && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">Connect GitHub to sync commits</p>
            <p className="mt-1 text-sm text-amber-700">Authorize Nuvora to read your repository activity (read-only access).</p>
            <div className="mt-3">
              <ConnectGithubButton />
            </div>
          </div>
        )}
        {active.repo ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white"><GitBranch size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm font-semibold">{active.repo}</p>
              <p className="text-xs text-slate-500">Connected · read-only. Nuvora never writes to your repository.</p>
            </div>
            <button onClick={() => void update(active.id, { repo: null })} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-rose-600">Disconnect</button>
          </div>
        ) : (
          <form onSubmit={connect} noValidate>
            <h2 className="font-semibold">Connect a GitHub repository</h2>
            <p className="mt-1 text-sm text-slate-600">Read-only. Commits and pull requests will appear here and in your evidence timeline.</p>
            <div className="mt-4 flex gap-2">
              <input value={repoInput} onChange={(e) => { setRepoInput(e.target.value); setRepoError(""); }} placeholder="owner/repository" aria-label="Repository"
                aria-invalid={!!repoError} className={inputCls} />
              <button type="submit" disabled={!repoInput.trim()} className="shrink-0 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50">Connect</button>
            </div>
            {repoError && <p role="alert" className="mt-2 flex items-center gap-1.5 text-sm text-rose-600"><AlertCircle size={14} /> {repoError}</p>}
          </form>
        )}
      </motion.section>

      {/* Code workspace link */}
      <Link href="/build/workspace" className="group flex flex-wrap items-center gap-4 rounded-3xl bg-slate-900 p-6 text-white transition-colors hover:bg-slate-800">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><Code2 size={20} /></span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-semibold">Open the code workspace</p>
          <p className="text-sm text-slate-300">Write code, run tests and get AI help. Everything you do is saved as evidence.</p>
        </div>
        <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
      </Link>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Commits", n: `${commits}`, icon: GitCommit },
          { label: "Pull requests", n: `${prs}`, icon: GitPullRequest },
          { label: "Test runs", n: `${tests}`, icon: FlaskConical },
          { label: "AI-assisted", n: `${aiShare}%`, icon: Bot },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05, duration: 0.5, ease: EASE }}
            className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500"><p className="text-sm">{s.label}</p><s.icon size={16} /></div>
            <p className="mt-2 text-3xl font-semibold">{s.n}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Activity */}
        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Activity</h2>
            <Link href="/evidence" className="text-sm font-semibold text-brand-600 hover:underline">All evidence</Link>
          </div>

          <div className="mt-4" aria-label="Activity over the last 14 days">
            <div className="flex gap-1.5" role="img" aria-label={days.map((d) => `${d.label}: ${d.n}`).join(", ")}>
              {days.map((d, i) => (
                <motion.span key={d.label} title={`${d.label}: ${d.n} item${d.n === 1 ? "" : "s"}`}
                  initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + i * 0.03 }}
                  className={`h-7 flex-1 rounded-md ${heat[Math.min(d.n, 3)]}`} />
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Last 14 days</p>
          </div>

          {activity.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-8 text-center">
              <p className="font-semibold">No build activity yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">{active.repo ? "Press Sync from GitHub to import your commits and pull requests." : "Connect a repository above, or log a test run."}</p>
            </div>
          ) : (
            <ul className="mt-5 space-y-1">
              <AnimatePresence initial={false}>
                {shown.map((e) => {
                  const Icon = TYPE_ICON[e.type];
                  return (
                    <motion.li key={e.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}
                      className="flex gap-3 rounded-xl p-2.5 transition-colors hover:bg-slate-50">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Icon size={17} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <p className="break-words text-sm font-medium">{e.text}</p>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROV_STYLE[e.provenance]}`}>{e.provenance}</span>
                        </div>
                        <p className="text-xs text-slate-500">{e.type} · {rel(e.date)} · {e.source}</p>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
          {activity.length > 8 && (
            <button onClick={() => setShowAll((s) => !s)} className="mt-3 text-sm font-semibold text-brand-600 hover:underline">
              {showAll ? "Show less" : `Show all ${activity.length}`}
            </button>
          )}
        </section>

        <div className="space-y-6">
          {/* Exit condition */}
          <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Ready to move on?</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{done} of {exit.length}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">What a finished build usually has on record.</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={exit.length} aria-label="Build checklist progress">
              <motion.div className="h-full rounded-full bg-brand-600" initial={{ width: 0 }} animate={{ width: `${(done / exit.length) * 100}%` }} transition={{ duration: 0.8, ease: EASE }} />
            </div>
            <ul className="mt-4 space-y-2.5">
              {exit.map((x) => (
                <li key={x.text} className="flex items-center gap-3 text-sm">
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${x.ok ? "bg-emerald-500 text-white" : "border border-slate-300 text-transparent"}`}><Check size={12} strokeWidth={3} /></span>
                  <span className={x.ok ? "text-slate-700" : "text-slate-500"}>{x.text}</span>
                  <span className="ml-auto text-xs text-slate-400">{x.hint}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Log a test run */}
          <form onSubmit={logTest} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold"><FlaskConical size={18} className="text-brand-600" /> Log a test run</h2>
            <p className="mt-1 text-sm text-slate-500">Test results make your work verifiable.</p>
            <label htmlFor="test-text" className="sr-only">Test summary</label>
            <input id="test-text" value={testText} onChange={(e) => setTestText(e.target.value)} placeholder="24 unit tests for auth" maxLength={100} className={`${inputCls} mt-4`} />
            <div className="mt-3 flex items-center gap-2">
              <div role="radiogroup" aria-label="Result" className="flex gap-2">
                {(["passing", "failing"] as const).map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={testResult === r} onClick={() => setTestResult(r)}
                    className={`rounded-full border px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${
                      testResult === r ? (r === "passing" ? "border-emerald-600 bg-emerald-600 text-white" : "border-rose-600 bg-rose-600 text-white") : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}>{r}</button>
                ))}
              </div>
              <button type="submit" disabled={!testText.trim()} className="ml-auto rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-40">Save</button>
            </div>
          </form>
        </div>
      </div>

      <AnimatePresence>
        {(flash || syncing) && (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-2xl">
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} className="text-emerald-400" />}
            {syncing ? "Reading repository activity…" : flash}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
