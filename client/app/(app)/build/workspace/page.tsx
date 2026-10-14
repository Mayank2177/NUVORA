"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Editor, { type OnMount } from "@monaco-editor/react";
import { AnimatePresence, m as motion } from "framer-motion";
import type { WebContainer } from "@webcontainer/api";
import {
  ArrowLeft, Bot, Check, ExternalLink, FilePlus, FolderPlus, GitCommit, Globe, Lightbulb, Loader2, PanelBottomClose,
  PanelBottomOpen, Play, RefreshCw, RotateCw, Send, ShieldCheck, Sparkles, Square, X,
} from "lucide-react";
import { useProjects } from "@/lib/store";
import { useProjectData } from "@/lib/data";
import {
  CHALLENGES, allFolders, askAI, baseOf, buildTree, createEntry, loadWs, parentOf, removeEntry, renameEntry,
  runProject, saveWs, type WsState,
} from "@/lib/workspace";
import { bootContainer, pullFiles, syncFiles, toTree } from "@/lib/runtime";
import { runPython } from "@/lib/pyrun";
import { buildPage } from "@/lib/preview";
import { TEMPLATES, type Template } from "@/lib/templates";
import { FileIcon, TreeList, type Creating, type Ctx } from "@/components/file-tree";
import { TerminalPane, type TerminalHandle } from "@/components/terminal-pane";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const LANG: Record<string, string> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", json: "json", md: "markdown",
  html: "html", htm: "html", css: "css", scss: "scss", py: "python", java: "java", c: "c", h: "c", cpp: "cpp", go: "go", rs: "rust",
  rb: "ruby", php: "php", sh: "shell", sql: "sql", yml: "yaml", yaml: "yaml", xml: "xml", svg: "xml", txt: "plaintext",
};
const extOf = (p: string) => p.split(".").pop()?.toLowerCase() ?? "";
const langOf = (p: string) => LANG[extOf(p)] ?? "plaintext";
const quote = (p: string) => `'${p}'`;

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";

type Line = { l: "log" | "info" | "warn" | "error"; t: string };
type Out = { title: string; lines: Line[]; tests: { name: string; ok: boolean; error?: string }[]; ms?: number; runner?: "browser" | "python" | "page"; file?: string };
const EMPTY_OUT: Out = { title: "", lines: [], tests: [] };
type Env = { state: "starting" | "ready" | "unavailable"; reason?: string };
type Msg = { id: string; role: "user" | "ai"; text: string; patch?: { path: string; code: string }; applied?: boolean };

function Chip({ onClick, children, label, disabled }: { onClick: () => void; children: React.ReactNode; label?: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-700 disabled:opacity-50">
      {children}
    </button>
  );
}

