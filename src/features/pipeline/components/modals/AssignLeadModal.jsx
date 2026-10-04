"use client";
import { useEffect, useState } from "react";
import Modal from "../../../../components/shared/Modal";
import { fetchUsers } from "../../../../lib/api/users";
import { useAssignLead } from "../../hooks/useLeadMutations";

const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all";

export default function AssignLeadModal({ lead, isOpen, onClose }) {
    const [employees, setEmployees] = useState([]);
    const [selectedEmployee, setSelectedEmployee] = useState("");
    const assignLead = useAssignLead();

    useEffect(() => {
        if (!isOpen) return;
        fetchUsers()
            .then((data) => {
                const list = Array.isArray(data) ? data : data?.users || [];
                setEmployees(list);
                if (list.length > 0) setSelectedEmployee(list[0].id);
            })
            .catch(() => setEmployees([]));
    }, [isOpen]);

    if (!lead) return null;

    const handleSubmit = (event) => {
        event.preventDefault();
        if (!selectedEmployee) return;
        assignLead.mutate(
            { leadId: lead.id, assignedToId: selectedEmployee },
            {
                onSuccess: () => {
                    setSelectedEmployee("");
                    onClose();
                }
            }
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Assign Lead">
            <p className="text-sm text-gray-500 mb-5">
                Assign <span className="font-bold text-gray-900">{lead.name}</span> to a team member.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Assign to</label>
                    <select
                        value={selectedEmployee}
                        onChange={(e) => setSelectedEmployee(e.target.value)}
                        className={inputClass}
                    >
                        {employees.length === 0 && <option value="">No team members available</option>}
                        {employees.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                                {emp.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex gap-3 pt-1">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={assignLead.isPending || !selectedEmployee}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {assignLead.isPending ? "Assigning..." : "Assign"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
