const STORAGE_PREFIX = "bobo:assistant-draft:";

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function sessionStorageOrNull(): DraftStorage | null {
    try {
        return typeof window === "undefined" ? null : window.sessionStorage;
    } catch {
        return null;
    }
}

export function createAssistantDraftHandoff(text: string, storage = sessionStorageOrNull()): string | null {
    const normalized = text.trim();
    if (!normalized || !storage) return null;

    try {
        const id = globalThis.crypto.randomUUID();
        storage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify({ text: normalized, createdAt: Date.now() }));
        return id;
    } catch {
        return null;
    }
}

export function consumeAssistantDraftHandoff(id: string, storage = sessionStorageOrNull()): string | null {
    if (!storage || !/^[\da-f-]{36}$/i.test(id)) return null;
    const key = `${STORAGE_PREFIX}${id}`;

    try {
        const raw = storage.getItem(key);
        storage.removeItem(key);
        if (!raw) return null;
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object") return null;
        const draft = value as { text?: unknown; createdAt?: unknown };
        if (typeof draft.text !== "string" || typeof draft.createdAt !== "number") return null;
        if (Date.now() - draft.createdAt > 30 * 60 * 1000 || draft.createdAt > Date.now() + 60_000) return null;
        return draft.text.trim() || null;
    } catch {
        return null;
    }
}
