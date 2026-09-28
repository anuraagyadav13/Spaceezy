import { PublicHeader } from "../../components/public/PublicHeader";
import { PublicFooter } from "../../components/public/PublicFooter";

export const metadata = {
    title: "SpaceEzy | Premium Real Estate",
    description: "Discover spaces designed for the way you want to live. Premium real estate projects and properties.",
};

export default function PublicLayout({ children }) {
    return (
        <div className="min-h-screen flex flex-col bg-white selection:bg-purple-200 selection:text-purple-900">
            <PublicHeader />
            <main className="flex-grow">
                {children}
            </main>
            <PublicFooter />
        </div>
    );
}
