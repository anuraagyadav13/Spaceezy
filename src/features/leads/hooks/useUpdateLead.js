import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateLeadStatus } from "../../../lib/api/leads";

export const useUpdateLead = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: updateLeadStatus,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["leads"] });
        },
    });
};
