"use client";
import { useMemo, useState } from "react";
import { Check, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import SearchableSelect from "../../../../components/shared/SearchableSelect";
import {
    useStates,
    useDistricts,
    useRegions,
    useCreateRegion,
    useUpdateRegion,
    useDeleteRegion,
} from "../../../../features/locations/hooks/useLocations";

// Admin management of the canonical location master.
// States and districts come from the verified India dataset and are
// read-only here; regions (localities) are the expandable level.
export default function LocationManagementPage() {
    const [stateId, setStateId] = useState("");
    const [districtId, setDistrictId] = useState("");
    const [newName, setNewName] = useState("");
    const [editingId, setEditingId] = useState(null);
    const [editingName, setEditingName] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const { data: states = [], isLoading: statesLoading } = useStates();
    const { data: districts = [], isLoading: districtsLoading } = useDistricts(stateId);
    const { data: regions = [], isLoading: regionsLoading } = useRegions(districtId);

    const createRegion = useCreateRegion();
    const updateRegion = useUpdateRegion();
    const deleteRegion = useDeleteRegion();

    const stateOptions = useMemo(
        () => states.map((row) => ({ value: row.id, label: row.name })),
        [states]
    );
    const districtOptions = useMemo(
        () => districts.map((row) => ({ value: row.id, label: row.name })),
        [districts]
    );

    const resetMessages = () => {
        setError("");
        setNotice("");
    };

    const handleAdd = async (event) => {
        event.preventDefault();
        const name = newName.trim();
        if (!districtId || !name) return;
        resetMessages();
        try {
            await createRegion.mutateAsync({ districtId, name });
            setNewName("");
            setNotice(`Added "${name}"`);
        } catch (err) {
            setError(err.message || "Could not add region");
        }
    };

    const handleRename = async (regionId) => {
        const name = editingName.trim();
        if (!name) return;
        resetMessages();
        try {
            await updateRegion.mutateAsync({ regionId, name });
            setEditingId(null);
            setEditingName("");
            setNotice("Region renamed");
        } catch (err) {
            setError(err.message || "Could not rename region");
        }
    };

    const handleDelete = async (region) => {
        const confirmed = window.confirm(
            `Delete region "${region.name}"? Leads and projects must not reference it.`
        );
        if (!confirmed) return;
        resetMessages();
        try {
            await deleteRegion.mutateAsync({ regionId: region.id });
            setNotice(`Deleted "${region.name}"`);
        } catch (err) {
            setError(err.message || "Could not delete region");
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Location Management</h1>
                <p className="text-sm text-gray-500">
                    Browse the canonical India location master (State/UT → District → Locality). States and districts are
                    seeded from the verified dataset; localities (regions) can be added, renamed or removed here by admins.
                </p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                            State / UT
                        </label>
                        <SearchableSelect
                            ariaLabel="State"
                            options={stateOptions}
                            value={stateId}
                            onChange={(next) => {
                                setStateId(next);
                                setDistrictId("");
                                resetMessages();
                            }}
                            placeholder={statesLoading ? "Loading..." : "Search state..."}
                            loading={statesLoading}
                        />
                        <p className="text-xs text-gray-400 mt-1">{states.length} states/UTs loaded</p>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                            District
                        </label>
                        <SearchableSelect
                            ariaLabel="District"
                            options={districtOptions}
                            value={districtId}
                            onChange={(next) => {
                                setDistrictId(next);
                                resetMessages();
                            }}
                            placeholder={
                                !stateId ? "Select a state first" : districtsLoading ? "Loading..." : "Search district..."
                            }
                            loading={districtsLoading}
                            disabled={!stateId}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            {stateId ? `${districts.length} districts in this state` : "Select a state to list districts"}
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-purple-600" />
                    <h3 className="font-bold text-gray-900 text-sm">Localities / Regions</h3>
                    {districtId && (
                        <span className="text-xs text-gray-400">
                            {regionsLoading ? "Loading..." : `${regions.length} region(s)`}
                        </span>
                    )}
                </div>

                {!districtId && (
                    <p className="text-sm text-gray-400">Select a state and district to manage its localities.</p>
                )}

                {error && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
                        <X size={16} className="shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}
                {notice && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-700">
                        <Check size={16} className="shrink-0 mt-0.5" />
                        <span>{notice}</span>
                    </div>
                )}

                {districtId && (
                    <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
                        <input
                            type="text"
                            value={newName}
                            onChange={(event) => setNewName(event.target.value)}
                            placeholder="New locality name"
                            maxLength={80}
                            className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
                        />
                        <button
                            type="submit"
                            disabled={createRegion.isPending || !newName.trim()}
                            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 disabled:opacity-60"
                        >
                            <Plus size={16} />
                            {createRegion.isPending ? "Adding..." : "Add Region"}
                        </button>
                    </form>
                )}

                {districtId && regions.length > 0 && (
                    <ul className="divide-y divide-gray-100 border-t border-gray-100">
                        {regions.map((region) => (
                            <li key={region.id} className="flex items-center gap-2 py-2">
                                {editingId === region.id ? (
                                    <>
                                        <input
                                            type="text"
                                            value={editingName}
                                            onChange={(event) => setEditingName(event.target.value)}
                                            maxLength={80}
                                            autoFocus
                                            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-400"
                                        />
                                        <button
                                            type="button"
                                            aria-label="Save region name"
                                            onClick={() => handleRename(region.id)}
                                            disabled={updateRegion.isPending}
                                            className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50"
                                        >
                                            <Check size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Cancel rename"
                                            onClick={() => {
                                                setEditingId(null);
                                                setEditingName("");
                                            }}
                                            className="p-2 rounded-lg text-gray-400 hover:bg-gray-50"
                                        >
                                            <X size={16} />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <span className="flex-1 text-sm text-gray-800">{region.name}</span>
                                        <button
                                            type="button"
                                            aria-label={`Rename ${region.name}`}
                                            onClick={() => {
                                                resetMessages();
                                                setEditingId(region.id);
                                                setEditingName(region.name);
                                            }}
                                            className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-purple-600"
                                        >
                                            <Pencil size={15} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`Delete ${region.name}`}
                                            onClick={() => handleDelete(region)}
                                            disabled={deleteRegion.isPending}
                                            className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {districtId && !regionsLoading && regions.length === 0 && (
                    <p className="text-sm text-gray-400">No localities yet. Add the first one above.</p>
                )}
            </div>
        </div>
    );
}
