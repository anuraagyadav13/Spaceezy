/**
 * Image source helpers.
 *
 * CRM media is returned as site-relative `/media/<key>` paths (the bucket is
 * private). `next.config.ts` proxies `/media` to the API origin so the Next
 * image optimizer can resize those files. Anything absolute is served as-is:
 * its host may not be listed in `images.remotePatterns`, and the optimizer
 * would reject it at runtime.
 */
export const isOptimizableImage = (src) =>
    typeof src === "string" && src.startsWith("/") && !src.startsWith("//");
