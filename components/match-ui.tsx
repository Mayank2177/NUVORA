"use client";

import { motion } from "framer-motion";
import { LEVEL_BADGE, LEVEL_LABEL } from "@/lib/capability";
import type { Match, SkillMatch } from "@/lib/matching";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const LABEL_STYLE: Record<Match["label"], string> = {
  Strong: "bg-emerald-50 text-emerald-700",
  Good: "bg-sky-50 text-sky-700",
  Partial: "bg-amber-50 text-amber-700",
  Weak: "bg-slate-100 text-slate-600",
};

export function ScoreRing({ score, size = 88 }: { score: number; size?: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${score}% match`}>
      <svg viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-slate-100" />
        <motion.circle
          cx="40" cy="40" r={r} fill="none" strokeWidth="7" strokeLinecap="round" className="stroke-brand-600"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score / 100) }} transition={{ duration: 0.9, ease: EASE }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-semibold" style={{ fontSize: size / 4.5 }}>{score}%</span>
    </div>
  );
}

const explain = (s: SkillMatch, you: boolean) => {
  if (s.level > 0) return `${s.items} evidence item${s.items === 1 ? "" : "s"}${s.verified ? ", verified by an employer" : ""}`;
  if (s.declared) return `${you ? "You list" : "Listed as a skill"}, but no public evidence backs it yet`;
  return "No evidence for this skill yet";
};

export function SkillBreakdown({ match, you }: { match: Match; you: boolean }) {
  return (
    <ul className="space-y-4">
      {match.skills.map((s, i) => (
        <li key={s.skill}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{s.skill}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_BADGE[s.level]}`}>L{s.level} {LEVEL_LABEL[s.level]}</span>
            <span className="ml-auto text-xs text-slate-500">{Math.round(s.weight * 100)}% credit</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${s.skill}: ${Math.round(s.weight * 100)}% credit`}>
            <motion.div className="h-full rounded-full bg-brand-600" initial={{ width: 0 }} animate={{ width: `${s.weight * 100}%` }} transition={{ duration: 0.8, delay: i * 0.08, ease: EASE }} />
          </div>
          <p className="mt-1.5 text-sm text-slate-600">{explain(s, you)}</p>
        </li>
      ))}
    </ul>
  );
}

export function HowScored() {
  return (
    <p className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
      How this is scored: each required skill earns credit from the level the evidence supports (L0 15%, L1 40%, L2 70%, L3 90%, L4 100%), and the score is the average. It&apos;s a transparent rule, not an AI judgement, so treat it as a starting point for a conversation.
    </p>
  );
}