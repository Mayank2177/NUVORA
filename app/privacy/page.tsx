import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalLayout, type LegalSection } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Nuvora stores, where it lives, and the controls you have.",
};

const sections: LegalSection[] = [
  {
    id: "summary",
    title: "The short version",
    body: (
      <ul>
        <li>Your projects are <strong>private by default</strong>. You choose what becomes public.</li>
        <li>In this version of Nuvora, your data is stored in your own browser, not on our servers.</li>
        <li>We don&apos;t sell your data, run ads, or use advertising trackers.</li>
        <li>Integrations are read-only unless you explicitly allow more.</li>
      </ul>
    ),
  },
  {
    id: "collect",
    title: "What Nuvora stores",
    body: (
      <>
        <p>To work, Nuvora keeps the things you give it:</p>
        <ul>
          <li><strong>Account details:</strong> your name and email, and your password if you sign up with email.</li>
          <li><strong>Project context:</strong> project names, goals, users, constraints, stage, tasks, blockers and decisions.</li>
          <li><strong>Evidence:</strong> commits, notes, screenshots, designs and links you add, each with its provenance and visibility setting.</li>
          <li><strong>Published stories:</strong> the snapshot of what you chose to make public.</li>
        </ul>
      </>
    ),
  },
  {
    id: "where",
    title: "Where your data lives",
    body: (
      <>
        <p>This version of Nuvora runs entirely in your browser. Your account and project data are saved in your browser&apos;s local storage on your device and aren&apos;t sent to our servers.</p>
        <p>That has two consequences worth knowing: clearing your browser data deletes your projects, and published pages can currently only be opened in the browser that published them. When we add cloud accounts, we will update this policy first and tell you what changes.</p>
      </>
    ),
  },
  {
    id: "integrations",
    title: "GitHub and other tools",
    body: (
      <>
        <p>When you enter a repository, this version uses sample activity to show how evidence works, and does not connect to GitHub.</p>
        <p>Real integrations will be read-only by default, will ask for your permission first, and will only read what is needed to build your evidence. Captured information stays private until you say otherwise.</p>
      </>
    ),
  },
  {
    id: "public",
    title: "Public pages",
    body: (
      <>
        <p>A project page is public only after you publish it, and it shows only the items you switched on. Please check what you share: public pages can be read, copied and indexed by others.</p>
        <p>We scan for common secrets and flag email addresses before publishing, but the scan isn&apos;t perfect. Never put passwords or API keys in your evidence.</p>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI features",
    body: <p>Suggested next steps and generated stories are currently produced by simple rules running in your browser. Nothing you write is sent to an AI service. If we add AI-assisted features later, we&apos;ll say so here and ask before using your content.</p>,
  },
  {
    id: "cookies",
    title: "Cookies and tracking",
    body: <p>We use browser storage only to keep you signed in and to remember your projects. We don&apos;t use analytics or advertising cookies in this version.</p>,
  },
  {
    id: "choices",
    title: "Your choices",
    body: (
      <ul>
        <li>Edit or delete evidence, designs, decisions, tasks and blockers at any time.</li>
        <li>Unpublish a page from the Publish screen to take it offline.</li>
        <li>Log out from the sidebar, and clear your browser&apos;s site data to erase everything stored on your device.</li>
        <li>For any other request, <a href={`mailto:${CONTACT_EMAIL}`}>contact us</a>.</li>
      </ul>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>Nuvora isn&apos;t meant for children under 13, and we don&apos;t knowingly collect their information.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>We&apos;ll update this page as Nuvora changes, and note the date above. Read it together with our <Link href="/terms">Terms of Service</Link>.</p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: <p>Questions about privacy? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      intro="What Nuvora stores, where it lives, and the controls you have. We wrote it to be read, not skimmed past."
      updated="September 29, 2026"
      sections={sections}
      other={{ label: "Terms of Service", href: "/terms" }}
    />
  );
}