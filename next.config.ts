import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The help centre reads its markdown at request time.
  outputFileTracingIncludes: {
    "/help": ["./content/help/**/*"],
    "/help/**": ["./content/help/**/*"],
    "/api/help": ["./content/help/**/*"],
    "/api/help/**": ["./content/help/**/*"],
  },
};

export default nextConfig;
