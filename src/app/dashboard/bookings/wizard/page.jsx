"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
    ArrowLeft, Check, ChevronRight, Building2, Home, FileText, 
    ShieldCheck, Calculator, User, DollarSign, Sparkles
} from "lucide-react";
import { getProjects, getProperties, addBooking, getLeads } from "../../../../lib/store";

const STAGES = [
    { title: "Select Project", icon: Building2 },
    { title: "Select Unit", icon: Home },
    { title: "Quotation & Pricing", icon: Calculator },
    { title: "Booking Confirmation", icon: ShieldCheck }
];

export default function BookingWizard() {
    const router = useRouter();
    const [currentStage, setCurrentStage] = useState(0);

    // Form data
    const [projects, setProjects] = useState([]);
    const [properties, setProperties] = useState([]);
    const [leads, setLeads] = useState([]);

    const [selectedProject, setSelectedProject] = useState(null);
    const [selectedUnit, setSelectedUnit] = useState(null);
    const [selectedLead, setSelectedLead] = useState(null);

    // Quotation data
    const [agreementValue, setAgreementValue] = useState("1,50,00,000");
    const [parkingCharge, setParkingCharge] = useState("3,50,000");
    const [clubMembership, setClubMembership] = useState("1,50,000");
    const [gstTax, setGstTax] = useState("5%");
    const [bookingAmount, setBookingAmount] = useState("5,00,000");
    const [paymentPlan, setPaymentPlan] = useState("Construction Linked (CLP)");
    const [notes, setNotes] = useState("");

    const [bookingRef, setBookingRef] = useState(null);

    useEffect(() => {
        setProjects(getProjects());
        setProperties(getProperties());
        setLeads(getLeads());
    }, []);

    const handleNext = () => {
        if (currentStage === 0 && !selectedProject) return;
        if (currentStage === 1 && !selectedUnit) return;
        if (currentStage === 2 && !selectedLead) return;

        if (currentStage < STAGES.length - 1) {
            setCurrentStage(s => s + 1);
        } else {
            // Confirm booking
            const newBk = addBooking({
                clientName: selectedLead ? selectedLead.name : "Walk-in Customer",
                property: selectedProject ? selectedProject.name : "Spaceezy Towers",
                unit: selectedUnit ? selectedUnit.name : "Unit A-101",
                amount: `₹${agreementValue}`,
                bookingDate: new Date().toISOString().slice(0, 10),
                paymentStatus: "Partial",
                paymentPlan,
                notes
            });
            setBookingRef(newBk.id);
        }
    };

    const handleBack = () => {
        if (currentStage > 0) setCurrentStage(s => s - 1);
        else router.back();
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
                    
                    {bookingRef ? (
                        <div className="p-12 text-center space-y-6">
                            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                                <ShieldCheck size={44} />
                            </div>
                            <div>
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
                                    Simulated Booking Confirmed
                                </span>
                                <h2 className="text-3xl font-extrabold text-gray-900 mt-3">Booking #{bookingRef}</h2>
                                <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                                    Unit <span className="font-bold text-gray-900">{selectedUnit?.name || "Unit"}</span> in <span className="font-bold text-gray-900">{selectedProject?.name || "Project"}</span> has been marked as reserved in mock state.
                                </p>
                            </div>

                            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 max-w-lg mx-auto text-left text-xs space-y-3 font-mono text-gray-700">
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-gray-500">Customer Name:</span>
                                    <span className="font-bold text-gray-900">{selectedLead?.name || "Sneha Gupta"}</span>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-gray-500">Agreement Value:</span>
                                    <span className="font-bold text-purple-700">₹{agreementValue}</span>
                                </div>
                                <div className="flex justify-between border-b pb-2">
                                    <span className="text-gray-500">Initial Booking Token:</span>
                                    <span className="font-bold text-emerald-600">₹{bookingAmount}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Payment Plan:</span>
                                    <span className="font-bold text-gray-900">{paymentPlan}</span>
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
                                    onClick={() => {
                                        setBookingRef(null);
                                        setCurrentStage(0);
                                        setSelectedProject(null);
                                        setSelectedUnit(null);
                                    }}
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

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {projects.map(prj => {
                                            const isSel = selectedProject?.id === prj.id;
                                            return (
                                                <div 
                                                    key={prj.id}
                                                    onClick={() => setSelectedProject(prj)}
                                                    className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                                                        isSel ? "border-purple-600 bg-purple-50/60 shadow-md" : "border-gray-200 hover:border-gray-300 bg-white"
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div>
                                                            <h3 className="font-bold text-gray-900 text-base">{prj.name}</h3>
                                                            <p className="text-xs text-gray-500">{prj.developer}</p>
                                                        </div>
                                                        {isSel && <div className="bg-purple-600 text-white p-1 rounded-full"><Check size={14} /></div>}
                                                    </div>
                                                    <p className="text-xs text-gray-600 mb-3">{prj.city}, {prj.location}</p>
                                                    <div className="flex items-center justify-between text-xs pt-3 border-t border-gray-100">
                                                        <span className="font-bold text-purple-700">{prj.priceRange}</span>
                                                        <span className="bg-gray-100 font-semibold px-2 py-0.5 rounded text-gray-600">{prj.status}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* STAGE 2: SELECT UNIT */}
                            {currentStage === 1 && (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">Stage 2 — Select Unit from {selectedProject?.name}</h2>
                                        <p className="text-xs text-gray-500 mt-1">Filter available floor units and verify live availability.</p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {properties.map(unit => {
                                            const isSel = selectedUnit?.id === unit.id;
                                            return (
                                                <div 
                                                    key={unit.id}
                                                    onClick={() => setSelectedUnit(unit)}
                                                    className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                                                        isSel ? "border-purple-600 bg-purple-50/60 shadow-md" : "border-gray-200 hover:border-gray-300 bg-white"
                                                    }`}
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <h3 className="font-bold text-gray-900">{unit.name}</h3>
                                                        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded">{unit.status}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-500 mb-2">{unit.address}</p>
                                                    <p className="text-base font-extrabold text-purple-700">{unit.price}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* STAGE 3: QUOTATION */}
                            {currentStage === 2 && (
                                <div className="space-y-6">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">Stage 3 — Quotation & Pricing Summary</h2>
                                        <p className="text-xs text-gray-500 mt-1">Configure price breakup, tax rates and assign to lead.</p>
                                    </div>

                                    <div className="space-y-4 bg-gray-50 p-6 rounded-2xl border border-gray-200">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Select Customer Lead</label>
                                            <select 
                                                value={selectedLead?.id || ""}
                                                onChange={e => {
                                                    const l = leads.find(x => x.id === e.target.value);
                                                    setSelectedLead(l);
                                                }}
                                                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-purple-500/20"
                                            >
                                                <option value="">-- Choose Lead --</option>
                                                {leads.map(l => (
                                                    <option key={l.id} value={l.id}>{l.name} ({l.phone}) - Budget: {l.budget}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Agreement Value (₹)</label>
                                                <input 
                                                    type="text" 
                                                    value={agreementValue}
                                                    onChange={e => setAgreementValue(e.target.value)}
                                                    className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2 text-sm font-semibold"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Car Parking Charges (₹)</label>
                                                <input 
                                                    type="text" 
                                                    value={parkingCharge}
                                                    onChange={e => setParkingCharge(e.target.value)}
                                                    className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2 text-sm font-semibold"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Initial Token Amount (₹)</label>
                                                <input 
                                                    type="text" 
                                                    value={bookingAmount}
                                                    onChange={e => setBookingAmount(e.target.value)}
                                                    className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2 text-sm font-semibold text-emerald-700"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Payment Plan Structure</label>
                                                <select 
                                                    value={paymentPlan}
                                                    onChange={e => setPaymentPlan(e.target.value)}
                                                    className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2 text-sm font-semibold"
                                                >
                                                    <option>Construction Linked (CLP)</option>
                                                    <option>Down Payment (10:90 Plan)</option>
                                                    <option>Time Linked Payment</option>
                                                </select>
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
                                                <h3 className="text-xl font-bold">{selectedProject?.name || "Project"} — {selectedUnit?.name || "Unit"}</h3>
                                            </div>
                                            <span className="bg-amber-400 text-gray-900 text-xs font-extrabold px-3 py-1 rounded-full uppercase">Unit Reserved</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                            <div>
                                                <p className="text-purple-300">Customer Name</p>
                                                <p className="font-bold text-sm text-white">{selectedLead?.name || "Sneha Gupta"}</p>
                                            </div>
                                            <div>
                                                <p className="text-purple-300">Total Agreement Value</p>
                                                <p className="font-bold text-sm text-amber-300">₹{agreementValue}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs text-amber-800 font-medium">
                                        Note: Final confirmation will register this booking under the mock sales repository and mark unit availability as reserved.
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
                                    className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold hover:opacity-95 shadow-sm shadow-purple-200"
                                >
                                    {currentStage === STAGES.length - 1 ? "Confirm Booking" : "Continue Next"}
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
