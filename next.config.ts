import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["pino", "pino-pretty", "sharp"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  typedRoutes: true,
};

export default config;
