import { z } from "zod";
import { PROPERTY_TYPES, configurationsFor } from "../../../lib/propertyRequirement";

// Lead form schema: contact details, project interest, the structured
// property requirement (type / configurations / budget range / hierarchical
// preferred locations) and assignment.
export const leadSchema = z
    .object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        phone: z.string().min(10, "Phone number must be at least 10 digits"),
        email: z.string().email("Enter a valid email address").or(z.literal("")).optional(),
        projectId: z.string().optional(),
        propertyId: z.string().optional(),
        source: z.string().min(1, "Source is required"),
        assignedTo: z.string().min(1, "Assignee is required"),

        propertyType: z.enum(PROPERTY_TYPES).or(z.literal("")).optional(),
        configurations: z.array(z.string()).max(12, "Too many configurations").default([]),
        budgetMin: z.string().optional(),
        budgetMax: z.string().optional(),
        preferredLocations: z
            .array(
                z.object({
                    stateId: z.string().min(1, "State is required"),
                    districtId: z.string().optional(),
                    regionId: z.string().optional(),
                })
            )
            .max(10, "At most 10 preferred locations")
            .default([]),
    })
    .superRefine((data, ctx) => {
        const parseBudget = (raw) => {
            if (raw === undefined || raw === null || String(raw).trim() === "") return null;
            const value = Number(raw);
            return Number.isNaN(value) || value < 0 ? NaN : value;
        };

        const min = parseBudget(data.budgetMin);
        const max = parseBudget(data.budgetMax);

        if (Number.isNaN(min)) {
            ctx.addIssue({ code: "custom", path: ["budgetMin"], message: "Enter a valid amount" });
        }
        if (Number.isNaN(max)) {
            ctx.addIssue({ code: "custom", path: ["budgetMax"], message: "Enter a valid amount" });
        }
        if (!Number.isNaN(min) && !Number.isNaN(max) && min !== null && max !== null && min > max) {
            ctx.addIssue({
                code: "custom",
                path: ["budgetMax"],
                message: "Maximum budget must be greater than or equal to minimum budget",
            });
        }

        if (data.configurations.length > 0 && !data.propertyType) {
            ctx.addIssue({
                code: "custom",
                path: ["propertyType"],
                message: "Select a property type before choosing configurations",
            });
        }
        if (data.propertyType) {
            const allowed = new Set(configurationsFor(data.propertyType));
            data.configurations.forEach((configuration, index) => {
                if (!allowed.has(configuration)) {
                    ctx.addIssue({
                        code: "custom",
                        path: ["configurations", index],
                        message: `"${configuration}" is not a valid ${data.propertyType} configuration`,
                    });
                }
            });
        }
    });
