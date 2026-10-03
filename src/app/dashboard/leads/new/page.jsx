"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, User, Phone, Mail, Building2 } from "lucide-react";
import { createLead } from "../../../../lib/api/leads";
import { fetchUsers } from "../../../../lib/api/users";
import { showToast } from "../../../../lib/toast";

export default function NewLeadPage() {
    const router = useRouter();
    const [employees, setEmployees] = useState([]);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [project, setProject] = useState("");
    const [budget, setBudget] = useState("");
    const [source, setSource] = useState("Website");
    const [assignedTo, setAssignedTo] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await fetchUsers({ limit: 50 });
                const emps = data.users || data || [];
                setEmployees(emps);
                if (emps.length > 0 && !assignedTo) {
                    setAssignedTo(emps[0].id);
                }
            } catch (err) {
                showToast(`Failed to load users: ${err.message}`, "error");
            }
        };
        loadData();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim() || !phone.trim()) {
            showToast("Lead name and phone are required", "error");
            return;
        }

        if (!assignedTo) {
            showToast("Please assign the lead to a valid sales executive", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            await createLead({
                name: name.trim(),
                phone: phone.trim(),
                email: email?.trim() || "",
                project,
                budget,
                source,
                assignedToId: assignedTo,
                status: "NEW"
            });
            showToast("Lead added successfully", "success");
            router.push("/dashboard/leads");
        } catch (err) {
            showToast(`Failed to add lead: ${err.message}`, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex items-center gap-3">
                <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-400 hover:bg-gray-100 rounded-xl">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Add New Lead</h1>
                    <p className="text-sm text-gray-500">Capture a new lead enquiry into the Spaceezy CRM pipeline.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="max-w-2xl bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Lead Name</label>
                    <input 
                        type="text" required
                        value={name} onChange={e => setName(e.target.value)}
                        placeholder="e.g. Sapphire Holloway"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:border-purple-500"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Phone Number</label>
                        <input 
                            type="text" required
                            value={phone} onChange={e => setPhone(e.target.value)}
                            placeholder="+91 98765 00000"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email Address</label>
                        <input 
                            type="email"
                            value={email} onChange={e => setEmail(e.target.value)}
                            placeholder="lead@example.com"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Interested Project</label>
                        <input 
                            type="text"
                            value={project} onChange={e => setProject(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Budget</label>
                        <input 
                            type="text"
                            value={budget} onChange={e => setBudget(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Lead Source</label>
                        <select 
                            value={source} onChange={e => setSource(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                        >
                            <option>Website</option><option>Google Ads</option><option>Meta / Instagram</option><option>Referral</option><option>Walk-in</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Assigned Sales Executive</label>
                        <select 
                            value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold"
                        >
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                    <button type="button" onClick={() => router.back()} className="px-5 py-2.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl">
                        Cancel
                    </button>
                    <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold rounded-xl shadow-sm hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed">
                        {isSubmitting ? "Saving..." : "Save Lead Record"}
                    </button>
                </div>
            </form>
        </div>
    );
}
