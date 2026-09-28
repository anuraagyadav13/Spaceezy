export const mockProjects = [
    {
        id: "PRJ-001",
        slug: "the-aurora-residences",
        name: "The Aurora Residences",
        location: "Sector 150",
        city: "Noida",
        description: "A premium luxury residential project offering expansive living spaces with panoramic views. The Aurora brings resort-style living to the heart of Noida.",
        developer: "Spaceezy Prime",
        status: "Under Construction",
        reraNumber: "UPRERA-PRJ-001",
        startingPrice: "1.8 Cr",
        configurations: ["3 BHK", "4 BHK", "Penthouses"],
        amenities: ["Infinity Pool", "Clubhouse", "Spa & Wellness", "Smart Home Tech", "Concierge"],
        images: [
            "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=80",
            "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1600&q=80",
            "https://images.unsplash.com/photo-1600566753086-00f18efc2291?auto=format&fit=crop&w=1600&q=80"
        ],
        latitude: 28.435,
        longitude: 77.467,
        featured: true,
        possession: "Dec 2027"
    },
    {
        id: "PRJ-002",
        slug: "zenith-towers",
        name: "Zenith Towers",
        location: "Golf Course Ext",
        city: "Gurugram",
        description: "Architectural masterpiece with bespoke interiors. Zenith Towers sets a new benchmark for ultra-luxury living with limited edition residences.",
        developer: "Spaceezy Signature",
        status: "Ready to Move",
        reraNumber: "HRERA-PRJ-002",
        startingPrice: "4.5 Cr",
        configurations: ["4 BHK", "5 BHK Duplex"],
        amenities: ["Private Elevator", "Golf Simulator", "Sky Lounge", "Valet Parking", "Temperature Controlled Pool"],
        images: [
            "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1600&q=80",
            "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=80"
        ],
        latitude: 28.398,
        longitude: 77.065,
        featured: true,
        possession: "Ready"
    },
    {
        id: "PRJ-003",
        slug: "oasis-park",
        name: "Oasis Park",
        location: "Whitefield",
        city: "Bengaluru",
        description: "An eco-luxury haven spanning 25 acres. Over 70% open green spaces designed for sustainable and mindful living.",
        developer: "Spaceezy Green",
        status: "New Launch",
        reraNumber: "PRM-KA-003",
        startingPrice: "1.2 Cr",
        configurations: ["2 BHK", "3 BHK"],
        amenities: ["Organic Garden", "Co-working Spaces", "EV Charging", "Sports Arena", "Yoga Pavilion"],
        images: [
            "https://images.unsplash.com/photo-1574362848149-11496d93a7c7?auto=format&fit=crop&w=1600&q=80",
            "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?auto=format&fit=crop&w=1600&q=80"
        ],
        latitude: 12.969,
        longitude: 77.749,
        featured: false,
        possession: "Mar 2028"
    }
];

export function getProjects() {
    return mockProjects;
}

export function getProjectBySlug(slug) {
    return mockProjects.find(p => p.slug === slug);
}
