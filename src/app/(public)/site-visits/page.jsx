import { AeoArticle } from "../../../components/seo/AeoArticle";
import { SITE_VISITS } from "../../../lib/aeo/realEstateContent";
import { staticPageMetadata } from "../../../lib/seo/staticPages";

export const metadata = staticPageMetadata("/site-visits");

export default function SiteVisitsPage() {
    return (
        <AeoArticle
            eyebrow="Spaceezy real estate services"
            title={SITE_VISITS.title}
            intro={SITE_VISITS.intro}
            serviceName="Spaceezy Property Site Visits"
            serviceDescription={SITE_VISITS.intro}
            serviceType="Property site visit assistance"
            path="/site-visits"
            blocks={SITE_VISITS.blocks}
            faqs={SITE_VISITS.faqs}
            faqHeading="Site visit FAQs"
            related={[
                { href: "/enquiry", text: "Request a site visit" },
                { href: "/property-buying-assistance", text: "Property buying assistance" },
                { href: "/projects", text: "Published projects" },
                { href: "/properties", text: "Published properties" },
            ]}
        />
    );
}
