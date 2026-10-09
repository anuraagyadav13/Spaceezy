// Registry of the public SEO landing pages. Titles/H1s are unique per page;
// scope + filters are applied to live CRM inventory (see inventory.js). Pages
// with zero matching inventory are rendered with an honest empty state and
// served noindex (see landing.js) — never invented listings.

const WAVE_CITY = { state: "Uttar Pradesh", district: "Ghaziabad", region: "Wave City" };
const GHAZIABAD = { state: "Uttar Pradesh", district: "Ghaziabad" };

export const LANDING_PAGES = {
    "properties-in-wave-city": {
        title: "Property in Wave City, Ghaziabad | Flats, Plots, Homes & Commercial Spaces | SpaceEzy",
        h1: "Property in Wave City, Ghaziabad",
        description:
            "Browse property in Wave City, Ghaziabad — flats, plots, homes and commercial spaces with live prices and availability.",
        scope: WAVE_CITY,
        filters: {},
        intro: [
            "Wave City on NH-24 is one of Ghaziabad's fastest-growing integrated townships, and this page brings together every property SpaceEzy has live there — residential flats, open plots, independent homes and commercial spaces in one place.",
            "Listings below come straight from our inventory: prices, configurations and availability are what our team has published today. Pick a listing to see full details, or contact us to plan a site visit anywhere in Wave City.",
        ],
        related: [
            "properties-in-ghaziabad",
            "flats-in-wave-city",
            "plots-in-wave-city",
            "commercial-property-in-wave-city",
            "property-for-sale-in-wave-city",
        ],
        faq: [
            {
                q: "What types of property are available in Wave City?",
                a: "SpaceEzy lists residential and commercial inventory in Wave City — flats, plots, homes and shops — published directly by our team, so the listings on this page reflect current availability.",
            },
            {
                q: "How do I enquire about a property in Wave City?",
                a: "Open any listing and use the Enquire Now button, call +91 78272 67897, or message us on WhatsApp. We respond with pricing, floor plans and site-visit slots.",
            },
            {
                q: "Does SpaceEzy charge brokerage?",
                a: "No. Listings on SpaceEzy are zero-brokerage — you enquire directly through our team and deal with the project on transparent, published prices.",
            },
            {
                q: "Where is the SpaceEzy office in Wave City?",
                a: "Office No. 04, 1st Floor, Wave Galleria, Sector-3, Wave City, Ghaziabad 201002 — walk-ins are welcome.",
            },
        ],
    },

    "properties-in-ghaziabad": {
        title: "Properties in Ghaziabad | Flats, Plots & Homes for Sale | SpaceEzy",
        h1: "Properties in Ghaziabad",
        description:
            "Explore properties in Ghaziabad — residential projects, flats, plots and commercial listings across the city's top localities.",
        scope: GHAZIABAD,
        filters: {},
        intro: [
            "Ghaziabad is one of the National Capital Region's largest residential markets, covering localities such as Wave City, Vaishali, Indirapuram, Raj Nagar Extension and Crossings Republik. This page aggregates every property and project SpaceEzy has published in the district.",
            "Compare live prices, configurations and availability below — or jump to a focused page like flats for sale or plots for sale if you already know what you are looking for.",
        ],
        related: [
            "properties-in-wave-city",
            "flats-for-sale",
            "plots-for-sale",
            "commercial-properties",
            "residential-properties",
        ],
    },

    "flats-for-sale": {
        title: "Flats for Sale | Buy Flats in Ghaziabad & Top Cities | SpaceEzy",
        h1: "Flats for Sale",
        description:
            "Browse flats for sale with prices, configurations and photos — live inventory across Ghaziabad and top cities on SpaceEzy.",
        scope: {},
        filters: { propertyType: "Residential", forSale: true },
        intro: [
            "Looking for a flat to buy? Every flat below is a live unit from a published project — with the price, configuration, carpet area and availability our team maintains in one system.",
            "Filter by project, compare units side by side, and enquire directly from any listing. Flats in Wave City and Ghaziabad have their own focused pages too.",
        ],
        related: [
            "properties-in-ghaziabad",
            "properties-in-wave-city",
            "residential-properties",
            "plots-for-sale",
        ],
    },

    "plots-for-sale": {
        title: "Plots for Sale | Residential Plots for Sale | SpaceEzy",
        h1: "Plots for Sale",
        description:
            "Browse residential and commercial plots for sale with sizes, prices and live availability on SpaceEzy.",
        scope: {},
        filters: { propertyType: "Plot", forSale: true },
        intro: [
            "Plots give you the freedom to build at your own pace. This page lists every published plot unit — with plot size, price and current availability from live inventory.",
            "Buy a plot in a serviced township or an independent pocket; enquire from any listing to get paperwork details, corner/middle positioning and a site-visit slot.",
        ],
        related: [
            "plots-in-wave-city",
            "plots-for-sale-in-wave-city",
            "properties-in-ghaziabad",
            "commercial-properties",
        ],
    },

    "commercial-properties": {
        title: "Commercial Properties for Sale & Lease | SpaceEzy",
        h1: "Commercial Properties",
        description:
            "Find commercial properties for sale — offices, shops and retail spaces with live availability on SpaceEzy.",
        scope: {},
        filters: { propertyType: "Commercial", projectTypes: ["Commercial"] },
        intro: [
            "From high-street shops to office floors, this page collects the commercial projects and units SpaceEzy has published — with real pricing and vacancy information maintained by our team.",
            "Commercial inventory moves fast; enquire from a listing or call us to get current availability, floor plans and rental-vs-buy options for a specific location.",
        ],
        related: ["commercial-property-in-wave-city", "residential-properties", "properties-in-ghaziabad"],
    },

    "residential-properties": {
        title: "Residential Properties | Flats, Homes & Villas | SpaceEzy",
        h1: "Residential Properties",
        description:
            "Browse residential properties — flats, homes and villas with prices, configurations and live availability on SpaceEzy.",
        scope: {},
        filters: { propertyType: "Residential", projectTypes: ["Residential"] },
        intro: [
            "Everything residential in one list: apartments, builder floors, homes and villas from published projects, with live prices and unit-level availability.",
            "Each card opens a full listing with photos, area, configuration and an enquiry flow that reaches our team directly — no brokerage, no guesswork.",
        ],
        related: ["flats-for-sale", "properties-in-wave-city", "properties-in-ghaziabad", "villas-in-wave-city"],
    },

    "flats-in-wave-city": {
        title: "Flats in Wave City, Ghaziabad | Top Projects | SpaceEzy",
        h1: "Flats in Wave City, Ghaziabad",
        description:
            "Browse flats in Wave City, Ghaziabad with prices, configurations and availability from live project inventory.",
        scope: WAVE_CITY,
        filters: { propertyType: "Residential" },
        intro: [
            "Wave City's apartment inventory — 2, 3 and 4 BHK flats across the township's published projects — collected in one list with live pricing.",
            "Open a flat to see area, floor, availability and photos, then enquire for a site visit at a time that suits you.",
        ],
        related: [
            "properties-in-wave-city",
            "flats-for-sale-in-wave-city",
            "2-bhk-flats-in-wave-city",
            "3-bhk-flats-in-wave-city",
        ],
    },

    "flats-for-sale-in-wave-city": {
        title: "Flats for Sale in Wave City | Ready & New Builds | SpaceEzy",
        h1: "Flats for Sale in Wave City",
        description:
            "Find flats for sale in Wave City, Ghaziabad — live inventory with prices and configurations on SpaceEzy.",
        scope: WAVE_CITY,
        filters: { propertyType: "Residential", forSale: true },
        intro: [
            "Units available to buy in Wave City, updated as our team publishes inventory — ready-to-move and under-construction flats side by side.",
            "Compare prices across projects, shortlist a couple of units and book a site visit through the enquiry form on any listing.",
        ],
        related: ["flats-in-wave-city", "properties-in-wave-city", "2-bhk-flats-in-wave-city", "3-bhk-flats-in-wave-city"],
    },

    "2-bhk-flats-in-wave-city": {
        title: "2 BHK Flats in Wave City, Ghaziabad | SpaceEzy",
        h1: "2 BHK Flats in Wave City, Ghaziabad",
        description: "Browse 2 BHK flats in Wave City, Ghaziabad with prices, sizes and live availability on SpaceEzy.",
        scope: WAVE_CITY,
        filters: { propertyType: "Residential", bhk: 2 },
        intro: [
            "A 2 BHK is the most popular first home and investment size in Wave City — this page shows exactly the 2 BHK units our team has live right now, with prices and areas.",
            "See a unit you like? Enquire from the listing for floor plans, payment plans and a site visit.",
        ],
        related: ["flats-in-wave-city", "3-bhk-flats-in-wave-city", "properties-in-wave-city", "flats-for-sale-in-wave-city"],
    },

    "3-bhk-flats-in-wave-city": {
        title: "3 BHK Flats in Wave City, Ghaziabad | SpaceEzy",
        h1: "3 BHK Flats in Wave City, Ghaziabad",
        description: "Browse 3 BHK flats in Wave City, Ghaziabad with prices, sizes and live availability on SpaceEzy.",
        scope: WAVE_CITY,
        filters: { propertyType: "Residential", bhk: 3 },
        intro: [
            "3 BHK flats in Wave City suit growing families who want extra rooms without leaving the township — every unit below is live inventory with a published price.",
            "Compare projects, check availability and enquire directly for a walkthrough.",
        ],
        related: ["flats-in-wave-city", "2-bhk-flats-in-wave-city", "4-bhk-flats-in-wave-city", "properties-in-wave-city"],
    },

    "4-bhk-flats-in-wave-city": {
        title: "4 BHK Flats in Wave City, Ghaziabad | SpaceEzy",
        h1: "4 BHK Flats in Wave City, Ghaziabad",
        description: "Browse 4 BHK flats in Wave City, Ghaziabad with prices, sizes and live availability on SpaceEzy.",
        scope: WAVE_CITY,
        filters: { propertyType: "Residential", bhk: 4 },
        intro: [
            "The largest apartments in Wave City — 4 BHK units with more space for work-from-home, guests and storage, listed with live prices and availability.",
            "Enquire from any unit for floor plans and a site visit; we can also share comparable options if inventory is tight.",
        ],
        related: ["flats-in-wave-city", "3-bhk-flats-in-wave-city", "properties-in-wave-city", "villas-in-wave-city"],
    },

    "plots-in-wave-city": {
        title: "Plots in Wave City, Ghaziabad | Residential Plots | SpaceEzy",
        h1: "Plots in Wave City, Ghaziabad",
        description: "Browse plots in Wave City, Ghaziabad with sizes, prices and live availability on SpaceEzy.",
        scope: WAVE_CITY,
        filters: { propertyType: "Plot" },
        intro: [
            "Build your own home inside a planned township — plots in Wave City with sizes and prices published by our team, updated as inventory changes.",
            "Enquire from a listing for plot dimensions, corner/middle positioning, possession status and paperwork details.",
        ],
        related: ["plots-for-sale-in-wave-city", "properties-in-wave-city", "plots-in-wave-city", "property-for-sale-in-wave-city"],
    },

    "plots-for-sale-in-wave-city": {
        title: "Plots for Sale in Wave City, Ghaziabad | SpaceEzy",
        h1: "Plots for Sale in Wave City",
        description: "Find plots for sale in Wave City, Ghaziabad — live inventory with sizes and prices on SpaceEzy.",
        scope: WAVE_CITY,
        filters: { propertyType: "Plot", forSale: true },
        intro: [
            "Residential plots available to buy in Wave City — sizes, prices and current status on every listing, straight from live inventory.",
            "Shortlist a plot and book a site visit; our team walks you through pricing, charges and the booking steps.",
        ],
        related: ["plots-in-wave-city", "properties-in-wave-city", "plots-for-sale", "property-for-sale-in-wave-city"],
    },

    "villas-in-wave-city": {
        title: "Villas in Wave City, Ghaziabad | Luxury Villas | SpaceEzy",
        h1: "Villas in Wave City, Ghaziabad",
        description: "Browse villas in Wave City, Ghaziabad with prices, sizes and live availability on SpaceEzy.",
        scope: WAVE_CITY,
        filters: { textMatch: "villa" },
        intro: [
            "Villa living inside Wave City — independent floors with private entrances, listed here whenever our team publishes villa inventory.",
            "If nothing is listed right now, call or WhatsApp us: villa stock is limited and often moves before it reaches the website.",
        ],
        related: ["properties-in-wave-city", "flats-in-wave-city", "residential-properties", "4-bhk-flats-in-wave-city"],
    },

    "commercial-property-in-wave-city": {
        title: "Commercial Property in Wave City, Ghaziabad | SpaceEzy",
        h1: "Commercial Property in Wave City, Ghaziabad",
        description:
            "Find commercial property in Wave City, Ghaziabad — shops, offices and retail spaces with live availability.",
        scope: WAVE_CITY,
        filters: { propertyType: "Commercial", projectTypes: ["Commercial"] },
        intro: [
            "Shops, offices and other commercial spaces inside Wave City — useful for business owners who want to be close to a residential catchment of tens of thousands.",
            "Enquire from a listing for frontage, floor, rent-vs-buy pricing and occupancy details.",
        ],
        related: ["commercial-properties", "properties-in-wave-city", "property-for-sale-in-wave-city"],
    },

    "property-for-sale-in-wave-city": {
        title: "Property for Sale in Wave City, Ghaziabad | SpaceEzy",
        h1: "Property for Sale in Wave City, Ghaziabad",
        description:
            "Browse property for sale in Wave City, Ghaziabad — flats, plots and homes with live prices on SpaceEzy.",
        scope: WAVE_CITY,
        filters: { forSale: true },
        intro: [
            "Everything available to buy in Wave City in one list — flats, plots, homes and commercial units from published inventory.",
            "Open a listing for full details, or contact our team (we are based in Wave Galleria, Wave City itself) to plan your visit.",
        ],
        related: ["properties-in-wave-city", "flats-for-sale-in-wave-city", "plots-for-sale-in-wave-city", "commercial-property-in-wave-city"],
    },
};

export const LANDING_SLUGS = Object.keys(LANDING_PAGES);

// Place name -> landing slug, for locality links on project/property pages.
export const LANDING_BY_PLACE = {
    "Wave City": "properties-in-wave-city",
    Ghaziabad: "properties-in-ghaziabad",
};
