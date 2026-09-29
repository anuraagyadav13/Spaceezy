"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { leadSchema } from "../schemas/leadSchema";
import { useCreateLead } from "../hooks/useCreateLead";
import { showToast } from "../../../lib/toast";

export default function LeadForm({ employees, onSuccess, onCancel }) {
    const { mutate: createLead, isPending, error } = useCreateLead();

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(leadSchema),
        defaultValues: {
            name: "",
            phone: "",
            project: "",
            budget: "",
            source: "Website",
            assignedTo: employees[0]?.id || "",
        },
    });

    const onSubmit = (data) => {
        createLead(data, {
            onSuccess: () => {
                showToast(`${data.name} added to the pipeline`);
                onSuccess();
            },
            onError: () => {
                showToast("Failed to create lead", "error");
            }
        });
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium">
                    {error.message || "An unexpected error occurred."}
                </div>
            )}
            
            <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Full Name</label>
                <input 
                    {...register("name")} 
                    type="text" 
                    placeholder="e.g., John Doe" 
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all" 
                />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Phone Number</label>
                <input 
                    {...register("phone")} 
                    type="text" 
                    placeholder="+91 9876543210" 
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all" 
                />
                {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Project</label>
                    <input 
                        {...register("project")} 
                        type="text" 
                        placeholder="e.g., Sky City" 
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all" 
                    />
                    {errors.project && <p className="text-red-500 text-xs mt-1">{errors.project.message}</p>}
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Budget</label>
                    <input 
                        {...register("budget")} 
                        type="text" 
                        placeholder="e.g., ₹1.5 Cr" 
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all" 
                    />
                    {errors.budget && <p className="text-red-500 text-xs mt-1">{errors.budget.message}</p>}
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Lead Source</label>
                <select 
                    {...register("source")} 
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all cursor-pointer"
                >
                    <option value="Website">Website</option>
                    <option value="Referral">Referral</option>
                    <option value="Google Ads">Google Ads</option>
                    <option value="Facebook Ads">Facebook Ads</option>
                    <option value="Direct Call">Direct Call</option>
                </select>
                {errors.source && <p className="text-red-500 text-xs mt-1">{errors.source.message}</p>}
            </div>

            <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Assign To</label>
                <select 
                    {...register("assignedTo")} 
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all cursor-pointer"
                >
                    {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                </select>
                {errors.assignedTo && <p className="text-red-500 text-xs mt-1">{errors.assignedTo.message}</p>}
            </div>

            <div className="flex gap-3 mt-4">
                <button 
                    type="button" 
                    onClick={onCancel} 
                    disabled={isPending}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                    Cancel
                </button>
                <button 
                    type="submit" 
                    disabled={isPending}
                    className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200 disabled:opacity-50"
                >
                    {isPending ? "Saving..." : "Save Lead"}
                </button>
            </div>
        </form>
    );
}
