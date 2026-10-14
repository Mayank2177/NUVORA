import type { NextConfig } from "next";

const apiOrigin = process.env.NUVORA_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4117";
if (process.env.NODE_ENV === "production" && !process.env.NUVORA_API_URL && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error("Set NUVORA_API_URL before building the production client.");
}

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
      { source: "/healthz", destination: `${apiOrigin}/healthz` },
    ];
  },
  async headers() {
    return [
      {
        source: "/build/workspace",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
