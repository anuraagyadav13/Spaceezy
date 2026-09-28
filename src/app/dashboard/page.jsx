"use client";
import { useAuth } from "../../features/auth/hooks/useAuth";

export default function DashboardOverview() {
    const { user } = useAuth();
    
    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name}</h1>
            <p className="text-gray-500 mt-2">You are logged in as {user?.role?.replace("_", " ")}.</p>
            
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-700">Quick Actions</h3>
                    <p className="text-sm text-gray-500 mt-2">Use the sidebar to navigate to your assigned modules based on your permissions.</p>
                </div>
            </div>
        </div>
    );
}
