import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateLead } from "../../../lib/api/leads";

export const useEditLead = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: updateLead,
        onSettled: () => {
            ["leads", "lead", "timeline", "agenda", "needs-attention", "pipeline", "lead-matching"].forEach((key) =>
                queryClient.invalidateQueries({ queryKey: [key] })
            );
        },
    });
};
