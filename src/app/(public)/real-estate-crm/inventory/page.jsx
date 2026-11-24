import { AeoArticle } from "../../../../components/seo/AeoArticle";
import { CRM_EXPLAINERS } from "../../../../lib/aeo/crmContent";
import { staticPageMetadata } from "../../../../lib/seo/staticPages";

const content = CRM_EXPLAINERS.inventory;
export const metadata = staticPageMetadata("/real-estate-crm/inventory");

export default function InventoryPage() {
    return (
        <AeoArticle
            eyebrow="Spaceezy CRM feature guide"
            title={content.title}
            intro={content.intro}
            serviceName="Spaceezy Real Estate CRM"
            serviceDescription={content.intro}
            path="/real-estate-crm/inventory"
            blocks={content.sections}
            faqs={content.faqs}
            faqHeading="Inventory FAQs"
            related={[
                { href: "/real-estate-crm", text: "Real Estate CRM overview" },
                { href: "/projects", text: "Browse published projects" },
                { href: "/properties", text: "Browse published properties" },
                { href: "/contact", text: "Contact the Spaceezy team" },
            ]}
        />
    );
}
