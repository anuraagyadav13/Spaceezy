import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createLead } from "../../../lib/api/leads";

export const useCreateLead = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createLead,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["leads"] });
        },
    });
};
