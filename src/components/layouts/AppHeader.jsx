"use client";
import { Menu, Search, Bell } from "lucide-react";
import { useAuth } from "../../features/auth/hooks/useAuth";
import Image from "next/image";

export default function AppHeader({ toggleSidebar }) {
    const { user } = useAuth();
    
    return (
        <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-4 sm:px-8 shrink-0 sticky top-0 z-30">
            <div className="flex items-center gap-4">
                <button 
                    onClick={toggleSidebar}
                    className="lg:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-xl"
                >
                    <Menu size={20} />
                </button>
                <div className="hidden sm:flex items-center bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 w-64">
                    <Search size={16} className="text-gray-400 mr-2" />
                    <input 
                        type="text" 
                        placeholder="Search anything..." 
                        className="bg-transparent border-none text-sm focus:outline-none w-full text-gray-700"
                    />
                </div>
            </div>

            <div className="flex items-center gap-4 sm:gap-6">
                <button className="relative p-2 text-gray-400 hover:bg-gray-50 rounded-xl transition-colors">
                    <Bell size={20} />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                </button>
                <div className="flex items-center gap-3">
                    <div className="hidden sm:block text-right">
                        <p className="text-sm font-bold text-gray-900">{user?.name || "User"}</p>
                        <div className="flex items-center justify-end gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]"></span>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{user?.role?.replace("_", " ") || "ROLE"}</p>
                        </div>
                    </div>
                    <div className="relative w-9 h-9 rounded-full bg-gradient-to-tr from-purple-600 to-blue-600 p-[2px] shadow-sm">
                        <div className="w-full h-full rounded-full border-2 border-white overflow-hidden bg-white">
                            <Image src={user?.avatar || "https://i.pravatar.cc/150?img=33"} alt="Profile" className="w-full h-full object-cover" width={36} height={36} />
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
