// Phase 3+4 — shared Meta Ads UI safety components. The critical contract:
// ConfirmDialog with requireCheckbox keeps activation/permanent-deletion
// buttons LOCKED until the user actively acknowledges the warning, and
// DisconnectedCard renders the exact Phase 2.5A disconnected string with
// no campaign content.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog, DisconnectedCard, StatusBadge, EmptyState, ErrorBox, SyncResultPanel } from "./metaAdsUi";
import { META_DISCONNECTED_MESSAGE } from "../../../../../lib/metaAdsEnums";

describe("ConfirmDialog — confirmation gating", () => {
    const base = {
        open: true,
        title: "Activate this campaign?",
        body: "Campaign will start delivering.",
        warning: "Activation may start ad spend immediately.",
        confirmLabel: "Activate campaign",
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
    };

    it("renders nothing when closed", () => {
        render(<ConfirmDialog {...base} open={false} />);
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("keeps Confirm disabled until the acknowledgement checkbox is ticked", async () => {
        const user = userEvent.setup();
        render(<ConfirmDialog {...base} requireCheckbox checkboxLabel="I understand this may start ad spend." />);
        const confirm = screen.getByRole("button", { name: /activate campaign/i });
        expect(confirm).toBeDisabled();

        await user.click(screen.getByRole("button", { name: /^cancel$/i }));
        expect(base.onConfirm).not.toHaveBeenCalled();

        await user.click(screen.getByLabelText(/i understand this may start ad spend/i));
        expect(confirm).toBeEnabled();

        await user.click(confirm);
        expect(base.onConfirm).toHaveBeenCalledTimes(1);
        // Stays acknowledged while the dialog remains open; the state resets
        // on the next open (handled by the open-dep effect).
        expect(screen.getByRole("button", { name: /activate campaign/i })).toBeEnabled();
    });

    it("does not require a checkbox for non-critical confirmations", async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();
        render(<ConfirmDialog {...base} onConfirm={onConfirm} requireCheckbox={false} />);
        const confirm = screen.getByRole("button", { name: /activate campaign/i });
        expect(confirm).toBeEnabled();
        await user.click(confirm);
        expect(onConfirm).toHaveBeenCalled();
    });

    it("stays locked while busy and surfaces the warning text", () => {
        render(<ConfirmDialog {...base} requireCheckbox busy />);
        expect(screen.getByRole("button", { name: /activate campaign/i })).toBeDisabled();
        expect(screen.getByText(/may start ad spend immediately/i)).toBeInTheDocument();
    });

    it("cancel closes without confirming", async () => {
        const user = userEvent.setup();
        const onCancel = vi.fn();
        const onConfirm = vi.fn();
        render(<ConfirmDialog {...base} onConfirm={onConfirm} requireCheckbox onCancel={onCancel} />);
        await user.click(screen.getByRole("button", { name: /^cancel$/i }));
        expect(onCancel).toHaveBeenCalled();
        expect(onConfirm).not.toHaveBeenCalled();
    });
});

describe("DisconnectedCard — disconnected ≠ demo data", () => {
    it("renders the exact contract message and no campaign content", () => {
        render(<DisconnectedCard />);
        expect(screen.getByText(META_DISCONNECTED_MESSAGE)).toBeInTheDocument();
        expect(
            screen.getByText("Meta account not connected — configure Meta App credentials to enable live integration.")
        ).toBeInTheDocument();
        expect(screen.queryByText(/sample campaign/i)).toBeNull();
        expect(screen.queryByText(/demo/i)).toBeNull();
    });

    it("links to the connection settings page", () => {
        render(<DisconnectedCard />);
        const link = screen.getByRole("link", { name: /open meta connection settings/i });
        expect(link.getAttribute("href")).toBe("/dashboard/marketing/meta-ads/settings");
    });
});

describe("StatusBadge & EmptyState", () => {
    it("shows a humanized status label", () => {
        render(<StatusBadge status="PENDING_REVIEW" />);
        expect(screen.getByText("Pending Review")).toBeInTheDocument();
    });

    it("renders empty-state copy without fabricating data", () => {
        render(<EmptyState title="No campaigns match these filters" hint="Meta returned no campaigns." />);
        expect(screen.getByText("No campaigns match these filters")).toBeInTheDocument();
        expect(screen.getByText("Meta returned no campaigns.")).toBeInTheDocument();
    });
});

describe("ErrorBox — honest failures with actionable permission guidance", () => {
    it("shows guidance for Meta permission denials", () => {
        render(
            <ErrorBox
                error={{ message: "Meta permission denied: Missing Permissions", code: "META_PERMISSION_DENIED" }}
            />
        );
        expect(screen.getByText("Meta permission denied: Missing Permissions")).toBeInTheDocument();
        expect(screen.getByText(/ads_read/)).toBeInTheDocument();
        expect(screen.getByText(/Permissions and Features/)).toBeInTheDocument();
    });

    it("renders plain failures verbatim without inventing guidance", () => {
        render(<ErrorBox error={{ message: "Network unreachable" }} />);
        expect(screen.getByText("Network unreachable")).toBeInTheDocument();
        expect(screen.queryByText(/ads_read/)).toBeNull();
    });
});

describe("SyncResultPanel — per-category sync outcomes, never fabricated", () => {
    const fullSuccess = {
        partial: false,
        adAccounts: 12,
        pages: 3,
        instagramAccounts: 1,
        syncedAt: "2026-11-14T10:00:00.000Z",
        results: {
            adAccounts: { ok: true, count: 12, error: null },
            pages: { ok: true, count: 3, error: null },
            instagramAccounts: { ok: true, count: 1, error: null },
        },
    };

    it("renders a green summary for a full success", () => {
        render(<SyncResultPanel result={fullSuccess} formatTime={() => "14 Nov 2026, 10:00"} />);
        expect(
            screen.getByText(/Refreshed 12 ad accounts · 3 Pages · 1 Instagram accounts/)
        ).toBeInTheDocument();
        expect(screen.getByText(/14 Nov 2026, 10:00/)).toBeInTheDocument();
        expect(screen.queryByText(/failed/i)).toBeNull();
    });

    it("reports partial success per category and never shows a count for the failed one", () => {
        const partial = {
            ...fullSuccess,
            partial: true,
            adAccounts: null,
            results: {
                adAccounts: {
                    ok: false,
                    count: null,
                    error: {
                        code: "META_PERMISSION_DENIED",
                        message: "Meta permission denied: Missing Permissions",
                    },
                },
                pages: { ok: true, count: 3, error: null },
                instagramAccounts: { ok: true, count: 1, error: null },
            },
        };
        render(<SyncResultPanel result={partial} formatTime={() => "14 Nov 2026, 10:00"} />);
        expect(screen.getByText(/1 of 3 categories failed/)).toBeInTheDocument();
        expect(
            screen.getByText(/Ad accounts: failed — Meta permission denied: Missing Permissions \(META_PERMISSION_DENIED\)/)
        ).toBeInTheDocument();
        expect(screen.getByText("Pages: 3 found")).toBeInTheDocument();
        expect(screen.getByText("Instagram accounts: 1 found")).toBeInTheDocument();
        // No fabricated count for the failed category, no green "refreshed" line.
        expect(screen.queryByText(/Ad accounts: \d+ found/)).toBeNull();
        expect(screen.queryByText(/Refreshed 12 ad accounts/)).toBeNull();
        // Actionable permission guidance.
        expect(screen.getByText(/ads_read/)).toBeInTheDocument();
    });

    it("falls back to the legacy count line when per-category results are absent", () => {
        render(<SyncResultPanel result={{ adAccounts: 5, pages: 2, instagramAccounts: 0, syncedAt: null }} />);
        expect(screen.getByText(/Refreshed 5 ad accounts · 2 Pages · 0 Instagram accounts/)).toBeInTheDocument();
    });

    it("renders nothing without a result", () => {
        const { container } = render(<SyncResultPanel result={null} />);
        expect(container.innerHTML).toBe("");
    });
});
