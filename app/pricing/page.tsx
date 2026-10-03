import type { Metadata } from "next";
import { PricingView } from "@/components/pricing-view";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Start free. Upgrade when you have more projects and pages to keep connected.",
};

export default function PricingPage() {
  return <PricingView />;
}