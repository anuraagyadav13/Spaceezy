import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    fetchStates,
    fetchDistricts,
    fetchRegions,
    createRegion,
    updateRegion,
    deleteRegion,
} from "../../../lib/api/locations";

const CACHE = 5 * 60 * 1000;

export const useStates = () =>
    useQuery({
        queryKey: ["locations", "states"],
        queryFn: fetchStates,
        staleTime: CACHE,
        retry: 1,
    });

export const useDistricts = (stateId) =>
    useQuery({
        queryKey: ["locations", "districts", stateId],
        queryFn: () => fetchDistricts(stateId),
        enabled: Boolean(stateId),
        staleTime: CACHE,
        retry: 1,
    });

export const useRegions = (districtId) =>
    useQuery({
        queryKey: ["locations", "regions", districtId],
        queryFn: () => fetchRegions(districtId),
        enabled: Boolean(districtId),
        staleTime: CACHE,
        retry: 1,
    });

const useRegionMutation = (mutationFn) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["locations", "regions"] }),
    });
};

// Admin-only region management (states/districts stay read-only).
export const useCreateRegion = () => useRegionMutation(createRegion);
export const useUpdateRegion = () => useRegionMutation(updateRegion);
export const useDeleteRegion = () => useRegionMutation(deleteRegion);
