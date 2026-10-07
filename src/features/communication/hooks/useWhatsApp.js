import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    fetchWhatsAppStatus,
    fetchConversations,
    createConversation,
    fetchMessages,
    sendWhatsAppMessage,
    fetchWhatsAppTemplates,
    createWhatsAppTemplate,
    updateWhatsAppTemplate
} from "../../../lib/api/whatsapp";
import { invalidateComm } from "./useCommunication";

export const useWhatsAppStatus = () =>
    useQuery({
        queryKey: ["whatsapp", "status"],
        queryFn: fetchWhatsAppStatus,
        staleTime: 60_000,
        retry: 1
    });

export const useConversations = (params = {}, options = {}) =>
    useQuery({
        queryKey: ["whatsapp-conversations", params],
        queryFn: () => fetchConversations(params),
        enabled: options.enabled !== false,
        retry: 1
    });

export const useMessages = (conversationId, params = {}, options = {}) =>
    useQuery({
        queryKey: ["whatsapp-messages", conversationId, params],
        queryFn: () => fetchMessages(conversationId, params),
        enabled: Boolean(conversationId) && options.enabled !== false,
        refetchInterval: options.refetchInterval ?? 10_000,
        retry: 1
    });

export const useCreateConversation = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: createConversation,
        onSettled: () => invalidateComm(queryClient)
    });
};

export const useSendMessage = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: sendWhatsAppMessage,
        onSettled: () => invalidateComm(queryClient)
    });
};

export const useWhatsAppTemplates = (params = {}, options = {}) =>
    useQuery({
        queryKey: ["whatsapp-templates", params],
        queryFn: () => fetchWhatsAppTemplates(params),
        enabled: options.enabled !== false,
        staleTime: 5 * 60_000,
        retry: 1
    });

export const useCreateWhatsAppTemplate = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: createWhatsAppTemplate,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] })
    });
};

export const useUpdateWhatsAppTemplate = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: updateWhatsAppTemplate,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] })
    });
};
