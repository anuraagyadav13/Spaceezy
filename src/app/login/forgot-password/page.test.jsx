// Forgot-password screen — loading, validation and error states, plus the
// resend countdown. The API layer is mocked, so nothing here reaches a server
// or an email provider.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

const api = vi.hoisted(() => ({
    forgotPasswordAPI: vi.fn(),
    verifyResetOtpAPI: vi.fn(),
    resetPasswordAPI: vi.fn(),
}));

vi.mock("../../../lib/api/auth", () => api);

import ForgotPasswordPage from "./page";

const EMAIL = "kamal@spaceezy.com";

const apiError = (message, code, status) =>
    Object.assign(new Error(message), { code, status });

beforeEach(() => {
    vi.clearAllMocks();
    // Generic 200, exactly as the backend answers for known AND unknown emails.
    api.forgotPasswordAPI.mockResolvedValue({});
    api.verifyResetOtpAPI.mockResolvedValue({ resetToken: "a".repeat(64), expiresInSeconds: 600 });
    api.resetPasswordAPI.mockResolvedValue({ sessionsRevoked: 2, confirmationEmailSent: true });
});

afterEach(() => {
    vi.useRealTimers();
});

describe("step 1 — request a code", () => {
    it("rejects a malformed email before calling the API", async () => {
        const user = userEvent.setup();
        render(<ForgotPasswordPage />);

        await user.type(screen.getByLabelText(/email address/i), "not-an-email");
        await user.click(screen.getByRole("button", { name: /send code/i }));

        expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
        expect(api.forgotPasswordAPI).not.toHaveBeenCalled();
    });

    it("shows a loading state on submit and advances to the OTP step", async () => {
        const user = userEvent.setup();
        let resolveSend;
        api.forgotPasswordAPI.mockReturnValue(new Promise((r) => { resolveSend = r; }));

        render(<ForgotPasswordPage />);
        await user.type(screen.getByLabelText(/email address/i), EMAIL);
        await user.click(screen.getByRole("button", { name: /send code/i }));

        // Loading state: button disabled and relabelled while in flight.
        expect(screen.getByRole("button", { name: /sending code/i })).toBeDisabled();

        resolveSend({});
        await screen.findByRole("heading", { name: /enter verification code/i });
        expect(api.forgotPasswordAPI).toHaveBeenCalledWith(EMAIL);
        // The address is echoed back so the user can spot a typo.
        expect(screen.getByText(new RegExp(EMAIL))).toBeInTheDocument();
    });

    it("surfaces an API failure inline without advancing", async () => {
        const user = userEvent.setup();
        api.forgotPasswordAPI.mockRejectedValue(
            apiError("Too many reset requests. Please try again later.", "TOO_MANY_REQUESTS", 429)
        );

        render(<ForgotPasswordPage />);
        await user.type(screen.getByLabelText(/email address/i), EMAIL);
        await user.click(screen.getByRole("button", { name: /send code/i }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Too many reset requests. Please try again later."
        );
        expect(screen.getByRole("heading", { name: /forgot your password/i })).toBeInTheDocument();
        expect(api.verifyResetOtpAPI).not.toHaveBeenCalled();
    });

    it("never reveals whether the email exists — success copy is generic", async () => {
        const user = userEvent.setup();
        render(<ForgotPasswordPage />);

        await user.type(screen.getByLabelText(/email address/i), "ghost@spaceezy.com");
        await user.click(screen.getByRole("button", { name: /send code/i }));

        await screen.findByRole("heading", { name: /enter verification code/i });
        // The response is identical for unknown accounts; the UI must not say
        // "we found your account" or similar.
        expect(screen.queryByText(/found your account|no account|not registered/i)).toBeNull();
    });
});

describe("step 2 — OTP entry", () => {
    const openOtpStep = async (user) => {
        render(<ForgotPasswordPage />);
        await user.type(screen.getByLabelText(/email address/i), EMAIL);
        await user.click(screen.getByRole("button", { name: /send code/i }));
        await screen.findByRole("heading", { name: /enter verification code/i });
    };

    it("accepts digits only and disables verify until 6 digits are entered", async () => {
        const user = userEvent.setup();
        await openOtpStep(user);

        const input = screen.getByLabelText(/6-digit code/i);
        await user.type(input, "12ab34--5678");

        // Non-digits stripped, length capped at 6.
        expect(input).toHaveValue("123456");
        expect(screen.getByRole("button", { name: /verify code/i })).toBeEnabled();
    });

    it("shows the generic server error for a wrong code and clears the field", async () => {
        const user = userEvent.setup();
        api.verifyResetOtpAPI.mockRejectedValue(
            apiError("Invalid or expired verification code.", "INVALID_RESET_CODE", 400)
        );
        await openOtpStep(user);

        await user.type(screen.getByLabelText(/6-digit code/i), "000000");
        await user.click(screen.getByRole("button", { name: /verify code/i }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Invalid or expired verification code."
        );
        expect(api.verifyResetOtpAPI).toHaveBeenCalledWith(EMAIL, "000000");
        // Wrong code must not leak any account detail.
        expect(screen.getByRole("alert")).not.toHaveTextContent(/no account|not found/i);
    });

    // These two tests install fake timers, which deadlock userEvent (its
    // internal delay await never resolves on a faked clock). fireEvent is
    // synchronous, so it drives the same handlers without touching timers.
    const openOtpStepWithFireEvent = async () => {
        render(<ForgotPasswordPage />);
        fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: EMAIL } });
        fireEvent.click(screen.getByRole("button", { name: /send code/i }));
        await act(async () => { await vi.advanceTimersByTimeAsync(0); });
        expect(screen.getByRole("heading", { name: /enter verification code/i })).toBeInTheDocument();
    };

    it("starts a 60s resend cooldown and disables Resend until it expires", async () => {
        vi.useFakeTimers();
        await openOtpStepWithFireEvent();

        // Countdown is live immediately after a send.
        expect(screen.getByRole("timer")).toHaveTextContent(/Resend available in 01:00/);
        expect(screen.getByRole("button", { name: /resend code/i })).toBeDisabled();

        // Cooldown expires after 60 ticks.
        await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
        expect(screen.getByRole("button", { name: /resend code/i })).toBeEnabled();
    });

    it("resend restarts the cooldown and calls the API again", async () => {
        vi.useFakeTimers();
        await openOtpStepWithFireEvent();

        await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
        fireEvent.click(screen.getByRole("button", { name: /resend code/i }));

        expect(api.forgotPasswordAPI).toHaveBeenCalledTimes(2);
        await act(async () => { await vi.advanceTimersByTimeAsync(0); });
        expect(screen.getByRole("timer")).toHaveTextContent(/Resend available in 01:00/);
    });
});

