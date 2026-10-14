import type { Snapshot } from "@/lib/publish";

export function normalizeSnapshot(raw: Record<string, unknown>): Snapshot {
  const evidence = Array.isArray(raw.evidence) ? raw.evidence as Record<string, unknown>[] : [];
  const blockers = Array.isArray(raw.blockers) ? raw.blockers as Record<string, unknown>[] : [];
  return {
    ...raw,
    projectId: (raw.projectId ?? raw.project_id) as string,
    publishedAt: (raw.publishedAt ?? raw.published_at) as string,
    evidence: evidence.map((item) => ({
      ...item,
      projectId: item.projectId ?? item.project_id,
      type: item.type ?? "Commit",
      stage: item.stage ?? "Think",
    })),
    blockers: blockers.map((item) => ({
      ...item,
      createdAt: item.createdAt ?? item.created_at,
      resolvedAt: item.resolvedAt ?? item.resolved_at,
    })),
  } as unknown as Snapshot;
}
