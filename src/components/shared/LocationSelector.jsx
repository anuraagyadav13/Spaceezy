"use client";
import { useMemo } from "react";
import SearchableSelect from "./SearchableSelect";
import { useStates, useDistricts, useRegions } from "../../features/locations/hooks/useLocations";

const EMPTY = { stateId: "", districtId: "", regionId: "" };

// Cascading State -> District -> Region selector backed by the canonical
// location master API. Never renders hardcoded location lists.
// value: { stateId, districtId, regionId }
export default function LocationSelector({ value, onChange, showRegion = true, disabled = false }) {
    const current = { ...EMPTY, ...(value || {}) };

    const { data: states = [], isLoading: statesLoading } = useStates();
    const { data: districts = [], isLoading: districtsLoading } = useDistricts(current.stateId);
    const { data: regions = [], isLoading: regionsLoading } = useRegions(current.districtId);

    const stateOptions = useMemo(
        () => (Array.isArray(states) ? states : []).map((row) => ({ value: row.id, label: row.name })),
        [states]
    );
    const districtOptions = useMemo(
        () => (Array.isArray(districts) ? districts : []).map((row) => ({ value: row.id, label: row.name })),
        [districts]
    );
    const regionOptions = useMemo(
        () => (Array.isArray(regions) ? regions : []).map((row) => ({ value: row.id, label: row.name })),
        [regions]
    );

    const handleState = (stateId) => onChange?.({ stateId, districtId: "", regionId: "" });
    const handleDistrict = (districtId) => onChange?.({ stateId: current.stateId, districtId, regionId: "" });
    const handleRegion = (regionId) => onChange?.({ ...current, regionId });

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">State *</label>
                <SearchableSelect
                    ariaLabel="State"
                    options={stateOptions}
                    value={current.stateId}
                    onChange={handleState}
                    placeholder={statesLoading ? "Loading..." : "Search state..."}
                    loading={statesLoading}
                    disabled={disabled}
                />
            </div>
            <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">District</label>
                <SearchableSelect
                    ariaLabel="District"
                    options={districtOptions}
                    value={current.districtId}
                    onChange={handleDistrict}
                    placeholder={
                        !current.stateId
                            ? "Select a state first"
                            : districtsLoading
                                ? "Loading..."
                                : "Search district..."
                    }
                    clearLabel={current.stateId && !districtsLoading && districts.length > 0 ? "Any district" : null}
                    loading={districtsLoading}
                    disabled={disabled || !current.stateId}
                />
            </div>
            {showRegion && (
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Area / Region</label>
                    <SearchableSelect
                        ariaLabel="Area or region"
                        options={regionOptions}
                        value={current.regionId}
                        onChange={handleRegion}
                        placeholder={
                            !current.districtId
                                ? "Select a district first"
                                : regionsLoading
                                    ? "Loading..."
                                    : "Search locality..."
                        }
                        clearLabel={current.districtId && !regionsLoading && regions.length > 0 ? "Any area" : null}
                        loading={regionsLoading}
                        disabled={disabled || !current.districtId}
                    />
                </div>
            )}
        </div>
    );
}
