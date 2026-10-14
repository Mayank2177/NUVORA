"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Project, Stage } from "@/lib/store";

export type Provenance = "Human" | "AI-assisted" | "Collaborator" | "External";
export type EvidenceType =
  | "Commit" | "Pull request" | "Test" | "Screenshot" | "Decision" | "Learning" | "AI session" | "Blocker resolved";

export type Evidence = {
  id: string;
  type: EvidenceType;
  text: string;
  body?: string;
  date: string; // ISO
  source: string;
  provenance: Provenance;
  stage: Stage;
  public?: boolean; // undefined means private
};

export type Blocker = {
  id: string;
  title: string;
  status: "open" | "resolved";
  attempts: string[];
  solution?: string;
  createdAt: string;
  resolvedAt?: string;
};

export type ProjectData = { evidence: Evidence[]; blockers: Blocker[] };

export type NewEvidence = Omit<Evidence, "id" | "date"> & { date?: string };

export { PROV_STYLE, TYPE_ICON } from "@/lib/evidence-ui";

/* ---------- API Types ---------- */

type ApiEvidence = {
  id: string;
  projectId: string;
  type: EvidenceType;
  text: string;
  body?: string;
  date: string;
  source: string;
  provenance: Provenance;
  stage: Stage;
  public: boolean;
  createdAt: string;
  updatedAt?: string;
};

type ApiBlocker = {
  id: string;
  project_id: string;
  title: string;
  status: "open" | "resolved";
  attempts: string[];
  solution?: string;
  created_at: string;
  resolved_at?: string;
};

