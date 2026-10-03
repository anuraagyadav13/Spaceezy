// Mock data storage removed. The app should use real backend APIs only.
export const FALLBACK_PROPERTY_IMAGE = "";

export function getEmployees() {
    return [];
}
export function getEmployeeById() {
    return null;
}
export function addEmployee() {
    return null;
}

export function getLeads() {
    return [];
}
export function getLeadsByEmployee() {
    return [];
}
export function getLeadsForProperty() {
    return [];
}
export function addLead() {
    return null;
}
export function updateLeadStage() {
    return [];
}

export function getClients() {
    return [];
}
export function getClientsByEmployee() {
    return [];
}
export function addClient() {
    return null;
}
export function updateClient() {
    return [];
}

export function getFollowups() {
    return [];
}
export function getFollowupsByEmployee() {
    return [];
}
export function addFollowup() {
    return null;
}

export function getProperties() {
    return [];
}
export function getPropertyById() {
    return null;
}
export function getPropertiesByEmployee() {
    return [];
}
export function addProperty() {
    return null;
}
export function updateProperty() {
    return [];
}

export function getSiteVisits() {
    return [];
}
export function getSiteVisitsByEmployee() {
    return [];
}
export function addSiteVisit() {
    return null;
}

export function getBookings() {
    return [];
}
export function getBookingsByEmployee() {
    return [];
}
export function addBooking() {
    return null;
}

export function getDailyWork() {
    return [];
}
export function toggleFollowupStatus(followupId) {
    const followups = getFollowups().map((f) =>
        f.id === followupId ? { ...f, status: f.status === "Pending" ? "Done" : "Pending" } : f
    );
    write(KEYS.followups, followups);
    return followups;
}

// ---------- Properties ----------
export function getProperties() {
    ensureSeeded();
    return read(KEYS.properties, []);
}
// Compatibility helper for the booking wizard.
// Existing seed data stores project-level records in the properties collection.
export function getProjects() {
    return getProperties();
}
export function getPropertyById(id) {
    return getProperties().find((p) => p.id === id) || null;
}
export function getPropertiesByEmployee(employeeId) {
    return getProperties().filter((p) => p.assignedTo === employeeId);
}
export function addProperty(property) {
    const properties = getProperties();
    const newProperty = {
        id: uid("P"),
        status: "Available",
        totalUnits: 0,
        occupiedUnits: 0,
        description: "",
        price: "",
        amenities: [],
        yearBuilt: "",
        floors: "",
        parkingSpots: "",
        gallery: [],
        ...property,
        image: property.image || FALLBACK_PROPERTY_IMAGE,
    };
    write(KEYS.properties, [...properties, newProperty]);
    return newProperty;
}
export function updateProperty(propertyId, updates) {
    // Drop undefined values so, e.g., leaving the photo URL blank on an
    // edit doesn't wipe out the existing photo.
    const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    const properties = getProperties().map((p) => (p.id === propertyId ? { ...p, ...clean } : p));
    write(KEYS.properties, properties);
    return properties;
}

// ---------- Daily Work ----------
export function getDailyWork() {
    ensureSeeded();
    return read(KEYS.dailyWork, []);
}
export function getDailyWorkByEmployee(employeeId) {
    return getDailyWork()
        .filter((d) => d.employeeId === employeeId)
        .sort((a, b) => (a.date < b.date ? 1 : -1));
}
export function addDailyWorkEntry(employeeId, entry) {
    const all = getDailyWork();
    const today = new Date().toISOString().slice(0, 10);
    const existing = all.find((d) => d.employeeId === employeeId && d.date === today);
    let updated;
    if (existing) {
        updated = all.map((d) =>
            d === existing ? { ...d, tasks: [...d.tasks, entry], summary: entry.summary || d.summary } : d
        );
    } else {
        updated = [...all, { id: uid("DW"), employeeId, date: today, tasks: [entry], summary: entry.summary || "" }];
    }
    write(KEYS.dailyWork, updated);
    return updated;
}

// ---------- Site Visits ----------
export function getSiteVisits() {
    ensureSeeded();
    return read(KEYS.siteVisits, []);
}
export function getSiteVisitsByEmployee(employeeId) {
    return getSiteVisits().filter((v) => v.assignedTo === employeeId);
}
export function getSiteVisitsForProperty(propertyName) {
    return getSiteVisits().filter((v) => v.property === propertyName);
}
export function addSiteVisit(visit) {
    const visits = getSiteVisits();
    const newVisit = { id: uid("SV"), status: "Scheduled", ...visit };
    write(KEYS.siteVisits, [...visits, newVisit]);
    return newVisit;
}
export function updateSiteVisitStatus(visitId, status) {
    const visits = getSiteVisits().map((v) => (v.id === visitId ? { ...v, status } : v));
    write(KEYS.siteVisits, visits);
    return visits;
}

// ---------- Bookings ----------
export function getBookings() {
    ensureSeeded();
    return read(KEYS.bookings, []);
}
export function getBookingsByEmployee(employeeId) {
    return getBookings().filter((b) => b.assignedTo === employeeId);
}
export function getBookingsForProperty(propertyName) {
    return getBookings().filter((b) => b.property === propertyName);
}
export function addBooking(booking) {
    const bookings = getBookings();
    const newBooking = { id: uid("BK"), paymentStatus: "Pending", ...booking };
    write(KEYS.bookings, [...bookings, newBooking]);
    return newBooking;
}
export function updateBookingPaymentStatus(bookingId, paymentStatus) {
    const bookings = getBookings().map((b) => (b.id === bookingId ? { ...b, paymentStatus } : b));
    write(KEYS.bookings, bookings);
    return bookings;
}