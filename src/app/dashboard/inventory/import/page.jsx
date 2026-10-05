"use client";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
    UploadCloud, FileText, Loader2, AlertCircle, CheckCircle2,
    XCircle, ArrowLeft, PlayCircle, Download
} from "lucide-react";
import { fetchProjects } from "../../../../lib/api/projects";
import { fetchConfigurations } from "../../../../lib/api/configurations";
import { bulkImportProperties } from "../../../../lib/api/properties";
import { PermissionGate } from "../../../../features/auth/components/PermissionGate";
import { showToast } from "../../../../lib/toast";

const CSV_HEADERS = [
    "unitNumber", "tower", "floor", "configuration", "bhk",
    "area", "areaCarpet", "areaSaleable", "facing", "price", "purpose"
];

const REQUIRED_HEADERS = ["unitNumber"];
const NUMERIC_HEADERS = new Set(["floor", "bhk", "area", "areaCarpet", "areaSaleable", "price"]);

const parseCsv = (text) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length < 2) throw new Error("CSV must contain a header row and at least one data row.");

    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    for (const required of REQUIRED_HEADERS) {
        if (!headers.includes(required)) {
            throw new Error(`Missing required column: "${required}". Expected headers: ${CSV_HEADERS.join(", ")}`);
        }
    }

    return lines.slice(1).map((line) => {
        const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const row = {};
        headers.forEach((header, i) => {
            if (!CSV_HEADERS.includes(header)) return;
            const raw = cells[i] ?? "";
            if (raw === "") return;
            if (NUMERIC_HEADERS.has(header)) {
                const num = Number(raw);
                row[header] = Number.isNaN(num) ? raw : num;
            } else {
                row[header] = raw;
            }
        });
        return row;
    });
};

const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all";
const labelClass = "block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1";