type EvidenceListResponse = {
  evidence: ApiEvidence[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

type BlockerListResponse = {
  blockers: ApiBlocker[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

/* ---------- Helper Functions ---------- */

function toFrontendEvidence(apiEvidence: ApiEvidence): Evidence {
  return {
    id: apiEvidence.id,
    type: apiEvidence.type,
    text: apiEvidence.body ? `${apiEvidence.text}: ${apiEvidence.body}` : apiEvidence.text,
    date: apiEvidence.date,
    source: apiEvidence.source,
    provenance: apiEvidence.provenance,
    stage: apiEvidence.stage,
    public: apiEvidence.public || undefined,
  };
}

function toFrontendBlocker(apiBlocker: ApiBlocker): Blocker {
  return {
    id: apiBlocker.id,
    title: apiBlocker.title,
    status: apiBlocker.status,
    attempts: apiBlocker.attempts || [],
    solution: apiBlocker.solution,
    createdAt: apiBlocker.created_at,
    resolvedAt: apiBlocker.resolved_at,
  };
}

function toApiEvidenceCreate(input: NewEvidence) {
  return {
    type: input.type,
    text: input.text,
    date: input.date || new Date().toISOString(),
    source: input.source,
    provenance: input.provenance,
    stage: input.stage,
    public: input.public || false,
  };
}

/* ---------- State Management ---------- */

const EVENT = "nuvora:project-data";

function notifyChange() {
  window.dispatchEvent(new Event(EVENT));
}

type State = {
  evidence: Evidence[];
  blockers: Blocker[];
  loading: boolean;
  error: string | null;
};

export function useProjectData(project: Project | null) {
  const pid = project?.id;
  const stage = project?.stage;
  
  const [state, setState] = useState<State>({
    evidence: [],
    blockers: [],
    loading: false,
    error: null,
  });
  const requestId = useRef(0);

  // Fetch both evidence and blockers
  const fetchData = useCallback(async () => {
    const request = ++requestId.current;
    if (!pid) {
      setState({ evidence: [], blockers: [], loading: false, error: null });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Fetch evidence and blockers in parallel
      const [evidenceResponse, blockerResponse] = await Promise.all([
        api.get<EvidenceListResponse>(`/api/projects/${pid}/evidence?limit=100&order=desc`),
        api.get<BlockerListResponse>(`/api/projects/${pid}/blockers?limit=100&order=desc`),
      ]);

      const evidence = evidenceResponse.evidence.map(toFrontendEvidence);
      const blockers = blockerResponse.blockers.map(toFrontendBlocker);

      if (request === requestId.current) setState({ evidence, blockers, loading: false, error: null });
    } catch (error) {
      console.error("Failed to fetch project data:", error);
      const errorMessage = error instanceof ApiError ? error.message : "Failed to load project data";
      if (request === requestId.current) setState((prev) => ({ ...prev, loading: false, error: errorMessage }));
    }
  }, [pid]);

  useEffect(() => {
    void Promise.resolve().then(fetchData);

    const handleEvent = () => {
      fetchData();
    };
    const handleFocus = () => { if (document.visibilityState === "visible") fetchData(); };

    window.addEventListener(EVENT, handleEvent);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    return () => {
      window.removeEventListener(EVENT, handleEvent);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [fetchData]);

  /* ---------- Evidence Operations ---------- */

  const addEvidence = useCallback(
    async (e: NewEvidence) => {
      if (!pid) return;
      requestId.current++;

      try {
        const newEvidence: Evidence = {
          ...e,
          id: crypto.randomUUID(), // Temporary ID for optimistic update
          date: e.date || new Date().toISOString(),
        };

        // Optimistic update
        setState(prev => ({
          ...prev,
          evidence: [newEvidence, ...prev.evidence],
        }));

        const response = await api.post<{ evidence: ApiEvidence }>(
          `/api/projects/${pid}/evidence`,
          toApiEvidenceCreate(e)
        );

        // Replace temporary evidence with real one from backend
        setState(prev => ({
          ...prev,
          evidence: prev.evidence.map(ev => 
            ev.id === newEvidence.id ? toFrontendEvidence(response.evidence) : ev
          ),
        }));

        notifyChange();
      } catch (error) {
        console.error("Failed to add evidence:", error);
        // Revert optimistic update
        fetchData();
        throw error instanceof ApiError ? error : new Error("Failed to add evidence");
      }
    },
    [pid, fetchData],
  );

  const removeEvidence = useCallback(
    async (id: string) => {
      if (!pid) return;

      try {
        // Optimistic removal
        setState(prev => ({
          ...prev,
          evidence: prev.evidence.filter((e) => e.id !== id),
        }));

        await api.delete(`/api/evidence/${id}`);
        notifyChange();
      } catch (error) {
        console.error("Failed to remove evidence:", error);
        // Revert
        fetchData();
        throw error instanceof ApiError ? error : new Error("Failed to remove evidence");
      }
    },
    [pid, fetchData],
  );

  const toggleEvidencePublic = useCallback(
    async (id: string) => {
      if (!pid) return;

      try {
        // Optimistic toggle
        setState(prev => ({
          ...prev,
          evidence: prev.evidence.map((e) => (e.id === id ? { ...e, public: !e.public } : e)),
        }));

        await api.patch(`/api/evidence/${id}/toggle-public`, {});
        notifyChange();
      } catch (error) {
        console.error("Failed to toggle evidence public:", error);
        // Revert
        fetchData();
        throw error instanceof ApiError ? error : new Error("Failed to toggle evidence");
      }
    },
    [pid, fetchData],
  );

  /* ---------- Blocker Operations ---------- */

  const addBlocker = useCallback(
    async (title: string) => {
      if (!pid) return;

      try {
        const tempBlocker: Blocker = {
          id: crypto.randomUUID(),
          title,
          status: "open",
          attempts: [],
          createdAt: new Date().toISOString(),
        };

        // Optimistic update
        setState(prev => ({
          ...prev,
          blockers: [tempBlocker, ...prev.blockers],
        }));

        const response = await api.post<{ blocker: ApiBlocker }>(
          `/api/projects/${pid}/blockers`,
          { title }
        );

        // Replace with real blocker
        setState(prev => ({
          ...prev,
          blockers: prev.blockers.map(b => 
            b.id === tempBlocker.id ? toFrontendBlocker(response.blocker) : b
          ),
        }));

        notifyChange();
      } catch (error) {
        console.error("Failed to add blocker:", error);
        fetchData();
        throw error instanceof ApiError ? error : new Error("Failed to add blocker");
      }
    },
    [pid, fetchData],
  );

  const addAttempt = useCallback(
    async (id: string, attempt: string) => {
      if (!pid) return;

      try {
        // Optimistic update
        setState(prev => ({
          ...prev,
          blockers: prev.blockers.map((b) => 
            (b.id === id ? { ...b, attempts: [...b.attempts, attempt] } : b)
          ),
        }));

        await api.post(`/api/blockers/${id}/attempts`, { attempt });
        notifyChange();
      } catch (error) {
        console.error("Failed to add attempt:", error);
        fetchData();
        throw error instanceof ApiError ? error : new Error("Failed to add attempt");
      }
    },
    [pid, fetchData],
  );

  const resolveBlocker = useCallback(
    async (id: string, solution: string) => {
      if (!pid || !stage) return;

      try {
        const blocker = state.blockers.find((x) => x.id === id);
        if (!blocker) return;

        const now = new Date().toISOString();

        // Optimistic update - resolve blocker and add evidence
        setState(prev => ({
          blockers: prev.blockers.map((x) => 
            (x.id === id ? { ...x, status: "resolved" as const, solution, resolvedAt: now } : x)
          ),
          evidence: [
            {
              id: crypto.randomUUID(),
              type: "Blocker resolved" as const,
              text: `${blocker.title}: ${solution}`,
              date: now,
              source: "Nuvora",
              provenance: "Human" as const,
              stage: stage,
            },
            ...prev.evidence,
          ],
          loading: prev.loading,
          error: prev.error,
        }));

        await api.post(`/api/blockers/${id}/resolve`, { solution });
        
        // Refresh to get accurate state from backend
        fetchData();
        notifyChange();
      } catch (error) {
        console.error("Failed to resolve blocker:", error);
        fetchData();
        throw error instanceof ApiError ? error : new Error("Failed to resolve blocker");
      }
    },
    [pid, stage, state.blockers, fetchData],
  );

  const removeBlocker = useCallback(
    async (id: string) => {
      if (!pid) return;

      try {
        // Optimistic removal
        setState(prev => ({
          ...prev,
          blockers: prev.blockers.filter((b) => b.id !== id),
        }));

        await api.delete(`/api/blockers/${id}`);
        notifyChange();
      } catch (error) {
        console.error("Failed to remove blocker:", error);
        fetchData();
        throw error instanceof ApiError ? error : new Error("Failed to remove blocker");
      }
    },
    [pid, fetchData],
  );

  const data = pid ? { evidence: state.evidence, blockers: state.blockers } : null;

  return {
    data,
    loading: state.loading,
    error: state.error,
    addEvidence,
    removeEvidence,
    toggleEvidencePublic,
    addBlocker,
    addAttempt,
    resolveBlocker,
    removeBlocker,
    refresh: fetchData,
  };
}
