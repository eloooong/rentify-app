import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // One-time email hashes and PKCE codes must not appear in development logs.
  logging: {
    incomingRequests: { ignore: [/\/auth\/(?:confirm|callback)/] },
    serverFunctions: false,
  },
};

export default nextConfig;
