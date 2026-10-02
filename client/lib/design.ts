"use client";

import { useEffect, useState } from "react";
import type { Stage } from "@/lib/store";
import { api, fromApiStage } from "@/lib/api-client";

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

type ApiDesign = Omit<Design, "stage" | "createdAt" | "image"> & {
  stage: string;
  created_at: string;
  image?: string | null; // API may send null
};

type ApiDecision = Omit<DecisionRec, "stage" | "createdAt"> & {
  stage: string;
  created_at: string;
};

const mapDesign = (raw: unknown): Design => {
  const d = raw as ApiDesign & { createdAt?: string };
  return { ...d, image: d.image ?? undefined, stage: fromApiStage(d.stage) as Stage, createdAt: d.created_at ?? d.createdAt ?? "" };
};

const mapDecision = (raw: unknown): DecisionRec => {
  const d = raw as ApiDecision & { createdAt?: string };
  return { ...d, stage: fromApiStage(d.stage) as Stage, createdAt: d.created_at ?? d.createdAt ?? "" };
};

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
  const [store, setStore] = useState<{ pid: string; data: Store } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!pid) return;
    let cancelled = false;
    Promise.all([api.designs.list(pid), api.decisions.list(pid)])
      .then(([d, r]) => {
        if (!cancelled) setStore({ pid, data: { designs: d.designs.map(mapDesign), decisions: r.decisions.map(mapDecision) } });
      })
      .catch((error) => {
        console.error("Could not load design data from the API", error);
        if (!cancelled) setStore({ pid, data: { designs: [], decisions: [] } });
      });
    return () => { cancelled = true; };
  }, [pid, reload]);

  const current = pid && store?.pid === pid ? store.data : null;

  const mutate = async (fn: () => Promise<unknown>) => { await fn(); setReload((r) => r + 1); return true; };

  return {
    designs: current?.designs ?? null,
    decisions: current?.decisions ?? null,
    addDesign: (d: Omit<Design, "id" | "createdAt">) =>
      mutate(() => api.designs.create(pid!, d)),
    removeDesign: (id: string) => mutate(() => api.designs.delete(id)),
    addDecision: (d: Omit<DecisionRec, "id" | "createdAt">) => mutate(() => api.decisions.create(pid!, d)),
    removeDecision: (id: string) => mutate(() => api.decisions.delete(id)),
  };
}

