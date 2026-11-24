import EnquiryClient from "./EnquiryClient";
import { staticPageMetadata } from "../../../lib/seo/staticPages";

export const metadata = staticPageMetadata("/enquiry");

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
                    configuration={first(sp.configuration)}
                />
            </div>
        </div>
    );
}
