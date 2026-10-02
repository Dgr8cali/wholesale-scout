import type { NextConfig } from "next";
import { LEGACY_REDIRECTS } from "./src/lib/workspaces";

const nextConfig: NextConfig = {
  // The help centre reads its markdown at request time.
  outputFileTracingIncludes: {
    "/help": ["./content/help/**/*"],
    "/help/**": ["./content/help/**/*"],
    "/api/help": ["./content/help/**/*"],
    "/api/help/**": ["./content/help/**/*"],
  },
  // /private-label (and its ?c= and ?tab=hunt links) moved into the Private label workspace.
  async redirects() {
    return LEGACY_REDIRECTS;
  },
};

export default nextConfig;
