import EnquiryClient from "./EnquiryClient";

export const metadata = {
    title: "Enquire | Spaceezy",
    description:
        "Send an enquiry or schedule a site visit for any Spaceezy project or property. Our property experts will get back to you shortly.",
    alternates: { canonical: "/enquiry" },
    openGraph: {
        title: "Enquire | Spaceezy",
        description:
            "Send an enquiry or schedule a site visit for any Spaceezy project or property.",
        url: "/enquiry",
        type: "website",
    },
};

const first = (value) => (Array.isArray(value) ? value[0] : value) || "";

export default async function EnquiryPage({ searchParams }) {
    const sp = (await searchParams) || {};

    return (
        <div className="bg-gray-50 min-h-screen pt-32 pb-24">
            <div className="container mx-auto px-6 md:px-12">
                <EnquiryClient
                    type={first(sp.type) === "visit" ? "visit" : "enquiry"}
                    projectSlug={first(sp.projectSlug)}
                    propertyToken={first(sp.propertyToken)}
                />
            </div>
        </div>
    );
}
