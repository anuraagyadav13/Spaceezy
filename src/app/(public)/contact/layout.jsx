import { PHONE_DISPLAY } from "../../../lib/seo/site";

export const metadata = {
    title: "Contact Spaceezy | Call, WhatsApp & Office in Ghaziabad",
    description:
        `Contact Spaceezy — call ${PHONE_DISPLAY}, chat on WhatsApp, or visit our office at Wave Galleria, Sector-3, Wave City, Ghaziabad 201002.`,
    alternates: { canonical: "/contact" },
    openGraph: {
        title: "Contact Spaceezy | Call, WhatsApp & Office in Ghaziabad",
        description: "Call, WhatsApp or visit Spaceezy at Wave Galleria, Wave City, Ghaziabad.",
        url: "/contact",
        type: "website",
        images: [{ url: "/images/og-default.jpg" }],
    },
    twitter: {
        card: "summary_large_image",
        title: "Contact Spaceezy | Call, WhatsApp & Office in Ghaziabad",
        description: "Call, WhatsApp or visit Spaceezy at Wave Galleria, Wave City, Ghaziabad.",
    },
};

export default function ContactLayout({ children }) {
    return children;
}
