import type { Metadata } from "next";
import { PricingView } from "@/components/pricing-view";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Plans for developers building proof and employers getting real work done. Paying never changes a score.",
};

export default function PricingPage() {
  return <PricingView />;
}