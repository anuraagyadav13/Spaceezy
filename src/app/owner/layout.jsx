// src/app/owner/layout.jsx
import OwnerSidebar from "../../components/owner/OwnerSidebar";
import ToastContainer from "../../components/shared/ToastContainer";

export default function OwnerLayout({ children }) {
    return (
        <>
            <div className="flex h-screen bg-[#E5E7EB] p-2 sm:p-4 md:p-6 font-sans">
                <div className="flex w-full h-full bg-[#F3F5F9] rounded-[32px] sm:rounded-[40px] shadow-2xl overflow-hidden border-4 border-white/50 relative">
                    <OwnerSidebar />
                    <main className="flex-1 overflow-y-auto flex flex-col pb-8">
                        {children}
                    </main>
                </div>
            </div>
            <ToastContainer />
        </>
    );
}