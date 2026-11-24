import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

/**
 * Retired-URL alias map. Read from the same JSON file the runtime hub resolver
 * uses (`src/lib/seo/facets.js`) so a pattern is declared exactly once.
 */
function legacyRedirects() {
  try {
    const raw = readFileSync(join(process.cwd(), "seo-aliases.json"), "utf8");
    const parsed = JSON.parse(raw);
    const rows: Array<{ source: string; destination: string }> = Array.isArray(parsed.legacyAliases)
      ? parsed.legacyAliases
      : [];
    return rows.map((row) => ({
      source: row.source,
      destination: row.destination,
      permanent: true,
    }));
  } catch {
    return [];
  }
}

/** Removed projects -> their location hub, from the same JSON the route reads. */
function retiredProjectRedirects() {
  try {
    const raw = readFileSync(join(process.cwd(), "seo-retired-projects.json"), "utf8");
    const parsed = JSON.parse(raw);
    const rows: Array<{ slug: string; destination: string }> = Array.isArray(parsed.redirects)
      ? parsed.redirects
      : [];
    return rows.map((row) => ({
      source: `/projects/${row.slug}`,
      destination: row.destination,
      permanent: true,
    }));
  } catch {
    return [];
  }
}

/** Canonical origin for absolute redirect targets (HTTPS enforced). */
function siteOrigin() {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "https://spaceezy.com").trim();
  try {
    return new URL(raw).origin.replace(/^http:\/\//i, "https://");
  } catch {
    return "https://spaceezy.com";
  }
}

/** www hostname for the canonical apex (both http and https requests). */
function wwwHost() {
  try {
    return `www.${new URL(siteOrigin()).hostname}`;
  } catch {
    return "www.spaceezy.com";
  }
}

/**
 * Internal origin that serves `/media/*`.
 *
 * CRM photos are returned as site-relative `/media/<key>` paths. Production
 * nginx routes `/media` straight to Express, but Next's image optimizer runs
 * inside the Next server and fetches the path from itself, so without a
 * rewrite every optimized image would come back 400. The rewrite makes both
 * `next dev` and the optimizer resolve `/media` to the API origin.
 */
function mediaOrigin() {
  const raw = (
    process.env.MEDIA_ORIGIN ||
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000"
  ).trim();
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:8000";
  }
}

const nextConfig: NextConfig = {
  reactCompiler: true,

  // One URL per page: no trailing-slash variant exists. Next answers a
  // trailing-slash request with a permanent redirect, which is the same
  // crawling signal as a 301.
  trailingSlash: false,

  // Emit a self-contained server bundle for Docker/EC2 deployments
  // (.next/standalone). Next 16's `next start` refuses to run a standalone
  // build, so the Docker image build sets NEXT_OUTPUT=standalone while local
  // `npm run build && npm start` stays on the standard output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,

  async redirects() {
    return [
      // www -> apex, HTTPS, in ONE hop. Host-based (not x-forwarded-proto),
      // so it also works for https://www and for origin requests without a
      // proxy header. Next applies this before the scheme rule.
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: wwwHost() }],
        destination: `${siteOrigin()}/:path*`,
        permanent: true,
      },
      // http -> https for any request a proxy forwards with a plain-http
      // scheme. Single hop: the target is the canonical HTTPS URL directly.
      {
        source: "/:path*",
        has: [{ type: "header" as const, key: "x-forwarded-proto", value: "http" }],
        destination: `${siteOrigin()}/:path*`,
        permanent: true,
      },
      ...legacyRedirects(),
      ...retiredProjectRedirects(),
    ];
  },

  async rewrites() {
    return [
      // Public media lives on the API origin; proxy it so next/image can
      // optimize it (and so `next dev` renders uploaded photos).
      { source: "/media/:path*", destination: `${mediaOrigin()}/media/:path*` },
    ];
  },

  images: {
    // Modern formats only; the optimizer falls back to the original if the
    // source is already compressed.
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
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
