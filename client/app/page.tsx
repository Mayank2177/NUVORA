import type { Metadata } from "next";
import LandingPage from "@/components/landing-page";

export const metadata: Metadata = {
  title: "Nuvora: get hired for what you've built",
  description: "Turn real project evidence into a capability profile, match it to business tasks, and build proof of your work.",
  openGraph: {
    title: "Nuvora: get hired for what you've built",
    description: "Evidence-backed capability profiles, matched to real business tasks.",
    type: "website",
  },
};

export default function Page() {
  return <LandingPage />;
}
