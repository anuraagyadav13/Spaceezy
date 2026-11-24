/**
 * Read-only production-data SEO impact report.
 *
 * Uses the production public API + sitemap (GET only — no DB writes, no
 * deploys) as the data source, then runs the SAME registry/gate code the site
 * uses. Run with vite-node so extensionless ESM imports resolve:
 *
 *   npx vite-node scripts/seo-production-audit.mjs
 *
 * Env:
 *   SEO_AUDIT_API      public API base (default https://spaceezy.com/api/v1)
 *   SEO_AUDIT_SITEMAP  sitemap to treat as "currently indexed"
 *   SEO_*              gate thresholds, so scenarios can be compared
 */
import { buildHubRegistry, indexableHubs, resolveHubSlug } from "../src/lib/seo/facets";
import { projectQuality, unitQuality, QUALITY_RULES } from "../src/lib/seo/quality";
import { retiredProjectPath } from "../src/lib/seo/retired";

const API = (process.env.SEO_AUDIT_API || "https://spaceezy.com/api/v1").replace(/\/+$/, "");
const SITEMAP = process.env.SEO_AUDIT_SITEMAP || "https://spaceezy.com/sitemap.xml";

async function json(path) {
    const response = await fetch(`${API}${path}`);
    if (!response.ok) throw new Error(`${path} answered ${response.status}`);
    const payload = await response.json();
    if (!payload.success) throw new Error(`${path} unsuccessful`);
    return payload.data;
}

async function all(path) {
    const items = [];
    let page = 1;
    for (;;) {
        const data = await json(`${path}?limit=50&page=${page}`);
        items.push(...(Array.isArray(data.items) ? data.items : []));
        if (!data.totalPages || page >= data.totalPages || page >= 50) break;
        page += 1;
    }
    return items;
}

async function currentSitemap() {
    const response = await fetch(SITEMAP);
    if (!response.ok) throw new Error(`sitemap answered ${response.status}`);
    const xml = await response.text();
    return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1].trim());
}

const enrichProject = (project) => ({
    ...project,
    descriptionLength: (project.description || project.shortDescription || "").length,
    imageCount: (project.images || []).length,
    amenitiesCount: (project.amenities || []).length,
});

