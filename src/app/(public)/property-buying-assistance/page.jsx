import { AeoArticle } from "../../../components/seo/AeoArticle";
import { BUYING_ASSISTANCE } from "../../../lib/aeo/realEstateContent";
import { staticPageMetadata } from "../../../lib/seo/staticPages";

export const metadata = staticPageMetadata("/property-buying-assistance");

export default function BuyingAssistancePage() {
    return (
        <AeoArticle
            eyebrow="Spaceezy real estate services"
            title={BUYING_ASSISTANCE.title}
            intro={BUYING_ASSISTANCE.intro}
            serviceName="Spaceezy Property Buying Assistance"
            serviceDescription={BUYING_ASSISTANCE.intro}
            serviceType="Real estate buyer services"
            path="/property-buying-assistance"
            blocks={BUYING_ASSISTANCE.blocks}
            faqs={BUYING_ASSISTANCE.faqs}
            faqHeading="Buyer FAQs"
            related={[
                { href: "/projects", text: "Browse published projects" },
                { href: "/properties", text: "Browse published properties" },
                { href: "/contact", text: "Contact Spaceezy" },
            ]}
        />
    );
}
