import { AeoArticle } from "../../../components/seo/AeoArticle";
import { PROPERTY_ENQUIRIES } from "../../../lib/aeo/realEstateContent";
import { staticPageMetadata } from "../../../lib/seo/staticPages";

export const metadata = staticPageMetadata("/property-enquiries");

export default function PropertyEnquiriesPage() {
    return (
        <AeoArticle
            eyebrow="Spaceezy real estate services"
            title={PROPERTY_ENQUIRIES.title}
            intro={PROPERTY_ENQUIRIES.intro}
            serviceName="Spaceezy Property Enquiry Assistance"
            serviceDescription={PROPERTY_ENQUIRIES.intro}
            serviceType="Property enquiry service"
            path="/property-enquiries"
            blocks={PROPERTY_ENQUIRIES.blocks}
            faqs={PROPERTY_ENQUIRIES.faqs}
            faqHeading="Property enquiry FAQs"
            related={[
                { href: "/enquiry", text: "Send an enquiry" },
                { href: "/property-buying-assistance", text: "Property buying assistance" },
                { href: "/site-visits", text: "Arrange a site visit" },
                { href: "/properties", text: "Browse published properties" },
            ]}
        />
    );
}
