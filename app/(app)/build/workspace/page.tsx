"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Editor, { type OnMount } from "@monaco-editor/react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Bot, Check, GitCommit, Lightbulb, Loader2, Play, RotateCcw, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { useProjects } from "@/lib/store";
import { useProjectData } from "@/lib/data";
import { CHALLENGES, askAI, bundle, loadWs, runCode, saveWs, type RunResult, type WsState } from "@/lib/workspace";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

type Msg = { id: string; role: "user" | "ai"; text: string; patch?: { file: string; code: string }; applied?: boolean };

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";

export default function WorkspacePage() {
  const router = useRouter();
  const { projects, active, ready } = useProjects();
  const { addEvidence } = useProjectData(active);
  const pid = active?.id;

  const [ws, setWs] = useState<WsState | null>(null);
  const [file, setFile] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [hintIdx, setHintIdx] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState(false);
  const [cpMsg, setCpMsg] = useState("");
  const [flash, setFlash] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const loggedPass = useRef("");
  const runRef = useRef<() => void>(() => {});
  const chatEnd = useRef<HTMLDivElement>(null);

  const challenge = CHALLENGES.find((c) => c.id === ws?.challengeId) ?? CHALLENGES[0];
  const files = ws?.code[challenge.id] ?? challenge.files;

  useEffect(() => {
    if (ready && projects.length === 0) router.replace("/new");
  }, [ready, projects.length, router]);

  useEffect(() => {
    if (pid) setWs(loadWs(pid));
  }, [pid]);

  useEffect(() => {
    if (pid && ws) saveWs(pid, ws);
  }, [pid, ws]);

  useEffect(() => {
    setFile(Object.keys(challenge.files)[0]);
    setResult(null);
    setMsgs([]);
    setHintIdx(0);
    setConfirmReset(false);
    loggedPass.current = "";
  }, [challenge.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 3000);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
  chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}, [msgs, thinking]);

  if (!ready || !active || !ws) {
    return (
      <div className="animate-pulse space-y-4" role="status" aria-label="Loading workspace">
        <div className="h-10 w-64 rounded-xl bg-slate-200/60" />
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]"><div className="h-[520px] rounded-3xl bg-slate-200/60" /><div className="h-[520px] rounded-3xl bg-slate-200/60" /></div>
      </div>
    );
  }
  const project = active;
  const state = ws;

  const setCode = (name: string, value: string) =>
    setWs((w) => w && { ...w, code: { ...w.code, [w.challengeId]: { ...(w.code[w.challengeId] ?? challenge.files), [name]: value } } });

  async function run() {
    if (running) return;
    setRunning(true);
    const code = bundle(files);
    const r = await runCode(code);
    setResult(r);
    setRunning(false);
    const total = r.results.length;
    const passed = r.results.filter((x) => x.ok).length;
    if (!r.fatal && total > 0 && passed === total && loggedPass.current !== code) {
      loggedPass.current = code;
      addEvidence({
        type: "Test", text: `${challenge.title}: ${passed}/${total} tests passing`, source: "Nuvora workspace",
        provenance: state.aiUsed.includes(challenge.id) ? "AI-assisted" : "Human", stage: project.stage, public: false,
      });
      setFlash("All tests pass. Saved to your evidence.");
    }
  }
  runRef.current = () => void run();

  const onMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
  };

  async function ask(text: string) {
    const q = text.trim();
    if (!q || thinking) return;
    setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "user", text: q }]);
    setPrompt("");
    setThinking(true);
    const failing = result?.results.filter((r) => !r.ok).map((r) => r.name) ?? [];
    const reply = await askAI(q, { challenge, failing, hintIndex: hintIdx });
    if (reply.hint) setHintIdx((i) => i + 1);
    setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "ai", text: reply.text, patch: reply.patch }]);
    setThinking(false);
  }

  function apply(m: Msg) {
    if (!m.patch || m.applied) return;
    setCode(m.patch.file, m.patch.code);
    setFile(m.patch.file);
    setWs((w) => w && { ...w, aiDirty: true, aiUsed: w.aiUsed.includes(w.challengeId) ? w.aiUsed : [...w.aiUsed, w.challengeId] });
    setMsgs((all) => all.map((x) => (x.id === m.id ? { ...x, applied: true } : x)));
    addEvidence({
      type: "AI session", text: `Applied an AI suggestion to ${m.patch.file} (${challenge.title})`, source: "Nuvora assistant",
      provenance: "AI-assisted", stage: project.stage, public: false,
    });
    setFlash("Applied. Logged as AI-assisted evidence.");
  }

  function checkpoint(e: React.FormEvent) {
    e.preventDefault();
    const ai = state.aiDirty;
    addEvidence({
      type: "Commit", text: cpMsg.trim() || `Checkpoint: ${challenge.title}`, source: "Nuvora workspace",
      provenance: ai ? "AI-assisted" : "Human", stage: project.stage, public: false,
    });
    setWs((w) => w && { ...w, aiDirty: false });
    setCpMsg("");
    setFlash(`Checkpoint saved as ${ai ? "AI-assisted" : "human"} evidence.`);
  }

  function reset() {
    setWs((w) => {
      if (!w) return w;
      const code = { ...w.code };
      delete code[w.challengeId];
      return { ...w, code, aiUsed: w.aiUsed.filter((i) => i !== w.challengeId) };
    });
    setFile(Object.keys(challenge.files)[0]);
    setResult(null);
    setConfirmReset(false);
    loggedPass.current = "";
  }

  const passed = result?.results.filter((r) => r.ok).length ?? 0;
  const total = result?.results.length ?? 0;
  const actions = [
    { label: "Give me a hint", icon: Lightbulb, q: "hint" },
    { label: "Explain failing tests", icon: Bot, q: "explain why tests fail" },
    { label: "Show a solution", icon: Sparkles, q: "show a solution" },
  ];

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/build" className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={14} /> Build activity</Link>
          <h1 className="text-3xl font-semibold">Code workspace</h1>
          <p className="mt-1 max-w-xl text-slate-600">Write code, run tests and get help. Your checkpoints, test results and AI use are saved to your evidence automatically.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="challenge" className="sr-only">Challenge</label>
          <select id="challenge" value={challenge.id} onChange={(e) => setWs((w) => w && { ...w, challengeId: e.target.value })} className={`${inputCls} !w-auto`}>
            {CHALLENGES.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <button onClick={run} disabled={running} className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700 disabled:opacity-60">
            {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Run tests
          </button>
        </div>
      </motion.div>

      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700"><span className="font-semibold">Challenge: </span>{challenge.brief}</p>

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm" aria-label="Code editor">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 pr-3">
              <div role="tablist" aria-label="Files" className="flex overflow-x-auto">
                {Object.keys(files).map((f) => (
                  <button key={f} role="tab" aria-selected={f === file} onClick={() => setFile(f)}
                    className={`whitespace-nowrap border-b-2 px-4 py-3 font-mono text-xs transition-colors ${f === file ? "border-brand-600 bg-white text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                    {f}
                  </button>
                ))}
              </div>
              {confirmReset ? (
                <span className="flex shrink-0 items-center gap-1 text-xs">
                  <button onClick={reset} className="rounded-lg bg-rose-600 px-2.5 py-1.5 font-semibold text-white hover:bg-rose-700">Reset code</button>
                  <button onClick={() => setConfirmReset(false)} aria-label="Cancel reset" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200"><X size={14} /></button>
                </span>
              ) : (
                <button onClick={() => setConfirmReset(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-200 hover:text-slate-800"><RotateCcw size={13} /> Reset</button>
              )}
            </div>
            <div className="h-[420px]">
              <Editor
                height="100%" theme="vs" language="javascript" path={`${challenge.id}/${file}`} value={files[file] ?? ""}
                onChange={(v) => setCode(file, v ?? "")} onMount={onMount}
                loading={<div className="grid h-full place-items-center text-slate-400"><Loader2 className="animate-spin" /></div>}
                options={{
                  minimap: { enabled: false }, fontSize: 13, tabSize: 2, scrollBeyondLastLine: false, automaticLayout: true,
                  padding: { top: 12 }, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                }}
              />
            </div>
            <form onSubmit={checkpoint} className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-3">
              <label htmlFor="cp" className="sr-only">Checkpoint message</label>
              <input id="cp" value={cpMsg} onChange={(e) => setCpMsg(e.target.value)} maxLength={100} placeholder={`Checkpoint: ${challenge.title}`} className={`${inputCls} min-w-[200px] flex-1`} />
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${state.aiDirty ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"}`}>
                {state.aiDirty ? "AI-assisted" : "Human"}
              </span>
              <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"><GitCommit size={15} /> Save checkpoint</button>
            </form>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm" aria-label="Test results" aria-live="polite">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Results</h2>
              {total > 0 && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${passed === total ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{passed} of {total} passing</span>}
            </div>
            {!result ? (
              <p className="mt-3 text-sm text-slate-500">Press <span className="font-medium text-slate-700">Run tests</span> or Ctrl/Cmd + Enter.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {result.fatal && <p role="alert" className="rounded-xl bg-rose-50 p-3 font-mono text-xs text-rose-700">{result.fatal}</p>}
                <ul className="space-y-1.5">
                  {result.results.map((r) => (
                    <li key={r.name} className="flex items-start gap-2.5 text-sm">
                      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${r.ok ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}>{r.ok ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}</span>
                      <span><span className="font-medium">{r.name}</span>{r.error && <span className="block font-mono text-xs text-rose-600">{r.error}</span>}</span>
                    </li>
                  ))}
                </ul>
                {result.logs.length > 0 && <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-xs leading-5 text-slate-100">{result.logs.join("\n")}</pre>}
                {total === 0 && !result.fatal && result.logs.length === 0 && <p className="text-sm text-slate-500">This code ran without output or tests.</p>}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col rounded-3xl border border-slate-100 bg-white shadow-sm" aria-label="AI assistant">
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <h2 className="flex items-center gap-2 font-semibold"><Bot size={18} className="text-brand-600" /> Assistant</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Demo</span>
          </div>
          <div className="flex flex-wrap gap-2 p-4 pb-0">
            {actions.map((a) => (
              <button key={a.label} onClick={() => ask(a.q)} disabled={thinking}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-700 disabled:opacity-50">
                <a.icon size={13} /> {a.label}
              </button>
            ))}
          </div>
          <div className="max-h-[380px] min-h-[200px] space-y-3 overflow-y-auto p-4" aria-live="polite">
            {msgs.length === 0 && <p className="text-sm text-slate-500">Stuck? Ask for a hint first. Working it out yourself makes the evidence worth more.</p>}
            <AnimatePresence initial={false}>
              {msgs.map((m) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}
                  className={m.role === "user" ? "ml-8 rounded-2xl rounded-br-md bg-slate-900 p-3 text-sm text-white" : "mr-4 rounded-2xl rounded-bl-md bg-slate-50 p-3 text-sm text-slate-800"}>
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  {m.patch && (
                    <div className="mt-3">
                      {m.applied ? (
                        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Check size={14} /> Applied to {m.patch.file}</p>
                      ) : (
                        <button onClick={() => apply(m)} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">Apply to {m.patch.file}</button>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {thinking && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Thinking…</p>}
            <div ref={chatEnd} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void ask(prompt); }} className="flex gap-2 border-t border-slate-100 p-3">
            <label htmlFor="ask" className="sr-only">Ask the assistant</label>
            <input id="ask" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask for help" className={inputCls} />
            <button type="submit" disabled={!prompt.trim() || thinking} aria-label="Send" className="grid w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-white transition-colors hover:bg-brand-600 disabled:opacity-40"><Send size={16} /></button>
          </form>
          <p className="flex gap-2 border-t border-slate-100 p-4 text-xs text-slate-500">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand-600" />
            Nothing is applied without your approval. Applied AI code is logged as AI-assisted evidence.
          </p>
        </aside>
      </div>

      <AnimatePresence>
        {flash && (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-2xl">
            <Check size={16} className="text-emerald-400" /> {flash}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}