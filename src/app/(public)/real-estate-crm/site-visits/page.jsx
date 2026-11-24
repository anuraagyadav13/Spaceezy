import { AeoArticle } from "../../../../components/seo/AeoArticle";
import { CRM_EXPLAINERS } from "../../../../lib/aeo/crmContent";
import { staticPageMetadata } from "../../../../lib/seo/staticPages";

const content = CRM_EXPLAINERS["site-visits"];
export const metadata = staticPageMetadata("/real-estate-crm/site-visits");

export default function SiteVisitsPage() {
    return (
        <AeoArticle
            eyebrow="Spaceezy CRM feature guide"
            title={content.title}
            intro={content.intro}
            serviceName="Spaceezy Real Estate CRM"
            serviceDescription={content.intro}
            path="/real-estate-crm/site-visits"
            blocks={content.sections}
            faqs={content.faqs}
            faqHeading="Site visit FAQs"
            related={[
                { href: "/real-estate-crm", text: "Real Estate CRM overview" },
                { href: "/enquiry", text: "Request a site visit" },
                { href: "/properties", text: "Browse published properties" },
                { href: "/contact", text: "Contact the Spaceezy team" },
            ]}
        />
    );
}
