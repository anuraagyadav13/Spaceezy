"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

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
                <Link href="/" className={`font-bold text-2xl tracking-tighter transition-colors ${isSolid ? "text-gray-900" : "text-white drop-shadow-md"}`}>
                    SPACEezy<span className="text-purple-500">.</span>
                </Link>
                
                <nav className="hidden md:flex gap-8 items-center">
                    <Link href="/projects" className={`text-sm font-medium transition-colors ${isSolid ? "text-gray-600 hover:text-purple-600" : "text-white/90 hover:text-white drop-shadow-sm"}`}>Projects</Link>
                    <Link href="/properties" className={`text-sm font-medium transition-colors ${isSolid ? "text-gray-600 hover:text-purple-600" : "text-white/90 hover:text-white drop-shadow-sm"}`}>Properties</Link>
                    <Link href="/search" className={`text-sm font-medium transition-colors ${isSolid ? "text-gray-600 hover:text-purple-600" : "text-white/90 hover:text-white drop-shadow-sm"}`}>Search</Link>
                    <Link href="/about" className={`text-sm font-medium transition-colors ${isSolid ? "text-gray-600 hover:text-purple-600" : "text-white/90 hover:text-white drop-shadow-sm"}`}>About</Link>
                    <Link href="/contact" className={`text-sm font-medium transition-colors ${isSolid ? "text-gray-600 hover:text-purple-600" : "text-white/90 hover:text-white drop-shadow-sm"}`}>Contact</Link>
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
                        <Link href="/" className="font-bold text-2xl tracking-tighter text-gray-900" onClick={() => setMobileMenuOpen(false)}>
                            SPACEezy<span className="text-purple-500">.</span>
                        </Link>
                        <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-gray-900 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                            <X size={24} />
                        </button>
                    </div>
                    <nav className="flex flex-col gap-6 p-8 mt-10 h-full overflow-y-auto">
                        <Link href="/projects" onClick={() => setMobileMenuOpen(false)} className="text-3xl font-light text-gray-800 hover:text-purple-600 transition-colors">Projects</Link>
                        <Link href="/properties" onClick={() => setMobileMenuOpen(false)} className="text-3xl font-light text-gray-800 hover:text-purple-600 transition-colors">Properties</Link>
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
