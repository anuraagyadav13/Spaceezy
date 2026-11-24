import { AeoArticle } from "../../../components/seo/AeoArticle";
import { CRM_OVERVIEW } from "../../../lib/aeo/crmContent";
import { staticPageMetadata } from "../../../lib/seo/staticPages";

export const metadata = staticPageMetadata("/real-estate-crm");

export default function RealEstateCrmPage() {
    const { whatIs, fit, capabilities, useCases, faqs, intro } = CRM_OVERVIEW;

    const blocks = [
        {
            heading: whatIs.heading,
            paragraphs: whatIs.paragraphs,
            example: whatIs.example,
        },
        {
            heading: fit.heading,
            paragraphs: fit.paragraphs,
            bullets: fit.checklist,
        },
        {
            heading: "What the Spaceezy CRM does",
            subheads: capabilities.map(({ title, body, href, linkText }) => ({
                heading: title,
                body,
                href,
                linkText,
            })),
        },
        {
            heading: "How real estate teams use Spaceezy CRM",
            subheads: useCases.map(({ title, body, href, linkText }) => ({
                heading: title,
                body,
                href,
                linkText,
            })),
        },
    ];

    const related = [
        { href: "/projects", text: "Browse published projects" },
        { href: "/properties", text: "Browse published properties" },
        { href: "/contact", text: "Contact the Spaceezy team" },
    ];

    return (
        <AeoArticle
            eyebrow={CRM_OVERVIEW.eyebrow}
            title={CRM_OVERVIEW.title}
            intro={intro}
            serviceName="Spaceezy Real Estate CRM"
            serviceDescription={intro}
            path="/real-estate-crm"
            blocks={blocks}
            faqs={faqs}
            faqHeading="Real estate CRM FAQs"
            related={related}
        />
    );
}
