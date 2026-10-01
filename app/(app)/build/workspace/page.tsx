"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Editor, { type OnMount } from "@monaco-editor/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Bot, Check, ChevronDown, ChevronRight, FileCode, FileJson, FilePlus, FileText, Folder, FolderOpen,
  FolderPlus, GitCommit, Lightbulb, Loader2, PanelBottomClose, PanelBottomOpen, Pencil, Play, Send, ShieldCheck,
  Sparkles, Trash2, X,
} from "lucide-react";
import { useProjects } from "@/lib/store";
import { useProjectData } from "@/lib/data";
import {
  CHALLENGES, allFolders, askAI, baseOf, buildTree, createEntry, loadWs, parentOf, removeEntry, renameEntry,
  runProject, saveWs, type RunResult, type TreeNode, type WsState,
} from "@/lib/workspace";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const LANG: Record<string, string> = { js: "javascript", mjs: "javascript", json: "json", md: "markdown", html: "html", css: "css", ts: "typescript", txt: "plaintext" };
const langOf = (p: string) => LANG[p.split(".").pop()?.toLowerCase() ?? ""] ?? "plaintext";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";

type Msg = { id: string; role: "user" | "ai"; text: string; patch?: { path: string; code: string }; applied?: boolean };
type Creating = { parent: string; kind: "file" | "folder" } | null;

/* ---------- explorer ---------- */

function FileIcon({ name }: { name: string }) {
  if (/\.(m?js|ts)$/.test(name)) return <FileCode size={15} className="shrink-0 text-amber-500" />;
  if (name.endsWith(".json")) return <FileJson size={15} className="shrink-0 text-emerald-500" />;
  return <FileText size={15} className="shrink-0 text-slate-400" />;
}

function NameInput({ initial = "", depth, onSubmit, onCancel }: { initial?: string; depth: number; onSubmit: (name: string) => string | null; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const [err, setErr] = useState("");
  return (
    <li style={{ paddingLeft: 8 + depth * 14 }} className="py-0.5 pr-2">
      <input
        autoFocus aria-label="Name" aria-invalid={!!err} value={v}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => { setV(e.target.value); setErr(""); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { const m = onSubmit(v); if (m) setErr(m); }
          if (e.key === "Escape") onCancel();
        }}
        onBlur={() => { if (!err) onCancel(); }}
        className="w-full rounded-md border border-brand-500 bg-white px-2 py-1 font-mono text-xs outline-none ring-2 ring-brand-100"
      />
      {err && <p role="alert" className="mt-1 text-xs text-rose-600">{err}</p>}
    </li>
  );
}

type Ctx = {
  active: string; selected: string; expanded: Record<string, boolean>;
  creating: Creating; renaming: string | null; confirmDel: string | null;
  openFile: (p: string) => void; toggle: (p: string) => void; select: (p: string) => void;
  startRename: (p: string) => void; askDelete: (p: string | null) => void; doDelete: (p: string) => void;
  submitCreate: (parent: string, kind: "file" | "folder", name: string) => string | null;
  submitRename: (p: string, name: string) => string | null; cancel: () => void;
};

