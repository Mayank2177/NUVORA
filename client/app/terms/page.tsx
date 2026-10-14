import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalLayout, type LegalSection } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for using Nuvora as a developer or an employer, in plain language.",
};

const sections: LegalSection[] = [
  {
    id: "agreement", title: "Agreeing to these terms",
    body: (<>
      <p>By creating an account or using Nuvora, you agree to these terms and to our <Link href="/privacy">Privacy Policy</Link>. If you don&apos;t agree, please don&apos;t use the service.</p>
      <p>You must be at least 18, or old enough to form a binding agreement where you live. If you sign up for a company, you confirm you&apos;re allowed to act for it.</p>
    </>),
  },
  {
    id: "service", title: "What Nuvora is",
    body: (<>
      <p>Nuvora is a platform that connects developers with businesses. Developers collect evidence of their work, and Nuvora measures their skills from it. Businesses describe technical needs, find developers whose evidence fits, and review the work they deliver.</p>
      <p><strong>Nuvora is not an employer or an agency.</strong> Developers aren&apos;t our employees and don&apos;t work for us. We provide the tools, and the work happens between the business and the developer.</p>
      <p>Nuvora is an early preview. Features change, some are previews that use sample data, and nothing here is a guarantee of work, income or hiring.</p>
    </>),
  },
  {
    id: "account", title: "Accounts",
    body: (<>
      <p>You choose a role when you sign up: developer or employer. Give accurate information, keep your password safe, and tell us if someone else has used your account. One person per account.</p>
    </>),
  },
  {
    id: "content", title: "Your content stays yours",
    body: (<>
      <p>You own what you add to Nuvora: projects, evidence, notes, tasks and submissions. We don&apos;t claim ownership of it.</p>
      <p>You give us permission to store it and show it as needed to run the service, and exactly as you or the other party have chosen, for example on a published page or to an employer you have shown interest in.</p>
    </>),
  },
  {
    id: "visibility", title: "Privacy, visibility and discovery",
    body: (<>
      <p>Everything is <strong>private by default</strong>.</p>
      <ul>
        <li><strong>Developers</strong> decide whether employers can find them, and which evidence is public. Employers only see evidence a developer has made public. Developers who aren&apos;t discoverable can still choose to show interest in a task, which lets that employer see their public evidence.</li>
        <li><strong>Employers&apos; tasks</strong> are visible to developers once published, including the company name, so don&apos;t put confidential details in a task.</li>
        <li>We scan for common secrets like API keys before publishing or saving, but the scan is not perfect. You are responsible for what you make public.</li>
        <li>Once something has been public, others may have seen or copied it. Taking it down can&apos;t undo that.</li>
      </ul>
    </>),
  },
  {
    id: "evidence", title: "Honest evidence and AI use",
    body: (<>
      <p>Nuvora only works if evidence is honest. When you record who made something, choose accurately: human, AI-assisted, collaborator or external. Don&apos;t add work you didn&apos;t do, hide AI involvement, or pad your record with meaningless activity. We may remove content and limit accounts that do.</p>
      <p>Skill levels are measured from evidence using simple rules and are approximate. They are a guide, not a certification, and employers should look at the work itself.</p>
    </>),
  },
  {
    id: "tasks", title: "Tasks, assignment and review",
    body: (<>
      <p><strong>Employers</strong> must describe tasks truthfully, set acceptance criteria that can be checked, and not request anything unlawful. The structured draft Nuvora produces is a suggestion, and you are responsible for the final task.</p>
      <p><strong>Developers</strong> may only accept a task they intend to deliver, and must describe their work honestly. Nobody is assigned a task without accepting it.</p>
      <p>When work is approved, the task is marked complete, the developer&apos;s relevant skills are marked as verified, and the work is added to their evidence privately. Approval is the employer&apos;s own judgement. Nuvora doesn&apos;t inspect or guarantee the quality of delivered work, and automated checks only test completeness and the tests a developer chose to run.</p>
      <p>Don&apos;t approve work you haven&apos;t reviewed, or approve it to inflate someone&apos;s profile. Verification is only meaningful if it&apos;s honest.</p>
    </>),
  },
  {
    id: "ownership", title: "Ownership of delivered work",
    body: (<>
      <p>Nuvora doesn&apos;t own the work developers deliver and doesn&apos;t take a licence to it beyond what is needed to run the service. Who owns the code, designs and other output of a task, and what the developer may reuse, should be agreed between the employer and the developer before work starts.</p>
      <p>Developers must not deliver code they have no right to share, or that infringes someone else&apos;s rights, and employers must not share confidential or third-party material they aren&apos;t allowed to.</p>
    </>),
  },
  {
    id: "payments", title: "Plans, payments and fees",
    body: (<>
      <p>Nuvora offers paid plans for developers and for employers. Billing isn&apos;t live yet, so during early access plans are free to use. We&apos;ll give notice before any charges begin, and you won&apos;t be charged without agreeing to a plan.</p>
      <p><strong>Plans change limits, such as the number of projects or active tasks. They never change a developer&apos;s skill levels, match scores or ranking.</strong></p>
      <p>In this version, Nuvora doesn&apos;t process payments between employers and developers. How a task is paid for, including price, timing and expenses, is agreed between the two of them, and we aren&apos;t a party to it or responsible for it.</p>
    </>),
  },
  {
    id: "use", title: "Acceptable use",
    body: (<>
      <p>Don&apos;t use Nuvora to:</p>
      <ul>
        <li>break the law, or infringe anyone&apos;s rights, including copyright and confidentiality;</li>
        <li>publish other people&apos;s private information, secrets or credentials;</li>
        <li>deliver malicious code, or ask for it;</li>
        <li>harass, discriminate against or mislead other users;</li>
        <li>take developers or employers off the platform by deceiving them, or scrape or automate access in ways that overload the service.</li>
      </ul>
    </>),
  },
  {
    id: "disputes", title: "Disagreements between users",
    body: (<p>Work between an employer and a developer is their own arrangement. If you disagree about quality, payment or ownership, try to resolve it with each other first. Nuvora doesn&apos;t arbitrate disputes in this version, but you can contact us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> about misconduct, and we may act on the accounts involved.</p>),
  },
  {
    id: "integrations", title: "Third-party tools",
    body: (<>
      <p>Nuvora can link to tools like GitHub, design tools and learning sites. Connections are read-only by default, and anything that writes to another service needs your explicit permission. Those services have their own terms, and we aren&apos;t responsible for them.</p>
    </>),
  },
  {
    id: "disclaimer", title: "No guarantees",
    body: (<>
      <p>Nuvora is provided &ldquo;as is&rdquo;, without warranties of any kind. We don&apos;t promise it will be uninterrupted or error-free, that any developer is suitable for any task, that any task will be completed, or that using Nuvora will lead to a job, income or any particular outcome.</p>
    </>),
  },
  {
    id: "liability", title: "Limit of liability",
    body: (<p>To the extent the law allows, Nuvora and its team aren&apos;t liable for indirect or consequential losses, lost profits or data, or for the actions, work or payment practices of other users. Keep your own copy of anything important.</p>),
  },
  {
    id: "ending", title: "Ending your use",
    body: (<>
      <p>You can stop using Nuvora at any time and delete your account from Settings. We may suspend or close accounts that break these terms.</p>
      <p>Deleting an account removes your data from your browser. Skills an employer already verified for a developer, and the evidence that created, remain with the developer. A task assigned to a developer who deletes their account returns to open.</p>
    </>),
  },
  {
    id: "changes", title: "Changes to these terms",
    body: (<p>We&apos;ll update these terms as the product grows, and tell you in the app about significant changes. Continuing to use Nuvora after an update means you accept it.</p>),
  },
  { id: "contact", title: "Contact", body: (<p>Questions about these terms? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>) },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      intro="The rules for using Nuvora as a developer or an employer, in plain language. Short version: your work is yours, everything is private until you share it, evidence must be honest, and paying never changes a score. This is a draft for the early-access preview and hasn't been reviewed by a lawyer."
      updated="October 11, 2026"
      sections={sections}
      other={{ label: "Privacy Policy", href: "/privacy" }}
    />
  );
}