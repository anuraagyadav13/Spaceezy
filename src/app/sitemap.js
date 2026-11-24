import { getInventory } from "../lib/seo/inventory";
import { getHubRegistry } from "../lib/seo/hubs";
import { buildSitemapEntries } from "../lib/seo/sitemap";

// Always render with live CRM data (public API is internal and fast).
export const dynamic = "force-dynamic";

/**
 * Single, database-derived sitemap.
 *
 * Inventory is far below the 45k URL chunk size today; `chunkEntries` is ready
 * if it ever grows (Next's `generateSitemaps` can then emit a sitemap index).
 */
export default async function sitemap() {
    try {
        const [inventory, registry] = await Promise.all([getInventory(), getHubRegistry()]);
        return buildSitemapEntries({ inventory, registry });
    } catch {
        // Never crash the sitemap route: a smaller valid sitemap beats a 500.
        return buildSitemapEntries({
            inventory: { projects: [], properties: [] },
            registry: new Map(),
        });
    }
}
