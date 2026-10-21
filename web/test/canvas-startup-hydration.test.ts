import { expect, mock, test } from "bun:test";

const calls: string[] = [];
let releaseCache!: () => void;
let applicationReady!: () => void;
const cacheReady = new Promise<void>((resolve) => { releaseCache = resolve; });
const ready = new Promise<void>((resolve) => { applicationReady = resolve; });

mock.module("@fontsource-variable/inter", () => ({}));
mock.module("@fontsource-variable/jetbrains-mono", () => ({}));
mock.module("@/services/desktop-runtime", () => ({
    DESKTOP_UPDATE_STATUSES: ["disabled", "idle", "checking", "available", "downloading", "ready", "installing", "error"],
    bootstrapDesktopRuntime: async () => { calls.push("runtime"); },
    getDesktopAppBinding: () => undefined,
}));
mock.module("@/stores/canvas/use-canvas-store", () => ({
    useCanvasStore: { persist: { rehydrate: async () => { calls.push("cache-start"); await cacheReady; calls.push("cache-end"); } } },
}));
mock.module("@/services/local-workspace-repository", () => ({ hydrateLocalCanvasProjectsFromBackend: async () => { calls.push("backend"); } }));
mock.module("@/services/appearance-bootstrap", () => ({ bootstrapAppearance: async () => { calls.push("appearance"); } }));
mock.module("../src/application", () => { calls.push("application"); applicationReady(); return {}; });

test("startup finishes asynchronous browser cache hydration before backend projection and mounting", async () => {
    globalThis.window = {} as Window & typeof globalThis;
    await import("../src/main");
    for (let tick = 0; tick < 10; tick++) await Promise.resolve();
    expect(calls).toEqual(["runtime", "cache-start"]);
    releaseCache();
    await ready;
    expect(calls).toEqual(["runtime", "cache-start", "cache-end", "backend", "appearance", "application"]);
});
