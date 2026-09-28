"use client";
import { useEffect, useState } from "react";
import { getEmployees } from "../../../lib/store";
import Modal from "../../../components/shared/Modal";
import { TeamTable } from "../../../features/team/components/TeamTable";
import { TeamMemberForm } from "../../../features/team/components/TeamMemberForm";
import { PermissionGate } from "../../../features/auth/components/PermissionGate";

export default function DashboardTeamPage() {
    const [employees, setEmployees] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const refreshEmployees = () => {
        setEmployees(getEmployees());
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            refreshEmployees();
        }, 0);
        return () => clearTimeout(timer);
    }, []);

    const handleSaved = () => {
        setIsModalOpen(false);
        refreshEmployees();
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-8 py-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Team & Employees</h1>
                    <p className="text-sm text-gray-500 mt-1">See what each team member is working on, in one glance.</p>
                </div>
                <PermissionGate permission="employee:create">
                    <button onClick={() => setIsModalOpen(true)} className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-md shadow-purple-200">
                        + Add Employee
                    </button>
                </PermissionGate>
            </div>

            <div className="px-4 sm:px-8 pb-8">
                <TeamTable employees={employees} />
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Employee">
                <TeamMemberForm onSaved={handleSaved} />
            </Modal>
        </div>
    );
}
