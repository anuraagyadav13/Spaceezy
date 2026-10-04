"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Plus, RefreshCw, Upload } from "lucide-react";
import { usePermissions } from "../../auth/hooks/usePermissions";
import { usePipelineDashboard } from "../hooks/usePipelineDashboard";
import { useTransitionLeadStage, toErrorMessage } from "../hooks/useLeadMutations";
import { showToast } from "../../../lib/toast";
import {
    buildPipelineQueryParams,
    filtersFromSearchParams,
    pipelineUrlParams
} from "../helpers";
import PipelineFilters from "./PipelineFilters";
import PipelineSummaryCards from "./PipelineSummaryCards";
import PipelineBoard from "./PipelineBoard";
import LeadTrendChart from "./LeadTrendChart";
import LeadSourceChart from "./LeadSourceChart";
import RecentActivities from "./RecentActivities";
import RecentLeadsTable from "./RecentLeadsTable";
import { CARD_ACTIONS } from "./PipelineLeadCard";
import ContactLeadModal from "./modals/ContactLeadModal";
import AssignLeadModal from "./modals/AssignLeadModal";
import ImportLeadsModal from "./modals/ImportLeadsModal";
import ScheduleFollowUpModal from "./modals/ScheduleFollowUpModal";
import ScheduleSiteVisitModal from "./modals/ScheduleSiteVisitModal";
import CreateQuotationModal from "./modals/CreateQuotationModal";
import ConvertLeadToBookingModal from "./modals/ConvertLeadToBookingModal";

const STAGE_DROP_PERMISSION = {
    NEW: "lead:update",
    CONTACTED: "lead:update",
    FOLLOW_UP: "task:create",
    SITE_VISIT: "lead:update",
    QUOTATION: "quotation:create",
    BOOKING: "booking:create"
};

const STAGE_MODAL = {
    CONTACTED: "contact",
    FOLLOW_UP: "followUp",
    SITE_VISIT: "siteVisit",
    QUOTATION: "quotation",
    BOOKING: "booking"
};

const ACTION_PERMISSION = {
    contact: "lead:update",
    assign: "lead:update",
    followUp: "task:create",
    siteVisit: "lead:update",
    quotation: "quotation:create",
    booking: "booking:create"
};

const SKELETON_COLUMNS = ["New Lead", "Contacted", "Follow-up", "Site Visit", "Quotation", "Booking"];

