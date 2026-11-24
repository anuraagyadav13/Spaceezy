import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * Breadcrumb JSON-LD lives in `lib/seo/schema.js` (one generator for the whole
 * site). This file only renders the visible trail that it must match.
 */
export function Breadcrumbs({ items, dark = false }) {
    return (
        <nav aria-label="Breadcrumb" className="mb-6">
            <ol className={`flex flex-wrap items-center gap-1 text-sm ${dark ? "text-gray-300" : "text-gray-500"}`}>
                {items.map((item, i) => (
                    <li key={`${item.name}-${i}`} className="flex items-center gap-1">
                        {i > 0 && <ChevronRight size={14} className={dark ? "text-gray-500" : "text-gray-400"} />}
                        {item.href ? (
                            <Link href={item.href} className={`hover:text-purple-600 transition-colors ${dark ? "hover:text-purple-300" : ""}`}>
                                {item.name}
                            </Link>
                        ) : (
                            <span aria-current="page" className={dark ? "text-white font-medium" : "text-gray-800 font-medium"}>
                                {item.name}
                            </span>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
}
