import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ...keep whatever you already have
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