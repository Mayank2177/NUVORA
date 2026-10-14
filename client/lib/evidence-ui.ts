import { Bot, BookOpen, Camera, Check, FlaskConical, GitCommit, GitPullRequest, Lightbulb, type LucideIcon } from "lucide-react";
import type { EvidenceType, Provenance } from "@/lib/data";

export const PROV_STYLE: Record<Provenance, string> = {
  Human: "bg-emerald-50 text-emerald-700",
  "AI-assisted": "bg-violet-50 text-violet-700",
  Collaborator: "bg-amber-50 text-amber-700",
  External: "bg-sky-50 text-sky-700",
};

export const TYPE_ICON: Record<EvidenceType, LucideIcon> = {
  Commit: GitCommit,
  "Pull request": GitPullRequest,
  Test: FlaskConical,
  Screenshot: Camera,
  Decision: Lightbulb,
  Learning: BookOpen,
  "AI session": Bot,
  "Blocker resolved": Check,
};
