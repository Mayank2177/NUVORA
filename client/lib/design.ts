"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
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

type ApiDesign = {
  id: string;
  project_id: string;
  title: string;
  kind: Kind;
  tool: Tool;
  url: string;
  image?: string;
  note: string;
  stage: Stage;
  created_at: string;
};

type ApiDecision = {
  id: string;
  project_id: string;
  decision: string;
  reason: string;
  stage: Stage;
  created_at: string;
};

type DesignListResponse = {
  designs: ApiDesign[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

type DecisionListResponse = {
  decisions: ApiDecision[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

function toFrontendDesign(apiDesign: ApiDesign): Design {
  return {
    id: apiDesign.id,
    title: apiDesign.title,
    kind: apiDesign.kind,
    tool: apiDesign.tool,
    url: apiDesign.url,
    image: apiDesign.image,
    note: apiDesign.note,
    stage: apiDesign.stage,
    createdAt: apiDesign.created_at,
  };
}

function toFrontendDecision(apiDecision: ApiDecision): DecisionRec {
  return {
    id: apiDecision.id,
    decision: apiDecision.decision,
    reason: apiDecision.reason,
    stage: apiDecision.stage,
    createdAt: apiDecision.created_at,
  };
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

const EVENT = "nuvora:design";

function notifyChange() {
  window.dispatchEvent(new Event(EVENT));
}

export function useDesign(pid: string | undefined) {
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [decisions, setDecisions] = useState<DecisionRec[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!pid) {
      setDesigns(null);
      setDecisions(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [designsRes, decisionsRes] = await Promise.all([
        api.get<DesignListResponse>(`/api/projects/${pid}/designs?limit=100&order=desc`),
        api.get<DecisionListResponse>(`/api/projects/${pid}/decisions?limit=100&order=desc`),
      ]);

      setDesigns(designsRes.designs.map(toFrontendDesign));
      setDecisions(decisionsRes.decisions.map(toFrontendDecision));
    } catch (error) {
      console.error("Failed to fetch designs/decisions:", error);
      setError("Could not load designs and decisions. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => {
    void Promise.resolve().then(fetchData);

    const handleEvent = () => {
      fetchData();
    };

    window.addEventListener(EVENT, handleEvent);
    return () => {
      window.removeEventListener(EVENT, handleEvent);
    };
  }, [fetchData]);

  const addDesign = useCallback(
    async (d: Omit<Design, "id" | "createdAt">) => {
      if (!pid) return false;

      const tempDesign: Design = {
        ...d,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };

      setDesigns(prev => prev ? [tempDesign, ...prev] : [tempDesign]);

      try {
        const response = await api.post<{ design: ApiDesign }>(`/api/projects/${pid}/designs`, {
          title: d.title,
          kind: d.kind,
          tool: d.tool,
          url: d.url,
          image: d.image,
          note: d.note,
          stage: d.stage,
        });

        setDesigns(prev => prev ? prev.map(design => 
          design.id === tempDesign.id ? toFrontendDesign(response.design) : design
        ) : [toFrontendDesign(response.design)]);

        notifyChange();
        return true;
      } catch (error) {
        console.error("Failed to add design:", error);
        fetchData();
        return false;
      }
    },
    [pid, fetchData],
  );

  const removeDesign = useCallback(
    async (id: string) => {
      if (!pid) return false;

      setDesigns(prev => prev ? prev.filter(d => d.id !== id) : null);

      try {
        await api.delete(`/api/designs/${id}`);
        notifyChange();
        return true;
      } catch (error) {
        console.error("Failed to remove design:", error);
        fetchData();
        return false;
      }
    },
    [pid, fetchData],
  );

  const addDecision = useCallback(
    async (d: Omit<DecisionRec, "id" | "createdAt">) => {
      if (!pid) return false;

      const tempDecision: DecisionRec = {
        ...d,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };

      setDecisions(prev => prev ? [tempDecision, ...prev] : [tempDecision]);

      try {
        const response = await api.post<{ decision: ApiDecision }>(`/api/projects/${pid}/decisions`, {
          decision: d.decision,
          reason: d.reason,
          stage: d.stage,
        });

        setDecisions(prev => prev ? prev.map(dec => 
          dec.id === tempDecision.id ? toFrontendDecision(response.decision) : dec
        ) : [toFrontendDecision(response.decision)]);

        notifyChange();
        return true;
      } catch (error) {
        console.error("Failed to add decision:", error);
        fetchData();
        return false;
      }
    },
    [pid, fetchData],
  );

  const removeDecision = useCallback(
    async (id: string) => {
      if (!pid) return false;

      setDecisions(prev => prev ? prev.filter(d => d.id !== id) : null);

      try {
        await api.delete(`/api/decisions/${id}`);
        notifyChange();
        return true;
      } catch (error) {
        console.error("Failed to remove decision:", error);
        fetchData();
        return false;
      }
    },
    [pid, fetchData],
  );

  return {
    designs,
    decisions,
    loading,
    error,
    addDesign,
    removeDesign,
    addDecision,
    removeDecision,
    refresh: fetchData,
  };
}
