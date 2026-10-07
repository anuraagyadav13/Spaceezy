"use client";
import { useEffect, useRef, useState } from "react";
import { Link2, MessageSquare, Search, Globe, GlobeLock } from "lucide-react";
import Modal from "./Modal";
import { fetchLeads, sharePropertyOnWhatsApp } from "../../lib/api/leads";
import { fetchProperties, fetchPropertyById } from "../../lib/api/properties";

const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all";

/**
 * Share a unit's public property link on WhatsApp.
 *
 * Two modes:
 * - `leadId` (+ optional `initialPropertyId`): pick which unit to share with
 *   this lead (used from Lead Detail / Matching per-card action).
 * - `propertyId`: pick which lead receives this unit's link (used from the
 *   unit detail page).
 *
 * The backend builds the message (project / location / configuration / area /
 * price / public URL) and the final send happens in the WhatsApp Center with
 * the draft pre-filled and editable.
 */
export default function SharePropertyModal({
    isOpen,
    onClose,
    leadId = null,
    propertyId = null,
    initialPropertyId = null
}) {
    const [selectedLead, setSelectedLead] = useState(null);
    const [selectedProperty, setSelectedProperty] = useState(null);
    const [leadQuery, setLeadQuery] = useState("");
    const [propertyQuery, setPropertyQuery] = useState("");
    const [leadResults, setLeadResults] = useState([]);
    const [propertyResults, setPropertyResults] = useState([]);
    const [searchingLeads, setSearchingLeads] = useState(false);
    const [searchingProperties, setSearchingProperties] = useState(false);
    const [share, setShare] = useState(null); // { body, publicUrl, publicToken, property }
    const [building, setBuilding] = useState(false);
    const [error, setError] = useState("");
    const searchTimer = useRef(null);
    const openRef = useRef(false);

    const fixedLeadId = leadId || (selectedLead && selectedLead.id) || null;
    const fixedPropertyId = propertyId || (selectedProperty && selectedProperty.id) || null;

    // Seed the fixed-lead property from the caller (per-card share) on open.
    // Only async setState here (promise callbacks) — state is cleared in
    // handleClose instead of synchronously in the effect body.
    useEffect(() => {
        if (!isOpen) return;
        openRef.current = true;
        const load = (id) => {
            fetchPropertyById(id)
                .then((data) => { if (openRef.current) setSelectedProperty(data); })
                .catch(() => { if (openRef.current) setError("Could not load the selected unit."); });
        };
        if (propertyId) load(propertyId);
        else if (leadId && initialPropertyId) load(initialPropertyId);
        return () => { openRef.current = false; };
    }, [isOpen, propertyId, leadId, initialPropertyId]);

    const handleClose = () => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        setSelectedLead(null);
        setSelectedProperty(null);
        setLeadQuery("");
        setPropertyQuery("");
        setLeadResults([]);
        setPropertyResults([]);
        setShare(null);
        setError("");
        setBuilding(false);
        onClose();
    };

    const scheduleSearch = (value, run) => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(run, 250);
        return value;
    };

    const searchLeads = (query) => {
        setLeadQuery(query);
        if (!query.trim()) {
            setLeadResults([]);
            return;
        }
        setSearchingLeads(true);
        scheduleSearch(query, () => {
            fetchLeads({ search: query, limit: 8 })
                .then((data) => setLeadResults(Array.isArray(data) ? data : []))
                .catch(() => setLeadResults([]))
                .finally(() => setSearchingLeads(false));
        });
    };

    const searchProperties = (query) => {
        setPropertyQuery(query);
        if (!query.trim()) {
            setPropertyResults([]);
            return;
        }
        setSearchingProperties(true);
        scheduleSearch(query, () => {
            fetchProperties(null, { search: query, limit: 8 })
                .then((data) => setPropertyResults(Array.isArray(data) ? data : []))
                .catch(() => setPropertyResults([]))
                .finally(() => setSearchingProperties(false));
        });
    };

    const buildShare = async (nextLeadId, nextPropertyId) => {
        if (!nextLeadId || !nextPropertyId) return;
        setBuilding(true);
        setError("");
        setShare(null);
        try {
            const result = await sharePropertyOnWhatsApp(nextLeadId, nextPropertyId);
            setShare(result);
        } catch (err) {
            if (err?.code === "PROPERTY_NOT_PUBLISHED") {
                setError("This unit is not published on the public website yet. Publish the project and the unit first, then share.");
            } else {
                setError(err?.message || "Could not build the share message.");
            }
        } finally {
            setBuilding(false);
        }
    };

    const pickProperty = (prop) => {
        setSelectedProperty(prop);
        setPropertyResults([]);
        setPropertyQuery("");
        setShare(null);
        if (fixedLeadId) buildShare(fixedLeadId, prop.id);
    };

    const pickLead = (lead) => {
        setSelectedLead(lead);
        setLeadResults([]);
        setLeadQuery("");
        setShare(null);
        if (fixedPropertyId) buildShare(lead.id, fixedPropertyId);
    };

    const openWhatsApp = () => {
        if (!share || !fixedLeadId || !fixedPropertyId) return;
        const params = new URLSearchParams({
            leadId: fixedLeadId,
            message: share.body,
            shareProperty: fixedPropertyId
        });
        // Full document navigation so the composer remounts with the
        // pre-filled draft from the query params (router.push would reuse the
        // mounted page and never re-seed the draft state).
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = `/dashboard/calling/whatsapp?${params.toString()}`;
        handleClose();
    };

    if (!isOpen) return null;

    const needsLead = !leadId;
    const needsProperty = !propertyId;
    const ready = Boolean(fixedLeadId && fixedPropertyId && share && !building);
    const isUnpublished = selectedProperty && selectedProperty.isPublic === false;

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Share on WhatsApp" maxWidth="max-w-lg">
            <div className="space-y-4">
                <p className="text-sm text-gray-500">
                    Send the unit&apos;s public property link — the customer can open it without logging in.
                </p>

                {needsLead && (
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Lead</label>
                        {selectedLead ? (
                            <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm">
                                <span>
                                    <span className="font-bold text-gray-900">{selectedLead.name}</span>
                                    {selectedLead.phone ? (
                                        <span className="text-gray-500 ml-2">{selectedLead.phone}</span>
                                    ) : null}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedLead(null); setShare(null); }}
                                    className="text-xs font-bold text-purple-600 hover:text-purple-700"
                                >
                                    Change
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={leadQuery}
                                    onChange={(e) => searchLeads(e.target.value)}
                                    placeholder="Search lead by name or phone..."
                                    className={`${inputClass} pl-9`}
                                    autoFocus
                                />
                                {searchingLeads && (
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Searching...</span>
                                )}
                                {leadResults.length > 0 && (
                                    <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                                        {leadResults.map((lead) => (
                                            <li key={lead.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => pickLead(lead)}
                                                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-purple-50 flex items-center justify-between"
                                                >
                                                    <span className="font-medium text-gray-900">{lead.name}</span>
                                                    <span className="text-xs text-gray-500">{lead.phone}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {needsProperty && (
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Unit</label>
                        {selectedProperty ? (
                            <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm">
                                <span>
                                    <span className="font-bold text-gray-900">{selectedProperty.title}</span>
                                    <span className="text-gray-500 ml-2">
                                        {selectedProperty.project?.name || selectedProperty.configuration || ""}
                                    </span>
                                    <span
                                        className={`ml-2 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                            selectedProperty.isPublic
                                                ? "bg-green-100 text-green-700"
                                                : "bg-amber-100 text-amber-700"
                                        }`}
                                    >
                                        {selectedProperty.isPublic ? <Globe size={11} /> : <GlobeLock size={11} />}
                                        {selectedProperty.isPublic ? "Published" : "Draft"}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedProperty(null); setShare(null); }}
                                    className="text-xs font-bold text-purple-600 hover:text-purple-700"
                                >
                                    Change
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={propertyQuery}
                                    onChange={(e) => searchProperties(e.target.value)}
                                    placeholder="Search unit by title, number or project..."
                                    className={`${inputClass} pl-9`}
                                />
                                {searchingProperties && (
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Searching...</span>
                                )}
                                {propertyResults.length > 0 && (
                                    <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                                        {propertyResults.map((prop) => (
                                            <li key={prop.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => pickProperty(prop)}
                                                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-purple-50 flex items-center justify-between"
                                                >
                                                    <span>
                                                        <span className="font-medium text-gray-900">{prop.title}</span>
                                                        <span className="block text-xs text-gray-500">{prop.project?.name}</span>
                                                    </span>
                                                    <span
                                                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                                            prop.isPublic ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                                                        }`}
                                                    >
                                                        {prop.isPublic ? "Published" : "Draft"}
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {isUnpublished && (
                    <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        This unit is a draft — publish the project and the unit before sharing its link.
                    </p>
                )}

                {building && (
                    <div className="text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">Building share message...</div>
                )}

                {error && (
                    <div className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                        {error}
                    </div>
                )}

                {share && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 uppercase">
                            <MessageSquare size={13} /> Message preview
                        </div>
                        <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-sans">
                            {share.body}
                        </pre>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Link2 size={13} />
                            <a
                                href={share.publicUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-purple-600 hover:underline font-medium"
                            >
                                {share.publicUrl}
                            </a>
                        </div>
                    </div>
                )}

                <div className="flex gap-3 pt-1">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={openWhatsApp}
                        disabled={!ready}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        <MessageSquare size={15} />
                        {building ? "Preparing..." : "Open WhatsApp"}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
