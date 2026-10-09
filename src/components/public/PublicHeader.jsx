"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";
import Image from "next/image";

const PROPERTY_LINKS = [
    ["/residential-properties", "Residential Properties"],
    ["/commercial-properties", "Commercial Properties"],
    ["/flats-for-sale", "Flats for Sale"],
    ["/plots-for-sale", "Plots for Sale"],
];

const LOCATION_LINKS = [
    ["/properties-in-ghaziabad", "Properties in Ghaziabad"],
    ["/properties-in-wave-city", "Properties in Wave City"],
];

const navLinkClass = (isSolid) =>
    `text-sm font-medium transition-colors ${isSolid ? "text-gray-600 hover:text-purple-600" : "text-white/90 hover:text-white drop-shadow-sm"}`;

const dropdownItemClass =
    "rounded-xl px-4 py-2.5 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors";

export function PublicHeader() {
    const pathname = usePathname();
    const isHomePage = pathname === "/";
    
    const [scrolled, setScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        if (mobileMenuOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "auto";
        }
    }, [mobileMenuOpen]);

    // Force solid header on non-homepage routes or when scrolled
    const isSolid = scrolled || !isHomePage;

    return (
        <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${isSolid ? "bg-white/90 backdrop-blur-md shadow-sm py-4" : "bg-transparent py-6"}`}>
            <div className="container mx-auto px-6 md:px-12 flex justify-between items-center">
                <Link href="/" className="flex items-center gap-2.5">
                    <span className="relative h-10 w-10 md:h-11 md:w-11 shrink-0 overflow-hidden rounded-full shadow-md ring-2 ring-white/50">
                        <Image src="/images/logo.jpg" alt="SpaceEzy logo" fill sizes="44px" className="object-cover" priority />
                    </span>
                    <span className={`font-bold text-2xl tracking-tighter transition-colors ${isSolid ? "text-gray-900" : "text-white drop-shadow-md"}`}>
                        Spaceezy<span className="text-purple-500">.</span>
                    </span>
                </Link>
                
                <nav className="hidden md:flex gap-6 lg:gap-8 items-center">
                    <div className="group relative">
                        <Link href="/properties" className={`${navLinkClass(isSolid)} flex items-center gap-1`}>
                            Properties <ChevronDown size={14} className="transition-transform group-hover:rotate-180" />
                        </Link>
                        <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 absolute left-0 top-full pt-3 transition-all duration-150 z-50">
                            <div className="w-60 rounded-2xl bg-white border border-gray-100 shadow-xl p-2 flex flex-col">
                                {PROPERTY_LINKS.map(([href, label]) => (
                                    <Link key={href} href={href} className={dropdownItemClass}>{label}</Link>
                                ))}
                            </div>
                        </div>
                    </div>
                    <Link href="/projects" className={navLinkClass(isSolid)}>Projects</Link>
                    <div className="group relative">
                        <span className={`${navLinkClass(isSolid)} flex items-center gap-1 cursor-default`}>
                            Locations <ChevronDown size={14} className="transition-transform group-hover:rotate-180" />
                        </span>
                        <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 absolute left-0 top-full pt-3 transition-all duration-150 z-50">
                            <div className="w-64 rounded-2xl bg-white border border-gray-100 shadow-xl p-2 flex flex-col">
                                {LOCATION_LINKS.map(([href, label]) => (
                                    <Link key={href} href={href} className={dropdownItemClass}>{label}</Link>
                                ))}
                            </div>
                        </div>
                    </div>
                    <Link href="/search" className={navLinkClass(isSolid)}>Search</Link>
                    <Link href="/about" className={navLinkClass(isSolid)}>About</Link>
                    <Link href="/contact" className={navLinkClass(isSolid)}>Contact</Link>
                </nav>

                <div className="hidden md:block">
                    <Link href="/enquiry" className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all shadow-sm ${isSolid ? "bg-gray-900 text-white hover:bg-gray-800" : "bg-white/10 hover:bg-white text-white hover:text-gray-900 border border-white/20 backdrop-blur-sm"}`}>
                        Enquire Now
                    </Link>
                </div>

                <button className={`md:hidden p-2 rounded-full transition-colors ${isSolid ? "text-gray-900" : "text-white"}`} onClick={() => setMobileMenuOpen(true)}>
                    <Menu size={24} />
                </button>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <div className="fixed inset-0 z-[60] bg-white flex flex-col">
                    <div className="flex justify-between items-center p-6">
                        <Link href="/" className="flex items-center gap-2.5" onClick={() => setMobileMenuOpen(false)}>
                            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full shadow-md ring-2 ring-purple-100">
                                <Image src="/images/logo.jpg" alt="SpaceEzy logo" fill sizes="40px" className="object-cover" />
                            </span>
                            <span className="font-bold text-2xl tracking-tighter text-gray-900">Spaceezy<span className="text-purple-500">.</span></span>
                        </Link>
                        <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-gray-900 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                            <X size={24} />
                        </button>
                    </div>
                    <nav className="flex flex-col gap-6 p-8 mt-10 h-full overflow-y-auto">
                        <Link href="/properties" onClick={() => setMobileMenuOpen(false)} className="text-3xl font-light text-gray-800 hover:text-purple-600 transition-colors">Properties</Link>
                        <div className="flex flex-col gap-3 -mt-3 pl-4 border-l-2 border-purple-100 ml-1">
                            {PROPERTY_LINKS.map(([href, label]) => (
                                <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="text-base text-gray-500 hover:text-purple-600 transition-colors">{label}</Link>
                            ))}
                        </div>
                        <Link href="/projects" onClick={() => setMobileMenuOpen(false)} className="text-3xl font-light text-gray-800 hover:text-purple-600 transition-colors">Projects</Link>
                        <span className="text-3xl font-light text-gray-800">Locations</span>
                        <div className="flex flex-col gap-3 -mt-3 pl-4 border-l-2 border-purple-100 ml-1">
                            {LOCATION_LINKS.map(([href, label]) => (
                                <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="text-base text-gray-500 hover:text-purple-600 transition-colors">{label}</Link>
                            ))}
                        </div>
                        <Link href="/search" onClick={() => setMobileMenuOpen(false)} className="text-3xl font-light text-gray-800 hover:text-purple-600 transition-colors">Search</Link>
                        <Link href="/about" onClick={() => setMobileMenuOpen(false)} className="text-3xl font-light text-gray-800 hover:text-purple-600 transition-colors">About</Link>
                        <Link href="/contact" onClick={() => setMobileMenuOpen(false)} className="text-3xl font-light text-gray-800 hover:text-purple-600 transition-colors">Contact</Link>
                        
                        <div className="mt-auto pb-8 pt-8 border-t border-gray-100">
                            <Link href="/enquiry" onClick={() => setMobileMenuOpen(false)} className="block bg-gray-900 text-white text-center py-4 rounded-xl text-lg font-medium hover:bg-gray-800 transition-colors">
                                Enquire Now
                            </Link>
                        </div>
                    </nav>
                </div>
            )}
        </header>
    );
}
