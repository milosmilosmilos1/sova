import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Scaffold uključuje cacheComponents (sve statično dok ne kažeš drugačije).
  // Sova je po korisniku dinamična na skoro svakoj strani, pa to isključujemo
  // da čitanje cookie-ja i sesije radi bez Suspense obaveze na svakoj ruti.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "54321" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
