/**
 * AEO content for the public real-estate CRM pages.
 *
 * Every statement here is derived from the Spaceezy CRM implementation
 * (routes, services and schema in this repository). Claims about features
 * that are placeholders (bulk lead import, commissions, customer portal,
 * payment gateway) are deliberately omitted.
 */

export const CRM_OVERVIEW = {
    eyebrow: "Spaceezy CRM",
    title: "Real Estate CRM for property teams",
    intro:
        "Spaceezy CRM is the customer relationship management system behind Spaceezy's real estate operations. It records enquiries, moves leads through sales stages, schedules site visits and keeps project and unit information connected to sales activity.",
    whatIs: {
        heading: "What is a real estate CRM?",
        paragraphs: [
            "A real estate CRM is a system for capturing property enquiries, tracking leads as they progress, scheduling visits and keeping project, unit and availability information aligned with sales work. Unlike a generic contact list, it connects a customer's requirement to the properties a team can actually offer.",
            "In Spaceezy CRM, a website enquiry creates or updates a lead with the project, unit, configuration, location and preferred visit details the visitor supplied. Team members can then log calls, schedule follow-ups, move the lead through stages and record site visits.",
        ],
        example:
            "Example: a visitor enquires about a 3 BHK unit in a published project. The enquiry is stored as a lead with that project and configuration attached, so the sales team can respond with relevant inventory instead of starting from scratch.",
    },
    fit: {
        heading: "Which CRM is suitable for real estate businesses?",
        paragraphs: [
            "A suitable CRM should support lead capture, structured follow-ups, site-visit scheduling, inventory and unit availability, role-based access and reporting from live data. Spaceezy CRM includes these areas for the teams using it.",
            "It is organised around sales executives, sales managers, administrators and channel partners. The system does not publish prices for the CRM, promise conversion results or claim a ranking among other products.",
        ],
        checklist: [
            "Enquiry and lead capture from the public website",
            "Pipeline stages, assignments and follow-up tasks",
            "Property matching and duplicate detection by phone number",
            "Project, configuration and unit availability records",
            "Site-visit scheduling and status tracking",
            "Bookings, quotations and payment-status records",
            "Calls, WhatsApp conversations and document attachments",
            "Role-based permissions and an audit trail",
        ],
    },
    capabilities: [
        {
            title: "Lead capture and enquiry handling",
            body: "The public enquiry form creates or updates a lead. Project, unit, configuration, preferred location and requested visit date are stored as lead context, and the endpoint is rate-limited.",
            href: "/enquiry",
            linkText: "Send an enquiry",
        },
        {
            title: "Pipeline, assignment and follow-ups",
            body: "Leads move through defined stages such as contact, follow-up, site visit, quotation and booking. Managers can reassign leads, executives can claim eligible leads, and tasks and activity timelines record each touchpoint. Duplicate groups are detected by phone number.",
            href: "/real-estate-crm/lead-management",
            linkText: "Read the lead management guide",
        },
        {
            title: "Inventory and unit availability",
            body: "Projects hold configurations and individually tracked units with area, price, status and versioning. Bulk availability counters let teams manage aggregate inventory, while pricing and grid screens read the same records.",
            href: "/real-estate-crm/inventory",
            linkText: "Read the inventory guide",
        },
        {
            title: "Site visits",
            body: "Visits can be scheduled from a lead or planned directly, assigned to a team member and moved through scheduled, completed, cancelled or no-show states. A calendar and a missed-visits queue make the status visible.",
            href: "/real-estate-crm/site-visits",
            linkText: "Read the site visit guide",
        },
        {
            title: "Bookings and quotations",
            body: "Bookings link a customer to a unit or bulk configuration, update reservation status and track payment status. Quotations are stored with validity dates and can be rendered as an itemised PDF. There is no online payment gateway in this application.",
        },
        {
            title: "Customers, calls and WhatsApp",
            body: "Staff can keep customer records, log calls with outcomes and notes, and work from a shared WhatsApp inbox tied to leads. Brochure PDFs and quotation PDFs can be attached to WhatsApp messages when the integration is configured.",
        },
        {
            title: "Marketing and Meta Ads",
            body: "Administrators can connect a Meta account, manage campaigns, ad sets, creatives and audiences, map Instant Form questions to CRM fields and sync incoming leads. Live behaviour depends on a configured Meta account.",
        },
        {
            title: "Permissions and audit trail",
            body: "Five roles with server-enforced permissions control access to leads, inventory, marketing and administration. Security-relevant actions are written to an audit log that administrators can filter.",
        },
        {
            title: "Reporting",
            body: "The reports workspace derives KPIs from live lists and a productivity endpoint, with tabs for leads, sales, visits, bookings and inventory. CSV export happens in the browser, and custom report templates are stored locally in the browser.",
        },
    ],
    useCases: [
        {
            title: "Capture enquiries from a property website",
            body: "A visitor submits the enquiry form on a project or property page. Spaceezy CRM stores the lead with the project, configuration and location context so the team has the details needed for a relevant reply.",
            href: "/enquiry",
            linkText: "Open the enquiry form",
        },
        {
            title: "Manage a sales pipeline",
            body: "Sales teams track leads from first contact through follow-up, site visit, quotation and booking, with assignments, tasks and a per-lead activity timeline.",
            href: "/real-estate-crm/lead-management",
            linkText: "See lead management",
        },
        {
            title: "Plan and follow up on site visits",
            body: "Visits are scheduled against leads and properties, assigned to team members and tracked through completion or no-show statuses.",
            href: "/real-estate-crm/site-visits",
            linkText: "See site visit management",
        },
        {
            title: "Keep inventory and enquiries aligned",
            body: "Project configurations and unit availability are maintained in the same system used for leads, so enquiries can be matched against real inventory.",
            href: "/real-estate-crm/inventory",
            linkText: "See inventory management",
        },
        {
            title: "Compare published inventory",
            body: "Buyers can explore published projects and properties directly on the public website before contacting the Spaceezy team.",
            href: "/projects",
            linkText: "Browse projects",
        },
    ],
    faqs: [
        {
            q: "What is a real estate CRM?",
            a: "A real estate CRM records property enquiries, tracks leads through sales stages, schedules site visits and keeps project, unit and availability information connected to sales activity. Spaceezy CRM performs these functions for Spaceezy's real estate operations.",
        },
        {
            q: "Which CRM is suitable for real estate businesses?",
            a: "Look for lead capture, follow-up tracking, site-visit scheduling, inventory and unit availability, role-based access and reporting from live data. Spaceezy CRM includes these areas; it does not publish CRM pricing or promise conversion results.",
        },
        {
            q: "How do real estate companies manage leads?",
            a: "They capture enquiries, assign them to team members, move them through defined stages, log calls and tasks, and review the activity history. Spaceezy CRM supports these steps, including pipeline stages, re-assignment, claimable leads and follow-up tasks.",
        },
        {
            q: "How can builders track property enquiries?",
            a: "The Spaceezy website enquiry form creates or updates a lead and stores the project, unit, configuration, location and preferred visit date with it. Meta Instant Form leads can also be mapped into CRM fields when the Meta integration is configured.",
        },
        {
            q: "How can real estate teams manage site visits?",
            a: "Spaceezy CRM schedules visits against leads, projects or units, assigns them to team members and records scheduled, completed, cancelled and no-show statuses. A calendar and missed-visits view show the current state.",
        },
        {
            q: "What features should a real estate CRM provide?",
            a: "Useful areas include lead capture, pipeline and follow-ups, property matching, inventory and availability records, site visits, bookings and quotations, calls and messaging, permissions, audit logs and reporting. Spaceezy CRM covers these operational areas.",
        },
        {
            q: "How can property dealers manage their sales pipeline?",
            a: "Spaceezy CRM records leads in stages, supports bulk re-assignment and a claimable queue, links each lead to follow-up tasks and a timeline, and provides pipeline and productivity views for managers.",
        },
        {
            q: "How can real estate businesses improve lead conversion?",
            a: "Respond to enquiries promptly, record each interaction, schedule the next follow-up, match the enquiry to real inventory and review pipeline activity. Spaceezy CRM provides the records and workflows for these steps; it does not guarantee a conversion rate.",
        },
    ],
};

