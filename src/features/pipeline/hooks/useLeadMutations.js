import { useMutation, useQueryClient } from "@tanstack/react-query";
import { transitionLeadStage, logLeadContact, scheduleLeadFollowUp, createLeadBooking, bulkAssignLeads } from "../../../lib/api/leads";
import { createQuotation } from "../../../lib/api/quotations";
import { showToast } from "../../../lib/toast";

const toErrorMessage = (error) => {
    if (typeof error === "string") return error;
    if (error?.message) return error.message;
    return "Something went wrong. Please try again.";
};

const invalidateAll = (queryClient, keys) => {
    keys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
};

const CORE_KEYS = ["pipeline", "leads", "lead", "activities"];

export const useTransitionLeadStage = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ successMessage, ...vars }) => {
            void successMessage;
            return transitionLeadStage(vars);
        },
        onSuccess: (_data, vars) => showToast(vars.successMessage || "Pipeline updated"),
        onError: (error) => showToast(toErrorMessage(error), "error"),
        onSettled: () => invalidateAll(queryClient, [...CORE_KEYS, "follow-ups", "tasks"])
    });
};

export const useContactLead = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, channel, notes, duration, advanceToContacted = true }) => {
            const lead = await logLeadContact({ id, channel, notes, duration });
            if (
                advanceToContacted &&
                lead &&
                lead.status !== "CONTACTED" &&
                lead.status !== "BOOKED"
            ) {
                await transitionLeadStage({ id, target: "CONTACTED", reason: "contact logged" });
            }
            return lead;
        },
        onSuccess: () => showToast("Contact logged"),
        onError: (error) => showToast(toErrorMessage(error), "error"),
        onSettled: () => invalidateAll(queryClient, [...CORE_KEYS, "follow-ups"])
    });
};

const FOLLOW_UP_STATUSES = ["NEW", "CONTACTED", "FOLLOW_UP", "INTERESTED", "QUALIFIED", "BOOKED"];

export const useScheduleLeadFollowUp = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, currentStatus, dueDate, title, notes, assignedToId }) => {
            const task = await scheduleLeadFollowUp({ id, dueDate, title, notes, assignedToId });
            const shouldAdvance = currentStatus && !FOLLOW_UP_STATUSES.includes(currentStatus);
            if (shouldAdvance) {
                await transitionLeadStage({ id, target: "FOLLOW_UP", reason: "follow-up scheduled" });
            }
            return task;
        },
        onSuccess: () => showToast("Follow-up scheduled"),
        onError: (error) => showToast(toErrorMessage(error), "error"),
        onSettled: () => invalidateAll(queryClient, [...CORE_KEYS, "tasks", "follow-ups"])
    });
};

export const useCreateQuotation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data) => createQuotation(data),
        onSuccess: (_data, vars) =>
            showToast(vars?.status === "DRAFT" ? "Quotation saved as draft" : "Quotation sent"),
        onError: (error) => showToast(toErrorMessage(error), "error"),
        onSettled: () => invalidateAll(queryClient, [...CORE_KEYS, "quotations", "tasks", "follow-ups"])
    });
};

export const useConvertLeadToBooking = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...data }) => createLeadBooking({ id, ...data }),
        onSuccess: () => showToast("Booking confirmed"),
        onError: (error) => showToast(toErrorMessage(error), "error"),
        onSettled: () =>
            invalidateAll(queryClient, [
                ...CORE_KEYS,
                "bookings",
                "customers",
                "properties",
                "inventory",
                "projects",
                "tasks",
                "follow-ups"
            ])
    });
};

export const useAssignLead = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ leadId, assignedToId }) => bulkAssignLeads([leadId], assignedToId),
        onSuccess: () => showToast("Lead assigned"),
        onError: (error) => showToast(toErrorMessage(error), "error"),
        onSettled: () => invalidateAll(queryClient, [...CORE_KEYS, "users"])
    });
};

export { toErrorMessage };
