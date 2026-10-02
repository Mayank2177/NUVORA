import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Nuvora: keep your work connected from idea to opportunity",
    template: "%s · Nuvora",
  },
  description:
    "Nuvora connects what you learn, build, solve, document and publish, so your context and evidence never disappear between the tools you use.",
  keywords: ["project evidence", "developer portfolio", "project story", "learning to building", "Nuvora"],
  openGraph: {
    title: "Nuvora: your work shouldn't disappear between tools",
    description: "Turn scattered activity into connected context, evidence and a story you can publish.",
    type: "website",
    siteName: "Nuvora",
  },
  twitter: { card: "summary_large_image", title: "Nuvora", description: "Learn it. Build it. Prove it. Keep the context." },
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-white font-sans text-slate-900 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}