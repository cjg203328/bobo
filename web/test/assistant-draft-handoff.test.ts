import { describe, expect, test } from "bun:test";

import { consumeAssistantDraftHandoff, createAssistantDraftHandoff } from "@/services/assistant-draft-handoff";

function memoryStorage() {
    const values = new Map<string, string>();
    return {
        values,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
    };
}

describe("assistant draft handoff", () => {
    test("passes a task once and consumes its temporary storage entry", () => {
        const storage = memoryStorage();
        const id = createAssistantDraftHandoff("  帮我做一套春季商品宣传图  ", storage);

        expect(id).toMatch(/^[\da-f-]{36}$/i);
        expect(consumeAssistantDraftHandoff(id!, storage)).toBe("帮我做一套春季商品宣传图");
        expect(consumeAssistantDraftHandoff(id!, storage)).toBeNull();
        expect(storage.values.size).toBe(0);
    });

    test("rejects empty, malformed, and expired handoffs", () => {
        const storage = memoryStorage();
        expect(createAssistantDraftHandoff("  ", storage)).toBeNull();
        expect(consumeAssistantDraftHandoff("not-an-id", storage)).toBeNull();

        const id = "00000000-0000-4000-8000-000000000000";
        storage.setItem(`bobo:assistant-draft:${id}`, JSON.stringify({ text: "过期任务", createdAt: Date.now() - 31 * 60 * 1000 }));
        expect(consumeAssistantDraftHandoff(id, storage)).toBeNull();
        expect(storage.values.size).toBe(0);
    });
});
