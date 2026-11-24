import { staticPageMetadata } from "../../../lib/seo/staticPages";

export const metadata = staticPageMetadata("/about");

export default function AboutLayout({ children }) {
    return children;
}