function OutputView({ out, onRunNode }: { out: Out; onRunNode?: () => void }) {
  const failing = out.tests.filter((t) => !t.ok).length;
  if (!out.title && out.lines.length === 0 && out.tests.length === 0)
    return <p className="text-slate-400">Run a file to see its output here. HTML pages send their console messages here too.</p>;
  return (
    <>
      <p className="mb-2 flex flex-wrap items-center gap-x-2 text-slate-400">
        <span>{out.title}{out.ms !== undefined ? ` · ${out.ms} ms` : ""}{out.tests.length > 0 ? ` · ${out.tests.length - failing} of ${out.tests.length} tests passing` : ""}</span>
        {out.runner === "browser" && onRunNode && <button onClick={onRunNode} className="rounded bg-white/10 px-2 py-0.5 text-slate-200 hover:bg-white/20">Run with Node instead</button>}
      </p>
      {out.lines.map((x, i) => (
        <p key={i} className={`whitespace-pre-wrap break-words ${x.l === "error" ? "text-rose-300" : x.l === "warn" ? "text-amber-300" : x.l === "info" ? "text-slate-400" : "text-slate-100"}`}>{x.t}</p>
      ))}
      {out.tests.length > 0 && (
        <ul className="mt-2 space-y-1">
          {out.tests.map((t) => (
            <li key={t.name} className={t.ok ? "text-emerald-300" : "text-rose-300"}>
              {t.ok ? "✓" : "✗"} {t.name}{t.error && <span className="block pl-4 text-rose-300/80">{t.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

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
  const [pendingTpl, setPendingTpl] = useState<Template | null>(null);

  const [env, setEnv] = useState<Env>({ state: "starting" });
  const [wc, setWc] = useState<WebContainer | null>(null);
  const [serverUrl, setServerUrl] = useState("");
  const [bottom, setBottom] = useState<"terminal" | "output">("terminal");
  const [panelOpen, setPanelOpen] = useState(true);
  const [right, setRight] = useState<"preview" | "assistant">("preview");
  const [previewMode, setPreviewMode] = useState<"page" | "server">("page");
  const [pageFile, setPageFile] = useState("");
  const [pageDoc, setPageDoc] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [out, setOut] = useState<Out>(EMPTY_OUT);
  const [running, setRunning] = useState(false);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [hintIdx, setHintIdx] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState(false);
  const [cpMsg, setCpMsg] = useState("");
  const [flash, setFlash] = useState("");

  const wsRef = useRef<WsState | null>(null);
  const wcRef = useRef<WebContainer | null>(null);
  const mirror = useRef<Record<string, string>>({});
  const mirrorFolders = useRef<string[]>([]);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const termRef = useRef<TerminalHandle>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const loggedPass = useRef("");
  const runRef = useRef<() => void>(() => {});
  const saveRef = useRef<() => void>(() => {});
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);
  const loaded = ws !== null;
  const wsFiles = ws?.files;
  const wsFolders = ws?.folders;
  const tree = useMemo(() => (ws ? buildTree(ws) : []), [ws]);
  const scripts = useMemo(() => {
    const raw = wsFiles?.["package.json"];
    if (raw === undefined) return { has: false, list: [] as string[] };
    try {
      const j = JSON.parse(raw) as { scripts?: Record<string, string> };
      return { has: true, list: ["dev", "start"].filter((k) => j.scripts?.[k]) };
    } catch {
      return { has: true, list: [] as string[] };
    }
  }, [wsFiles]);

  /* ---- loading and saving ---- */

  useEffect(() => {
    if (ready && projects.length === 0) router.replace("/new");
  }, [ready, projects.length, router]);

  useEffect(() => {
    if (!pid) return;
    let current = true;
    void Promise.resolve().then(() => {
      if (!current) return;
      const s = loadWs(pid);
      setWs(s);
      setExpanded(Object.fromEntries([...allFolders(s)].map((f) => [f, true])));
      setSelected(s.active);
    });
    return () => { current = false; };
  }, [pid]);

  useEffect(() => {
    if (!pid || !ws) return;
    const t = setTimeout(() => saveWs(pid, ws), 300);
    return () => clearTimeout(t);
  }, [pid, ws]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs, thinking]);

  /* ---- the terminal environment ---- */

  useEffect(() => {
    if (!pid || !loaded) return;
    let dead = false;
    let off = () => {};

    (async () => {
      if (!window.crossOriginIsolated) {
        // The workspace route sends the isolation headers, but an in-app link doesn't load them. Reload once.
        if (sessionStorage.getItem("nuvora:coi") !== "1") {
          sessionStorage.setItem("nuvora:coi", "1");
          window.location.reload();
          return;
        }
        setEnv({ state: "unavailable", reason: "The terminal needs a browser that supports cross-origin isolation, such as Chrome or Edge." });
        return;
      }
      sessionStorage.removeItem("nuvora:coi");
      try {
        const c = await bootContainer();
        if (dead) return;
        const snap = wsRef.current!;
        await c.mount(toTree(snap.files, snap.folders));
        if (dead) return;
        mirror.current = { ...snap.files };
        mirrorFolders.current = [...snap.folders];
        const a = c.on("server-ready", (_port, url) => {
          setServerUrl(url);
          setPreviewMode("server");
          setRight("preview");
          setReloadKey((k) => k + 1);
        });
        const b = c.on("error", (e) => setFlash(`Terminal error: ${e.message}`));
        off = () => { a(); b(); };
        wcRef.current = c;
        setWc(c);
        setEnv({ state: "ready" });
      } catch (e) {
        if (!dead) setEnv({ state: "unavailable", reason: e instanceof Error ? e.message : "The terminal couldn't start." });
      }
    })();

    return () => {
      dead = true;
      off();
    };
  }, [pid, loaded]);

  /** Copies editor changes into the container. Queued, so writes never overlap. */
  const flush = useCallback(() => {
    const job = async () => {
      const c = wcRef.current;
      const cur = wsRef.current;
      if (!c || !cur) return;
      const prev = mirror.current;
      const prevF = mirrorFolders.current;
      mirror.current = { ...cur.files };
      mirrorFolders.current = [...cur.folders];
      try {
        await syncFiles(c, prev, cur.files, prevF, cur.folders);
      } catch {
        /* a failed write is retried on the next edit */
      }
    };
    chain.current = chain.current.then(job, job);
    return chain.current;
  }, []);

  useEffect(() => {
    if (!wc || !wsFiles) return;
    const t = setTimeout(() => void flush(), 400);
    return () => clearTimeout(t);
  }, [wc, wsFiles, wsFolders, flush]);

  /* ---- the page preview ---- */

  useEffect(() => {
    if (!pageFile || !wsFiles) return;
    const t = setTimeout(() => {
      setPageDoc(buildPage(wsFiles, pageFile));
      setOut((o) => (o.runner === "page" ? { ...o, lines: [] } : o));
    }, 250);
    return () => clearTimeout(t);
  }, [pageFile, wsFiles]);

  useEffect(() => {
    const on = (e: MessageEvent) => {
      const d = e.data as { nuvora?: string; level?: Line["l"]; text?: string } | null;
      if (!d || d.nuvora !== "console" || e.source !== frameRef.current?.contentWindow) return;
      setOut((o) => ({ ...o, lines: [...o.lines, { l: d.level ?? "log", t: String(d.text ?? "") }].slice(-500) }));
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);

  useEffect(() => {
    runRef.current = () => void run();
    saveRef.current = () => setFlash("Saved. Changes are saved automatically.");
  });

  if (!ready || !project || !ws) {
    return (
      <div className="animate-pulse space-y-4" role="status" aria-label="Loading workspace">
        <div className="h-10 w-64 rounded-xl bg-slate-200/60" />
        <div className="h-[680px] rounded-3xl bg-slate-200/60" />
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

  function applyTemplate(t: Template) {
    setWs((s) => s && { ...s, files: { ...t.files }, folders: [], open: [t.open], active: t.open, aiDirty: false, aiFiles: [] });
    setExpanded(Object.fromEntries(Object.keys(t.files).flatMap((p) => { const out: string[] = []; let d = parentOf(p); while (d) { out.push(d); d = parentOf(d); } return out; }).map((f) => [f, true])));
    setSelected(t.open);
    setOut(EMPTY_OUT);
    setPageFile("");
    setPageDoc("");
    setPendingTpl(null);
    if (t.id === "html") { setPageFile("index.html"); setPreviewMode("page"); setRight("preview"); }
    setFlash(`${t.name} loaded. ${t.next}`);
  }

  /** Reads the container back into the explorer, so files made in the terminal show up. */
  async function pull() {
    const c = wcRef.current;
    if (!c) return;
    await flush();
    try {
      const r = await pullFiles(c);
      mirror.current = { ...r.files };
      mirrorFolders.current = [...r.folders];
      setWs((s) => {
        if (!s) return s;
        const open = s.open.filter((p) => p in r.files);
        return { ...s, files: r.files, folders: r.folders, open, active: s.active in r.files ? s.active : open[0] ?? "" };
      });
      setFlash(`Explorer updated from the terminal (${Object.keys(r.files).length} files).`);
    } catch {
      setFlash("Couldn't read the terminal's files.");
    }
  }

  /* ---- running code ---- */

  async function runInTerminal(cmd: string) {
    await flush();
    setPanelOpen(true);
    setBottom("terminal");
    termRef.current?.run(cmd);
  }

  async function runInBrowser(file: string) {
    setRunning(true);
    setPanelOpen(true);
    setBottom("output");
    const r = await runProject(files, file);
    const lines: Line[] = [...r.logs.map((t): Line => ({ l: "log", t })), ...(r.fatal ? [{ l: "error" as const, t: r.fatal }] : [])];
    setOut({ title: `${file} (browser runner)`, lines, tests: r.tests, ms: r.ms, runner: "browser", file });
    setRunning(false);
    const total = r.tests.length;
    const sig = file + JSON.stringify(files);
    if (!r.fatal && total > 0 && r.tests.every((t) => t.ok) && loggedPass.current !== sig) {
      loggedPass.current = sig;
      addEvidence({
        type: "Test", text: `${baseOf(file)}: ${total}/${total} tests passing`, source: "Nuvora workspace",
        provenance: state.aiFiles.length ? "AI-assisted" : "Human", stage: project!.stage, public: false,
      });
      setFlash("All tests pass. Saved to your evidence.");
    }
  }

  async function runPy(file: string) {
    setRunning(true);
    setPanelOpen(true);
    setBottom("output");
    setOut({ title: `${file} (Python)`, lines: [{ l: "info", t: "Starting Python. The first run downloads the runtime and can take a few seconds." }], tests: [], runner: "python" });
    const r = await runPython(files, file);
    setOut({
      title: `${file} (Python)`, ms: r.ms, tests: [], runner: "python",
      lines: [...r.out.map((t): Line => ({ l: "log", t })), ...(r.error ? [{ l: "error" as const, t: r.error }] : [])],
    });
    setRunning(false);
  }

  function showPage(file: string) {
    setPageFile(file);
    setPreviewMode("page");
    setRight("preview");
    setPanelOpen(true);
    setBottom("output");
    setOut({ title: `${file}: page console`, lines: [], tests: [], runner: "page" });
  }

  async function run() {
    if (running) return;
    const f = activeFile;
    if (!f) return setFlash("Open a file to run it.");
    const ext = extOf(f);
    const c = wcRef.current;
    const devServer = scripts.list.length > 0;

    if (ext === "html" || ext === "htm") {
      if (c && devServer) return setFlash("This project uses a dev server. Press npm install once, then the npm run dev or npm start button.");
      return showPage(f);
    }
    if (/\.test\.m?js$/.test(f)) return runInBrowser(f);
    if (ext === "mjs" || ext === "cjs" || ext === "js") {
      if (c && (scripts.has || ext !== "js")) return void runInTerminal(`node ${quote(f)}`);
      return runInBrowser(f);
    }
    if (ext === "ts") {
      if (!c) return setFlash("TypeScript runs in the terminal, which isn't available in this browser.");
      return void runInTerminal(`npx --yes tsx ${quote(f)}`);
    }
    if (ext === "py") return runPy(f);
    setFlash(`.${ext || "this file type"} can't run in the browser. You can edit it, and run code that uses it.`);
  }
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
      failing: out.tests.filter((t) => !t.ok).map((t) => t.name),
      error: out.lines.find((l) => l.l === "error")?.t,
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
      ...s, files: { ...s.files, [path]: code }, open: s.open.includes(path) ? s.open : [...s.open, path], active: path,
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

  const actions = [
    { label: "Give me a hint", icon: Lightbulb, q: "hint" },
    { label: "Explain the error", icon: Bot, q: "explain why this fails" },
    { label: "Show a solution", icon: Sparkles, q: "show a solution" },
  ];
  const envBadge =
    env.state === "ready" ? { t: "Terminal ready", c: "bg-emerald-50 text-emerald-700" }
    : env.state === "starting" ? { t: "Starting terminal…", c: "bg-slate-100 text-slate-600" }
    : { t: "Terminal unavailable", c: "bg-amber-50 text-amber-700" };

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/build" className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft size={14} /> Build activity</Link>
          <h1 className="text-3xl font-semibold">Code workspace</h1>
          <p className="mt-1 max-w-xl text-slate-600">Write code, install packages, run it and see it in the browser. Passing tests, AI use and checkpoints are saved to your evidence.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span title={env.reason} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${envBadge.c}`}>
            {env.state === "starting" && <Loader2 size={12} className="animate-spin" />} {envBadge.t}
          </span>
          <label htmlFor="tpl" className="sr-only">Start from a template</label>
          <select id="tpl" value="" onChange={(e) => setPendingTpl(TEMPLATES.find((t) => t.id === e.target.value) ?? null)} className={`${inputCls} !w-auto`}>
            <option value="">Templates…</option>
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label htmlFor="starter" className="sr-only">Add a starter challenge</label>
          <select id="starter" value="" onChange={(e) => e.target.value && addStarter(e.target.value)} className={`${inputCls} !w-auto`}>
            <option value="">Challenges…</option>
            {CHALLENGES.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <button onClick={run} disabled={running}
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700 disabled:opacity-60">
            {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Run
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {pendingTpl && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div role="alertdialog" aria-label="Replace files" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="min-w-0 flex-1 basis-64"><span className="font-semibold">Load {pendingTpl.name}?</span> {pendingTpl.blurb} This replaces every file in this workspace.</p>
              <button onClick={() => applyTemplate(pendingTpl)} className="rounded-xl bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700">Replace files</button>
              <button onClick={() => setPendingTpl(null)} className="px-3 py-2 font-medium text-amber-900/70 hover:text-amber-900">Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_380px]">
        {/* Explorer */}
        <aside className="flex h-64 flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm lg:h-[680px]" aria-label="File explorer">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
            <p className="text-sm font-semibold">Explorer</p>
            <div className="flex gap-0.5">
              <button onClick={() => startCreate("file")} aria-label="New file" title="New file" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><FilePlus size={16} /></button>
              <button onClick={() => startCreate("folder")} aria-label="New folder" title="New folder" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><FolderPlus size={16} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {tree.length === 0 && !creating ? <p className="px-4 py-3 text-sm text-slate-500">No files yet. Use the buttons above, or pick a template.</p> : <TreeList nodes={tree} parent="" depth={0} c={ctx} />}
          </div>
        </aside>

        {/* Editor and bottom panel */}
        <section className="flex h-[680px] min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm" aria-label="Editor">
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

          {challenge && <p className="shrink-0 border-b border-slate-100 bg-brand-50/60 px-4 py-2 text-xs text-slate-700"><span className="font-semibold">Challenge: </span>{challenge.brief}</p>}

          <div className="min-h-0 flex-1">
            {activeFile ? (
              <Editor
                height="100%" theme="vs" language={langOf(activeFile)} path={activeFile} keepCurrentModel
                value={files[activeFile]} onChange={(v) => setContent(activeFile, v ?? "")} onMount={onMount}
                loading={<div className="grid h-full place-items-center text-slate-400"><Loader2 className="animate-spin" /></div>}
                options={{ minimap: { enabled: false }, fontSize: 13, tabSize: 2, scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 12 }, bracketPairColorization: { enabled: true }, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
              />
            ) : (
              <div className="grid h-full place-items-center p-6 text-center">
                <div>
                  <p className="font-semibold">No file open</p>
                  <p className="mt-1 text-sm text-slate-600">Pick a file, create one, or start from a template.</p>
                  <button onClick={() => startCreate("file")} className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"><FilePlus size={16} /> New file</button>
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-1.5">
              <div role="tablist" aria-label="Panel" className="flex gap-1">
                {(["terminal", "output"] as const).map((t) => (
                  <button key={t} role="tab" aria-selected={bottom === t} onClick={() => { setBottom(t); setPanelOpen(true); }}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize ${bottom === t && panelOpen ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{t}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {wc && scripts.has && <Chip onClick={() => void runInTerminal("npm install")} label="Install the packages in package.json">npm install</Chip>}
                {wc && scripts.list.map((s) => <Chip key={s} onClick={() => void runInTerminal(s === "start" ? "npm start" : `npm run ${s}`)}>{s === "start" ? "npm start" : `npm run ${s}`}</Chip>)}
                {wc && <Chip onClick={() => termRef.current?.interrupt()} label="Stop the running command"><Square size={11} /> Stop</Chip>}
                {wc && <Chip onClick={() => void pull()} label="Show files created in the terminal in the explorer"><RefreshCw size={11} /> Sync files</Chip>}
                <button onClick={() => setPanelOpen((o) => !o)} aria-label={panelOpen ? "Collapse panel" : "Expand panel"} className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800">
                  {panelOpen ? <PanelBottomClose size={15} /> : <PanelBottomOpen size={15} />}
                </button>
              </div>
            </div>
            <div className={panelOpen ? "h-56 bg-slate-900" : "hidden"}>
              <div className={bottom === "terminal" ? "h-full" : "hidden"}>
                {wc ? <TerminalPane ref={termRef} wc={wc} /> : (
                  <p className="p-4 font-mono text-xs text-slate-400">
                    {env.state === "starting" ? "Starting the terminal…" : `${env.reason ?? "The terminal isn't available."} HTML preview, JavaScript tests and Python still work.`}
                  </p>
                )}
              </div>
              <div aria-live="polite" className={bottom === "output" ? "h-full overflow-auto p-3 font-mono text-xs leading-5" : "hidden"}>
                <OutputView out={out} onRunNode={wc && out.file ? () => void runInTerminal(`node ${quote(out.file!)}`) : undefined} />
              </div>
            </div>
          </div>

          <form onSubmit={checkpoint} className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-100 p-2.5">
            <label htmlFor="cp" className="sr-only">Checkpoint message</label>
            <input id="cp" value={cpMsg} onChange={(e) => setCpMsg(e.target.value)} maxLength={100} placeholder="Checkpoint message (optional)" className={`${inputCls} min-w-[180px] flex-1 !py-2`} />
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ws.aiDirty ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700"}`}>{ws.aiDirty ? "AI-assisted" : "Human"}</span>
            <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"><GitCommit size={15} /> Save checkpoint</button>
          </form>
        </section>

        {/* Preview and assistant */}
        <aside className="flex h-[680px] flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm lg:col-span-2 xl:col-span-1" aria-label="Preview and assistant">
          <div role="tablist" aria-label="Right panel" className="flex shrink-0 gap-1 border-b border-slate-100 p-2">
            {([["preview", "Preview", Globe], ["assistant", "Assistant", Bot]] as const).map(([k, label, Icon]) => (
              <button key={k} role="tab" aria-selected={right === k} onClick={() => setRight(k)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-medium ${right === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}><Icon size={14} /> {label}</button>
            ))}
          </div>

          <div className={right === "preview" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
              <div role="radiogroup" aria-label="Preview source" className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
                <button role="radio" aria-checked={previewMode === "page"} onClick={() => setPreviewMode("page")} className={`rounded-md px-2.5 py-1 ${previewMode === "page" ? "bg-slate-900 text-white" : "text-slate-600"}`}>Page</button>
                <button role="radio" aria-checked={previewMode === "server"} disabled={!serverUrl} onClick={() => setPreviewMode("server")} className={`rounded-md px-2.5 py-1 disabled:opacity-40 ${previewMode === "server" ? "bg-slate-900 text-white" : "text-slate-600"}`}>Server</button>
              </div>
              <button onClick={() => setReloadKey((k) => k + 1)} aria-label="Reload preview" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><RotateCw size={14} /></button>
              {previewMode === "server" && serverUrl && (
                <a href={serverUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">Open in new tab <ExternalLink size={12} /></a>
              )}
            </div>
            <div className="min-h-0 flex-1 bg-slate-50">
              {previewMode === "server" && serverUrl ? (
                <iframe key={`s${reloadKey}`} src={serverUrl} title="Server preview" sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups" className="h-full w-full bg-white" />
              ) : pageFile ? (
                <iframe key={`p${reloadKey}`} ref={frameRef} srcDoc={pageDoc} title="Page preview" sandbox="allow-scripts allow-forms allow-modals allow-popups" className="h-full w-full bg-white" />
              ) : (
                <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-600">
                  <p className="max-w-xs">Open an <span className="font-mono">.html</span> file and press Run to preview it. For an app with a server, press <span className="font-mono">npm run dev</span> and it appears here.</p>
                </div>
              )}
            </div>
            <p className="shrink-0 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">Previews run in a sandbox, separate from your Nuvora account.</p>
          </div>

          <div className={right === "assistant" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <div className="flex flex-wrap gap-2 p-4 pb-0">
              {actions.map((a) => (
                <button key={a.label} onClick={() => ask(a.q)} disabled={thinking}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-700 disabled:opacity-50"><a.icon size={13} /> {a.label}</button>
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
                        {m.applied ? <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Check size={14} /> Applied to {baseOf(m.patch.path)}</p>
                          : <button onClick={() => applyPatch(m)} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">Apply to {baseOf(m.patch.path)}</button>}
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
            <p className="flex gap-2 border-t border-slate-100 p-4 text-xs text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-brand-600" /> Demo assistant. Nothing is applied without your approval, and applied AI code is logged as AI-assisted evidence.</p>
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {flash && (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-6 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-2.5 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-2xl">
            <Check size={16} className="shrink-0 text-emerald-400" /> <span className="truncate">{flash}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
