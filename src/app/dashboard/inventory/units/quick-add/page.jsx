"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, UploadCloud, Building2, MapPin, Search } from "lucide-react";
import { addProperty } from "../../../../../lib/store";

const STEPS = ["Basic Details", "Amenities", "Gallery", "Other Details"];

export default function QuickAddWizard() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(0);
    const [formData, setFormData] = useState({
        purpose: "Sale",
        category: "Residential",
        type: "Apartment",
        projectId: "",
        projectName: "",
        tower: "",
        floor: "",
        unitNumber: "",
        configuration: "2 BHK",
        amenities: [],
        images: [],
        areaCarpet: "",
        areaSaleable: "",
        furnishing: "Unfurnished",
        basePrice: "",
        allInclusivePrice: "",
        description: ""
    });

    const handleNext = () => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(s => s + 1);
        } else {
            // Save mock property
            const newProp = {
                name: `${formData.projectName} ${formData.tower}-${formData.unitNumber}`,
                address: formData.projectName,
                type: formData.category,
                price: `₹${formData.allInclusivePrice}`,
                description: formData.description,
                amenities: formData.amenities,
            };
            addProperty(newProp);
            router.push("/dashboard/inventory");
        }
    };

    const handleBack = () => {
        if (currentStep > 0) setCurrentStep(s => s - 1);
        else router.back();
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            {/* Header */}
            <div className="flex items-center gap-4 p-4 sm:px-8 py-6 bg-white border-b border-gray-100 shrink-0">
                <button onClick={handleBack} className="p-2 -ml-2 text-gray-400 hover:bg-gray-50 rounded-xl transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quick Add Unit</h1>
                    <p className="text-sm text-gray-500 mt-1">Add a new property or unit in 4 easy steps.</p>
                </div>
            </div>

            {/* Progress Stepper */}
            <div className="bg-white border-b border-gray-100 p-4 sm:px-8 shrink-0 flex items-center justify-between">
                <div className="max-w-3xl mx-auto w-full flex items-center justify-between relative">
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-100 z-0"></div>
                    {STEPS.map((step, index) => {
                        const isCompleted = currentStep > index;
                        const isActive = currentStep === index;
                        return (
                            <div key={step} className="relative z-10 flex flex-col items-center gap-2 bg-white px-2">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${isCompleted ? 'bg-green-500 text-white' :
                                        isActive ? 'bg-purple-600 text-white ring-4 ring-purple-50' :
                                            'bg-gray-100 text-gray-400'
                                    }`}>
                                    {isCompleted ? <Check size={16} /> : index + 1}
                                </div>
                                <span className={`text-xs font-bold uppercase tracking-wider hidden sm:block ${isActive ? 'text-purple-600' : isCompleted ? 'text-green-600' : 'text-gray-400'}`}>
                                    {step}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Form Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
                <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-6 sm:p-8">
                        {currentStep === 0 && <Step1Basic formData={formData} setFormData={setFormData} />}
                        {currentStep === 1 && <Step2Amenities formData={formData} setFormData={setFormData} />}
                        {currentStep === 2 && <Step3Gallery formData={formData} setFormData={setFormData} />}
                        {currentStep === 3 && <Step4Other formData={formData} setFormData={setFormData} />}
                    </div>

                    {/* Footer Actions */}
                    <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                        <button onClick={handleBack} className="px-6 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                            {currentStep === 0 ? "Cancel" : "Previous"}
                        </button>
                        <button onClick={handleNext} className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200">
                            {currentStep === STEPS.length - 1 ? "Save Unit" : "Next Step"}
                            {currentStep < STEPS.length - 1 && <ChevronRight size={16} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Steps Components
function Step1Basic({ formData, setFormData }) {
    return (
        <div className="space-y-6 animate-in fade-in">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Basic Details</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Purpose</label>
                    <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        value={formData.purpose} onChange={e => setFormData({ ...formData, purpose: e.target.value })}>
                        <option>Sale</option><option>Resale</option><option>Rent</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Category</label>
                    <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                        <option>Residential</option><option>Commercial</option><option>Plot</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Type</label>
                    <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                        <option>Apartment</option><option>Villa</option><option>Penthouse</option>
                    </select>
                </div>
            </div>

            <hr className="border-gray-100" />

            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Project Selection</label>
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" placeholder="Search or add project name..."
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                            value={formData.projectName} onChange={e => setFormData({ ...formData, projectName: e.target.value })}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Tower</label>
                        <input type="text" placeholder="e.g. Tower A"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                            value={formData.tower} onChange={e => setFormData({ ...formData, tower: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Floor</label>
                        <input type="text" placeholder="e.g. 12"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                            value={formData.floor} onChange={e => setFormData({ ...formData, floor: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Unit</label>
                        <input type="text" placeholder="e.g. 1204"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                            value={formData.unitNumber} onChange={e => setFormData({ ...formData, unitNumber: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Config</label>
                        <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                            value={formData.configuration} onChange={e => setFormData({ ...formData, configuration: e.target.value })}>
                            <option>1 BHK</option><option>2 BHK</option><option>3 BHK</option><option>4 BHK</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Step2Amenities({ formData, setFormData }) {
    const options = ["24/7 Security", "Power Backup", "Gym", "Swimming Pool", "Clubhouse", "Park", "Visitor Parking", "Lift"];

    const toggle = (opt) => {
        const arr = [...formData.amenities];
        if (arr.includes(opt)) arr.splice(arr.indexOf(opt), 1);
        else arr.push(opt);
        setFormData({ ...formData, amenities: arr });
    };

    return (
        <div className="space-y-6 animate-in fade-in">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Select Amenities</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {options.map(opt => {
                    const selected = formData.amenities.includes(opt);
                    return (
                        <button key={opt} onClick={() => toggle(opt)}
                            className={`p-4 rounded-xl border text-left transition-all ${selected ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm' : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                }`}>
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-sm">{opt}</span>
                                {selected && <Check size={16} className="text-purple-600" />}
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    );
}

function Step3Gallery() {
    return (
        <div className="space-y-6 animate-in fade-in">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Property Gallery</h2>
            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-4">
                    <UploadCloud size={32} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">Click to upload images</h3>
                <p className="text-sm text-gray-500">SVG, PNG, JPG or GIF (max. 5MB)</p>
            </div>
        </div>
    );
}

function Step4Other({ formData, setFormData }) {
    return (
        <div className="space-y-6 animate-in fade-in">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Other Details & Pricing</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Carpet Area (sq.ft)</label>
                    <input type="number"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        value={formData.areaCarpet} onChange={e => setFormData({ ...formData, areaCarpet: e.target.value })} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Furnishing</label>
                    <select className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                        value={formData.furnishing} onChange={e => setFormData({ ...formData, furnishing: e.target.value })}>
                        <option>Unfurnished</option><option>Semi-Furnished</option><option>Furnished</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Base Price</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</span>
                        <input type="text"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                            value={formData.basePrice} onChange={e => setFormData({ ...formData, basePrice: e.target.value })} />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">All-Inclusive Price</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</span>
                        <input type="text"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                            value={formData.allInclusivePrice} onChange={e => setFormData({ ...formData, allInclusivePrice: e.target.value })} />
                    </div>
                </div>
                <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Description / Internal Notes</label>
                    <textarea rows="4"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none"
                        value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                </div>
            </div>
        </div>
    );
}
