"use client";

import { useEffect, useState } from "react";
import type { Stage } from "@/lib/store";

export const KINDS = ["Wireframe", "Mockup", "Flow", "Diagram", "Other"] as const;
export const TOOLS = ["Figma", "Excalidraw", "tldraw", "Balsamiq", "Penpot", "draw.io", "Mermaid", "Other"] as const;
export type Kind = (typeof KINDS)[number];
export type Tool = (typeof TOOLS)[number];

export type Design = {
  id: string;
  title: string;
  kind: Kind;
  tool: Tool;
  url: string;
  image?: string; // small JPEG data URL
  note: string;
  stage: Stage;
  createdAt: string;
};

export type DecisionRec = { id: string; decision: string; reason: string; stage: Stage; createdAt: string };
type Store = { designs: Design[]; decisions: DecisionRec[] };

const EVENT = "nuvora:design";
const key = (pid: string) => `nuvora:design:${pid}`;
const uid = () => crypto.randomUUID();

function read(pid: string): Store {
  try {
    const raw = localStorage.getItem(key(pid));
    return raw ? (JSON.parse(raw) as Store) : { designs: [], decisions: [] };
  } catch {
    return { designs: [], decisions: [] };
  }
}

/** Returns false if the browser refuses to store it (usually: storage is full). */
function write(pid: string, s: Store): boolean {
  try {
    localStorage.setItem(key(pid), JSON.stringify(s));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

export function detectTool(url: string): Tool | null {
  const u = url.toLowerCase();
  if (u.includes("figma.com")) return "Figma";
  if (u.includes("excalidraw")) return "Excalidraw";
  if (u.includes("tldraw")) return "tldraw";
  if (u.includes("balsamiq")) return "Balsamiq";
  if (u.includes("penpot")) return "Penpot";
  if (u.includes("draw.io") || u.includes("diagrams.net")) return "draw.io";
  if (u.includes("mermaid")) return "Mermaid";
  return null;
}

export function isHttpUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Downscale so a screenshot doesn't fill up localStorage. */
export function resizeImage(file: File, max = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Choose an image file (PNG, JPG or WebP)."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("We couldn't read that image. Try a PNG or JPG."));
    };
    img.src = url;
  });
}

export function useDesign(pid: string | undefined) {
  const [store, setStore] = useState<Store | null>(null);

  useEffect(() => {
    if (!pid) {
      setStore(null);
      return;
    }
    const sync = () => setStore(read(pid));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [pid]);

  const mutate = (fn: (s: Store) => Store) => (pid ? write(pid, fn(read(pid))) : false);

  return {
    designs: store?.designs ?? null,
    decisions: store?.decisions ?? null,
    addDesign: (d: Omit<Design, "id" | "createdAt">) =>
      mutate((s) => ({ ...s, designs: [{ ...d, id: uid(), createdAt: new Date().toISOString() }, ...s.designs] })),
    removeDesign: (id: string) => mutate((s) => ({ ...s, designs: s.designs.filter((d) => d.id !== id) })),
    addDecision: (d: Omit<DecisionRec, "id" | "createdAt">) =>
      mutate((s) => ({ ...s, decisions: [{ ...d, id: uid(), createdAt: new Date().toISOString() }, ...s.decisions] })),
    removeDecision: (id: string) => mutate((s) => ({ ...s, decisions: s.decisions.filter((d) => d.id !== id) })),
  };
}