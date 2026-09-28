export const mockProperties = [
    {
        id: "PROP-101",
        projectId: "PRJ-001",
        title: "3 BHK Luxury Suite in Aurora",
        unitNumber: "A-1204",
        configuration: "3 BHK",
        bhk: 3,
        area: 2150, // sq.ft
        floor: 12,
        facing: "North-East",
        price: 18500000,
        status: "Available",
        images: [
            "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1000&q=80",
            "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1000&q=80"
        ],
        featured: true
    },
    {
        id: "PROP-102",
        projectId: "PRJ-001",
        title: "4 BHK Premium Residence",
        unitNumber: "B-2201",
        configuration: "4 BHK",
        bhk: 4,
        area: 3200, // sq.ft
        floor: 22,
        facing: "East",
        price: 27500000,
        status: "Available",
        images: [
            "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=80"
        ],
        featured: false
    },
    {
        id: "PROP-201",
        projectId: "PRJ-002",
        title: "Signature 4 BHK Apartment",
        unitNumber: "T1-1502",
        configuration: "4 BHK",
        bhk: 4,
        area: 4500, // sq.ft
        floor: 15,
        facing: "South-West",
        price: 46000000,
        status: "Available",
        images: [
            "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1000&q=80",
            "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1000&q=80"
        ],
        featured: true
    },
    {
        id: "PROP-301",
        projectId: "PRJ-003",
        title: "Eco-Friendly 2 BHK",
        unitNumber: "C-0504",
        configuration: "2 BHK",
        bhk: 2,
        area: 1250, // sq.ft
        floor: 5,
        facing: "North",
        price: 12500000,
        status: "Available",
        images: [
            "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1000&q=80"
        ],
        featured: false
    }
];

export function getProperties() {
    return mockProperties;
}

export function getPropertyById(id) {
    return mockProperties.find(p => p.id === id);
}

export function searchProperties(filters) {
    let results = [...mockProperties];
    
    if (filters.bhk) {
        results = results.filter(p => p.bhk === parseInt(filters.bhk));
    }
    if (filters.maxPrice) {
        results = results.filter(p => p.price <= parseInt(filters.maxPrice));
    }
    if (filters.minPrice) {
        results = results.filter(p => p.price >= parseInt(filters.minPrice));
    }
    if (filters.projectId) {
        results = results.filter(p => p.projectId === filters.projectId);
    }
    
    return results;
}