async function main() {
    const [projects, units, indexed] = await Promise.all([
        all("/public/projects"),
        all("/public/properties"),
        currentSitemap(),
    ]);
    // Detail DTOs carry the fields the production list DTO omits.
    const details = await Promise.all(
        projects.map(async (project) => {
            try {
                return await json(`/public/projects/${encodeURIComponent(project.slug)}`);
            } catch {
                return project;
            }
        })
    );
    const fullProjects = details.map(enrichProject);
    const fullUnits = units.map((unit) => ({
        ...unit,
        image: unit.image || null,
        images: unit.images || (unit.image ? [unit.image] : []),
    }));

    const registry = buildHubRegistry({ projects: fullProjects, properties: fullUnits });
    const bySlug = new Map(fullProjects.map((project) => [project.slug, project]));
    const byToken = new Map(fullUnits.map((unit) => [unit.token, unit]));

    console.log("=== SOURCE ===");
    console.log(`API: ${API} (read-only GET)`);
    console.log(`Sitemap: ${SITEMAP}`);
    console.log(`Projects: ${fullProjects.length}, units: ${fullUnits.length}, indexed URLs: ${indexed.length}`);
    console.log(`Rules: ${JSON.stringify(QUALITY_RULES)}`);

    const changes = [];
    for (const loc of indexed) {
        const path = new URL(loc).pathname;
        let verdict = "KEEP";
        let reason = "indexable";
        if (path === "/" || ["/projects", "/properties", "/about", "/contact", "/privacy-policy", "/terms"].includes(path)) {
            // static
        } else if (path.startsWith("/projects/")) {
            const slug = path.split("/")[2];
            const to = retiredProjectPath(slug);
            if (to) { verdict = "REDIRECT"; reason = `retired project -> ${to}`; }
            else if (!bySlug.has(slug)) { verdict = "REMOVE"; reason = "no longer published (404)"; }
            else {
                const quality = projectQuality(bySlug.get(slug));
                if (!quality.ok) { verdict = "NOINDEX"; reason = quality.missing.join("; "); }
            }
        } else if (path.startsWith("/properties/")) {
            const token = path.split("/")[2];
            const unit = byToken.get(token);
            if (!unit) { verdict = "REMOVE"; reason = "no longer published (404)"; }
            else if (String(unit.availability || "").toLowerCase() === "sold") { verdict = "REDIRECT"; reason = "sold -> parent project"; }
            else {
                const quality = unitQuality(unit);
                if (!quality.ok) { verdict = "NOINDEX"; reason = quality.missing.join("; "); }
            }
        } else {
            const slug = path.replace(/^\//, "");
            const resolved = resolveHubSlug(registry, slug);
            if (resolved.redirectTo) { verdict = "REDIRECT"; reason = `alias -> ${resolved.redirectTo}`; }
            else if (!resolved.hub) { verdict = "REMOVE"; reason = "hub no longer generated (404)"; }
            else if (resolved.hub.canonicalPath) {
                verdict = "CANONICAL";
                reason = `duplicate item set -> canonical ${resolved.hub.canonicalPath}`;
            }
            else if (!resolved.hub.indexable) {
                verdict = "NOINDEX";
                reason = `items=${resolved.hub.counts.total} blocks=${resolved.hub.blocks.length} (need ${process.env.SEO_HUB_MIN_ITEMS || 1}/${process.env.SEO_HUB_MIN_BLOCKS || 2})`;
            }
        }
        changes.push({ path, verdict, reason });
    }

    console.log("\n=== CURRENTLY INDEXED -> NEW SYSTEM ===");
    for (const row of changes) console.log(`${row.verdict.padEnd(8)} ${row.path}${row.verdict === "KEEP" ? "" : `  (${row.reason})`}`);
    const counts = changes.reduce((acc, row) => ({ ...acc, [row.verdict]: (acc[row.verdict] || 0) + 1 }), {});
    console.log(`\nSummary: ${JSON.stringify(counts)}`);

    console.log("\n=== DUPLICATE-ITEM HUBS (canonical-only, no noindex) ===");
    for (const hub of registry.values()) {
        if (!hub.canonicalPath) continue;
        console.log(`${hub.path.padEnd(42)} items=${hub.counts.total} -> ${hub.canonicalPath}`);
    }

    console.log("\n=== HUB NUMBERS ===");
    for (const hub of indexableHubs(registry)) {
        console.log(`INDEXABLE ${hub.path.padEnd(42)} items=${hub.counts.total} blocks=${hub.blocks.length}`);
    }
    for (const hub of registry.values()) {
        if (hub.indexable && !hub.canonicalPath) continue;
        const label = hub.canonicalPath ? "CANONICAL" : "NOINDEX  ";
        console.log(`${label} ${hub.path.padEnd(42)} items=${hub.counts.total} blocks=${hub.blocks.length}${hub.canonicalPath ? ` -> ${hub.canonicalPath}` : ""}`);
    }

    console.log("\n=== PROJECT FIELD NUMBERS ===");
    for (const project of fullProjects) {
        const quality = projectQuality(project);
        console.log(
            `${project.slug}: desc=${project.descriptionLength} images=${project.imageCount} amenities=${project.amenitiesCount} ` +
            `rera=${Boolean(project.rera?.number)} possession=${Boolean(project.possessionDate || project.expectedCompletionDate)} ` +
            `configs=${(project.configurations || []).length} -> ${quality.ok ? "INDEXABLE" : `NOINDEX [${quality.missing.join(", ")}]`}`
        );
    }
}

main().catch((error) => {
    console.error(`Audit failed: ${error.message}`);
    process.exit(1);
});
