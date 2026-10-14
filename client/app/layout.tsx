import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { AnimationProvider } from "@/components/animation-provider";
import "./globals.css";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

// Fail production builds if NEXT_PUBLIC_SITE_URL is not set
if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_SITE_URL) {
  throw new Error("Set NEXT_PUBLIC_SITE_URL before building the production client.");
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    title: { default: "Nuvora: get hired for what you've built", template: "%s · Nuvora" },
  description: "Nuvora turns real project evidence into a capability profile, matches it to real business tasks, and adds every completed task back as proof.",
  keywords: ["project evidence", "developer portfolio", "project story", "learning to building", "Nuvora"],
    openGraph: {
    title: "Nuvora: get hired for what you've built",
    description: "Evidence-backed capability profiles, matched to real business tasks.",
    type: "website",
    siteName: "Nuvora",
  },
  twitter: { card: "summary_large_image", title: "Nuvora", description: "Learn it. Build it. Prove it. Keep the context." },
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} data-scroll-behavior="smooth">
      <body className="min-h-screen bg-white font-sans text-slate-900 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <AnimationProvider>{children}</AnimationProvider>
      </body>
    </html>
  );
}