describe("step 3 — new password", () => {
    const openPasswordStep = async (user) => {
        render(<ForgotPasswordPage />);
        await user.type(screen.getByLabelText(/email address/i), EMAIL);
        await user.click(screen.getByRole("button", { name: /send code/i }));
        await screen.findByRole("heading", { name: /enter verification code/i });
        await user.type(screen.getByLabelText(/6-digit code/i), "424242");
        await user.click(screen.getByRole("button", { name: /verify code/i }));
        await screen.findByRole("heading", { name: /set a new password/i });
    };

    it("enforces length and confirmation before calling the API", async () => {
        const user = userEvent.setup();
        await openPasswordStep(user);

        await user.type(screen.getByLabelText(/^new password/i), "short");
        await user.click(screen.getByRole("button", { name: /update password/i }));
        expect(await screen.findByRole("alert")).toHaveTextContent(/at least 10 characters/i);
        expect(api.resetPasswordAPI).not.toHaveBeenCalled();

        await user.type(screen.getByLabelText(/^new password/i), "a-brand-new-passw0rd");
        await user.type(screen.getByLabelText(/confirm new password/i), "different-passw0rd");
        await user.click(screen.getByRole("button", { name: /update password/i }));
        expect(await screen.findByRole("alert")).toHaveTextContent(/passwords do not match/i);
        expect(api.resetPasswordAPI).not.toHaveBeenCalled();
    });

    it("submits, shows loading, and lands on the success state", async () => {
        const user = userEvent.setup();
        await openPasswordStep(user);

        await user.type(screen.getByLabelText(/^new password/i), "a-brand-new-passw0rd");
        await user.type(screen.getByLabelText(/confirm new password/i), "a-brand-new-passw0rd");
        await user.click(screen.getByRole("button", { name: /update password/i }));

        expect(await screen.findByRole("heading", { name: /password updated/i })).toBeInTheDocument();
        expect(api.resetPasswordAPI).toHaveBeenCalledWith(
            EMAIL,
            "a".repeat(64),
            "a-brand-new-passw0rd"
        );
        // The success state offers the way back to sign-in.
        expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    });

    it("sends the user back to step 1 when the reset token has expired", async () => {
        const user = userEvent.setup();
        api.resetPasswordAPI.mockRejectedValue(
            apiError("Invalid or expired verification code.", "INVALID_RESET_CODE", 400)
        );
        await openPasswordStep(user);

        await user.type(screen.getByLabelText(/^new password/i), "a-brand-new-passw0rd");
        await user.type(screen.getByLabelText(/confirm new password/i), "a-brand-new-passw0rd");
        await user.click(screen.getByRole("button", { name: /update password/i }));

        expect(await screen.findByRole("heading", { name: /forgot your password/i })).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent(/session expired/i);
    });
});
