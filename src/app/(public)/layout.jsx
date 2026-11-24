import { PublicHeader } from "../../components/public/PublicHeader";
import { PublicFooter } from "../../components/public/PublicFooter";
import { WhatsAppButton } from "../../components/public/WhatsAppButton";
import { FirstThemePrompt } from "../../components/providers/ThemeProvider";
import { JsonLd } from "../../components/seo/JsonLd";
import { organizationSchema, webSiteSchema } from "../../lib/seo/schema";
import { SITE_DESCRIPTION, SITE_TITLE_FALLBACK, SITE_URL } from "../../lib/seo/site";
import { getNavHubs } from "../../lib/seo/hubs";

export const metadata = {
    metadataBase: new URL(SITE_URL),
    title: SITE_TITLE_FALLBACK,
    description: SITE_DESCRIPTION,
};

/**
 * Navigation hubs are computed from live inventory, so an empty category
 * disappears from the header/footer automatically — no hand-maintained links.
 */
export default async function PublicLayout({ children }) {
    const nav = await getNavHubs();

    return (
        <div className="min-h-screen flex flex-col bg-white selection:bg-purple-200 selection:text-purple-900">
            <PublicHeader nav={nav} />
            <main className="flex-grow">
                {children}
            </main>
            <PublicFooter nav={nav} />
            <WhatsAppButton />
            <JsonLd data={organizationSchema()} />
            <JsonLd data={webSiteSchema()} />
            <FirstThemePrompt />
        </div>
    );
}