export const CRM_EXPLAINERS = {
    "lead-management": {
        title: "Real estate lead management with Spaceezy CRM",
        intro:
            "Lead management in Spaceezy CRM covers how an enquiry becomes a tracked opportunity: it is captured, given context, assigned, progressed through stages and followed up with recorded activities.",
        sections: [
            {
                heading: "How enquiries become leads",
                body: "The public enquiry form creates or updates a lead. A repeat phone number matches the same lead, and the submission stores the project, unit, configuration, preferred location and requested visit details where provided.",
            },
            {
                heading: "Pipeline stages and ownership",
                body: "Leads move through stages such as contact, follow-up, site visit, quotation and booking. Managers can reassign leads in bulk, and sales executives can claim eligible leads from a dedicated queue governed by per-user limits.",
            },
            {
                heading: "Follow-ups and activity history",
                body: "Tasks can be scheduled, completed, rescheduled and reviewed in an overdue queue. Each lead has a timeline that brings together calls, visits, notes and other interactions, and duplicate groups are detected by phone number.",
            },
            {
                heading: "Matching enquiries to properties",
                body: "A lead's budget, configuration and preferred locations can be used to find matching properties from the same inventory that the team maintains. Interested projects and units are recorded against the lead.",
            },
        ],
        faqs: [
            {
                q: "Does Spaceezy CRM import leads from a spreadsheet?",
                a: "Bulk lead import from a spreadsheet is not implemented in this application. Leads are created individually, through the public website form, or through the configured Meta Ads lead sync. Bulk import exists for properties, not leads.",
            },
            {
                q: "How are duplicate leads handled?",
                a: "Spaceezy CRM groups leads that share a phone number and lets authorised users merge a duplicate into another lead, moving activities and interests across and keeping the surviving record.",
            },
        ],
    },
    "site-visits": {
        title: "Site visit management for real estate teams",
        intro:
            "Spaceezy CRM schedules property visits against leads, projects and units so that a visit is a tracked step in the sales process rather than an informal calendar entry.",
        sections: [
            {
                heading: "Scheduling a visit",
                body: "A visit can be created from a lead or planned directly. It records the lead, project or unit, an optional assignee and a scheduled time; the public enquiry form can also capture a preferred visit date and time.",
            },
            {
                heading: "Statuses and missed visits",
                body: "Visits move through scheduled, completed, cancelled and no-show states. A missed-visits view surfaces no-show records, and a calendar view places visits alongside other team activities.",
            },
            {
                heading: "Why it matters for follow-up",
                body: "Because the visit is linked to the lead, the team can see it in the lead timeline and continue the conversation with the property context already recorded.",
            },
        ],
        faqs: [
            {
                q: "Can a visitor request a site visit from the website?",
                a: "Yes. The public enquiry form accepts a preferred visit date and time and stores those details with the lead. A team member can then schedule and confirm the visit in the CRM.",
            },
            {
                q: "How are missed visits tracked?",
                a: "A visit marked as no-show appears in the missed-visits view and retains its link to the lead and property, so the team can follow up.",
            },
        ],
    },
    inventory: {
        title: "Property inventory and availability tracking",
        intro:
            "Spaceezy CRM maintains the project, configuration and unit records that sales teams refer to when responding to enquiries and preparing quotations.",
        sections: [
            {
                heading: "Projects and configurations",
                body: "A project record holds its location hierarchy, pricing, amenities, RERA fields, images and an optional brochure. Configurations such as '2 BHK' sit under the project and can carry their own area and price values.",
            },
            {
                heading: "Units and bulk availability",
                body: "Units can be tracked individually with area, floor, facing, price, status and a version field that guards concurrent edits. Teams managing large inventories can instead use aggregate total and available unit counters.",
            },
            {
                heading: "Availability in sales workflows",
                body: "Grid, availability and pricing screens read the same inventory records. Matching an enquiry to a property uses this live inventory, and a booking updates the unit or bulk availability status.",
            },
        ],
        faqs: [
            {
                q: "Can the team import property inventory in bulk?",
                a: "Yes. Properties support a bulk import with a dry-run option. Lead bulk import from spreadsheets is a separate feature and is not implemented.",
            },
            {
                q: "Are prices and availability public?",
                a: "Published projects and units appear on the public website with their current prices and availability. Internal CRM records include additional fields that are not exposed publicly.",
            },
        ],
    },
};
