import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateLeadStatus } from "../../../lib/api/leads";

export const useUpdateLead = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: updateLeadStatus,
        onSuccess: () => {
            ["leads", "lead", "timeline", "agenda", "needs-attention", "pipeline"].forEach((key) =>
                queryClient.invalidateQueries({ queryKey: [key] })
            );
        },
    });
};
