import EnquiryClient from "./EnquiryClient";
import { staticPageMetadata } from "../../../lib/seo/staticPages";

export const metadata = staticPageMetadata("/enquiry");

const first = (value) => (Array.isArray(value) ? value[0] : value) || "";

export default async function EnquiryPage({ searchParams }) {
    const sp = (await searchParams) || {};

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#f8f6ff] via-[#f5f2ff] to-[#fbfaff] pt-28 pb-16 dark:from-[#0f1117] dark:via-[#12141c] dark:to-[#0f1117]">
            <div className="container mx-auto px-4 sm:px-6 md:px-12">
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