function TreeList({ nodes, parent, depth, c }: { nodes: TreeNode[]; parent: string; depth: number; c: Ctx }) {
  return (
    <ul>
      {c.creating && c.creating.parent === parent && (
        <NameInput depth={depth} onSubmit={(n) => c.submitCreate(parent, c.creating!.kind, n)} onCancel={c.cancel} />
      )}
      {nodes.map((n) => {
        const folder = n.type === "folder";
        const isOpen = folder && c.expanded[n.path];
        const pad = { paddingLeft: 8 + depth * 14 };

        if (c.renaming === n.path)
          return <NameInput key={n.path} initial={n.name} depth={depth} onSubmit={(v) => c.submitRename(n.path, v)} onCancel={c.cancel} />;

        if (c.confirmDel === n.path)
          return (
            <li key={n.path} style={pad} className="flex items-center gap-1.5 py-1 pr-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-rose-700">Delete {n.name}{folder ? " and its files" : ""}?</span>
              <button onClick={() => c.doDelete(n.path)} className="rounded bg-rose-600 px-2 py-0.5 font-semibold text-white hover:bg-rose-700">Yes</button>
              <button onClick={() => c.askDelete(null)} className="rounded px-2 py-0.5 text-slate-600 hover:bg-slate-100">No</button>
            </li>
          );

        return (
          <li key={n.path}>
            <div className={`group flex items-center rounded-md pr-1 ${c.active === n.path ? "bg-brand-50" : c.selected === n.path ? "bg-slate-100" : "hover:bg-slate-50"}`}>
              <button
                onClick={() => { c.select(n.path); folder ? c.toggle(n.path) : c.openFile(n.path); }}
                aria-expanded={folder ? !!isOpen : undefined} style={pad}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-[13px] text-slate-700"
              >
                {folder ? (
                  <>
                    {isOpen ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
                    {isOpen ? <FolderOpen size={15} className="shrink-0 text-brand-500" /> : <Folder size={15} className="shrink-0 text-brand-500" />}
                  </>
                ) : (
                  <><span className="w-3.5 shrink-0" /><FileIcon name={n.name} /></>
                )}
                <span className="truncate">{n.name}</span>
              </button>
              <span className="flex shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button onClick={() => c.startRename(n.path)} aria-label={`Rename ${n.name}`} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800"><Pencil size={13} /></button>
                <button onClick={() => c.askDelete(n.path)} aria-label={`Delete ${n.name}`} className="rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"><Trash2 size={13} /></button>
              </span>
            </div>
            {folder && isOpen && <TreeList nodes={n.children ?? []} parent={n.path} depth={depth + 1} c={c} />}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- page ---------- */

export default function WorkspacePage() {
  const router = useRouter();
  const { projects, active: project, ready } = useProjects();
  const { addEvidence } = useProjectData(project);
  const pid = project?.id;

  const [ws, setWs] = useState<WsState | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState<Creating>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [ranFile, setRanFile] = useState("");
  const [running, setRunning] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [hintIdx, setHintIdx] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState(false);
  const [cpMsg, setCpMsg] = useState("");
  const [flash, setFlash] = useState("");
  const loggedPass = useRef("");
  const runRef = useRef<() => void>(() => {});
  const saveRef = useRef<() => void>(() => {});
  const chatEnd = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => (ws ? buildTree(ws) : []), [ws]);

  useEffect(() => {
    if (ready && projects.length === 0) router.replace("/new");
  }, [ready, projects.length, router]);

  useEffect(() => {
    if (!pid) return;
    const s = loadWs(pid);
    setWs(s);
    setExpanded(Object.fromEntries([...allFolders(s)].map((f) => [f, true])));
    setSelected(s.active);
  }, [pid]);

  useEffect(() => {
    if (!pid || !ws) return;
    const t = setTimeout(() => saveWs(pid, ws), 300);
    return () => clearTimeout(t);
  }, [pid, ws]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 3000);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs, thinking]);

  if (!ready || !project || !ws) {
    return (
      <div className="animate-pulse space-y-4" role="status" aria-label="Loading workspace">
        <div className="h-10 w-64 rounded-xl bg-slate-200/60" />
        <div className="h-[640px] rounded-3xl bg-slate-200/60" />
      </div>
    );
  }

  const state = ws;
  const files = ws.files;
  const activeFile = ws.active && ws.active in files ? ws.active : "";
  const challenge = CHALLENGES.find((c) => activeFile.startsWith(`challenges/${c.id}/`));

  /* ---- file operations ---- */

  const openFile = (path: string) => {
    setWs((s) => s && { ...s, open: s.open.includes(path) ? s.open : [...s.open, path], active: path });
    setSelected(path);
  };

  const closeTab = (path: string) =>
    setWs((s) => {
      if (!s) return s;
      const i = s.open.indexOf(path);
      const open = s.open.filter((p) => p !== path);
      return { ...s, open, active: s.active === path ? open[Math.max(0, i - 1)] ?? "" : s.active };
    });

  const setContent = (path: string, value: string) => setWs((s) => s && { ...s, files: { ...s.files, [path]: value } });

  function startCreate(kind: "file" | "folder") {
    const parent = allFolders(state).has(selected) ? selected : parentOf(selected);
    if (parent) setExpanded((e) => ({ ...e, [parent]: true }));
    setRenaming(null);
    setConfirmDel(null);
    setCreating({ parent, kind });
  }

  const ctx: Ctx = {
    active: activeFile, selected, expanded, creating, renaming, confirmDel,
    openFile,
    select: setSelected,
    toggle: (p) => setExpanded((e) => ({ ...e, [p]: !e[p] })),
    startRename: (p) => { setCreating(null); setConfirmDel(null); setRenaming(p); },
    askDelete: (p) => { setCreating(null); setRenaming(null); setConfirmDel(p); },
    doDelete: (p) => { setWs((s) => (s ? removeEntry(s, p) : s)); setConfirmDel(null); setSelected(""); },
    cancel: () => { setCreating(null); setRenaming(null); },
    submitCreate: (parent, kind, name) => {
      const r = createEntry(state, parent, name, kind);
      if (!r.ok) return r.error;
      setWs(r.state);
      setExpanded((e) => ({ ...e, ...(parent ? { [parent]: true } : {}), ...(kind === "folder" ? { [r.path]: true } : {}) }));
      setSelected(r.path);
      setCreating(null);
      return null;
    },
    submitRename: (path, name) => {
      const r = renameEntry(state, path, name);
      if (!r.ok) return r.error;
      setExpanded((e) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k === path ? r.path : k.startsWith(`${path}/`) ? r.path + k.slice(path.length) : k, v])));
      setWs(r.state);
      setSelected(r.path);
      setRenaming(null);
      return null;
    },
  };

  function addStarter(id: string) {
    const c = CHALLENGES.find((x) => x.id === id);
    if (!c) return;
    const base = `challenges/${id}`;
    const names = Object.keys(c.files);
    const first = `${base}/${names.find((n) => !n.endsWith(".test.js")) ?? names[0]}`;
    setWs((s) => {
      if (!s) return s;
      const next = { ...s.files };
      names.forEach((n) => { if (!(`${base}/${n}` in next)) next[`${base}/${n}`] = c.files[n]; });
      return { ...s, files: next, open: s.open.includes(first) ? s.open : [...s.open, first], active: first };
    });
    setExpanded((e) => ({ ...e, challenges: true, [base]: true }));
    setSelected(first);
  }

  /* ---- run ---- */

  async function run() {
    if (running) return;
    const entry = activeFile;
    if (!entry || !/\.m?js$/.test(entry)) {
      setFlash("Open a .js file to run it. Only JavaScript runs in the browser.");
      return;
    }
    setRunning(true);
    setPanelOpen(true);
    const r = await runProject(files, entry);
    setResult(r);
    setRanFile(entry);
    setRunning(false);
    const total = r.tests.length;
    const sig = entry + JSON.stringify(files);
    if (!r.fatal && total > 0 && r.tests.every((t) => t.ok) && loggedPass.current !== sig) {
      loggedPass.current = sig;
      addEvidence({
        type: "Test", text: `${baseOf(entry)}: ${total}/${total} tests passing`, source: "Nuvora workspace",
        provenance: state.aiFiles.length ? "AI-assisted" : "Human", stage: project!.stage, public: false,
      });
      setFlash("All tests pass. Saved to your evidence.");
    }
  }
  runRef.current = () => void run();
  saveRef.current = () => setFlash("Saved. Changes are saved automatically.");

  const onMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
  };

  /* ---- assistant ---- */

  async function ask(text: string) {
    const q = text.trim();
    if (!q || thinking) return;
    setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "user", text: q }]);
    setPrompt("");
    setThinking(true);
    const reply = await askAI(q, {
      challenge,
      failing: result?.tests.filter((t) => !t.ok).map((t) => t.name) ?? [],
      error: result?.fatal,
      hintIndex: hintIdx,
    });
    if (reply.hint) setHintIdx((i) => i + 1);
    const patch = reply.patch && { path: challenge ? `challenges/${challenge.id}/${reply.patch.file}` : reply.patch.file, code: reply.patch.code };
    setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "ai", text: reply.text, patch }]);
    setThinking(false);
  }

  function applyPatch(m: Msg) {
    if (!m.patch || m.applied) return;
    const { path, code } = m.patch;
    setWs((s) => s && {
      ...s, files: { ...s.files, [path]: code },
      open: s.open.includes(path) ? s.open : [...s.open, path], active: path,
      aiDirty: true, aiFiles: s.aiFiles.includes(path) ? s.aiFiles : [...s.aiFiles, path],
    });
    setSelected(path);
    setMsgs((all) => all.map((x) => (x.id === m.id ? { ...x, applied: true } : x)));
    addEvidence({
      type: "AI session", text: `Applied an AI suggestion to ${baseOf(path)}`, source: "Nuvora assistant",
      provenance: "AI-assisted", stage: project!.stage, public: false,
    });
    setFlash("Applied. Logged as AI-assisted evidence.");
  }

  function checkpoint(e: React.FormEvent) {
    e.preventDefault();
    const ai = state.aiDirty;
    addEvidence({
      type: "Commit", text: cpMsg.trim() || `Checkpoint: ${Object.keys(files).length} files`, source: "Nuvora workspace",
      provenance: ai ? "AI-assisted" : "Human", stage: project!.stage, public: false,
    });
    setWs((s) => s && { ...s, aiDirty: false });
    setCpMsg("");
    setFlash(`Checkpoint saved as ${ai ? "AI-assisted" : "human"} evidence.`);
  }

  const failing = result?.tests.filter((t) => !t.ok).length ?? 0;
  const actions = [
    { label: "Give me a hint", icon: Lightbulb, q: "hint" },
    { label: "Explain the error", icon: Bot, q: "explain why this fails" },
    { label: "Show a solution", icon: Sparkles, q: "show a solution" },
  ];

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/build" className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={14} /> Build activity</Link>
          <h1 className="text-3xl font-semibold">Code workspace</h1>
          <p className="mt-1 max-w-xl text-slate-600">Create files and folders, write JavaScript and run it. Passing tests, AI use and checkpoints are saved to your evidence.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="starter" className="sr-only">Add a starter challenge</label>
          <select id="starter" value="" onChange={(e) => e.target.value && addStarter(e.target.value)} className={`${inputCls} !w-auto`}>
            <option value="">Starter challenges…</option>
            {CHALLENGES.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <button onClick={run} disabled={running}
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700 disabled:opacity-60">
            {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Run
          </button>
        </div>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_340px]">
        {/* Explorer */}
        <aside className="flex h-64 flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm lg:h-[640px]" aria-label="File explorer">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
            <p className="text-sm font-semibold">Explorer</p>
            <div className="flex gap-0.5">
              <button onClick={() => startCreate("file")} aria-label="New file" title="New file" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><FilePlus size={16} /></button>
              <button onClick={() => startCreate("folder")} aria-label="New folder" title="New folder" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><FolderPlus size={16} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {tree.length === 0 && !creating ? (
              <p className="px-4 py-3 text-sm text-slate-500">No files yet. Use the buttons above to create one.</p>
            ) : (
              <TreeList nodes={tree} parent="" depth={0} c={ctx} />
            )}
          </div>
        </aside>

        {/* Editor + output */}
        <section className="flex h-[640px] min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm" aria-label="Editor">
          <div role="tablist" aria-label="Open files" className="flex shrink-0 overflow-x-auto border-b border-slate-100 bg-slate-50">
            {ws.open.filter((p) => p in files).map((p) => (
              <div key={p} className={`group flex shrink-0 items-center border-b-2 border-r border-r-slate-100 ${p === activeFile ? "border-b-brand-600 bg-white" : "border-b-transparent hover:bg-slate-100"}`}>
                <button role="tab" aria-selected={p === activeFile} onClick={() => openFile(p)} title={p}
                  className={`flex items-center gap-1.5 py-2.5 pl-3 pr-1.5 font-mono text-xs ${p === activeFile ? "text-slate-900" : "text-slate-500"}`}>
                  <FileIcon name={baseOf(p)} /> {baseOf(p)}
                </button>
                <button onClick={() => closeTab(p)} aria-label={`Close ${baseOf(p)}`} className="mr-1.5 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-800"><X size={13} /></button>
              </div>
            ))}
          </div>

          {challenge && (
            <p className="shrink-0 border-b border-slate-100 bg-brand-50/60 px-4 py-2 text-xs text-slate-700"><span className="font-semibold">Challenge: </span>{challenge.brief}</p>
          )}

          <div className="min-h-0 flex-1">
            {activeFile ? (
              <Editor
                height="100%" theme="vs" language={langOf(activeFile)} path={activeFile} keepCurrentModel
                value={files[activeFile]} onChange={(v) => setContent(activeFile, v ?? "")} onMount={onMount}
                loading={<div className="grid h-full place-items-center text-slate-400"><Loader2 className="animate-spin" /></div>}
                options={{
                  minimap: { enabled: false }, fontSize: 13, tabSize: 2, scrollBeyondLastLine: false, automaticLayout: true,
                  padding: { top: 12 }, bracketPairColorization: { enabled: true }, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                }}
              />
            ) : (
              <div className="grid h-full place-items-center p-6 text-center">
                <div>
                  <p className="font-semibold">No file open</p>
                  <p className="mt-1 text-sm text-slate-600">Pick a file in the explorer, or create a new one.</p>
                  <button onClick={() => startCreate("file")} className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"><FilePlus size={16} /> New file</button>
                </div>
              </div>
            )}
          </div>

          {/* Output panel */}
          <div className="shrink-0 border-t border-slate-200">
            <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
              <p className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                Output
                {result && <span className="font-normal text-slate-500">{ranFile} · {result.ms} ms</span>}
                {result && result.tests.length > 0 && (
                  <span className={`rounded-full px-2 py-0.5 font-medium ${failing ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {result.tests.length - failing} of {result.tests.length} tests passing
                  </span>
                )}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setResult(null)} className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-200 hover:text-slate-800">Clear</button>
                <button onClick={() => setPanelOpen((o) => !o)} aria-label={panelOpen ? "Collapse output" : "Expand output"} className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800">
                  {panelOpen ? <PanelBottomClose size={15} /> : <PanelBottomOpen size={15} />}
                </button>
              </div>
            </div>
            {panelOpen && (
              <div aria-live="polite" className="h-44 overflow-auto bg-slate-900 p-3 font-mono text-xs leading-5 text-slate-100">
                {!result ? (
                  <p className="text-slate-400">Press Run (Ctrl/Cmd + Enter) to run the open file.</p>
                ) : (
                  <>
                    {result.fatal && <p className="whitespace-pre-wrap text-rose-300">{result.fatal}</p>}
                    {result.logs.length > 0 && <pre className="whitespace-pre-wrap">{result.logs.join("\n")}</pre>}
                    {result.tests.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {result.tests.map((t) => (
                          <li key={t.name} className={t.ok ? "text-emerald-300" : "text-rose-300"}>
                            {t.ok ? "✓" : "✗"} {t.name}{t.error && <span className="block pl-4 text-rose-300/80">{t.error}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!result.fatal && result.logs.length === 0 && result.tests.length === 0 && <p className="text-slate-400">Ran without output. Use console.log to print values.</p>}
                  </>
                )}
              </div>
            )}
          </div>

          <form onSubmit={checkpoint} className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-100 p-2.5">
            <label htmlFor="cp" className="sr-only">Checkpoint message</label>
            <input id="cp" value={cpMsg} onChange={(e) => setCpMsg(e.target.value)} maxLength={100} placeholder="Checkpoint message (optional)" className={`${inputCls} min-w-[180px] flex-1 !py-2`} />
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ws.aiDirty ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"}`}>{ws.aiDirty ? "AI-assisted" : "Human"}</span>
            <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"><GitCommit size={15} /> Save checkpoint</button>
          </form>
        </section>

        {/* Assistant */}
        <aside className="flex h-[640px] flex-col rounded-3xl border border-slate-100 bg-white shadow-sm lg:col-span-2 xl:col-span-1" aria-label="AI assistant">
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
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {msgs.length === 0 && <p className="text-sm text-slate-500">Stuck? Ask for a hint first. Working it out yourself makes the evidence worth more.</p>}
            <AnimatePresence initial={false}>
              {msgs.map((m) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}
                  className={m.role === "user" ? "ml-8 rounded-2xl rounded-br-md bg-slate-900 p-3 text-sm text-white" : "mr-4 rounded-2xl rounded-bl-md bg-slate-50 p-3 text-sm text-slate-800"}>
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  {m.patch && (
                    <div className="mt-3">
                      {m.applied ? (
                        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Check size={14} /> Applied to {baseOf(m.patch.path)}</p>
                      ) : (
                        <button onClick={() => applyPatch(m)} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">Apply to {baseOf(m.patch.path)}</button>
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