function BoardSkeleton() {
    return (
        <div className="overflow-x-auto pb-2 custom-scrollbar">
            <div className="flex gap-4 min-w-max" aria-hidden="true">
                {SKELETON_COLUMNS.map((label) => (
                    <div key={label} className="w-[285px] shrink-0 bg-gray-100/70 rounded-3xl border border-gray-200 p-4">
                        <div className="h-3.5 bg-gray-200 rounded w-24 mb-4" />
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-3 mb-2.5 animate-pulse">
                                <div className="h-3.5 bg-gray-200 rounded w-2/3" />
                                <div className="h-3 bg-gray-100 rounded w-1/2 mt-2.5" />
                                <div className="h-3 bg-gray-100 rounded w-1/3 mt-2.5" />
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function LeadPipelineDashboard() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { hasPermission } = usePermissions();

    const filters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams]);
    const queryParams = useMemo(() => buildPipelineQueryParams(filters), [filters]);

    const { data, isPending, isFetching, isError, error, refetch } = usePipelineDashboard(queryParams);

    const [draggedLeadId, setDraggedLeadId] = useState(null);
    const [pendingLeadId, setPendingLeadId] = useState(null);
    const [modal, setModal] = useState(null);
    const dragRef = useRef(null);

    const canDrag = hasPermission("lead:update");
    const transitionStage = useTransitionLeadStage();

    const columns = useMemo(() => data?.pipeline || [], [data]);

    const cardActions = useMemo(
        () =>
            CARD_ACTIONS.filter((action) => hasPermission(action.permission)).map(({ key, label, icon }) => ({
                key,
                label,
                icon
            })),
        [hasPermission]
    );

    const handleFilterChange = useCallback(
        (patch) => {
            const merged = { ...filters, ...patch };
            const query = pipelineUrlParams(merged).toString();
            if (pathname === "/dashboard/leads") {
                const params = new URLSearchParams(query);
                params.set("view", "pipeline");
                const prevStage = searchParams.get("stage");
                const prevStageLabel = searchParams.get("stageLabel");
                if (prevStageLabel && prevStage && params.get("stage") === prevStage) {
                    params.set("stageLabel", prevStageLabel);
                }
                router.replace(`/dashboard/leads?${params.toString()}`, { scroll: false });
                return;
            }
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        },
        [filters, pathname, router, searchParams]
    );

    const closeModal = useCallback(() => setModal(null), []);

    const handleCardDragStart = useCallback(
        (event, lead, fromStage) => {
            if (!canDrag) {
                event.preventDefault();
                return;
            }
            dragRef.current = { lead, fromStage };
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", lead.id);
            setDraggedLeadId(lead.id);
        },
        [canDrag]
    );

    const handleCardDragEnd = useCallback(() => {
        dragRef.current = null;
        setDraggedLeadId(null);
    }, []);

    const openModalForStage = useCallback(
        (toStage, lead, fromDrag) => {
            const modalType = STAGE_MODAL[toStage];
            if (!modalType) return false;
            const needed = STAGE_DROP_PERMISSION[toStage];
            if (needed && !hasPermission(needed)) {
                showToast("You do not have permission for this action", "error");
                return true;
            }
            setModal({ type: modalType, lead, advanceToContacted: fromDrag });
            return true;
        },
        [hasPermission]
    );

    const handleDropLead = useCallback(
        (toStage) => {
            const drag = dragRef.current;
            dragRef.current = null;
            setDraggedLeadId(null);
            if (!drag) return;

            const { lead, fromStage } = drag;
            if (fromStage === toStage) return;

            if (!canDrag) {
                showToast("You do not have permission to move leads", "error");
                return;
            }
            if (lead.status === "BOOKED" && toStage !== "BOOKING") {
                showToast("A booked lead can only leave the Booking stage via booking cancellation", "error");
                return;
            }

            if (openModalForStage(toStage, lead, true)) return;

            const label = columns.find((column) => column.stage === toStage)?.label || toStage;
            setPendingLeadId(lead.id);
            transitionStage.mutate(
                { id: lead.id, target: toStage, reason: "moved in pipeline", successMessage: `Lead moved to ${label}` },
                { onSettled: () => setPendingLeadId(null) }
            );
        },
        [canDrag, columns, openModalForStage, transitionStage]
    );

    const handleCardAction = useCallback(
        (type, lead) => {
            const needed = ACTION_PERMISSION[type];
            if (needed && !hasPermission(needed)) {
                showToast("You do not have permission for this action", "error");
                return;
            }
            if (lead.status === "BOOKED" && type !== "contact" && type !== "assign") {
                showToast("A booked lead can only leave the Booking stage via booking cancellation", "error");
                return;
            }
            setModal({ type, lead, advanceToContacted: false });
        },
        [hasPermission]
    );

    const stageOptions = columns.map(({ stage, label }) => ({ stage, label }));

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 custom-scrollbar">
            <div className="p-4 sm:px-8 sm:py-6 bg-white border-b border-gray-100 shrink-0">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Lead Pipeline</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Drag leads between stages, or use the card menu for guided actions.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => refetch()}
                            disabled={isFetching}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-60"
                        >
                            <RefreshCw size={16} className={isFetching ? "animate-spin" : ""} /> Refresh
                        </button>
                        {hasPermission("lead:create") && (
                            <button
                                type="button"
                                onClick={() => setModal({ type: "import" })}
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                            >
                                <Upload size={16} /> Import Leads
                            </button>
                        )}
                        {hasPermission("lead:create") && (
                            <Link
                                href="/dashboard/leads/new"
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200"
                            >
                                <Plus size={16} /> Add Lead
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-4 sm:p-8 space-y-5">
                <PipelineFilters
                    filters={filters}
                    onChange={handleFilterChange}
                    stageOptions={stageOptions}
                    dataSources={data?.sources}
                />

                {isPending && !data ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4 animate-pulse">
                                <div className="h-8 w-8 rounded-xl bg-gray-200" />
                                <div className="h-6 bg-gray-200 rounded w-12 mt-3" />
                                <div className="h-3 bg-gray-100 rounded w-16 mt-2" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <PipelineSummaryCards summary={data?.summary} />
                )}

                {isError && !data && (
                    <div className="bg-white rounded-3xl border border-red-200 shadow-sm p-10 flex flex-col items-center text-center">
                        <AlertCircle size={28} className="text-red-500 mb-3" />
                        <p className="text-sm font-bold text-red-600">Failed to load the pipeline</p>
                        <p className="text-xs text-gray-500 mt-1">{toErrorMessage(error)}</p>
                        <button
                            onClick={() => refetch()}
                            className="mt-4 px-5 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 transition-opacity"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {isPending && !data && <BoardSkeleton />}

                {data && columns.length > 0 && (
                    <PipelineBoard
                        columns={columns}
                        isLoading={false}
                        canDrag={canDrag}
                        pendingLeadId={pendingLeadId}
                        draggedLeadId={draggedLeadId}
                        actions={cardActions}
                        onAction={handleCardAction}
                        onCardDragStart={handleCardDragStart}
                        onCardDragEnd={handleCardDragEnd}
                        onDropLead={handleDropLead}
                    />
                )}

                {data && data.summary?.total?.count === 0 && (
                    <div className="bg-white rounded-3xl border border-dashed border-gray-300 shadow-sm p-10 text-center">
                        <p className="text-sm font-bold text-gray-700">No leads match the current view</p>
                        <p className="text-xs text-gray-500 mt-1">
                            Adjust the filters, or add your first lead to start building the pipeline.
                        </p>
                        {hasPermission("lead:create") && (
                            <Link
                                href="/dashboard/leads/new"
                                className="inline-flex items-center gap-2 mt-4 px-5 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 transition-opacity"
                            >
                                <Plus size={15} /> Add Lead
                            </Link>
                        )}
                    </div>
                )}

                {data && (
                    <>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            <LeadTrendChart trends={data.trends} />
                            <LeadSourceChart sources={data.sources} />
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pb-2">
                            <RecentActivities activities={data.recentActivities} />
                            <RecentLeadsTable leads={data.recentLeads} />
                        </div>
                    </>
                )}
            </div>

            {modal?.type === "contact" && (
                <ContactLeadModal
                    lead={modal.lead}
                    advanceToContacted={modal.advanceToContacted}
                    isOpen
                    onClose={closeModal}
                />
            )}
            {modal?.type === "assign" && <AssignLeadModal lead={modal.lead} isOpen onClose={closeModal} />}
            {modal?.type === "import" && <ImportLeadsModal isOpen onClose={closeModal} />}
            {modal?.type === "followUp" && (
                <ScheduleFollowUpModal lead={modal.lead} isOpen onClose={closeModal} />
            )}
            {modal?.type === "siteVisit" && (
                <ScheduleSiteVisitModal lead={modal.lead} isOpen onClose={closeModal} />
            )}
            {modal?.type === "quotation" && (
                <CreateQuotationModal lead={modal.lead} isOpen onClose={closeModal} />
            )}
            {modal?.type === "booking" && (
                <ConvertLeadToBookingModal lead={modal.lead} isOpen onClose={closeModal} />
            )}
        </div>
    );
}
