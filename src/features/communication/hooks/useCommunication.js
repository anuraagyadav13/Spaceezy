import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    fetchTelephonyStatus,
    initiateCall,
    hangupCall,
    recordCallOutcome,
    fetchCalls,
    fetchCallById
} from "../../../lib/api/calls";
import { fetchLeadTimeline } from "../../../lib/api/timeline";
import {
    fetchAgenda,
    fetchProductivity,
    fetchNeedsAttention
} from "../../../lib/api/activities";

// Keys invalidated whenever communication state changes (calls, outcomes,
// follow-ups, stages, timeline entries).
export const COMM_KEYS = [
    "leads",
    "lead",
    "timeline",
    "agenda",
    "tasks",
    "follow-ups",
    "activities",
    "productivity",
    "needs-attention",
    "calls",
    "whatsapp-conversations",
    "whatsapp-messages"
];

export const invalidateComm = (queryClient) =>
    COMM_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));

export const useTelephonyStatus = () =>
    useQuery({
        queryKey: ["calls", "status"],
        queryFn: fetchTelephonyStatus,
        staleTime: 60_000,
        retry: 1
    });

export const useInitiateCall = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: initiateCall,
        onSettled: () => invalidateComm(queryClient)
    });
};

export const useHangupCall = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: hangupCall,
        onSettled: () => invalidateComm(queryClient)
    });
};

export const useRecordCallOutcome = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: recordCallOutcome,
        onSettled: () => invalidateComm(queryClient)
    });
};

export const useCalls = (params = {}, options = {}) =>
    useQuery({
        queryKey: ["calls", params],
        queryFn: () => fetchCalls(params),
        enabled: options.enabled !== false,
        retry: 1
    });

export const useCall = (id, options = {}) =>
    useQuery({
        queryKey: ["calls", id],
        queryFn: () => fetchCallById(id),
        enabled: Boolean(id) && options.enabled !== false,
        retry: 1
    });

export const useLeadTimeline = (leadId, options = {}) =>
    useQuery({
        queryKey: ["timeline", leadId],
        queryFn: () => fetchLeadTimeline(leadId),
        enabled: Boolean(leadId) && options.enabled !== false,
        retry: 1
    });

export const useAgenda = (params = {}, options = {}) =>
    useQuery({
        queryKey: ["agenda", params],
        queryFn: () => fetchAgenda(params),
        enabled: options.enabled !== false,
        retry: 1
    });

export const useProductivity = (params = {}, options = {}) =>
    useQuery({
        queryKey: ["productivity", params],
        queryFn: () => fetchProductivity(params),
        enabled: options.enabled !== false,
        retry: 1
    });

export const useNeedsAttention = (params = {}, options = {}) =>
    useQuery({
        queryKey: ["needs-attention", params],
        queryFn: () => fetchNeedsAttention(params),
        enabled: options.enabled !== false,
        retry: 1
    });
