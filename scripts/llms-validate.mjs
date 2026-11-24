#!/usr/bin/env node
/**
 * llms.txt validator.
 *
 *   node scripts/llms-validate.mjs --local   # file + URL syntax only
 *   node scripts/llms-validate.mjs            # also fetch every linked URL live
 *   LLMS_BASE_URL=http://localhost:3000 node scripts/llms-validate.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.LLMS_BASE_URL || "https://spaceezy.com").replace(/\/+$/, "");
const LOCAL_ONLY = process.argv.includes("--local");
const FILES = ["llms.txt", "llms-full.txt"].filter((name) =>
    existsSync(join(process.cwd(), "public", name))
);

const errors = [];
let links = 0;

const fail = (message) => errors.push(message);
const normalize = (value) => value.replace(/\/+$/, "") || "/";
const PRIVATE_PATHS = /^\/(?:dashboard|login|api|admin|backoffice)(?:\/|$)/i;

function checkFile(name) {
    const text = readFileSync(join(process.cwd(), "public", name), "utf8");
    const lines = text.split(/\r?\n/);

    if (!lines[0].startsWith("# ")) fail(`${name}: first line must be an H1 heading`);
    if (lines[0] !== "# Spaceezy") fail(`${name}: H1 must be exactly "# Spaceezy"`);
    if (!lines.slice(1, 12).some((line) => line.startsWith("> "))) {
        fail(`${name}: missing blockquote description near the top`);
    }

    const found = [...text.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)].map((m) => m[1]);
    if (!found.length) fail(`${name}: no links found`);

    for (const url of found) {
        links += 1;
        let parsed;
        try {
            parsed = new URL(url);
        } catch {
            fail(`${name}: malformed URL ${url}`);
            continue;
        }
        if (parsed.protocol !== "https:") fail(`${name}: non-HTTPS link ${url}`);
        if (parsed.host !== "spaceezy.com") fail(`${name}: non-canonical host ${url}`);
        if (parsed.search || parsed.hash) fail(`${name}: query/fragment on link ${url}`);
        if (PRIVATE_PATHS.test(parsed.pathname)) fail(`${name}: private path ${url}`);
    }

    if (/\blocalhost\b|127\.0\.0\.1|\/staging|\/preview/i.test(text)) {
        fail(`${name}: contains local/staging/preview references`);
    }
    return found;
}

async function checkLive(name, urls) {
    const response = await fetch(`${BASE}/${name}`, { redirect: "manual" });
    if (response.status !== 200) {
        fail(`${name}: live URL answered ${response.status}`);
        return;
    }
    const type = response.headers.get("content-type") || "";
    if (!/text\/plain/i.test(type)) fail(`${name}: content-type is "${type}", expected text/plain`);

    const body = await response.text();
    if (!body.trim().startsWith("# Spaceezy")) fail(`${name}: live content does not start with the H1`);

    for (const url of urls) {
        const target = new URL(url);
        const localUrl = `${BASE}${target.pathname}`;
        const page = await fetch(localUrl, { redirect: "manual" });
        if (page.status !== 200) {
            fail(`${name}: ${localUrl} answered ${page.status}`);
            continue;
        }
        const html = await page.text();
        const canonical = /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i.exec(html)?.[1];
        if (!canonical) {
            fail(`${name}: ${localUrl} has no canonical`);
            continue;
        }
        if (normalize(canonical) !== normalize(url)) {
            fail(`${name}: canonical mismatch for ${url} -> ${canonical}`);
        }
    }
}

const all = [];
for (const file of FILES) all.push(...checkFile(file));

if (!LOCAL_ONLY) {
    for (const file of FILES) await checkLive(file, all);
}

console.log(`Validated ${FILES.length} llms file(s), ${links} canonical link occurrence(s).`);
if (errors.length) {
    for (const error of errors) console.error(`ERROR ${error}`);
    console.error(`llms validation failed with ${errors.length} error(s).`);
    process.exit(1);
}
console.log(LOCAL_ONLY ? "Local file validation passed." : `Live validation passed (${BASE}).`);
