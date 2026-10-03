import React from "react";

export const AMENITY_CATEGORIES = [
    {
        name: "Clubhouse & Lifestyle",
        amenities: ["Premium Clubhouse", "Rooftop Lounge", "Party Hall", "Banquet Hall", "Indoor Games Room", "Multipurpose Hall", "Reading Lounge", "Business Lounge", "Co-working Space", "Café", "Mini Theatre", "Private Dining Area"]
    },
    {
        name: "Fitness & Wellness",
        amenities: ["Infinity Pool", "Swimming Pool", "Kids' Pool", "Jacuzzi", "Spa", "Sauna", "Steam Room", "Yoga Studio", "Meditation Room", "Aerobics Studio", "Fitness Studio", "Gym", "Jogging Track", "Cycling Track", "Sports Lounge"]
    },
    {
        name: "Sports & Recreation",
        amenities: ["Tennis Court", "Badminton Court", "Basketball Court", "Squash Court", "Cricket Practice Pitch", "Football Ground", "Table Tennis", "Billiards / Pool Table", "Padel Court", "Children's Play Area", "Senior Citizen Area"]
    },
    {
        name: "Outdoor & Landscaping",
        amenities: ["Landscaped Gardens", "Central Green", "Rooftop Garden", "Terrace Garden", "Gazebo", "Walking Track", "Outdoor Seating", "Outdoor Fitness Zone", "Amphitheatre", "Water Features", "Picnic Area", "Park"]
    },
    {
        name: "Security & Safety",
        amenities: ["24/7 Security", "CCTV Surveillance", "Gated Community", "Video Door Security", "Intercom Facility", "Access Control", "Boom Barrier", "Security Cabin", "Visitor Management System", "Fire Safety System", "Fire Fighting Equipment", "Smoke Detection", "Emergency Response System"]
    },
    {
        name: "Parking & Mobility",
        amenities: ["Visitor Parking", "Basement Parking", "Covered Parking", "Reserved Parking", "EV Charging Stations", "Valet Parking", "Car Wash Facility", "Driver's Lounge", "Bicycle Parking"]
    },
    {
        name: "Utilities & Sustainability",
        amenities: ["Power Backup", "Water Supply", "Rainwater Harvesting", "Sewage Treatment Plant", "Solar Power", "Waste Management", "Water Softener", "Gas Pipeline"]
    },
    {
        name: "Premium / Luxury Features",
        amenities: ["Private Elevator", "Private Lobby", "Private Terrace", "Private Garden", "Private Pool", "Sky Lounge", "Sky Deck", "Rooftop Pool", "Concierge Service", "Housekeeping Service", "Home Automation", "Smart Door Lock", "Video Door Phone", "Smart Lighting", "Central Air Conditioning", "VRV / VRF Air Conditioning", "Premium Flooring", "Modular Kitchen", "Walk-in Wardrobe", "Servant Room", "Servant Lift", "Lift"]
    },
    {
        name: "Family & Community",
        amenities: ["Kids' Play Area", "Creche / Daycare", "Children's Activity Room", "Senior Citizen Lounge", "Community Hall", "Pet Park", "Pet-Friendly Zone", "Community Garden"]
    }
];

export const RESIDENTIAL_ONLY_AMENITIES = new Set([
    "Premium Clubhouse", "Party Hall", "Infinity Pool", "Swimming Pool", "Kids' Pool", 
    "Jacuzzi", "Spa", "Gym", "Tennis Court", "Badminton Court", "Basketball Court", "Children's Play Area", 
    "Senior Citizen Area", "Gazebo", "Amphitheatre", "Gated Community", "Video Door Security", 
    "Private Elevator", "Private Terrace", "Private Garden", "Private Pool", "Rooftop Pool", 
    "Home Automation", "Smart Door Lock", "Video Door Phone", "Modular Kitchen", "Walk-in Wardrobe", 
    "Servant Room", "Kids' Play Area", "Creche / Daycare", "Children's Activity Room", 
    "Senior Citizen Lounge", "Community Hall", "Pet Park", "Pet-Friendly Zone"
]);

export function AmenitiesSelector({ selectedAmenities, onChange, propertyType }) {
    const handleToggle = (amenity) => {
        const existing = selectedAmenities.includes(amenity);
        const next = existing 
            ? selectedAmenities.filter((item) => item !== amenity) 
            : [...selectedAmenities, amenity];
        onChange(next);
    };

    return (
        <div className="space-y-8">
            {AMENITY_CATEGORIES.map((category) => {
                const availableAmenities = category.amenities.filter(amenity => 
                    propertyType !== "Commercial" || !RESIDENTIAL_ONLY_AMENITIES.has(amenity)
                );
                
                if (availableAmenities.length === 0) return null;

                return (
                    <div key={category.name} className="space-y-4">
                        <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700 pb-2 border-b border-[#e7e2ee]">{category.name}</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {availableAmenities.map((amenity) => {
                                const selected = selectedAmenities.includes(amenity);
                                return (
                                    <button
                                        type="button"
                                        key={amenity}
                                        onClick={() => handleToggle(amenity)}
                                        className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${selected ? "border-violet-400 bg-violet-50 text-violet-700" : "border-[#d9d2e3] bg-[#f7f5f9] text-gray-700 hover:border-violet-200"}`}
                                    >
                                        {amenity}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
