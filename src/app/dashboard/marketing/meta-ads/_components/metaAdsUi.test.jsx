// Phase 3+4 — shared Meta Ads UI safety components. The critical contract:
// ConfirmDialog with requireCheckbox keeps activation/permanent-deletion
// buttons LOCKED until the user actively acknowledges the warning, and
// DisconnectedCard renders the exact Phase 2.5A disconnected string with
// no campaign content.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog, DisconnectedCard, StatusBadge, EmptyState } from "./metaAdsUi";
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
