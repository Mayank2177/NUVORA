"use client";

import { saveDevRecord } from "@/lib/market";
import { saveOffers, type Offer } from "@/lib/offers";
import type { Evidence } from "@/lib/data";
import type { Project, Stage } from "@/lib/store";
import { loadTasks, saveTasks, type Task } from "@/lib/market";
import { buildChecks, loadSubmissions, saveSubmissions, type Submission } from "@/lib/submissions";

const FLAG = "nuvora:demo-extra:v1";
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const uid = () => crypto.randomUUID();
const put = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
const ev = (type: Evidence["type"], text: string, days: number, source: string, provenance: Evidence["provenance"], stage: Stage): Evidence => ({
  id: uid(), type, text, date: ago(days), source, provenance, stage, public: true,
});

export function seedExtraDevs() {
  if (localStorage.getItem(FLAG)) return;

  /* Chidi: visible to employers, early in his journey */
  const chidi = "demo-dev-chidi";
  const chidiProject: Project = {
    id: "demo-p-chidi", name: "Portfolio Site", goal: "A personal portfolio built with React and Tailwind CSS.",
    users: "Recruiters and clients", constraints: "Evenings and weekends only.", stage: "Build", repo: "chidi-eze/portfolio", createdAt: ago(25),
  };
  put(`nuvora:projects:${chidi}`, [chidiProject]);
  put(`nuvora:active:${chidi}`, chidiProject.id);
  put(`nuvora:data:${chidiProject.id}`, {
    blockers: [],
    evidence: [
      ev("Learning", "Completed the React basics tutorial", 24, "freeCodeCamp", "External", "Learn"),
      ev("Commit", "Build responsive layout with CSS", 18, "chidi-eze/portfolio", "Human", "Build"),
      ev("Commit", "Add React components for project cards", 14, "chidi-eze/portfolio", "Human", "Build"),
      ev("Commit", "Fix mobile menu overflow", 9, "chidi-eze/portfolio", "AI-assisted", "Build"),
    ],
  });
  saveDevRecord({
    userId: chidi, name: "Chidi Eze", goals: ["Get my first developer job"], interests: ["Web development"],
    skills: [{ name: "React", level: "Intermediate" }, { name: "JavaScript", level: "Intermediate" }, { name: "HTML and CSS", level: "Advanced" }, { name: "Python", level: "Beginner" }],
    githubHandle: "chidi-eze", openToWork: true, completedAt: ago(26),
  });

  /* Zainab: strong backend evidence, but hidden. Employers never find her unless she raises her hand. */
  const zainab = "demo-dev-zainab";
  const zProject: Project = {
    id: "demo-p-zainab", name: "Inventory API", goal: "A REST API with a SQL database for tracking warehouse stock.",
    users: "Small warehouses", constraints: "Must be well tested.", stage: "Validate", repo: "zainab-musa/inventory-api", createdAt: ago(60),
  };
  put(`nuvora:projects:${zainab}`, [zProject]);
  put(`nuvora:active:${zainab}`, zProject.id);
  put(`nuvora:data:${zProject.id}`, {
    blockers: [],
    evidence: [
      ev("Commit", "Design the SQL schema for stock items", 55, "zainab-musa/inventory-api", "Human", "Build"),
      ev("Commit", "Implement REST endpoints with Node and Express", 48, "zainab-musa/inventory-api", "Human", "Build"),
      ev("Commit", "Add input validation and error handling", 40, "zainab-musa/inventory-api", "Human", "Build"),
      ev("Pull request", "Merge authentication middleware", 33, "zainab-musa/inventory-api", "Collaborator", "Build"),
      ev("Test", "52 integration tests for the API (passing)", 28, "zainab-musa/inventory-api", "Human", "Validate"),
      ev("Commit", "Add a database index to speed up stock queries", 20, "zainab-musa/inventory-api", "Human", "Build"),
    ],
  });
  saveDevRecord({
    userId: zainab, name: "Zainab Musa", goals: ["Get freelance or contract work"], interests: ["APIs and backend"],
    skills: [{ name: "Node.js", level: "Advanced" }, { name: "SQL", level: "Advanced" }, { name: "APIs", level: "Advanced" }, { name: "Testing", level: "Intermediate" }],
    githubHandle: "zainab-musa", openToWork: false, completedAt: ago(62),
  });

  /* One invitation to Ada, and one expression of interest from Chidi */
  const offers: Offer[] = [
    { id: uid(), taskId: "demo-t3", devId: "demo-dev", devName: "Ada Okafor", origin: "invite", status: "pending", createdAt: ago(0) },
    { id: uid(), taskId: "demo-t1", devId: chidi, devName: "Chidi Eze", origin: "interest", status: "pending", createdAt: ago(1) },
  ];
  saveOffers(offers);

  localStorage.setItem(FLAG, "1");
}

export function seedValidationDemo() {
  const FLAG2 = "nuvora:demo-extra:v2";
  if (localStorage.getItem(FLAG2)) return;

  const base = { employerId: "demo-emp", company: "Acme Logistics", assigneeId: "demo-dev", publishedAt: ago(6) };
  const accept4 = ["Adding items on a phone no longer empties the cart", "A new test reproduces the original bug", "No other checkout behaviour changes"];
  const tasks: Task[] = [
    {
      ...base, id: "demo-t4", rawNeed: "Customers say the cart empties on mobile", title: "Fix the cart emptying on mobile checkout",
      summary: "Customers on phones lose their cart when they navigate back from checkout. Find the cause and fix it.",
      requirements: ["Reproduce the problem on a phone", "Fix the cause without breaking checkout", "Add a test that would have caught it"],
      skills: ["JavaScript", "Testing", "Git"], complexity: "Small", scope: "Two to four days of work", acceptance: accept4,
      status: "in_review", createdAt: ago(7),
    },
    {
      ...base, id: "demo-t5", rawNeed: "Our public API gets hammered", title: "Add rate limiting to the public API",
      summary: "A few clients send far too many requests. Add sensible rate limits that protect the service without blocking normal use.",
      requirements: ["Limit requests per client over a time window", "Return a clear error when the limit is hit", "Make the limits configurable"],
      skills: ["Node.js", "APIs", "Testing"], complexity: "Medium", scope: "One week of work",
      acceptance: ["Clients over the limit receive a clear 429 response", "Normal traffic is unaffected", "Tests cover under-limit and over-limit cases"],
      status: "assigned", createdAt: ago(4),
    },
  ];
  saveTasks([...tasks, ...loadTasks().filter((t) => !tasks.some((x) => x.id === t.id))]);

  const summary = "The cart was cleared by a state reset on the back navigation. I now persist it between steps and added a regression test.";
  const link = "https://github.com/example/shop/pull/42";
  const criteria = accept4.map((text, i) => ({
    text,
    how: ["Tested on a phone-sized viewport: items stay after going back.", "cart.test.js fails on the old code and passes now.", "Ran the full checkout flow and the existing tests: nothing else changed."][i],
  }));
  const testRun = { project: "Route Planner API", file: "cart.test.js", passed: 6, total: 6, failures: [], ranAt: ago(0), ms: 42 };
  const sub: Submission = {
    id: uid(), taskId: "demo-t4", devId: "demo-dev", devName: "Ada Okafor", round: 1, submittedAt: ago(0),
    summary, link, criteria, tests: testRun, checks: buildChecks({ summary, link, criteria, tests: testRun }),
  };
  saveSubmissions([sub, ...loadSubmissions().filter((s) => s.id !== sub.id)]);

  localStorage.setItem(FLAG2, "1");
}