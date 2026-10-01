// src/lib/store.js
// Lightweight localStorage-backed data layer for the SpaceEzy CRM.
// This is a frontend-only mock "backend" — swap these functions for
// real API calls once you build the server side. Every page in the
// app reads/writes through here, so the Owner and Employee sides
// stay in sync within the same browser.

const KEYS = {
    employees: "se_employees",
    leads: "se_leads",
    clients: "se_clients",
    followups: "se_followups",
    dailyWork: "se_daily_work",
    // v3: bumped again to add richer property fields (description,
    // amenities, gallery, price, assignedTo default) — browsers with
    // the v2 shape re-seed cleanly instead of showing partial data.
    properties: "se_properties_v3",
    siteVisits: "se_site_visits",
    bookings: "se_bookings",
};

function read(key, fallback) {
    if (typeof window === "undefined") return fallback;
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function write(key, value) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
}

function uid(prefix = "id") {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// Photo URLs confirmed to work (pulled from your own existing pages),
// used as seed data and as the fallback when a pasted URL is blank.
export const FALLBACK_PROPERTY_IMAGE = "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?q=80&w=800&auto=format&fit=crop";

const IMG_A = "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?q=80&w=1200&auto=format&fit=crop"; // apartment exterior
const IMG_B = "https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=1200&auto=format&fit=crop"; // office building
const IMG_C = "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?q=80&w=1200&auto=format&fit=crop"; // residency exterior
const IMG_D = "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=1200&auto=format&fit=crop"; // tower/villa

// ---------- Seed data (only used the first time the app runs) ----------
const SEED_EMPLOYEES = [
    { id: "EMP-001", name: "Rahul Sharma", email: "rahul@spaceezy.in", phone: "+91 9876500001", role: "Senior Sales Executive", avatar: "https://i.pravatar.cc/150?u=rahul", joinedDate: "2024-02-10" },
    { id: "EMP-002", name: "Priya Singh", email: "priya@spaceezy.in", phone: "+91 9876500002", role: "Sales Executive", avatar: "https://i.pravatar.cc/150?u=priya", joinedDate: "2024-06-18" },
    { id: "EMP-003", name: "Aman Verma", email: "aman@spaceezy.in", phone: "+91 9876500003", role: "Field Executive", avatar: "https://i.pravatar.cc/150?u=aman", joinedDate: "2025-01-05" },
];

const SEED_LEADS = [
    { id: "L-1021", name: "Sapphire Holloway", phone: "+91 9000000001", project: "Alpha Residency", budget: "₹1.5 Cr", stage: "SITE VISIT", source: "Website", assignedTo: "EMP-001", createdAt: "2026-09-20" },
    { id: "L-1022", name: "Jakub Tucker", phone: "+91 9000000002", project: "Downtown Office", budget: "₹80 L", stage: "CONTACTED", source: "Google Ads", assignedTo: "EMP-002", createdAt: "2026-09-21" },
    { id: "L-1023", name: "Diana Hess", phone: "+91 9000000003", project: "Greenwood Villas", budget: "₹2.2 Cr", stage: "NEGOTIATION", source: "Referral", assignedTo: "EMP-001", createdAt: "2026-09-18" },
];

const SEED_CLIENTS = [
    { id: "C-501", name: "Vikram Malhotra", phone: "+91 9000000010", email: "vikram@example.com", property: "Sky City Towers", status: "Active", assignedTo: "EMP-001", notes: "Wants a 3BHK, pre-approved loan." },
    { id: "C-502", name: "Sneha Gupta", phone: "+91 9000000011", email: "sneha@example.com", property: "Alpha Residency", status: "Closed", assignedTo: "EMP-002", notes: "Booking confirmed, awaiting registry." },
];

const SEED_FOLLOWUPS = [
    { id: "F-1", refName: "Sapphire Holloway", type: "Site Visit", dueDate: "2026-09-27", status: "Pending", assignedTo: "EMP-001", notes: "Confirm timing before visit." },
    { id: "F-2", refName: "Jakub Tucker", type: "Call", dueDate: "2026-09-26", status: "Pending", assignedTo: "EMP-002", notes: "Follow up on commercial space pricing." },
];

// Only images already proven to load in your app are used here.
const SEED_PROPERTIES = [
    {
        id: "P-1", name: "Sunset Apartments", address: "Hauz Khas, New Delhi", image: IMG_A, gallery: [IMG_A, IMG_C],
        type: "Residential", totalUnits: 24, occupiedUnits: 24, status: "Fully Occupied", assignedTo: "EMP-001",
        price: "₹1.5 Cr onwards",
        description: "A quiet, established residential community in the heart of Hauz Khas with easy access to the metro and South Delhi's best cafes. Fully occupied with a stable, long-term tenant base.",
        amenities: ["24/7 Security", "Power Backup", "Covered Parking", "Landscaped Garden"],
        yearBuilt: "2016", floors: "8", parkingSpots: "30",
    },
    {
        id: "P-2", name: "Downtown Office Plaza", address: "Connaught Place, New Delhi", image: IMG_B, gallery: [IMG_B, IMG_D],
        type: "Commercial", totalUnits: 8, occupiedUnits: 6, status: "Available", assignedTo: "EMP-002",
        price: "₹1.2 L/mo per floor",
        description: "Grade-A commercial space in the heart of Connaught Place, minutes from the metro. Two floors currently vacant and move-in ready for corporate tenants.",
        amenities: ["Central AC", "24/7 Power Backup", "High-Speed Elevators", "Conference Rooms", "Cafeteria"],
        yearBuilt: "2011", floors: "6", parkingSpots: "40",
    },
    {
        id: "P-3", name: "Greenwood Complex", address: "Sector 45, Gurugram", image: IMG_C, gallery: [IMG_C, IMG_A],
        type: "Residential", totalUnits: 45, occupiedUnits: 30, status: "Renovating", assignedTo: "EMP-001",
        price: "₹2.2 Cr onwards",
        description: "A large residential complex currently undergoing a phased renovation of common areas and facades. Strong long-term rental demand once work completes.",
        amenities: ["Clubhouse", "Swimming Pool", "Children's Play Area", "Jogging Track"],
        yearBuilt: "2009", floors: "12", parkingSpots: "60",
    },
    {
        id: "P-4", name: "Sky City Towers", address: "Sector 21, Dwarka", image: IMG_D, gallery: [IMG_D, IMG_B],
        type: "Residential", totalUnits: 120, occupiedUnits: 0, status: "Pre-Launch", assignedTo: "EMP-001",
        price: "₹1.8 Cr onwards",
        description: "A premium high-rise development currently in pre-launch. Bookings open for early buyers with flexible payment plans.",
        amenities: ["Rooftop Garden", "Gym", "Smart Home Fittings", "EV Charging"],
        yearBuilt: "2027 (under construction)", floors: "28", parkingSpots: "150",
    },
    {
        id: "P-5", name: "The Orion Retail", address: "Saket District Centre, New Delhi", image: IMG_B, gallery: [IMG_B, IMG_C],
        type: "Retail", totalUnits: 15, occupiedUnits: 10, status: "Available", assignedTo: "EMP-002",
        price: "₹90 L onwards per unit",
        description: "High-footfall retail units at Saket District Centre, ideal for F&B and lifestyle brands. Five units currently available for lease or purchase.",
        amenities: ["Food Court Access", "Dedicated Loading Bay", "CCTV Surveillance", "Visitor Parking"],
        yearBuilt: "2014", floors: "3", parkingSpots: "80",
    },
    {
        id: "P-6", name: "Palm Grove Villas", address: "Golf Course Road, Gurugram", image: IMG_D, gallery: [IMG_D, IMG_A],
        type: "Residential", totalUnits: 30, occupiedUnits: 30, status: "Fully Occupied", assignedTo: "EMP-001",
        price: "₹4.5 Cr onwards",
        description: "An exclusive gated community of independent villas on Golf Course Road. Fully occupied with a strong community and 24/7 concierge.",
        amenities: ["Golf Course View", "Private Garden", "Concierge Service", "Clubhouse"],
        yearBuilt: "2018", floors: "3 (per villa)", parkingSpots: "60",
    },
];

const SEED_DAILY_WORK = [
    { id: "DW-1", employeeId: "EMP-001", date: "2026-09-25", tasks: [{ title: "Site visit with Sapphire Holloway", hours: 2 }, { title: "Follow-up calls", hours: 1 }], summary: "Productive day, one site visit went well." },
];

const SEED_SITE_VISITS = [
    { id: "SV-1", leadName: "Sapphire Holloway", phone: "+91 9000000001", property: "Alpha Residency", date: "2026-09-28", time: "11:30 AM", assignedTo: "EMP-001", status: "Scheduled" },
    { id: "SV-2", leadName: "Amit Kumar", phone: "+91 9000000020", property: "Greenwood Villas", date: "2026-09-24", time: "4:00 PM", assignedTo: "EMP-002", status: "Completed" },
];

const SEED_BOOKINGS = [
    { id: "BK-1", clientName: "Sneha Gupta", property: "Alpha Residency", unit: "B-1204", amount: "₹1.4 Cr", bookingDate: "2026-09-15", assignedTo: "EMP-002", paymentStatus: "Partial" },
    { id: "BK-2", clientName: "Vikram Malhotra", property: "Sky City Towers", unit: "A-802", amount: "₹1.8 Cr", bookingDate: "2026-09-20", assignedTo: "EMP-001", paymentStatus: "Pending" },
];

function ensureSeeded() {
    if (read(KEYS.employees, null) === null) write(KEYS.employees, SEED_EMPLOYEES);
    if (read(KEYS.leads, null) === null) write(KEYS.leads, SEED_LEADS);
    if (read(KEYS.clients, null) === null) write(KEYS.clients, SEED_CLIENTS);
    if (read(KEYS.followups, null) === null) write(KEYS.followups, SEED_FOLLOWUPS);
    if (read(KEYS.properties, null) === null) write(KEYS.properties, SEED_PROPERTIES);
    if (read(KEYS.dailyWork, null) === null) write(KEYS.dailyWork, SEED_DAILY_WORK);
    if (read(KEYS.siteVisits, null) === null) write(KEYS.siteVisits, SEED_SITE_VISITS);
    if (read(KEYS.bookings, null) === null) write(KEYS.bookings, SEED_BOOKINGS);
}

// ---------- Employees ----------
export function getEmployees() {
    ensureSeeded();
    return read(KEYS.employees, []);
}
export function getEmployeeById(id) {
    return getEmployees().find((e) => e.id === id) || null;
}
export function addEmployee(employee) {
    const employees = getEmployees();
    const newEmployee = { id: uid("EMP"), ...employee };
    write(KEYS.employees, [...employees, newEmployee]);
    return newEmployee;
}

// ---------- Leads ----------
export function getLeads() {
    ensureSeeded();
    return read(KEYS.leads, []);
}
export function getLeadsByEmployee(employeeId) {
    return getLeads().filter((l) => l.assignedTo === employeeId);
}
export function getLeadsForProperty(propertyName) {
    return getLeads().filter((l) => l.project === propertyName);
}
export function addLead(lead) {
    const leads = getLeads();
    const newLead = { id: uid("L"), stage: "NEW", createdAt: new Date().toISOString().slice(0, 10), ...lead };
    write(KEYS.leads, [...leads, newLead]);
    return newLead;
}
export function updateLeadStage(leadId, newStage) {
    const leads = getLeads().map((l) => (l.id === leadId ? { ...l, stage: newStage } : l));
    write(KEYS.leads, leads);
    return leads;
}

// ---------- Clients ----------
export function getClients() {
    ensureSeeded();
    return read(KEYS.clients, []);
}
export function getClientsByEmployee(employeeId) {
    return getClients().filter((c) => c.assignedTo === employeeId);
}
export function addClient(client) {
    const clients = getClients();
    const newClient = { id: uid("C"), status: "Active", ...client };
    write(KEYS.clients, [...clients, newClient]);
    return newClient;
}
export function updateClient(clientId, updates) {
    const clients = getClients().map((c) => (c.id === clientId ? { ...c, ...updates } : c));
    write(KEYS.clients, clients);
    return clients;
}

// ---------- Follow-ups ----------
export function getFollowups() {
    ensureSeeded();
    return read(KEYS.followups, []);
}
export function getFollowupsByEmployee(employeeId) {
    return getFollowups().filter((f) => f.assignedTo === employeeId);
}
export function addFollowup(followup) {
    const followups = getFollowups();
    const newFollowup = { id: uid("F"), status: "Pending", ...followup };
    write(KEYS.followups, [...followups, newFollowup]);
    return newFollowup;
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