"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
    ArrowLeft, Check, ChevronRight, Building2, Home,
    ShieldCheck, Calculator
} from "lucide-react";
import { fetchProjects } from "../../../../lib/api/projects";
import { fetchProperties } from "../../../../lib/api/properties";
import { fetchLeads, createLeadBooking } from "../../../../lib/api/leads";
import { fetchQuotationById } from "../../../../lib/api/quotations";
import { showToast } from "../../../../lib/toast";
import { formatCurrency } from "../../../../features/pipeline/helpers";
import { usePermissions } from "../../../../features/auth/hooks/usePermissions";

const STAGES = [
    { title: "Select Project", icon: Building2 },
    { title: "Select Unit", icon: Home },
    { title: "Quotation & Pricing", icon: Calculator },
    { title: "Booking Confirmation", icon: ShieldCheck }
];

const EMPTY_CUSTOMER = { name: "", phone: "", email: "" };

const describeError = (err) => {
    if (!err) return "";
    if (err.status === 403) return "You do not have permission to create this booking.";
    if (err.status === 404) return err.message || "The selected record no longer exists.";
    if (err.status === 409) return err.message || "This booking conflicts with the current inventory or lead state.";
    if (err.status === 400) return err.message || "Some booking details are invalid.";
    return err.message || "Something went wrong.";
};

function BookingWizardInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quotationId = searchParams.get("quotationId");
    const { hasPermission } = usePermissions();

    const [currentStage, setCurrentStage] = useState(0);
    const [manualProject, setManualProject] = useState(null);
    const [manualUnit, setManualUnit] = useState(null);
    const [manualLead, setManualLead] = useState(null);
    const [manualAmount, setManualAmount] = useState("");
    const [customerOverride, setCustomerOverride] = useState(null);
    const [booking, setBooking] = useState(null);
    const [inlineError, setInlineError] = useState(null);

    const projectsQuery = useQuery({
        queryKey: ["projects", "booking-wizard"],
        queryFn: () => fetchProjects({ limit: 100 }),
        enabled: hasPermission("booking:create"),
        retry: 1
    });

    const quotationQuery = useQuery({
        queryKey: ["quotations", quotationId],
        queryFn: () => fetchQuotationById(quotationId),
        enabled: Boolean(quotationId) && hasPermission("booking:create"),
        retry: 1
    });

    const quotation = quotationQuery.data || null;

    // Quotation-derived selections are the source of truth while a
    // quotationId is present; manual state is used otherwise. No effect needed.
    const selectedLead = quotation?.lead || manualLead;
    const selectedProject = quotation
        ? ( quotation.projectId
            ? { id: quotation.projectId, name: quotation.project?.name || "Project", city: "", projectType: "" }
            : null )
        : manualProject;
    const selectedUnit = quotation?.propertyId ? quotation.property : manualUnit;
    const amount = quotation
        ? String(Number(quotation.totalAmount ?? 0))
        : manualAmount;
    const customer = customerOverride || ( selectedLead
        ? { name: selectedLead.name || "", phone: selectedLead.phone || "", email: selectedLead.email || "" }
        : EMPTY_CUSTOMER );

    const unitProjectId = selectedProject?.id || null;

    const unitsQuery = useQuery({
        queryKey: ["properties", "booking-wizard", unitProjectId],
        queryFn: () => fetchProperties(unitProjectId, { status: "AVAILABLE", limit: 200 }),
        enabled: Boolean(unitProjectId),
        retry: 1
    });

    const leadsQuery = useQuery({
        queryKey: ["leads", "booking-wizard"],
        queryFn: () => fetchLeads({ limit: 100 }),
        enabled: Boolean(!quotationId) && hasPermission("booking:create"),
        retry: 1
    });

    const bookingMutation = useMutation({
        mutationFn: () =>
            createLeadBooking({
                id: selectedLead.id,
                propertyId: selectedUnit.id,
                ...( quotationId
                    ? { quotationId }
                    : { amount: Number(amount) } ),
                customer: {
                    name: customer.name || undefined,
                    phone: customer.phone || undefined,
                    ...( customer.email ? { email: customer.email } : {} )
                }
            }),
        onSuccess: (data) => {
            setBooking(data);
            setInlineError(null);
            showToast("Booking confirmed");
        },
        onError: (err) => {
            setInlineError(describeError(err));
            showToast(err.message || "Failed to create booking", "error");
        }
    });

    if (!hasPermission("booking:create")) {
        return (
            <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-8 items-center justify-center text-center">
                <ShieldCheck size={36} className="text-gray-300 mb-3" />
                <p className="text-sm font-bold text-gray-700">You do not have permission to create bookings.</p>
                <p className="text-xs text-gray-400 mt-1">Ask your administrator for booking access.</p>
            </div>
        );
    }

    const projects = Array.isArray(projectsQuery.data) ? projectsQuery.data : projectsQuery.data?.projects || [];
    const units = Array.isArray(unitsQuery.data) ? unitsQuery.data : unitsQuery.data?.properties || [];
    const leads = Array.isArray(leadsQuery.data) ? leadsQuery.data : leadsQuery.data?.leads || [];

    const quotationRejected = Boolean(quotation && quotation.status !== "ACCEPTED");
    const amountValue = Number(amount);

    const handleNext = () => {
        setInlineError(null);
        if (currentStage === 0 && !selectedProject) return;
        if (currentStage === 1 && !selectedUnit) return;
        if (currentStage === 2) {
            if (!selectedLead) return;
            if (!quotationId && !(amountValue > 0)) return;
            if (!customer.name.trim() || !customer.phone.trim()) return;
        }
        if (currentStage < STAGES.length - 1) {
            setCurrentStage((s) => s + 1);
        } else {
            bookingMutation.mutate();
        }
    };

    const handleBack = () => {
        if (currentStage > 0) setCurrentStage((s) => s - 1);
        else router.back();
    };

    const selectLead = (leadId) => {
        const lead = leads.find((l) => l.id === leadId);
        setManualLead(lead || null);
        setCustomerOverride(null);
    };

    const updateCustomer = (field, value) => {
        setCustomerOverride({ ...customer, [field]: value });
    };

    const resetWizard = () => {
        setBooking(null);
        setCurrentStage(0);
        setManualProject(null);
        setManualUnit(null);
        setManualLead(null);
        setManualAmount("");
        setCustomerOverride(null);
        setInlineError(null);
        if (quotationId) router.push("/dashboard/bookings/wizard");
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 p-4 sm:px-8 py-5 shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={handleBack} className="p-2 -ml-2 text-gray-400 hover:bg-gray-50 rounded-xl transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">4-Stage Booking Wizard</h1>
                        <p className="text-xs text-gray-500">Create unit reservations and generate client booking agreements.</p>
                    </div>
                </div>
            </div>

            {/* Stepper Header */}
            <div className="bg-white border-b border-gray-100 p-4 sm:px-8 shrink-0">
                <div className="max-w-4xl mx-auto flex items-center justify-between relative">
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-100 z-0"></div>
                    {STAGES.map((stg, index) => {
                        const Icon = stg.icon;
                        const isDone = currentStage > index;
                        const isCurrent = currentStage === index;
                        return (
                            <div key={stg.title} className="relative z-10 flex flex-col items-center gap-1.5 bg-white px-3">
                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                                    isDone ? 'bg-emerald-500 text-white shadow-sm' :
                                    isCurrent ? 'bg-purple-600 text-white ring-4 ring-purple-100 shadow-md' :
                                    'bg-gray-100 text-gray-400'
                                }`}>
                                    {isDone ? <Check size={18} /> : <Icon size={18} />}
                                </div>
                                <span className={`text-xs font-bold ${isCurrent ? 'text-purple-700' : isDone ? 'text-emerald-600' : 'text-gray-400'}`}>
                                    {stg.title}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
                <div className="max-w-4xl mx-auto bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">

                    {booking ? (
                        <div className="p-12 text-center space-y-6">
                            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                                <ShieldCheck size={44} />
                            </div>
                            <div>
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
                                    Booking Confirmed
                                </span>
                                <h2 className="text-3xl font-extrabold text-gray-900 mt-3">Booking #{booking.id?.slice(0, 8).toUpperCase()}</h2>
                                <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                                    Unit <span className="font-bold text-gray-900">{selectedUnit?.unitNumber || selectedUnit?.title || "Unit"}</span> in{" "}
                                    <span className="font-bold text-gray-900">{selectedProject?.name || "Project"}</span> has been reserved and the lead moved to Booking.
                                </p>
                            </div>

                            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 max-w-lg mx-auto text-left text-xs space-y-3 font-mono text-gray-700">
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-gray-500">Customer Name:</span>
                                    <span className="font-bold text-gray-900">{customer.name || selectedLead?.name}</span>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-gray-500">Agreement Value:</span>
                                    <span className="font-bold text-purple-700">{formatCurrency(booking.amount ?? amountValue)}</span>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-gray-500">Payment Status:</span>
                                    <span className="font-bold text-emerald-600">{booking.paymentStatus || "PENDING"}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Linked Lead:</span>
                                    <span className="font-bold text-gray-900">{selectedLead?.name || "—"}</span>
                                </div>
                            </div>

                            <div className="pt-4 flex justify-center gap-3">
                                <button
                                    onClick={() => router.push("/dashboard/bookings")}
                                    className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800"
                                >
                                    View All Bookings
                                </button>
                                <button
                                    onClick={resetWizard}
                                    className="px-6 py-2.5 bg-purple-50 text-purple-700 rounded-xl text-sm font-bold hover:bg-purple-100"
                                >
                                    Create Another Booking
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-6 sm:p-8">
                            {/* STAGE 1: SELECT PROJECT */}
                            {currentStage === 0 && (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">Stage 1 — Select Project</h2>
                                        <p className="text-xs text-gray-500 mt-1">Choose the development project for this customer reservation.</p>
                                    </div>

                                    {quotationId && quotationQuery.isLoading && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {[1, 2].map((i) => <div key={i} className="h-36 bg-gray-100 rounded-2xl animate-pulse" />)}
                                        </div>
                                    )}

                                    {quotationId && quotationQuery.isError && (
                                        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-center">
                                            <p className="text-sm font-bold text-red-600 mb-1">Failed to load quotation</p>
                                            <p className="text-xs text-red-500 mb-2">{quotationQuery.error?.message}</p>
                                            <button onClick={() => quotationQuery.refetch()} className="text-xs font-bold text-red-600 underline">Retry</button>
                                        </div>
                                    )}

                                    {projectsQuery.isLoading && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {[1, 2, 3, 4].map((i) => <div key={i} className="h-36 bg-gray-100 rounded-2xl animate-pulse" />)}
                                        </div>
                                    )}

                                    {projectsQuery.isError && (
                                        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-center">
                                            <p className="text-sm font-bold text-red-600 mb-1">Failed to load projects</p>
                                            <p className="text-xs text-red-500 mb-2">{projectsQuery.error?.message}</p>
                                            <button onClick={() => projectsQuery.refetch()} className="text-xs font-bold text-red-600 underline">Retry</button>
                                        </div>
                                    )}

                                    {!projectsQuery.isLoading && !projectsQuery.isError && projects.length === 0 && (
                                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center">
                                            <Building2 size={24} className="mx-auto text-gray-300 mb-2" />
                                            <p className="text-sm font-bold text-gray-700">No projects found</p>
                                            <p className="text-xs text-gray-400 mt-1">Create a project in Inventory first.</p>
                                        </div>
                                    )}

                                    {projects.length > 0 && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {projects.map(prj => {
                                                const isSel = selectedProject?.id === prj.id;
                                                return (
                                                    <div
                                                        key={prj.id}
                                                        onClick={() => {
                                                            setManualProject(prj);
                                                            setManualUnit(null);
                                                        }}
                                                        className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                                                            isSel ? "border-purple-600 bg-purple-50/60 shadow-md" : "border-gray-200 hover:border-gray-300 bg-white"
                                                        }`}
                                                    >
                                                        <div className="flex justify-between items-start mb-3">
                                                            <div>
                                                                <h3 className="font-bold text-gray-900 text-base">{prj.name}</h3>
                                                                <p className="text-xs text-gray-500">{prj.developer || prj.projectType || "Project"}</p>
                                                            </div>
                                                            {isSel && <div className="bg-purple-600 text-white p-1 rounded-full"><Check size={14} /></div>}
                                                        </div>
                                                        <p className="text-xs text-gray-600 mb-3">{[prj.city, prj.locality].filter(Boolean).join(", ") || "Location TBC"}</p>
                                                        <div className="flex items-center justify-between text-xs pt-3 border-t border-gray-100">
                                                            <span className="font-bold text-purple-700">{prj.projectType || "Residential"}</span>
                                                            <span className="bg-gray-100 font-semibold px-2 py-0.5 rounded text-gray-600">{prj.status || "AVAILABLE"}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* STAGE 2: SELECT UNIT */}
                            {currentStage === 1 && (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">Stage 2 — Select Unit from {selectedProject?.name}</h2>
                                        <p className="text-xs text-gray-500 mt-1">Filter available floor units and verify live availability.</p>
                                    </div>

                                    {unitsQuery.isLoading && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {[1, 2, 3, 4].map((i) => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
                                        </div>
                                    )}

                                    {unitsQuery.isError && (
                                        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-center">
                                            <p className="text-sm font-bold text-red-600 mb-1">Failed to load units</p>
                                            <p className="text-xs text-red-500 mb-2">{unitsQuery.error?.message}</p>
                                            <button onClick={() => unitsQuery.refetch()} className="text-xs font-bold text-red-600 underline">Retry</button>
                                        </div>
                                    )}

                                    {!unitsQuery.isLoading && !unitsQuery.isError && units.length === 0 && (
                                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 text-center">
                                            <Home size={24} className="mx-auto text-gray-300 mb-2" />
                                            <p className="text-sm font-bold text-gray-700">No available units in this project</p>
                                            <p className="text-xs text-gray-400 mt-1">All units may be reserved or sold. Check the inventory grid.</p>
                                        </div>
                                    )}

                                    {units.length > 0 && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {units.map(unit => {
                                                const isSel = selectedUnit?.id === unit.id;
                                                return (
                                                    <div
                                                        key={unit.id}
                                                        onClick={() => setManualUnit(unit)}
                                                        className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                                                            isSel ? "border-purple-600 bg-purple-50/60 shadow-md" : "border-gray-200 hover:border-gray-300 bg-white"
                                                        }`}
                                                    >
                                                        <div className="flex justify-between items-start mb-2">
                                                            <h3 className="font-bold text-gray-900">{unit.title}{unit.unitNumber ? ` · ${unit.unitNumber}` : ""}</h3>
                                                            <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded">{unit.status || "AVAILABLE"}</span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 mb-2">{unit.configuration || unit.tower || "Unit"}</p>
                                                        <p className="text-base font-extrabold text-purple-700">{formatCurrency(unit.price)}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* STAGE 3: LEAD, CUSTOMER & PRICING */}
                            {currentStage === 2 && (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">Stage 3 — Quotation & Pricing Summary</h2>
                                        <p className="text-xs text-gray-500 mt-1">Confirm the lead, customer details and agreement value. The server revalidates every value.</p>
                                    </div>

                                    {quotationId && quotationQuery.isLoading && (
                                        <div className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
                                    )}

                                    {quotationId && quotationQuery.isError && (
                                        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-center">
                                            <p className="text-sm font-bold text-red-600 mb-1">Failed to load quotation</p>
                                            <p className="text-xs text-red-500 mb-2">{quotationQuery.error?.message}</p>
                                            <button onClick={() => quotationQuery.refetch()} className="text-xs font-bold text-red-600 underline">Retry</button>
                                        </div>
                                    )}

                                    {quotationRejected && quotation && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 font-medium">
                                            This quotation is {quotation.status}. Only an ACCEPTED quotation can be converted to a booking.
                                        </div>
                                    )}

                                    <div className="space-y-4 bg-gray-50 p-6 rounded-2xl border border-gray-200">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Select Customer Lead</label>
                                            {quotationId ? (
                                                <div className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-700">
                                                    {selectedLead?.name || "Loading lead..."}
                                                    <span className="text-gray-400 ml-2">{selectedLead?.phone}</span>
                                                    <span className="text-[10px] font-bold text-purple-600 ml-2 uppercase">From quotation</span>
                                                </div>
                                            ) : (
                                                <select
                                                    value={selectedLead?.id || ""}
                                                    onChange={(e) => selectLead(e.target.value)}
                                                    disabled={leadsQuery.isLoading}
                                                    className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-purple-500/20"
                                                >
                                                    <option value="">{leadsQuery.isLoading ? "Loading leads..." : "-- Choose Lead --"}</option>
                                                    {leads.map(l => (
                                                        <option key={l.id} value={l.id}>{l.name} ({l.phone})</option>
                                                    ))}
                                                </select>
                                            )}
                                            {!quotationId && !leadsQuery.isLoading && leads.length === 0 && (
                                                <p className="text-xs text-red-500 mt-1 font-semibold">No leads found. Create a lead first.</p>
                                            )}
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Customer (matched by phone)</label>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <input
                                                    value={customer.name}
                                                    onChange={(e) => updateCustomer("name", e.target.value)}
                                                    placeholder="Customer name"
                                                    className="bg-white border border-gray-300 rounded-xl px-4 py-2 text-sm font-semibold"
                                                />
                                                <input
                                                    value={customer.phone}
                                                    onChange={(e) => updateCustomer("phone", e.target.value)}
                                                    placeholder="Phone"
                                                    className="bg-white border border-gray-300 rounded-xl px-4 py-2 text-sm font-semibold"
                                                />
                                                <input
                                                    value={customer.email}
                                                    onChange={(e) => updateCustomer("email", e.target.value)}
                                                    placeholder="Email (optional)"
                                                    className="bg-white border border-gray-300 rounded-xl px-4 py-2 text-sm font-semibold"
                                                />
                                            </div>
                                            <p className="text-[11px] text-gray-400 mt-1.5">
                                                An existing customer with this phone is linked automatically — never a duplicate.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Agreement Value (₹)</label>
                                                {quotationId ? (
                                                    <div className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold text-purple-700">
                                                        {formatCurrency(quotation?.totalAmount ?? amountValue)}
                                                        <span className="text-[10px] font-bold text-gray-400 ml-2 uppercase">From accepted quotation</span>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            value={amount}
                                                            onChange={(e) => setManualAmount(e.target.value)}
                                                            placeholder="e.g. 1500000"
                                                            className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2 text-sm font-semibold"
                                                        />
                                                        {amountValue > 0 && (
                                                            <p className="text-xs text-gray-500 mt-1 font-semibold">{formatCurrency(amountValue)}</p>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Selected Unit</label>
                                                <div className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-semibold text-gray-700">
                                                    {selectedUnit?.unitNumber || selectedUnit?.title || "—"}
                                                    {selectedUnit?.price ? <span className="text-purple-700 ml-2">{formatCurrency(selectedUnit.price)}</span> : null}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* STAGE 4: CONFIRMATION */}
                            {currentStage === 3 && (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">Stage 4 — Final Booking Review</h2>
                                        <p className="text-xs text-gray-500 mt-1">Review unit availability and confirm binding reservation terms.</p>
                                    </div>

                                    <div className="bg-purple-900 text-white p-6 rounded-2xl shadow-md space-y-4">
                                        <div className="flex justify-between items-center border-b border-purple-800 pb-4">
                                            <div>
                                                <p className="text-xs text-purple-300">Selected Project & Unit</p>
                                                <h3 className="text-xl font-bold">
                                                    {selectedProject?.name || "Project"} — {selectedUnit?.unitNumber || selectedUnit?.title || "Unit"}
                                                </h3>
                                            </div>
                                            <span className="bg-amber-400 text-gray-900 text-xs font-extrabold px-3 py-1 rounded-full uppercase">Unit Available</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                            <div>
                                                <p className="text-purple-300">Customer Name</p>
                                                <p className="font-bold text-sm text-white">{customer.name || selectedLead?.name || "—"}</p>
                                            </div>
                                            <div>
                                                <p className="text-purple-300">Total Agreement Value</p>
                                                <p className="font-bold text-sm text-amber-300">
                                                    {formatCurrency(amountValue)}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-purple-300">Linked Lead</p>
                                                <p className="font-bold text-sm text-white">{selectedLead?.name || "—"}</p>
                                            </div>
                                            <div>
                                                <p className="text-purple-300">Quotation</p>
                                                <p className="font-bold text-sm text-white">
                                                    {quotationId ? `QT-${quotationId.slice(0, 8).toUpperCase()} (ACCEPTED)` : "Direct booking"}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {inlineError && (
                                        <div className="bg-red-50 border border-red-200 p-4 rounded-xl text-xs text-red-700 font-medium">
                                            {inlineError}
                                        </div>
                                    )}

                                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs text-amber-800 font-medium">
                                        Note: Confirming reserves the unit atomically. If another user takes the unit first, you will get a conflict and no data will change.
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="pt-6 mt-6 border-t border-gray-100 flex justify-between items-center">
                                <button onClick={handleBack} className="px-5 py-2.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl">
                                    {currentStage === 0 ? "Cancel" : "Previous Stage"}
                                </button>

                                <button
                                    onClick={handleNext}
                                    disabled={bookingMutation.isPending || (currentStage === 3 && quotationRejected)}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold hover:opacity-95 shadow-sm shadow-purple-200 disabled:opacity-60"
                                >
                                    {currentStage === STAGES.length - 1
                                        ? (bookingMutation.isPending ? "Confirming..." : "Confirm Booking")
                                        : "Continue Next"}
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}

export default function BookingWizard() {
    return (
        <Suspense
            fallback={
                <div className="flex h-full items-center justify-center bg-gray-50/50">
                    <div className="h-8 w-8 rounded-full border-2 border-purple-600 border-t-transparent animate-spin" />
                </div>
            }
        >
            <BookingWizardInner />
        </Suspense>
    );
}
