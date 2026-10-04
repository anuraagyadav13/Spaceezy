"use client";
import PipelineColumn from "./PipelineColumn";

export default function PipelineBoard({ columns, isLoading, canDrag, pendingLeadId, draggedLeadId, actions, onAction, onCardDragStart, onCardDragEnd, onDropLead }) {
    return (
        <div className="overflow-x-auto pb-2 custom-scrollbar">
            <div className="flex gap-4 min-w-max">
                {columns.map((column) => (
                    <PipelineColumn
                        key={column.stage}
                        column={column}
                        isLoading={isLoading}
                        canDrag={canDrag}
                        pendingLeadId={pendingLeadId}
                        draggedLeadId={draggedLeadId}
                        actions={actions}
                        onAction={onAction}
                        onCardDragStart={onCardDragStart}
                        onCardDragEnd={onCardDragEnd}
                        onDropLead={onDropLead}
                    />
                ))}
            </div>
        </div>
    );
}
