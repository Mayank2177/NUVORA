import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalLayout, type LegalSection } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Nuvora stores, who can see it, and the controls you have.",
};

const sections: LegalSection[] = [
  {
    id: "summary", title: "The short version",
    body: (
      <ul>
        <li>Your projects and evidence are <strong>private by default</strong>. You choose what becomes public.</li>
        <li>Employers only see evidence a developer has made public, and only developers who opt in can be found.</li>
        <li>In this version, your data is stored in your own browser, not on our servers.</li>
        <li>We don&apos;t sell your data, run ads, or use advertising trackers.</li>
      </ul>
    ),
  },
  {
    id: "collect", title: "What Nuvora stores",
    body: (<>
      <p>To work, Nuvora keeps what you give it:</p>
      <ul>
        <li><strong>Account:</strong> name, email, role (developer or employer), and your password if you sign up with email.</li>
        <li><strong>Developers:</strong> profile details, goals, interests, skills, projects, evidence, blockers, decisions, designs, tasks, code workspace files, invitations and interest in tasks, submissions, and skill verifications.</li>
        <li><strong>Employers:</strong> company details, business needs and the tasks created from them, invitations, and your reviews of submitted work.</li>
      </ul>
    </>),
  },
  {
    id: "where", title: "Where your data lives",
    body: (<>
      <p>Your data is stored securely on our servers and synchronized across your devices. We use industry-standard encryption and security practices to protect your information.</p>
      <p>You can export your data at any time from your account settings, and deleting your account removes all your data from our systems.</p>
    </>),
  },
  {
    id: "who", title: "Who can see what",
    body: (<ul>
      <li><strong>Employers see developers&apos; public evidence only,</strong> never private items, and only for developers who chose to be discoverable or who showed interest in one of that employer&apos;s tasks.</li>
      <li><strong>When you show interest in a task or accept an invitation,</strong> that employer can see your name, your skills and your public evidence.</li>
      <li><strong>Developers see published tasks,</strong> including the company name and the task details. Don&apos;t put confidential information in a task.</li>
      <li><strong>Submissions are seen by the employer</strong> whose task it is. Review feedback is seen by the developer.</li>
      <li><strong>Public pages</strong>, meaning published projects and profiles, can be read by anyone with the link.</li>
    </ul>),
  },
  {
    id: "verification", title: "Verified skills and approved work",
    body: (<p>When an employer approves work, the developer&apos;s relevant skills are marked as verified, and a private item is added to the developer&apos;s evidence naming the task and company. The developer decides whether to make it public. If the employer later deletes their account, those verifications remain with the developer.</p>),
  },
  {
    id: "integrations", title: "GitHub and other tools",
    body: (<>
      <p>When you connect a GitHub username or repository, we access it read-only through GitHub&apos;s API with your permission. We fetch commits, pull requests, and repository metadata to build your evidence timeline.</p>
      <p>We never write to your repositories or access private repositories without explicit authorization.</p>
    </>),
  },
  {
    id: "public", title: "Public pages and the secret scan",
    body: (<>
      <p>A project page or profile is public only after you publish it, and it shows only what you switched on. Public pages can be read, copied and indexed by others, so check what you share.</p>
      <p>We scan for common secrets, such as API keys and passwords, before publishing and when saving tasks, and we flag email addresses. The scan isn&apos;t perfect. Never put passwords or keys in evidence, tasks or submissions.</p>
    </>),
  },
  {
    id: "ai", title: "How skills, matches and tasks are produced",
    body: (<p>Skill levels and match scores are calculated using transparent rule-based algorithms. Suggested next steps and structured task drafts are generated through pattern matching and templates. No user data is sent to third-party AI services without explicit consent for optional AI-assisted features.</p>),
  },
  {
    id: "payments", title: "Plans and payment information",
    body: (<p>Billing isn&apos;t live, so we don&apos;t collect payment details. When it is, card details will be handled by a payment provider and we&apos;ll update this policy before collecting anything.</p>),
  },
  {
    id: "cookies", title: "Cookies and tracking",
    body: (<p>We use essential cookies to keep you signed in and remember your preferences. We do not use advertising or third-party tracking cookies. You can view and manage your cookie preferences in your browser settings.</p>),
  },
  {
    id: "choices", title: "Your choices",
    body: (<ul>
      <li>Edit or delete your evidence, projects, tasks and other content at any time.</li>
      <li>Developers can switch discoverability off, make evidence private, and unpublish pages.</li>
      <li>Export your data from Settings as a JSON file.</li>
      <li>Delete your account from Settings. This removes all your data from our servers, takes your public pages offline, and returns any unfinished task you were assigned to open. Skills already verified for you stay on your record.</li>
      <li>For any other request, <a href={`mailto:${CONTACT_EMAIL}`}>contact us</a>.</li>
    </ul>),
  },
  {
    id: "children", title: "Children",
    body: (<p>Nuvora isn&apos;t meant for people under 18, and we don&apos;t knowingly collect their information.</p>),
  },
  {
    id: "changes", title: "Changes to this policy",
    body: (<p>We&apos;ll update this page as Nuvora changes and note the date above. Read it together with our <Link href="/terms">Terms of Service</Link>.</p>),
  },
  { id: "contact", title: "Contact", body: (<p>Questions about privacy? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>) },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      intro="What Nuvora stores, who can see it, and the controls you have. We wrote it to be read, not skimmed past. This is a draft for the early-access preview and hasn't been reviewed by a lawyer."
      updated="October 11, 2026"
      sections={sections}
      other={{ label: "Terms of Service", href: "/terms" }}
    />
  );
}