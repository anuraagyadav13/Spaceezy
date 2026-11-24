/**
 * Public, evidence-based real-estate AEO content.
 *
 * Every statement is drawn from the live public website (home, about, contact,
 * projects, properties and location pages) or from verified company details.
 * No CRM capability is presented as a public product, and no resale, seller,
 * testimonial, award or ranking claim is made where evidence does not exist.
 */

export const BUYING_ASSISTANCE = {
    title: "Property buying assistance with Spaceezy",
    intro:
        "Spaceezy is a real-estate firm that helps buyers discover, shortlist and enquire about residential properties and builder projects. The team publishes live prices, configurations and availability on this website so visitors can compare options before getting in touch.",
    blocks: [
        {
            heading: "How Spaceezy helps property buyers",
            body: "Spaceezy connects buyers with published projects and individual units. Visitors can browse listings by project, property type, location and configuration, then send an enquiry with the details of what they are looking for.",
            links: [
                { href: "/projects", text: "Browse published projects" },
                { href: "/properties", text: "Browse published properties" },
            ],
        },
        {
            heading: "Property categories published on the website",
            body: "The current public inventory includes residential flats and builder projects in Wave City, Ghaziabad. Published configurations include 1 BHK and 3 BHK homes, and project pages show developer, RERA and availability details where available.",
            links: [
                { href: "/flats-in-wave-city", text: "Flats in Wave City" },
                { href: "/1-bhk-flats-in-wave-city", text: "1 BHK flats in Wave City" },
            ],
        },
        {
            heading: "Areas Spaceezy serves",
            body: "The website and company details list Wave City, Ghaziabad, Uttar Pradesh as the served area. The Spaceezy office is in Wave City, Ghaziabad, and the published projects are in this location.",
        },
        {
            heading: "From enquiry to site visit",
            body: "Buyers can submit an enquiry for a project or unit, include a preferred visit date and time, and ask the team for more information. Spaceezy then assists with the next steps, including arranging a site visit where appropriate.",
            links: [
                { href: "/property-enquiries", text: "How property enquiries work" },
                { href: "/site-visits", text: "Arranging a site visit" },
                { href: "/enquiry", text: "Send an enquiry" },
            ],
        },
        {
            heading: "Why buyers consider Spaceezy",
            body: "The website states that Spaceezy offers zero brokerage on partner and new developer projects, dedicated relationship managers for site visits, legal and documentation assistance, and post-sales support. Listings are described as verified, and project pages include RERA details where available.",
            links: [{ href: "/about", text: "About Spaceezy" }],
        },
    ],
    faqs: [
        {
            q: "What does Spaceezy do?",
            a: "Spaceezy is a real-estate firm that helps buyers discover, shortlist and enquire about residential properties and builder projects. The website publishes prices, configurations, availability and direct enquiry options.",
        },
        {
            q: "Which properties can I explore on Spaceezy?",
            a: "The current public inventory includes residential flats and builder projects in Wave City, Ghaziabad, with 1 BHK and 3 BHK configurations. Browse the Projects and Properties pages for the latest published listings.",
        },
        {
            q: "Which locations does Spaceezy serve?",
            a: "The website and company details list Wave City, Ghaziabad, Uttar Pradesh as the served area, and the published projects are located there.",
        },
        {
            q: "Does Spaceezy charge brokerage?",
            a: "The website states that Spaceezy offers zero brokerage on partner and new developer projects. Buyers should confirm the terms for a specific property with the team.",
        },
        {
            q: "Can I arrange a site visit?",
            a: "Yes. The enquiry form accepts a preferred visit date and time for a project or unit, and the Spaceezy team assists with arranging the visit.",
        },
        {
            q: "Are prices and availability up to date?",
            a: "The website publishes current prices and availability for listed projects and units. Spaceezy's terms state that prices and availability can change, so buyers should confirm details with the team before making a decision.",
        },
    ],
};

export const PROPERTY_ENQUIRIES = {
    title: "Property enquiries with Spaceezy",
    intro:
        "A property enquiry on Spaceezy tells the team which project, unit or configuration interests you and how to contact you. The website then uses those details to help you get a relevant response.",
    blocks: [
        {
            heading: "How to send an enquiry",
            body: "Use the enquiry form on any project or property page, or the general enquiry page. You can provide your name, WhatsApp number, email, an optional project, a preferred location, a unit type and a message.",
            links: [{ href: "/enquiry", text: "Open the enquiry form" }],
        },
        {
            heading: "What details help us respond",
            body: "Useful details include the project or unit you are interested in, your preferred configuration and budget, the location you are considering, and whether you would like a site visit. The form captures these where provided.",
        },
        {
            heading: "What happens after an enquiry",
            body: "The Spaceezy team reviews the enquiry and follows up with information about the relevant published inventory. Where a visit is requested, the team helps arrange the next step.",
            links: [{ href: "/site-visits", text: "Learn about site visits" }],
        },
        {
            heading: "Pricing and availability questions",
            body: "Project and unit pages show published prices, configurations and availability. Because these can change, the team confirms the current position during the enquiry conversation.",
        },
    ],
    faqs: [
        {
            q: "Where do I send a property enquiry?",
            a: "Use the enquiry form linked from a project or property page, or the general enquiry page on the website. You can include your contact details, project interest, location and unit type.",
        },
        {
            q: "Can I ask for a site visit in my enquiry?",
            a: "Yes. The enquiry form supports a preferred visit date and time, and the Spaceezy team can then help arrange the visit.",
        },
        {
            q: "Will I get information about current prices?",
            a: "Published prices and availability are shown on the listing pages and can be included in your enquiry. Spaceezy confirms the current details with you because they may change.",
        },
    ],
};

export const SITE_VISITS = {
    title: "Property site visits with Spaceezy",
    intro:
        "Spaceezy helps buyers arrange site visits for published projects and properties. A visit request can be submitted online with a preferred date and time for the team to follow up.",
    blocks: [
        {
            heading: "How to request a site visit",
            body: "Choose a project or property, open the enquiry form and provide your contact details along with a preferred visit date and time. The team uses these details to confirm the next steps.",
            links: [{ href: "/enquiry", text: "Request a site visit" }],
        },
        {
            heading: "Which properties can be visited",
            body: "Site visit requests can be made for published projects and units in the areas Spaceezy serves, currently Wave City, Ghaziabad, Uttar Pradesh. Browse Projects and Properties to see what is published.",
            links: [
                { href: "/projects", text: "Published projects" },
                { href: "/properties", text: "Published properties" },
            ],
        },
        {
            heading: "What to prepare for a visit",
            body: "It helps to know the configuration, budget and location you are considering, and which project or unit you want to see. The team can then focus the visit on relevant options.",
        },
        {
            heading: "After the visit",
            body: "Following a visit, buyers can continue the conversation with the Spaceezy team about price, availability, documentation and the next steps toward a booking.",
        },
    ],
    faqs: [
        {
            q: "How do I book a site visit with Spaceezy?",
            a: "Submit an enquiry for a project or property and include your preferred visit date and time. The Spaceezy team will follow up to arrange the visit.",
        },
        {
            q: "Where are the properties I can visit?",
            a: "Published projects and units are in Wave City, Ghaziabad, Uttar Pradesh. Check the Projects and Properties pages for the current listings.",
        },
        {
            q: "Can I ask questions after the visit?",
            a: "Yes. After a visit you can continue discussing price, availability and documentation with the Spaceezy team.",
        },
    ],
};