export default function BulkImportInventoryPage() {
    const queryClient = useQueryClient();
    const fileRef = useRef(null);
    const [projectId, setProjectId] = useState("");
    const [fileName, setFileName] = useState("");
    const [rows, setRows] = useState([]);
    const [parseError, setParseError] = useState("");
    const [result, setResult] = useState(null);

    const { data: projects, isPending: projectsLoading } = useQuery({
        queryKey: ["projects", "filter-options"],
        queryFn: () => fetchProjects({ limit: 200 }),
        staleTime: 5 * 60 * 1000,
        retry: 1
    });

    const { data: configurations } = useQuery({
        queryKey: ["configurations", projectId],
        queryFn: () => fetchConfigurations(projectId),
        enabled: !!projectId,
        retry: 1
    });

    const importMutation = useMutation({
        mutationFn: (payload) => bulkImportProperties(payload),
        onSuccess: (data) => {
            setResult(data);
            if (data.dryRun) {
                showToast(
                    data.failed.length === 0
                        ? `Dry run OK — ${data.total - data.failed.length} rows ready to import`
                        : `Dry run found ${data.failed.length} problem row(s)`,
                    data.failed.length === 0 ? "success" : "error"
                );
            } else {
                showToast(`Imported ${data.created} unit(s), ${data.failed.length} failed`, data.failed.length === 0 ? "success" : "error");
                if (data.created > 0) {
                    queryClient.invalidateQueries({ queryKey: ["projects"] });
                    queryClient.invalidateQueries({ queryKey: ["properties"] });
                    if (projectId) queryClient.invalidateQueries({ queryKey: ["project", projectId] });
                    setRows([]);
                    setFileName("");
                    if (fileRef.current) fileRef.current.value = "";
                }
            }
        },
        onError: (err) => showToast(err?.message || "Import failed", "error")
    });

    const projectList = Array.isArray(projects) ? projects : [];
    const configList = Array.isArray(configurations) ? configurations : [];
    const selectedProject = projectList.find((p) => p.id === projectId);

    const preview = useMemo(() => rows.slice(0, 50), [rows]);

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        setParseError("");
        setResult(null);
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = parseCsv(text);
            setRows(parsed);
            setFileName(file.name);
        } catch (err) {
            setRows([]);
            setFileName("");
            setParseError(err?.message || "Failed to parse CSV");
        }
    };

    const canRun = !!projectId && rows.length > 0 && !importMutation.isPending;

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-gray-50/50 p-4 sm:p-8 space-y-6 custom-scrollbar">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <Link href="/dashboard/inventory" className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 mb-2">
                        <ArrowLeft size={14} /> Inventory
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900">Bulk Import Inventory Units</h1>
                    <p className="text-sm text-gray-500">Upload a CSV of units: validate with a dry run, then import in one transaction.</p>
                </div>
                <button
                    onClick={() => {
                        const csv = `${CSV_HEADERS.join(",")}\nA-101,A,1,2 BHK,2,950,700,950,East,4500000,Sale\nA-102,A,1,2 BHK,2,950,700,950,West,4600000,Sale`;
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "inventory-template.csv";
                        a.click();
                        URL.revokeObjectURL(url);
                    }}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                >
                    <Download size={14} /> Template
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Setup */}
                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-5">
                    <div>
                        <label className={labelClass}>1. Target Project *</label>
                        <select
                            value={projectId}
                            onChange={(e) => {
                                setProjectId(e.target.value);
                                setResult(null);
                            }}
                            disabled={projectsLoading}
                            className={inputClass}
                        >
                            <option value="">{projectsLoading ? "Loading projects…" : "Select a project"}</option>
                            {projectList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {selectedProject && (
                            <p className="text-[11px] text-gray-400 mt-1.5">
                                Configurations in this project:{" "}
                                {configList.length ? configList.map((c) => c.name).join(", ") : "none yet (leave configuration column empty)"}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className={labelClass}>2. Choose CSV file</label>
                        <label className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:bg-gray-50 cursor-pointer block">
                            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
                            <UploadCloud size={36} className="mx-auto text-purple-600 mb-2" />
                            <p className="text-sm font-bold text-gray-900">{fileName || "Click to select a CSV file"}</p>
                            <p className="text-[11px] text-gray-500 mt-1">
                                Columns: <code className="bg-gray-100 px-1 rounded">{CSV_HEADERS.join(", ")}</code>
                            </p>
                        </label>
                        {parseError && (
                            <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-2 flex items-start gap-1.5">
                                <AlertCircle size={14} className="shrink-0 mt-0.5" /> {parseError}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                        <PermissionGate permission="inventory:create">
                            <button
                                onClick={() => importMutation.mutate({ projectId, rows, dryRun: true })}
                                disabled={!canRun}
                                className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-40"
                            >
                                <PlayCircle size={15} /> Dry Run (validate)
                            </button>
                            <button
                                onClick={() => {
                                    if (window.confirm(`Import ${rows.length} row(s) into "${selectedProject?.name}"?`)) {
                                        importMutation.mutate({ projectId, rows, dryRun: false });
                                    }
                                }}
                                disabled={!canRun}
                                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-40"
                            >
                                {importMutation.isPending && !result ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Import {rows.length} Row(s)
                            </button>
                        </PermissionGate>
                    </div>

                    {result && (
                        <div className={`rounded-2xl border p-4 ${result.failed.length === 0 ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"}`}>
                            <p className="text-sm font-black text-gray-900 flex items-center gap-1.5 mb-2">
                                {result.failed.length === 0 ? <CheckCircle2 size={16} className="text-emerald-600" /> : <XCircle size={16} className="text-amber-600" />}
                                {result.dryRun ? "Dry run" : "Import"}: {result.dryRun ? `${result.total - result.failed.length} valid` : `${result.created} created`} of {result.total} row(s)
                            </p>
                            {result.failed.length > 0 && (
                                <ul className="space-y-1 text-xs text-gray-700 max-h-48 overflow-y-auto">
                                    {result.failed.map((f) => (
                                        <li key={`${f.row}-${f.unitNumber}`}>
                                            <span className="font-black">Row {f.row}{f.unitNumber ? ` (${f.unitNumber})` : ""}:</span>{" "}
                                            {f.errors.join("; ")}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                {/* Preview */}
                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="font-bold text-gray-900 text-sm">3. Preview</h2>
                        <span className="text-xs font-bold text-gray-400">{rows.length} row(s){rows.length > 50 ? " · showing first 50" : ""}</span>
                    </div>
                    {rows.length === 0 ? (
                        <div className="py-16 text-center text-gray-400 text-sm">No rows loaded yet.</div>
                    ) : (
                        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                            <table className="w-full text-left text-[11px] border-collapse">
                                <thead className="sticky top-0 bg-gray-50">
                                    <tr className="border-b border-gray-200 font-black text-gray-500 uppercase">
                                        <th className="p-2">#</th>
                                        {CSV_HEADERS.map((h) => <th key={h} className="p-2">{h}</th>)}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {preview.map((row, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="p-2 font-bold text-gray-400">{i + 1}</td>
                                            {CSV_HEADERS.map((h) => (
                                                <td key={h} className="p-2 text-gray-700 whitespace-nowrap">{row[h] ?? ""}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
