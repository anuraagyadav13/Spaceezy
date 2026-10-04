"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";
import PipelineLeadCard from "./PipelineLeadCard";
import { formatCompactCurrency } from "../helpers";

function ColumnSkeleton() {
    return (
        <div className="flex flex-col gap-2.5" aria-hidden="true">
            {[0, 1, 2].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-200 p-3 animate-pulse">
                    <div className="h-3.5 bg-gray-200 rounded w-2/3" />
                    <div className="h-3 bg-gray-100 rounded w-1/2 mt-2.5" />
                    <div className="h-3 bg-gray-100 rounded w-1/3 mt-2.5" />
                    <div className="flex justify-between mt-3 pt-2 border-t border-gray-100">
                        <div className="h-3 bg-gray-100 rounded w-16" />
                        <div className="h-3 bg-gray-100 rounded w-10" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function PipelineColumn({
    column,
    isLoading,
    canDrag,
    pendingLeadId,
    draggedLeadId,
    actions,
    onAction,
    onCardDragStart,
    onCardDragEnd,
    onDropLead
}) {
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDragOver = (event) => {
        if (!canDrag) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsDragOver(true);
    };

    const handleDragLeave = (event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setIsDragOver(false);
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setIsDragOver(false);
        if (!canDrag) return;
        onDropLead(column.stage);
    };

    return (
        <section
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col w-[285px] shrink-0 bg-gray-100/70 rounded-3xl border transition-colors ${
                isDragOver ? "border-purple-400 bg-purple-50/70 ring-2 ring-purple-300" : "border-gray-200"
            }`}
            aria-label={`${column.label} stage, ${column.count} leads`}
        >
            <header className="flex items-center justify-between px-4 pt-4 pb-3">
                <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-xs font-black text-gray-700 uppercase tracking-wider truncate">{column.label}</h3>
                    <span className="text-[11px] font-black text-gray-500 bg-white border border-gray-200 rounded-full px-2 py-0.5 tabular-nums">
                        {column.count}
                    </span>
                </div>
                <span className="text-[11px] font-bold text-gray-500 whitespace-nowrap">{formatCompactCurrency(column.value)}</span>
            </header>

            <div className="flex-1 px-3 pb-2 flex flex-col gap-2.5 min-h-[140px]">
                {isLoading ? (
                    <ColumnSkeleton />
                ) : column.leads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-gray-400 py-8 px-2 text-center">
                        <Inbox size={22} className="mb-1.5 opacity-60" />
                        <p className="text-xs font-semibold">No leads in this stage</p>
                        {isDragOver && <p className="text-[11px] text-purple-500 mt-1 font-bold">Drop to move here</p>}
                    </div>
                ) : (
                    column.leads.map((lead) => (
                        <PipelineLeadCard
                            key={lead.id}
                            lead={lead}
                            draggable={canDrag}
                            isDragging={draggedLeadId === lead.id}
                            isPending={pendingLeadId === lead.id}
                            actions={actions}
                            onAction={onAction}
                            onDragStart={(event) => onCardDragStart(event, lead, column.stage)}
                            onDragEnd={onCardDragEnd}
                        />
                    ))
                )}
            </div>

            {column.count > column.leads.length && (
                <Link
                    href={`/dashboard/leads?stage=${encodeURIComponent(column.stage)}&stageLabel=${encodeURIComponent(column.label)}`}
                    className="flex items-center justify-center gap-1 px-4 py-3 text-[11px] font-black text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-b-3xl transition-colors border-t border-gray-200"
                >
                    View All ({column.count}) <ChevronRight size={13} />
                </Link>
            )}
        </section>
    );
}
