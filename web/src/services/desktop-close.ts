import { flushSync } from "react-dom";
import { getDesktopAppBinding } from "@/services/desktop-runtime";
import { persistWorkspaceBeforeDesktopInstall } from "@/services/desktop-update";

export const DESKTOP_CLOSE_SAVE_EVENT = "huabu:before-close-save";
export const DESKTOP_CLOSE_SAVE_TIMEOUT_EVENT = "huabu:close-save-timeout";

type CloseHost = {
    EventsOn: (name: string, callback: (requestId: string) => void) => () => void;
};

function showCloseSaveFeedback() {
    if (typeof document === "undefined") return () => {};
    const focused = document.activeElement;
    // Commit inline title/input blur handlers before the save callbacks read refs.
    flushSync(() => { if (focused instanceof HTMLElement) focused.blur(); });
    // A modal dialog also blocks portals mounted outside the React root.
    const feedback = document.createElement("dialog");
    feedback.className = "desktop-close-save-feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    feedback.textContent = "正在保存工作区，完成后关闭…";
    feedback.addEventListener("cancel", event => event.preventDefault());
    document.body.append(feedback);
    feedback.showModal();
    return () => {
        feedback.close();
        feedback.remove();
        if (focused instanceof HTMLElement && focused.isConnected) focused.focus();
    };
}

// Keep attempts serialized even after the native timeout. A late save cannot
// acknowledge a later close request, and retry must await the previous write.
export async function installDesktopCloseSave(
    binding = getDesktopAppBinding(),
    runtime = (window as Window & { runtime?: CloseHost }).runtime,
    persist = persistWorkspaceBeforeDesktopInstall,
) {
    if (!binding?.CloseSaveReady || !binding.CompleteCloseSave || !runtime?.EventsOn) return;
    let tail = Promise.resolve();
    const pending = new Map<string, { cancelled: boolean }>();
    const visibleRequests = new Set<string>();
    let restoreFeedback: (() => void) | undefined;
    const releaseFeedback = (requestId: string) => {
        visibleRequests.delete(requestId);
        if (!visibleRequests.size) { restoreFeedback?.(); restoreFeedback = undefined; }
    };
    const unsubscribe = runtime.EventsOn(DESKTOP_CLOSE_SAVE_EVENT, (requestId) => {
        if (typeof requestId !== "string" || !requestId || pending.has(requestId)) return;
        if (!restoreFeedback) restoreFeedback = showCloseSaveFeedback();
        visibleRequests.add(requestId);
        const attempt = { cancelled: false };
        pending.set(requestId, attempt);
        tail = tail.catch(() => undefined).then(async () => {
            let saved = false;
            try { await persist(); saved = true; }
            catch { /* The host keeps the window open and offers a recovery choice. */ }
            if (!attempt.cancelled) await binding.CompleteCloseSave!(requestId, saved);
        }).finally(() => {
            pending.delete(requestId);
            releaseFeedback(requestId);
        });
        void tail.catch(() => undefined); // A timed-out native request rejects its stale acknowledgement.
    });
    const unsubscribeTimeout = runtime.EventsOn(DESKTOP_CLOSE_SAVE_TIMEOUT_EVENT, (requestId) => {
        const attempt = pending.get(requestId);
        if (!attempt) return;
        // Keep ownership of the pending write, but let the user return to editing.
        attempt.cancelled = true;
        releaseFeedback(requestId);
    });
    const stop = () => { unsubscribe(); unsubscribeTimeout(); restoreFeedback?.(); restoreFeedback = undefined; };
    try { await binding.CloseSaveReady(); }
    catch (error) { stop(); throw error; }
    return stop;
}
