import { z } from "zod";

export const leadSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
    project: z.string().min(1, "Project is required"),
    budget: z.string().min(1, "Budget is required"),
    source: z.string().min(1, "Source is required"),
    assignedTo: z.string().min(1, "Assignee is required"),
});
