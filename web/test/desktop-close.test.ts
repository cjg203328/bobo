import { expect, test } from "bun:test";
import { installDesktopCloseSave, DESKTOP_CLOSE_SAVE_EVENT, DESKTOP_CLOSE_SAVE_TIMEOUT_EVENT } from "../src/services/desktop-close";

function host() {
    const listeners = new Map<string, (id: string) => void>();
    const acknowledgements: Array<[string, boolean]> = [];
    let ready = false;
    const binding = {
        RuntimeConfig: async () => ({ baseURL: "", launchToken: "" }),
        CloseSaveReady: async () => { ready = true; },
        CompleteCloseSave: async (id: string, saved: boolean) => { acknowledgements.push([id, saved]); },
    };
    const runtime = { EventsOn: (event: string, callback: (id: string) => void) => {
        listeners.set(event, callback);
        return () => { listeners.delete(event); };
    } };
    return { binding, runtime, acknowledgements, emit: (id: string) => listeners.get(DESKTOP_CLOSE_SAVE_EVENT)?.(id), timeout: (id: string) => listeners.get(DESKTOP_CLOSE_SAVE_TIMEOUT_EVENT)?.(id), ready: () => ready };
}

test("native close is acknowledged only after persistence finishes", async () => {
    const h = host();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const stop = await installDesktopCloseSave(h.binding, h.runtime, () => gate);
    expect(h.ready()).toBe(true);
    h.emit("1");
    await Bun.sleep(1);
    expect(h.acknowledgements).toEqual([]);
    release();
    await Bun.sleep(1);
    expect(h.acknowledgements).toEqual([["1", true]]);
    stop?.();
});

test("failed saves refuse close and a later request saves afresh", async () => {
    const h = host();
    let fail = true;
    const stop = await installDesktopCloseSave(h.binding, h.runtime, async () => { if (fail) throw new Error("disk full"); });
    h.emit("1");
    await Bun.sleep(1);
    expect(h.acknowledgements).toEqual([["1", false]]);
    fail = false;
    h.emit("2");
    await Bun.sleep(1);
    expect(h.acknowledgements).toEqual([["1", false], ["2", true]]);
    stop?.();
});

test("timeout retries and duplicate events cannot overlap pending writes", async () => {
    const h = host();
    let release!: () => void;
    let saves = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const stop = await installDesktopCloseSave(h.binding, h.runtime, async () => { if (++saves === 1) await gate; });
    h.emit("1"); h.emit("1"); h.emit("2");
    await Bun.sleep(1);
    expect(saves).toBe(1);
    h.timeout("1");
    release();
    await Bun.sleep(1);
    expect(saves).toBe(2);
    expect(h.acknowledgements).toEqual([["2", true]]);
    stop?.();
});
