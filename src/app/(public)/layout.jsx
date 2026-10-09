import { PublicHeader } from "../../components/public/PublicHeader";
import { PublicFooter } from "../../components/public/PublicFooter";
import { WhatsAppButton } from "../../components/public/WhatsAppButton";
import { JsonLd } from "../../components/seo/JsonLd";
import { SITE_URL, organizationJsonLd, webSiteJsonLd } from "../../lib/seo/site";

export const metadata = {
    metadataBase: new URL(SITE_URL),
    title: "SpaceEzy | Premium Real Estate",
    description: "Discover spaces designed for the way you want to live. Premium real estate projects and properties.",
};

export default function PublicLayout({ children }) {
    return (
        <div className="min-h-screen flex flex-col bg-white selection:bg-purple-200 selection:text-purple-900">
            <PublicHeader />
            <main className="flex-grow">
                {children}
            </main>
            <PublicFooter />
            <WhatsAppButton />
            <JsonLd data={organizationJsonLd} />
            <JsonLd data={webSiteJsonLd} />
        </div>
    );
}
