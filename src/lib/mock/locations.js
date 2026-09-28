export const mockLocations = [
    { id: "LOC-01", name: "Noida", featured: true },
    { id: "LOC-02", name: "Gurugram", featured: true },
    { id: "LOC-03", name: "Bengaluru", featured: true },
    { id: "LOC-04", name: "Pune", featured: false },
    { id: "LOC-05", name: "Mumbai", featured: false }
];

export function getLocations() {
    return mockLocations;
}
