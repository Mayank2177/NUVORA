import type { Complexity } from "@/lib/market";

export type Digest = {
  title: string; summary: string; requirements: string[]; skills: string[];
  complexity: Complexity; scope: string; acceptance: string[];
};

type Cat = {
  terms: string[]; title: string; goal: string; requirements: string[]; skills: string[]; acceptance: string[]; complexity: Complexity;
};

/* Rule-based: it looks for keywords and fills in a sensible template. It doesn't understand your business,
   so the result is always a draft for the employer to review. */
const CATS: Cat[] = [
  {
    terms: ["slow", "performance", "speed", "lag", "laggy", "loading", "load time", "timeout", "timeouts", "sluggish"],
    title: "Improve performance", goal: "The goal is to find what is making it slow and fix the biggest causes.",
    requirements: ["Measure current load times and record a baseline", "Find the biggest causes of the slowness", "Fix the top problems", "Report what changed and the measured improvement"],
    skills: ["JavaScript", "Web performance"],
    acceptance: ["Measured load time is clearly better than the baseline", "Existing features still work", "A short written report with before and after numbers"],
    complexity: "Medium",
  },
  {
    terms: ["portal", "dashboard", "admin", "internal tool", "back office", "backoffice", "crm", "spreadsheet", "database", "records"],
    title: "Build an internal tool", goal: "The goal is a simple, secure tool that replaces the manual process staff use today.",
    requirements: ["Let signed-in staff search and view the records", "Allow editing with input validation", "Record who changed what, and when", "Restrict access to authorised people"],
    skills: ["TypeScript", "Node.js", "SQL", "Testing"],
    acceptance: ["Only authorised staff can open the tool", "Edits are validated and logged", "Automated tests cover the main flows"],
    complexity: "Large",
  },
  {
    terms: ["api", "integration", "integrate", "connect", "webhook", "sync", "third-party", "third party", "stripe", "payment", "payments"],
    title: "Integrate an external service", goal: "The goal is a reliable connection between your system and the outside service.",
    requirements: ["Connect to the external service securely", "Handle errors, timeouts and rate limits gracefully", "Keep credentials out of the code", "Document how the integration works"],
    skills: ["APIs", "Node.js", "Testing"],
    acceptance: ["Data flows correctly in the happy path", "A clear fallback appears when the service fails", "Tests cover success and failure"],
    complexity: "Medium",
  },
  {
    terms: ["website", "landing page", "web page", "webpage", "site", "redesign", "homepage"],
    title: "Build or update the website", goal: "The goal is a clear, fast, mobile-friendly web page that does its job.",
    requirements: ["Work from the existing content and brand", "Make the layout responsive on phones and desktops", "Keep pages accessible and quick to load"],
    skills: ["HTML and CSS", "JavaScript", "React"],
    acceptance: ["Looks right on a phone and a laptop", "Passes a basic accessibility check", "Content matches what was agreed"],
    complexity: "Medium",
  },
  {
    terms: ["bug", "broken", "crash", "crashes", "error", "errors", "not working", "fails", "failing", "fix"],
    title: "Fix a defect", goal: "The goal is to find the cause of the problem and fix it properly.",
    requirements: ["Reproduce the problem and confirm the cause", "Fix it without breaking related behaviour", "Add a test that would have caught it"],
    skills: ["JavaScript", "Testing", "Git"],
    acceptance: ["The problem no longer happens", "A new test covers it", "No related features regress"],
    complexity: "Small",
  },
  {
    terms: ["automate", "automation", "report", "reports", "script", "csv", "excel", "manual", "repetitive"],
    title: "Automate a manual process", goal: "The goal is to replace repeated manual work with a script or small service.",
    requirements: ["Understand the current manual steps", "Automate them reliably", "Log what the automation does", "Document how to run and maintain it"],
    skills: ["Python", "SQL", "Testing"],
    acceptance: ["The result matches the manual process on sample data", "Failures are logged clearly", "Instructions are included"],
    complexity: "Medium",
  },
  {
    terms: ["login", "log in", "sign in", "signup", "sign up", "authentication", "accounts", "users", "password"],
    title: "Add user accounts and sign-in", goal: "The goal is secure sign-up and sign-in that people can trust.",
    requirements: ["Let people create an account and sign in", "Store credentials securely", "Protect pages that need a signed-in user", "Handle password reset"],
    skills: ["Node.js", "TypeScript", "Testing"],
    acceptance: ["Signed-out visitors can't open protected pages", "Passwords are never stored in plain text", "Tests cover sign-in and sign-out"],
    complexity: "Medium",
  },
  {
    terms: ["mobile app", "ios", "android", "app store"],
    title: "Build a mobile app", goal: "The goal is a working mobile app that covers the core need.",
    requirements: ["Agree the core screens and flows", "Build and test on real devices", "Connect to your existing data or API"],
    skills: ["React", "JavaScript", "APIs"],
    acceptance: ["Core flows work on iOS and Android", "Works with the existing backend", "A build the team can install and try"],
    complexity: "Large",
  },
];

const NUM: Record<Complexity, number> = { Small: 1, Medium: 2, Large: 3 };
const BY_NUM: Complexity[] = ["Small", "Small", "Medium", "Large"];
const SCOPE: Record<Complexity, string> = {
  Small: "Two to four days of work",
  Medium: "One to two weeks of work",
  Large: "Two to four weeks of work",
};

export const EXAMPLES = [
  "Our website is slow",
  "Need an internal database portal for staff",
  "Need to integrate a shipping rates API",
  "Customers say login keeps failing on mobile",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text: string, term: string) => new RegExp(`(^|[^a-z0-9])${esc(term)}([^a-z0-9]|$)`, "i").test(text);
const uniq = (a: string[]) => [...new Set(a)];

export function digestNeed(raw: string): Digest {
  const text = raw.trim().replace(/\s+/g, " ");
  const hits = CATS.map((c) => ({ c, n: c.terms.filter((t) => has(text, t)).length }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).map((x) => x.c);
  const main = hits.slice(0, 3);

  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  const said = (sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence).replace(/[.!?]+$/, "");

  if (main.length === 0) {
    return {
      title: said.length > 70 ? `${said.slice(0, 67)}...` : said,
      summary: `${said}. We couldn't match this to a common type of work, so review every field and make it specific.`,
      requirements: ["Confirm the exact problem and who it affects", "Deliver a working solution for the described need", "Document how it works and how to maintain it"],
      skills: ["JavaScript", "Git"], complexity: "Medium", scope: SCOPE.Medium,
      acceptance: ["The described problem is solved in a real environment", "The developer explains what changed and why", "Work is delivered through a pull request"],
    };
  }

  let score = Math.max(...main.map((c) => NUM[c.complexity]));
  if (main.length >= 3 && score < 3) score++;
  if (text.length > 300 && score < 3) score++;
  const complexity = BY_NUM[score];

  return {
    title: main[0].title,
    summary: `${said}. ${main[0].goal}`,
    requirements: uniq(main.flatMap((c) => c.requirements.slice(0, 3))).slice(0, 6),
    skills: uniq(main.flatMap((c) => c.skills)).slice(0, 6),
    complexity,
    scope: SCOPE[complexity],
    acceptance: uniq(main.flatMap((c) => c.acceptance.slice(0, 3))).slice(0, 5),
  };
}