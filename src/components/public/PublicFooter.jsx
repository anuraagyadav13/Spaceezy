import Link from "next/link";
import Image from "next/image";

export function PublicFooter() {
    return (
        <footer className="bg-[#0f172a] text-gray-300 py-16 border-t border-gray-800">
            <div className="container mx-auto px-6 md:px-12">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
                    <div className="md:col-span-1">
                        <Link href="/" className="flex items-center gap-3 mb-6">
                            <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full shadow-md ring-2 ring-white/10">
                                <Image src="/images/logo.jpg" alt="SpaceEzy logo" fill sizes="44px" className="object-cover" />
                            </span>
                            <span className="font-bold text-2xl tracking-tighter text-white">
                                Spaceezy<span className="text-purple-500">.</span>
                            </span>
                        </Link>
                        <p className="text-sm text-gray-400 leading-relaxed mb-6">
                            Redefining real estate discovery. We connect you with premium properties and visionary projects designed for modern living.
                        </p>
                    </div>
                    
                    <div>
                        <h4 className="text-white font-bold mb-6">Explore</h4>
                        <ul className="flex flex-col gap-3 text-sm">
                            <li><Link href="/projects" className="hover:text-purple-400 transition-colors">Projects</Link></li>
                            <li><Link href="/properties" className="hover:text-purple-400 transition-colors">Properties</Link></li>
                            <li><Link href="/search" className="hover:text-purple-400 transition-colors">Property Search</Link></li>
                        </ul>
                    </div>
                    
                    <div>
                        <h4 className="text-white font-bold mb-6">Company</h4>
                        <ul className="flex flex-col gap-3 text-sm">
                            <li><Link href="/about" className="hover:text-purple-400 transition-colors">About Us</Link></li>
                            <li><Link href="/contact" className="hover:text-purple-400 transition-colors">Contact</Link></li>
                            <li><Link href="/privacy-policy" className="hover:text-purple-400 transition-colors">Privacy Policy</Link></li>
                            <li><Link href="/terms" className="hover:text-purple-400 transition-colors">Terms of Service</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-white font-bold mb-6">Contact</h4>
                        <ul className="flex flex-col gap-3 text-sm text-gray-400">
                            <li><a href="mailto:admin@spaceezy.com" className="hover:text-purple-400 transition-colors">admin@spaceezy.com</a></li>
                            <li><a href="tel:+917827267897" className="hover:text-purple-400 transition-colors">+91 78272 67897</a></li>
                            <li className="mt-2">Office No. 04, 1st Floor, Wave Galleria<br />Sector-3, Wave City, Ghaziabad 201002</li>
                        </ul>
                    </div>
                </div>
                
                <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-gray-800/50 text-xs text-gray-500">
                    <p>&copy; {new Date().getFullYear()} SpaceEzy Real Estate. All rights reserved.</p>
                    <div className="flex gap-4 mt-4 md:mt-0">
                        <Link href="/login" className="hover:text-white transition-colors">Partner/Employee Portal</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
