// WhatsApp Business App Coexistence — Embedded Signup (ES v4) launch flow
// built on the official Facebook JavaScript SDK.
//
// Flow (Meta docs: "Embedded Signup > Implementation" + "Onboard WhatsApp
// Business app users"):
//   1. load connect.facebook.net/en_US/sdk.js and FB.init with the Meta App ID,
//   2. listen for WA_EMBEDDED_SIGNUP postMessage session events (origin-checked),
//   3. FB.login with the Facebook Login for Business configuration id,
//      response_type 'code' + override_default_response_type, and extras
//      carrying featureType whatsapp_business_app_onboarding + version v4,
//   4. resolve with the exchangeable code (30s TTL) + session asset ids so the
//      caller can POST them straight to our backend for the server-side
//      exchange.
//
// SECURITY RULES honored here (nothing in this module ever logs):
// - the exchangeable code is never console.logged, never stored, never put in
//   a URL — it goes directly from the FB callback into the completion promise
//   and from there to the backend over TLS,
// - only display-safe session data (waba/phone asset ids, event names) is
//   kept in memory while the flow runs.

export const FB_APP_ID = "1536498651554499"; // existing Meta App ID
export const WA_ES_CONFIG_ID = "1742726286812906"; // existing Embedded Signup configuration id
const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const SDK_GRAPH_VERSION = "v21.0";
const SESSION_MESSAGE_TYPE = "WA_EMBEDDED_SIGNUP";
const FINISH_EVENTS = [
    "FINISH",
    "FINISH_ONLY_WABA",
    "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    "FINISH_GRANT_ONLY_API_ACCESS",
];
// Meta returns the code ~instantly with the finish event; give the session
// message a short grace before declaring it lost (the code TTL is 30s, so a
// retry stays cheap).
const CODE_WITHOUT_SESSION_TIMEOUT_MS = 5000;
// No code in the FB.login callback = the dialog ended without Finish. Give
// the session message a moment to land so a final-screen exit reports
// "incomplete" (assets created, no code) instead of a plain cancel.
const SESSION_AFTER_NO_CODE_GRACE_MS = 700;

let sdkPromise = null;

const isFacebookOrigin = (origin) => {
    if (typeof origin !== "string" || origin.indexOf("//") === -1) return false;
    const host = origin.split("//")[1].split("/")[0];
    return host === "facebook.com" || host.endsWith(".facebook.com");
};

// Injects the SDK once; resolves with window.FB. Idempotent across clicks.
export function loadFacebookSdk() {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("Embedded Signup requires a browser"));
    }
    if (window.FB && typeof window.FB.login === "function") return Promise.resolve(window.FB);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
        const previousInit = window.fbAsyncInit;
        window.fbAsyncInit = () => {
            // A pre-existing fbAsyncInit (if any) must not stop our init.
            if (typeof previousInit === "function") {
                try { previousInit(); } catch { /* ignore */ }
            }
            window.FB.init({
                appId: FB_APP_ID,
                autoLogAppEvents: true,
                xfbml: true,
                version: SDK_GRAPH_VERSION,
            });
            resolve(window.FB);
        };
        const script = document.createElement("script");
        script.src = SDK_SRC;
        script.async = true;
        script.defer = true;
        script.crossOrigin = "anonymous";
        script.onerror = () => {
            sdkPromise = null;
            reject(new Error("Could not load the Facebook SDK — check the network and try again"));
        };
        document.head.appendChild(script);
    });
    return sdkPromise;
}

/**
 * Launches Embedded Signup and resolves with one of:
 *   { status: "completed", code, wabaId, phoneNumberId?, businessId?, event }
 *   { status: "cancelled", step? }                     — dialog/flow abandoned
 *   { status: "incomplete", step?, event? }            — final screen exited without a code
 *   { status: "error", message, flowErrorCode? }       — flow-reported Meta error
 * Rejects only on SDK/popup infrastructure failures.
 */
export function launchWhatsAppEmbeddedSignup() {
    return loadFacebookSdk().then((FB) => new Promise((resolve) => {
        let settled = false;
        let exchangeCode = null;
        let session = null; // session-logging data (display-safe asset ids)
        let noSessionTimer = null;
        let noCodeTimer = null;

        const cleanup = () => {
            window.removeEventListener("message", onMessage);
            if (noSessionTimer) clearTimeout(noSessionTimer);
            if (noCodeTimer) clearTimeout(noCodeTimer);
        };
        const settle = (result) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(result);
        };
        const maybeComplete = () => {
            // The code (FB.login callback) and the session ids (postMessage)
            // arrive on separate channels in either order — ship only when
            // both are in, so the backend always gets code + waba_id together.
            if (!exchangeCode || !session || !session.wabaId) return;
            settle({
                status: "completed",
                code: exchangeCode,
                wabaId: session.wabaId,
                phoneNumberId: session.phoneNumberId || null,
                businessId: session.businessId || null,
                event: session.event,
            });
        };

        function onMessage(event) {
            if (settled || !isFacebookOrigin(event.origin)) return;
            let data = null;
            try {
                data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
            } catch {
                return; // unrelated facebook.com message
            }
            if (!data || data.type !== SESSION_MESSAGE_TYPE) return;
            const payload = data.data || {};

            if (FINISH_EVENTS.includes(data.event)) {
                session = {
                    event: String(data.event),
                    wabaId: payload.waba_id ? String(payload.waba_id) : null,
                    phoneNumberId: payload.phone_number_id ? String(payload.phone_number_id) : null,
                    businessId: payload.business_id ? String(payload.business_id) : null,
                };
                maybeComplete();
            } else if (data.event === "CANCEL") {
                settle({ status: "cancelled", step: payload.current_step || null });
            } else if (data.event === "ERROR") {
                // Flow-reported error — display-safe fields only, never
                // credentials (the ERROR payload carries message/code/session id).
                settle({
                    status: "error",
                    message: payload.error_message || "Meta reported an error during Embedded Signup",
                    flowErrorCode: payload.error_code || null,
                    flowSessionId: payload.session_id || null,
                });
            }
        }

        window.addEventListener("message", onMessage);

        FB.login((response) => {
            const code = response
                && response.authResponse
                && response.authResponse.code
                ? String(response.authResponse.code)
                : null;
            if (code) {
                exchangeCode = code;
                if (session) {
                    maybeComplete();
                } else {
                    // Wait briefly for the finish event; never hang past the
                    // code's usefulness — report honestly if it never lands.
                    noSessionTimer = setTimeout(() => {
                        settle({
                            status: "error",
                            message: "Meta returned a code but no session data (waba_id) arrived — please retry the connection",
                        });
                    }, CODE_WITHOUT_SESSION_TIMEOUT_MS);
                }
                return;
            }
            // Dialog ended without Finish: distinguish "assets created but no
            // code" from a plain cancel when the session message says so.
            noCodeTimer = setTimeout(() => {
                settle(session
                    ? { status: "incomplete", event: session.event, wabaId: session.wabaId || null }
                    : { status: "cancelled", step: null });
            }, SESSION_AFTER_NO_CODE_GRACE_MS);
        }, {
            config_id: WA_ES_CONFIG_ID,
            response_type: "code",
            override_default_response_type: true,
            extras: {
                setup: {},
                featureType: "whatsapp_business_app_onboarding",
                sessionInfoVersion: "3",
                version: "v4",
            },
        });
    }));
}
