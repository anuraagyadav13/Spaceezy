"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createProject } from "../../../../../lib/api/projects";
import { showToast } from "../../../../../lib/toast";
import { AmenitiesSelector } from "../../../../../components/AmenitiesSelector";

const STEPS = [
  "Basic Details",
  "Location",
  "Overview",
  "Pricing",
  "Amenities",
  "Gallery & Docs",
  "Sales & CRM"
];

export default function AddProjectPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    projectType: "Residential",
    type: "",
    developer: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    description: "",
    shortDescription: "",
    totalLandArea: "",
    landAreaUnit: "",
    totalTowers: "",
    totalFloors: "",
    totalUnits: "",
    availableUnits: "",
    launchDate: "",
    expectedCompletionDate: "",
    possessionDate: "",
    reraRegistered: false,
    reraNumber: "",
    reraAuthority: "",
    startingPrice: "",
    maximumPrice: "",
    pricePerSqFt: "",
    priceUnit: "",
    maintenanceCharges: "",
    plcCharges: "",
    parkingCharges: "",
    clubCharges: "",
    otherCharges: "",
    amenities: [],
    images: [],
    documents: [],
    connectivity: [],
    status: "UPCOMING"
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (e) => {
    const value = e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? e;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = async () => {
    if (currentStep < STEPS.length - 1) setCurrentStep((s) => s + 1);
    else await handleSubmit();
  };

  const handleSubmit = async () => {
    if (!form.name?.trim()) {
      showToast("Project name is required", "error");
      return;
    }
    try {
      setLoading(true);
      const payload = {
        ...form,
        totalLandArea: Number(form.totalLandArea) || undefined,
        totalTowers: Number(form.totalTowers) || undefined,
        totalFloors: Number(form.totalFloors) || undefined,
        totalUnits: Number(form.totalUnits) || undefined,
        availableUnits: Number(form.availableUnits) || undefined,
        startingPrice: Number(form.startingPrice) || undefined,
        maximumPrice: Number(form.maximumPrice) || undefined,
        pricePerSqFt: Number(form.pricePerSqFt) || undefined,
        maintenanceCharges: Number(form.maintenanceCharges) || undefined,
        plcCharges: Number(form.plcCharges) || undefined,
        parkingCharges: Number(form.parkingCharges) || undefined,
        clubCharges: Number(form.clubCharges) || undefined,
        otherCharges: Number(form.otherCharges) || undefined
      };
      await createProject(payload);
      showToast("Project created successfully", "success");
      router.push("/dashboard/inventory");
    } catch (err) {
      showToast(`Failed to create project: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Project Name</label>
              <input type="text" value={form.name} onChange={handleChange("name")} className="w-full rounded-xl border bg-gray-50 p-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Project Type</label>
              <select value={form.projectType} onChange={handleChange("projectType")} className="w-full rounded-xl border bg-gray-50 p-3 text-sm">
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
                <option value="Mixed_Use">Mixed Use</option>
              </select>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Address</label>
              <input type="text" value={form.address} onChange={handleChange("address")} className="w-full rounded-xl border bg-gray-50 p-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1">City</label>
              <input type="text" value={form.city} onChange={handleChange("city")} className="w-full rounded-xl border bg-gray-50 p-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1">State</label>
              <input type="text" value={form.state} onChange={handleChange("state")} className="w-full rounded-xl border bg-gray-50 p-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Pincode</label>
              <input type="text" value={form.pincode} onChange={handleChange("pincode")} className="w-full rounded-xl border bg-gray-50 p-3 text-sm" />
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Short Description</label>
              <textarea value={form.shortDescription} onChange={handleChange("shortDescription")} rows={2} className="w-full rounded-xl border bg-gray-50 p-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Full Description</label>
              <textarea value={form.description} onChange={handleChange("description")} rows={4} className="w-full rounded-xl border bg-gray-50 p-3 text-sm" />
            </div>
          </div>
        );
      case 3:
        return (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Starting Price</label>
              <input type="number" value={form.startingPrice} onChange={handleChange("startingPrice")} className="w-full rounded-xl border bg-gray-50 p-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Maximum Price</label>
              <input type="number" value={form.maximumPrice} onChange={handleChange("maximumPrice")} className="w-full rounded-xl border bg-gray-50 p-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Price per Sq Ft</label>
              <input type="number" value={form.pricePerSqFt} onChange={handleChange("pricePerSqFt")} className="w-full rounded-xl border bg-gray-50 p-3 text-sm" />
            </div>
          </div>
        );
      case 4:
        return (
          <AmenitiesSelector
            selectedAmenities={form.amenities}
            onChange={handleChange("amenities")}
            propertyType={form.projectType}
          />
        );
      default:
        return <div className="text-gray-500">Additional sections (Gallery, Docs, CRM) can be built later.</div>;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Add New Project</h1>
      </div>
      <div className="max-w-2xl mx-auto bg-white rounded-3xl p-8 shadow-sm space-y-6">
        <div className="text-sm text-gray-600">Step {currentStep + 1} of {STEPS.length}: {STEPS[currentStep]}</div>
        {renderStepContent()}
        <div className="flex justify-end space-x-3 pt-4">
          {currentStep > 0 && (
            <button type="button" onClick={() => setCurrentStep((s) => s - 1)} className="px-4 py-2 text-sm bg-gray-200 rounded-xl">Back</button>
          )}
          <button type="button" onClick={handleNext} disabled={loading} className="px-6 py-2 bg-purple-600 text-white text-sm rounded-xl hover:bg-purple-700 disabled:opacity-70">
            {loading ? "Saving..." : currentStep === STEPS.length - 1 ? "Create Project" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
