// src/app/property/post/page.jsx
"use client";

export default function PostPropertyPage() {
    const handleSubmit = (e) => {
        e.preventDefault();
        alert("Property submitted successfully! Our team will contact you shortly.");
    };

    return (
        <div className="min-h-screen bg-[#F8F9FB] py-12 px-4 sm:px-6">
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-10">
                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Sell or Rent your Property</h1>
                    <p className="text-gray-500 text-lg">Post your property details and connect with genuine buyers.</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">

                    <div className="p-8 border-b border-gray-50">
                        <h2 className="text-xl font-bold text-gray-900 mb-6">1. Your Details</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-2 block">Full Name</label>
                                <input type="text" placeholder="John Doe" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors" required />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-2 block">Phone Number</label>
                                <input type="tel" placeholder="+91 98765 43210" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors" required />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium text-gray-700 mb-2 block">Email Address</label>
                                <input type="email" placeholder="john@example.com" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors" required />
                            </div>
                        </div>
                    </div>

                    <div className="p-8 border-b border-gray-50">
                        <h2 className="text-xl font-bold text-gray-900 mb-6">2. Property Details</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label className="text-sm font-medium text-gray-700 mb-2 block">Property Title</label>
                                <input type="text" placeholder="e.g., 3 BHK Luxury Apartment in South Delhi" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors" required />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-2 block">Property Type</label>
                                <select className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors">
                                    <option>Residential Apartment</option>
                                    <option>Independent House / Villa</option>
                                    <option>Commercial Office</option>
                                    <option>Plot / Land</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-2 block">BHK</label>
                                <select className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors">
                                    <option>1 BHK</option>
                                    <option>2 BHK</option>
                                    <option>3 BHK</option>
                                    <option>4+ BHK</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-2 block">Super Built-up Area (Sq.Ft)</label>
                                <input type="number" placeholder="e.g., 1500" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors" required />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-2 block">Expected Price</label>
                                <input type="text" placeholder="e.g., 1,50,00,000" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors" required />
                            </div>
                        </div>
                    </div>

                    <div className="p-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-6">3. Location Details</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-2 block">City</label>
                                <input type="text" placeholder="e.g., Delhi" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors" required />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-700 mb-2 block">Locality / Project Name</label>
                                <input type="text" placeholder="e.g., Vasant Vihar" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50 focus:bg-white transition-colors" required />
                            </div>
                        </div>

                        <div className="mt-8 pt-8 border-t border-gray-50 flex justify-end gap-4">
                            <a href="/property" className="px-6 py-3 rounded-xl font-medium text-gray-600 hover:bg-gray-100 transition-colors">
                                Cancel
                            </a>
                            <button type="submit" className="px-8 py-3 rounded-xl font-medium text-white bg-black hover:bg-gray-800 transition-colors">
                                Post Property Now
                            </button>
                        </div>
                    </div>

                </form>
            </div>
        </div>
    );
}