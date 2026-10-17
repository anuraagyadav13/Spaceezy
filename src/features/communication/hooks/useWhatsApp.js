import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    fetchWhatsAppStatus,
    fetchConversations,
    createConversation,
    fetchMessages,
    sendWhatsAppMessage,
    fetchWhatsAppTemplates,
    fetchTemplateLibrary,
    createWhatsAppTemplate,
    updateWhatsAppTemplate,
    fetchWhatsappSettings,
    saveWhatsappSettings,
    rotateWhatsappSecret,
    removeWhatsappSecret,
    testWhatsappConnection,
    fetchLatestNotification,
    sendTestNotification
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
        // Target the exact thread that was sent to (the generic prefix
        // invalidation below does not wake a thread query that mounted
        // after a fresh conversation was created).
        onSuccess: (_data, variables) => {
            if (variables?.conversationId) {
                queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", variables.conversationId] });
            }
            queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
        },
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

// Predefined real-estate library (code-owned catalog, no DB rows needed to
// browse). Entries provision org-local rows on first send.
export const useTemplateLibrary = (options = {}) =>
    useQuery({
        queryKey: ["whatsapp-template-library"],
        queryFn: fetchTemplateLibrary,
        enabled: options.enabled !== false,
        staleTime: 30 * 60_000,
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

export const useWhatsappSettings = (options = {}) =>
    useQuery({
        queryKey: ["whatsapp-settings"],
        queryFn: fetchWhatsappSettings,
        enabled: options.enabled !== false,
        staleTime: 60_000,
        retry: 1
    });

const invalidateSettings = (queryClient) =>
    queryClient.invalidateQueries({ queryKey: ["whatsapp-settings"] });

export const useSaveWhatsappSettings = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: saveWhatsappSettings,
        onSettled: () => invalidateSettings(queryClient)
    });
};

export const useRotateWhatsappSecret = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: rotateWhatsappSecret,
        onSettled: () => invalidateSettings(queryClient)
    });
};

export const useRemoveWhatsappSecret = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: removeWhatsappSecret,
        onSettled: () => invalidateSettings(queryClient)
    });
};

export const useTestWhatsappConnection = () =>
    useMutation({ mutationFn: testWhatsappConnection });

export const useLatestNotification = (options = {}) =>
    useQuery({
        queryKey: ["whatsapp-latest-notification"],
        queryFn: fetchLatestNotification,
        enabled: options.enabled !== false,
        staleTime: 30_000,
        retry: 1
    });

export const useTestNotify = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: sendTestNotification,
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-latest-notification"] })
    });
};
