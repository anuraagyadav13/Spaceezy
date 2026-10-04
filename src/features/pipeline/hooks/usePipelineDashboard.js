import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchPipelineDashboard } from "../../../lib/api/leads";

export const pipelineQueryKey = (filters) => ["pipeline", filters];

export const usePipelineDashboard = (filters) => {
    return useQuery({
        queryKey: pipelineQueryKey(filters),
        queryFn: () => fetchPipelineDashboard(filters),
        placeholderData: keepPreviousData,
        staleTime: 30 * 1000,
        retry: 1,
        refetchOnWindowFocus: false
    });
};
