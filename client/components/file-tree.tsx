"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileCode, FileJson, FileText, Folder, FolderOpen, Pencil, Trash2 } from "lucide-react";
import type { TreeNode } from "@/lib/workspace";

export type Creating = { parent: string; kind: "file" | "folder" } | null;

export type Ctx = {
  active: string; selected: string; expanded: Record<string, boolean>;
  creating: Creating; renaming: string | null; confirmDel: string | null;
  openFile: (p: string) => void; toggle: (p: string) => void; select: (p: string) => void;
  startRename: (p: string) => void; askDelete: (p: string | null) => void; doDelete: (p: string) => void;
  submitCreate: (parent: string, kind: "file" | "folder", name: string) => string | null;
  submitRename: (p: string, name: string) => string | null; cancel: () => void;
};

const CODE: Record<string, string> = {
  js: "text-amber-500", mjs: "text-amber-500", cjs: "text-amber-500", jsx: "text-sky-500", ts: "text-blue-500", tsx: "text-sky-500",
  html: "text-orange-500", css: "text-blue-500", scss: "text-pink-500", py: "text-emerald-600", java: "text-red-500",
  go: "text-cyan-500", rs: "text-orange-600", c: "text-slate-500", cpp: "text-slate-500", rb: "text-red-500", php: "text-violet-500", sh: "text-slate-500",
};

export function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "json") return <FileJson size={15} className="shrink-0 text-emerald-500" />;
  if (CODE[ext]) return <FileCode size={15} className={`shrink-0 ${CODE[ext]}`} />;
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

export function TreeList({ nodes, parent, depth, c }: { nodes: TreeNode[]; parent: string; depth: number; c: Ctx }) {
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
                onClick={() => { c.select(n.path); if (folder) c.toggle(n.path); else c.openFile(n.path); }}
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