
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Emit a self-contained server bundle for Docker/EC2 deployments
  // (.next/standalone). Next 16's `next start` refuses to run a standalone
  // build, so the Docker image build sets NEXT_OUTPUT=standalone while local
  // `npm run build && npm start` stays on the standard output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
        pathname: "/**",
      },
      // CRM media bucket (S3, ap-south-1) — used if next/image is adopted.
      {
        protocol: "https",
        hostname: "*.s3.ap-south-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.s3.amazonaws.com",
      },
    ],
  },
};

export default nextConfig;