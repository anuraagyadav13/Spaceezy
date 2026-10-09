export const metadata = {
    title: "About SpaceEzy | Our Story, Vision & Team",
    description:
        "Meet SpaceEzy — the team redefining real estate discovery in Ghaziabad with transparent pricing, live inventory and zero-brokerage property listings.",
    alternates: { canonical: "/about" },
    openGraph: {
        title: "About SpaceEzy | Our Story, Vision & Team",
        description: "The team redefining real estate discovery in Ghaziabad with transparent, zero-brokerage listings.",
        url: "/about",
        type: "website",
        images: [{ url: "/images/og-default.jpg" }],
    },
    twitter: {
        card: "summary_large_image",
        title: "About SpaceEzy | Our Story, Vision & Team",
        description: "The team redefining real estate discovery in Ghaziabad.",
    },
};

export default function AboutLayout({ children }) {
    return children;
}
