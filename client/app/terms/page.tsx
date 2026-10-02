import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalLayout, type LegalSection } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for using Nuvora, in plain language.",
};

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreeing to these terms",
    body: (
      <>
        <p>By creating an account or using Nuvora, you agree to these terms and to our <Link href="/privacy">Privacy Policy</Link>. If you don&apos;t agree, please don&apos;t use the service.</p>
        <p>You must be old enough to form a binding agreement where you live, and at least 13 years old.</p>
      </>
    ),
  },
  {
    id: "service",
    title: "What Nuvora is",
    body: (
      <>
        <p>Nuvora keeps the context and evidence of your learning and building work connected, and helps you turn it into a project story. We connect to the tools you already use. We don&apos;t replace them.</p>
        <p>Nuvora is an early product. Features may change, and some integrations are still previews.</p>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <>
        <p>You are responsible for your account and for keeping your password safe. Give us accurate information, and tell us if you think someone else has accessed your account.</p>
        <p>One person per account. Don&apos;t share your login.</p>
      </>
    ),
  },
  {
    id: "content",
    title: "Your content stays yours",
    body: (
      <>
        <p>You own what you add to Nuvora: project details, evidence, designs, notes and stories. We don&apos;t claim ownership of any of it.</p>
        <p>You give us permission to store and display that content only as needed to run the service for you, and to show published pages exactly as you chose.</p>
      </>
    ),
  },
  {
    id: "publishing",
    title: "Publishing and visibility",
    body: (
      <>
        <p>Everything is <strong>private by default</strong>. Nothing becomes public until you switch it on and publish.</p>
        <ul>
          <li>You decide which evidence appears on a public page, and you can unpublish at any time.</li>
          <li>We scan for common secrets like API keys and passwords before publishing, but the scan is not perfect. You are responsible for what you make public.</li>
          <li>Once a page has been public, others may have seen or copied it. Unpublishing can&apos;t undo that.</li>
        </ul>
      </>
    ),
  },
  {
    id: "provenance",
    title: "Honest evidence and AI use",
    body: (
      <>
        <p>Nuvora exists to make work verifiable, so evidence must be honest. When you record who made something, choose accurately: human, AI-assisted, collaborator or external.</p>
        <p>Don&apos;t add evidence you didn&apos;t create, misstate AI involvement, or try to inflate your record with meaningless activity. We may remove content that does.</p>
      </>
    ),
  },
  {
    id: "use",
    title: "Acceptable use",
    body: (
      <>
        <p>Don&apos;t use Nuvora to:</p>
        <ul>
          <li>break the law or infringe anyone&apos;s rights, including copyright;</li>
          <li>publish other people&apos;s private information, secrets or credentials;</li>
          <li>upload malware, or attempt to disrupt or gain unauthorised access to the service;</li>
          <li>scrape or automate access in ways that place unreasonable load on it.</li>
        </ul>
      </>
    ),
  },
  {
    id: "integrations",
    title: "Third-party tools",
    body: (
      <>
        <p>Nuvora can link to tools such as GitHub, design tools and learning platforms. Integrations are read-only by default, and anything that writes to another service needs your explicit permission.</p>
        <p>Those services have their own terms and privacy policies, and we aren&apos;t responsible for them.</p>
      </>
    ),
  },
  {
    id: "disclaimer",
    title: "No guarantees",
    body: (
      <>
        <p>Nuvora is provided &ldquo;as is&rdquo;, without warranties of any kind. We don&apos;t promise it will be uninterrupted or error-free, and we don&apos;t guarantee that using it will lead to a job, opportunity or any particular outcome.</p>
        <p>Guidance such as suggested next steps is meant to help you decide and is not professional advice.</p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Limit of liability",
    body: (
      <p>To the extent the law allows, Nuvora and its team are not liable for indirect or consequential losses, or for lost data, profits or opportunities arising from your use of the service. Keep your own copy of anything important.</p>
    ),
  },
  {
    id: "ending",
    title: "Ending your use",
    body: (
      <>
        <p>You can stop using Nuvora at any time. We may suspend or close accounts that break these terms.</p>
        <p>Unpublish your pages before you leave if you don&apos;t want them to stay online.</p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: <p>We may update these terms as the product grows. When the changes are significant, we&apos;ll tell you in the app. Continuing to use Nuvora after an update means you accept it.</p>,
  },
  {
    id: "contact",
    title: "Contact",
    body: <p>Questions about these terms? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>,
  },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      intro="The rules for using Nuvora, in plain language. The short version: your work is yours, everything is private until you publish it, and evidence should be honest."
      updated="September 29, 2026"
      sections={sections}
      other={{ label: "Privacy Policy", href: "/privacy" }}
    />
  );
}