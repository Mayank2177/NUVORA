"use client";

import type { FileSystemTree, WebContainer } from "@webcontainer/api";

let booting: Promise<WebContainer> | null = null;

/** WebContainer can only boot once per page, so every visit shares one instance. */
export function bootContainer(): Promise<WebContainer> {
  if (!booting) {
    booting = import("@webcontainer/api").then(({ WebContainer }) => WebContainer.boot({ coep: "credentialless" }));
    booting.catch(() => {
      booting = null;
    });
  }
  return booting;
}

type Dir = { [name: string]: { directory: Dir } | { file: { contents: string } } };

export function toTree(files: Record<string, string>, folders: string[] = []): FileSystemTree {
  const root: Dir = {};
  const dirAt = (parts: string[]) => {
    let cur = root;
    for (const p of parts) {
      const next = cur[p];
      if (!next || !("directory" in next)) cur[p] = { directory: {} };
      cur = (cur[p] as { directory: Dir }).directory;
    }
    return cur;
  };
  folders.forEach((f) => dirAt(f.split("/")));
  for (const [path, contents] of Object.entries(files)) {
    const parts = path.split("/");
    dirAt(parts.slice(0, -1))[parts[parts.length - 1]] = { file: { contents } };
  }
  return root as FileSystemTree;
}

const abs = (p: string) => `/${p}`;

/** Copies what changed in the editor into the container's file system. */
export async function syncFiles(
  wc: WebContainer, prev: Record<string, string>, next: Record<string, string>, prevFolders: string[], nextFolders: string[],
) {
  for (const p of Object.keys(prev)) if (!(p in next)) await wc.fs.rm(abs(p), { force: true });
  for (const f of [...prevFolders].sort((a, b) => b.length - a.length)) {
    if (!nextFolders.includes(f)) await wc.fs.rm(abs(f), { recursive: true, force: true });
  }
  for (const f of nextFolders) if (!prevFolders.includes(f)) await wc.fs.mkdir(abs(f), { recursive: true });
  for (const [p, c] of Object.entries(next)) {
    if (prev[p] === c) continue;
    const i = p.lastIndexOf("/");
    if (i > 0) await wc.fs.mkdir(abs(p.slice(0, i)), { recursive: true });
    await wc.fs.writeFile(abs(p), c);
  }
}

const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", ".vite", ".cache"]);

/** Reads the container back into the editor, so files made in the terminal show up. Text files only. */
export async function pullFiles(wc: WebContainer) {
  const files: Record<string, string> = {};
  const folders: string[] = [];
  const walk = async (dir: string) => {
    const entries = await wc.fs.readdir(dir ? `/${dir}` : "/", { withFileTypes: true });
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const path = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        folders.push(path);
        await walk(path);
      } else if (e.name !== "package-lock.json" && Object.keys(files).length < 300) {
        const bytes = await wc.fs.readFile(abs(path));
        if (bytes.length > 200_000) continue;
        try {
          files[path] = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          /* binary file: skip */
        }
      }
    }
  };
  await walk("");
  return { files, folders };
}