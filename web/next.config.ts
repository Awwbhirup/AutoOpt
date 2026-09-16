import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next writes editor scaffolding files into the project root on every dev
  // run. They belong to whatever editor is open, not to this project, so the
  // generation is off rather than the output being deleted in a loop.
  agentRules: false,
};

export default nextConfig;
