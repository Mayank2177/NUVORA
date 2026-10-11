"use client";

import { startSession, type AuthUser, type Role } from "@/lib/auth";
import { saveDevRecord, saveEmployerRecord, saveTasks, type Task } from "@/lib/market";
import type { Project, Stage } from "@/lib/store";
import { seedExtraDevs, seedValidationDemo } from "@/lib/demo-extra";
import type { Blocker, Evidence, ProjectData } from "@/lib/data";

export const DEMO_DEV: AuthUser = { id: "demo-dev", name: "Ada Okafor", email: "ada@demo.nuvora.dev", role: "developer" };
export const DEMO_EMPLOYER: AuthUser = { id: "demo-emp", name: "Tunde Bello", email: "tunde@demo.nuvora.dev", role: "employer" };

const FLAG = "nuvora:demo-seeded:v1";
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const uid = () => crypto.randomUUID();
const put = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));

const ev = (type: Evidence["type"], text: string, days: number, source: string, provenance: Evidence["provenance"], stage: Stage): Evidence => ({
  id: uid(), type, text, date: ago(days), source, provenance, stage, public: true,
});

function seedDemo() {
  if (localStorage.getItem(FLAG)) return;

  /* ---- developer: two projects with public evidence ---- */
  const projects: Project[] = [
    { id: "demo-p1", name: "EduBoost AI", goal: "Build an AI-powered learning platform for students.", users: "African students and developers", constraints: "Small team. Limited development time.", stage: "Build", repo: "ada-okafor/eduboost-ai", createdAt: ago(21) },
    { id: "demo-p2", name: "Route Planner API", goal: "A REST API that plans delivery routes for small logistics teams.", users: "Local delivery businesses", constraints: "Must run on a single cheap server.", stage: "Validate", repo: "ada-okafor/route-api", createdAt: ago(40) },
  ];
  const resolved: Blocker = {
    id: uid(), title: "Slow database queries under load", status: "resolved",
    attempts: ["Profiled the slow endpoint", "Checked for missing indexes", "Tried caching the full response"],
    solution: "Added an index on the route lookup and cached the heavy query for 60 seconds.",
    createdAt: ago(30), resolvedAt: ago(29),
  };
  const data: Record<string, ProjectData> = {
    "demo-p1": {
      blockers: [],
      evidence: [
        ev("Decision", "Chose Firebase over Supabase. The team already knows it.", 20, "Nuvora", "Collaborator", "Prototype"),
        ev("Commit", "Set up React and TypeScript project", 18, "ada-okafor/eduboost-ai", "Human", "Build"),
        ev("Commit", "Add authentication flow", 14, "ada-okafor/eduboost-ai", "Human", "Build"),
        ev("AI session", "Debugged Firebase environment config", 13, "Claude Code", "AI-assisted", "Build"),
        ev("Pull request", "Merge study planner feature", 9, "ada-okafor/eduboost-ai", "Collaborator", "Build"),
        ev("Test", "24 unit tests for auth (passing)", 7, "ada-okafor/eduboost-ai", "Human", "Validate"),
        ev("Screenshot", "Dashboard completed on mobile", 3, "CleanShot X", "Human", "Document"),
      ],
    },
    "demo-p2": {
      blockers: [resolved],
      evidence: [
        ev("Learning", "Completed a course on REST API design", 38, "freeCodeCamp", "External", "Learn"),
        ev("Commit", "Implement route optimisation endpoint", 30, "ada-okafor/route-api", "Human", "Build"),
        ev("Commit", "Add request validation and error handling", 26, "ada-okafor/route-api", "Human", "Build"),
        ev("Blocker resolved", "Slow database queries under load: indexed and cached", 29, "Nuvora", "Human", "Build"),
        ev("Test", "41 integration tests for the API (passing)", 22, "ada-okafor/route-api", "Human", "Validate"),
        ev("Pull request", "Merge rate limiting from a collaborator", 18, "ada-okafor/route-api", "Collaborator", "Build"),
      ],
    },
  };
  put(`nuvora:projects:${DEMO_DEV.id}`, projects);
  put(`nuvora:active:${DEMO_DEV.id}`, "demo-p1");
  projects.forEach((p) => put(`nuvora:data:${p.id}`, data[p.id]));

  saveDevRecord({
    userId: DEMO_DEV.id,
    goals: ["Get a first paid contract", "Build a strong portfolio"],
    interests: ["Web performance", "APIs", "Education technology"],
    skills: [
      { name: "JavaScript", level: "Advanced" }, { name: "React", level: "Advanced" }, { name: "TypeScript", level: "Intermediate" },
      { name: "Node.js", level: "Intermediate" }, { name: "Testing", level: "Intermediate" }, { name: "SQL", level: "Beginner" },
    ],
    githubHandle: "ada-okafor", openToWork: true, completedAt: ago(40),
  });

  /* ---- employer: a company with three published tasks ---- */
  saveEmployerRecord({
    userId: DEMO_EMPLOYER.id, company: "Acme Logistics", industry: "Logistics", teamSize: "11 to 50",
    website: "https://example.com", needs: ["Web performance", "Internal tools", "Integrations"], completedAt: ago(15),
  });

  const base = { employerId: DEMO_EMPLOYER.id, company: "Acme Logistics", status: "open" as const };
  const tasks: Task[] = [
    {
      ...base, id: "demo-t1", rawNeed: "Our website is slow", title: "Speed up the customer website",
      summary: "The public site takes too long to load, especially on mobile. Find the main causes and fix the biggest ones.",
      requirements: ["Measure current load times and report a baseline", "Fix the three biggest performance problems", "Document what changed and the measured improvement"],
      skills: ["JavaScript", "React", "Web performance"], complexity: "Medium", scope: "About one week of work, frontend only",
      acceptance: ["Largest content paint under 2.5 seconds on mobile", "No regressions in existing pages", "A short written report with before and after numbers"],
      createdAt: ago(5), publishedAt: ago(5),
    },
    {
      ...base, id: "demo-t2", rawNeed: "Need an internal database portal", title: "Build an internal portal to view and edit shipment records",
      summary: "Staff currently edit a spreadsheet. They need a simple login-protected page to search and update shipment records.",
      requirements: ["Search shipments by reference and date", "Edit status and notes with validation", "Log who changed what"],
      skills: ["TypeScript", "Node.js", "SQL", "Testing"], complexity: "Large", scope: "Two to three weeks, full stack",
      acceptance: ["Only signed-in staff can open the portal", "All edits are validated and logged", "Automated tests cover the edit flow"],
      createdAt: ago(3), publishedAt: ago(3),
    },
    {
      ...base, id: "demo-t3", rawNeed: "Need API integration", title: "Integrate a shipping-rates API into checkout",
      summary: "Show live shipping prices at checkout from a third-party rates API, with a sensible fallback when it is down.",
      requirements: ["Fetch live rates for the customer's address", "Handle timeouts and errors gracefully", "Cache results briefly to reduce calls"],
      skills: ["JavaScript", "Node.js", "APIs", "Testing"], complexity: "Small", scope: "Two to four days, backend and checkout page",
      acceptance: ["Checkout shows rates within 2 seconds", "A clear fallback message appears if the API fails", "Integration tests cover success and failure"],
      createdAt: ago(1), publishedAt: ago(1),
    },
  ];
  saveTasks(tasks);

  localStorage.setItem(FLAG, "1");
}

export async function startDemo(role: Role): Promise<AuthUser> {
  await new Promise((r) => setTimeout(r, 500));
    seedDemo();
  seedExtraDevs();
  seedValidationDemo();
  const user = role === "employer" ? DEMO_EMPLOYER : DEMO_DEV;
  startSession(user);
  return user;
}