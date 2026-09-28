// src/components/owner/RightPanel.js
export default function RightPanel() {
    return (
        <div className="w-full xl:w-[340px] flex flex-col gap-6">

            <div className="bg-white rounded-[24px] p-4 shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
                <div className="relative h-48 rounded-[20px] overflow-hidden mb-5">
                    <img src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?q=80&w=400&auto=format&fit=crop" className="w-full h-full object-cover" />
                </div>

                <div className="flex justify-between items-center px-2 mb-6">
                    <h3 className="font-medium text-[15px] text-gray-900">Alpha Residency</h3>
                    <button className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100">↗</button>
                </div>

                <div className="flex justify-between text-left px-2 mb-6">
                    <div><h4 className="text-[20px] font-normal text-gray-900">120</h4><p className="text-[11px] text-gray-500">Total Units</p></div>
                    <div><h4 className="text-[20px] font-normal text-gray-900">85</h4><p className="text-[11px] text-gray-500">Sold</p></div>
                    <div><h4 className="text-[20px] font-normal text-gray-900">12</h4><p className="text-[11px] text-gray-500">Booked</p></div>
                    <div><h4 className="text-[20px] font-normal text-gray-900">23</h4><p className="text-[11px] text-gray-500">Available</p></div>
                </div>

                <div className="px-2">
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex mb-2">
                        <div className="bg-purple-500 w-[70%] h-full"></div>
                        <div className="bg-gray-900 w-[10%] h-full"></div>
                    </div>
                    <p className="text-[11px] text-gray-500">Sold & Booked by 80%</p>
                </div>
            </div>

            <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-medium text-[15px] text-gray-900">Lead Pipeline</h3>
                    <button className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100">↗</button>
                </div>
                <div className="flex items-center gap-8">
                    <div className="relative w-24 h-24 rounded-full border-4 border-purple-500 border-l-gray-900 border-b-gray-100 border-r-orange-400 flex items-center justify-center">
                        <div className="text-center">
                            <span className="block text-[22px] font-normal text-gray-900">850</span>
                            <span className="text-[10px] text-gray-500">total</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                        <div><h4 className="text-[16px] font-medium text-gray-900">230</h4><p className="text-[11px] text-gray-500">Qualified</p></div>
                        <div><h4 className="text-[16px] font-medium text-gray-900">75</h4><p className="text-[11px] text-gray-500">Site Visits</p></div>
                        <div><h4 className="text-[16px] font-medium text-gray-900">45</h4><p className="text-[11px] text-gray-500">Negotiation</p></div>
                        <div><h4 className="text-[16px] font-medium text-gray-900">12</h4><p className="text-[11px] text-gray-500">Bookings</p></div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-medium text-[15px] text-gray-900">Top Sales Team</h3>
                    <button className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100">↗</button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-[11px] text-gray-400 mb-1">Sales Exec</p>
                        <p className="text-[13px] font-medium text-gray-900">Rahul Sharma</p>
                        <p className="text-[12px] text-gray-500 flex items-center gap-1 mt-1"><span>8</span> Bookings</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-gray-400 mb-1">Sales Exec</p>
                        <p className="text-[13px] font-medium text-gray-900">Priya Singh</p>
                        <p className="text-[12px] text-gray-500 flex items-center gap-1 mt-1"><span>7</span> Bookings</p>
                    </div>
                </div>
            </div>

        </div>
    );
}