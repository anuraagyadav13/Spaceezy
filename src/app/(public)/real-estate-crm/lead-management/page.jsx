import { AeoArticle } from "../../../../components/seo/AeoArticle";
import { CRM_EXPLAINERS } from "../../../../lib/aeo/crmContent";
import { staticPageMetadata } from "../../../../lib/seo/staticPages";

const content = CRM_EXPLAINERS["lead-management"];
export const metadata = staticPageMetadata("/real-estate-crm/lead-management");

export default function LeadManagementPage() {
    return (
        <AeoArticle
            eyebrow="Spaceezy CRM feature guide"
            title={content.title}
            intro={content.intro}
            serviceName="Spaceezy Real Estate CRM"
            serviceDescription={content.intro}
            path="/real-estate-crm/lead-management"
            blocks={content.sections}
            faqs={content.faqs}
            faqHeading="Lead management FAQs"
            related={[
                { href: "/real-estate-crm", text: "Real Estate CRM overview" },
                { href: "/enquiry", text: "Send a property enquiry" },
                { href: "/projects", text: "Browse published projects" },
                { href: "/contact", text: "Contact the Spaceezy team" },
            ]}
        />
    );
}
