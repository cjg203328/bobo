import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { canvasAppearanceForTheme } from "../src/lib/canvas/canvas-appearance";

let browser: Browser;
let server: ReturnType<typeof Bun.serve>;
const initial = { id: "c1", revision: 1, title: "Restart", createdAt: "2026-10-18", updatedAt: "2026-10-18", nodes: [{ id: "n0", type: "note", title: "创作笔记", width: 260, height: 200, position: { x: 160, y: 150 }, metadata: { content: "初始笔记", note: { tone: "amber" } } }], connections: [], chatSessions: [], activeChatId: null, appearance: canvasAppearanceForTheme("dark"), backgroundMode: "grid", showImageInfo: false, viewport: { x: 0, y: 0, k: 1 }, directorScenes: [] };
let backend = structuredClone(initial);
let gate = Promise.resolve();
let release: () => void = () => {};
let fail = false;
let commits = 0;

beforeAll(async () => {
    const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, "fixtures/canvas-stage1-harness.tsx")], target: "browser", define: {
        "import.meta.env.DEV": "false", "import.meta.env.PROD": "true", "import.meta.env.MODE": '"production"',
        "import.meta.env.VITE_CANVAS_LOCAL_MODE": '"true"', "import.meta.env.VITE_CANVAS_BACKEND_URL": '"/api"', "process.env.NODE_ENV": '"production"',
    }, plugins: [{ name: "source", setup(builder) {
        builder.onResolve({ filter: /^@\// }, args => ({ path: Bun.resolveSync("../src/" + args.path.slice(2), import.meta.dir) }));
        // Provider logos are unrelated to Note editing. Bun does not expand Vite's lazy glob.
        builder.onLoad({ filter: /[\\/]model-logo\.tsx$/ }, async args => ({
            contents: (await Bun.file(args.path).text()).replace('import.meta.glob("../../node_modules/@lobehub/icons/es/*/components/Mono.js", { import: "default" })', "{}"),
            loader: "tsx",
        }));
        builder.onLoad({ filter: /\.(css|svg|png|jpe?g|gif|webp|woff2?)$/ }, () => ({ contents: "export default ''", loader: "js" }));
    } }] });
    if (!build.success) throw new Error(build.logs.join("\n"));
    const script = await build.outputs[0]!.text();
    const cssPath = resolve(import.meta.dir, "../src/styles/globals.css");
    const styles = await postcss([tailwind({ base: resolve(import.meta.dir, "..") })]).process(await Bun.file(cssPath).text(), { from: cssPath });
    const json = (data: unknown) => Response.json({ code: 0, data, msg: "ok" });
    server = Bun.serve({ port: 0, async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/harness.js") return new Response(script, { headers: { "Content-Type": "application/javascript" } });
        if (path === "/styles.css") return new Response(styles.css, { headers: { "Content-Type": "text/css" } });
        if (path === "/api/canvas-projects/c1") return json({ project: backend });
        if (path === "/api/canvas-projects/c1/document-commit") {
            const body = await request.json();
            commits++;
            await gate;
            if (fail) return Response.json({ code: 500, data: null, msg: "测试保存失败", reason: "save_failed" }, { status: 500 });
            if (body.params.expectedRevision !== backend.revision) return Response.json({ code: 409, data: null, msg: "Revision conflict", reason: "canvas_revision_conflict" }, { status: 409 });
            backend = { ...body.params.document, revision: backend.revision + 1 };
            return json({ revision: backend.revision, result: { canvasId: "c1", revision: backend.revision, title: backend.title, updatedAt: backend.updatedAt } });
        }
        if (path.startsWith("/api/")) return json([]);
        return new Response('<html class="dark"><link rel="stylesheet" href="/styles.css"><body><div id="root"></div><div id="portal"><input aria-label="浮层输入" style="position:fixed;right:0;top:0"></div><script>window.__reopenProject=' + JSON.stringify(backend).replaceAll("<", "\\u003c") + '</script><script type="module" src="/harness.js"></script></body></html>', { headers: { "Content-Type": "text/html" } });
    } });
    const executablePath = process.env.CHROME_PATH;
    browser = await chromium.launch({ executablePath: executablePath && existsSync(executablePath) ? executablePath : undefined, headless: true });
}, 60000);
afterAll(async () => { release(); await browser?.close(); server?.stop(true); });
beforeEach(() => { backend = structuredClone(initial); gate = Promise.resolve(); fail = false; commits = 0; });

async function open(page: Page) {
    page.setDefaultTimeout(8000);
    const errors: string[] = [];
    const recordError = (error: Error) => errors.push(error.message);
    page.on("pageerror", recordError);
    await page.goto(`${server.url}?scenario=stage1-note`);
    try {
        await page.waitForFunction(() => document.querySelector('[data-testid="graph"]')?.textContent === "true:1:0", undefined, { timeout: 8000 });
    } catch (error) { throw new Error(`${String(error)}\n${errors.join("\n")}\n${await page.locator("body").innerText()}`); }
    finally { page.off("pageerror", recordError); }
}

test("笔记单击编辑、中文输入隔离、撤销重做以及保存重开", async () => {
    const page = await browser.newPage();
    try {
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await open(page);
        await page.getByRole("button", { name: "编辑笔记", exact: true }).click();
        const textarea = page.getByRole("textbox", { name: "笔记正文" });
        expect(await textarea.evaluate(element => document.activeElement === element)).toBe(true);
        await textarea.fill("雨夜街道\n人物戴红色围巾");
        await textarea.evaluate(element => element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true })));
        expect(await textarea.count()).toBe(1);
        await textarea.evaluate(element => element.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })));
        expect(await page.evaluate(() => (window as any).__lifecycle.keyBubbles || 0)).toBe(0);
        await textarea.press("Escape");
        expect(await textarea.count()).toBe(0);
        await page.waitForFunction(() => (window as any).__lifecycle.canUndo);
        await page.evaluate(() => (window as any).__lifecycle.undo());
        await page.waitForFunction(() => document.querySelector('[data-canvas-node-type="note"]')?.textContent?.includes("初始笔记"));
        await page.waitForFunction(() => (window as any).__lifecycle.canRedo);
        await page.evaluate(() => (window as any).__lifecycle.redo());
        await page.waitForFunction(() => document.querySelector('[data-canvas-node-type="note"]')?.textContent?.includes("红色围巾"));
        await page.evaluate(() => (window as any).__lifecycle.close("1"));
        await page.waitForFunction(() => (window as any).__lifecycle.acknowledgements.some((ack: any) => ack.id === "1" && ack.saved));
        expect(backend.nodes[0]!.metadata.content).toBe("雨夜街道\n人物戴红色围巾");
        await open(page);
        await page.getByText("雨夜街道\n人物戴红色围巾", { exact: true }).dblclick();
        expect(await page.getByRole("textbox", { name: "笔记正文" }).inputValue()).toBe("雨夜街道\n人物戴红色围巾");
        expect(errors).toEqual([]);
    } finally { await page.close(); }
}, 30000);

test("笔记锁定、只读与编辑中权限变化均禁止继续编辑", async () => {
    const page = await browser.newPage();
    try {
        await open(page);
        await page.getByRole("button", { name: "编辑笔记", exact: true }).click();
        await page.evaluate(() => (window as any).__lifecycle.setLocked(true));
        await page.waitForFunction(() => !document.querySelector('textarea[aria-label="笔记正文"]'));
        expect(await page.getByRole("button", { name: "编辑笔记", exact: true }).count()).toBe(0);
        await page.getByText("初始笔记", { exact: true }).dblclick();
        expect(await page.getByRole("textbox", { name: "笔记正文" }).count()).toBe(0);
        await page.evaluate(() => { (window as any).__lifecycle.setLocked(false); (window as any).__lifecycle.setReadOnly(true); });
        expect(await page.getByRole("button", { name: "编辑笔记", exact: true }).count()).toBe(0);
        await page.getByText("初始笔记", { exact: true }).dblclick();
        expect(await page.getByRole("textbox", { name: "笔记正文" }).count()).toBe(0);
    } finally { await page.close(); }
}, 30000);

test("关闭提交当前焦点标题、等待后端，并冻结画布外浮层", async () => {
    const page = await browser.newPage();
    try {
        await open(page);
        gate = new Promise<void>(resolve => { release = resolve; });
        await page.getByRole("button", { name: "编辑节点名称：创作笔记" }).click();
        await page.getByRole("textbox", { name: "节点名称", exact: true }).fill("尚未失焦的新标题");
        await page.evaluate(() => (window as any).__lifecycle.close("1"));
        await page.waitForFunction(() => document.querySelector("dialog:modal"));
        expect(await page.locator('#portal input').evaluate(element => { (element as HTMLInputElement).focus(); return document.activeElement === element; })).toBe(false);
        expect(await page.evaluate(() => (window as any).__lifecycle.acknowledgements)).toEqual([]);
        release();
        await page.waitForFunction(() => (window as any).__lifecycle.acknowledgements.length === 1);
        expect(await page.evaluate(() => (window as any).__lifecycle.acknowledgements[0])).toEqual({ id: "1", saved: true });
        expect(backend.nodes[0]!.title).toBe("尚未失焦的新标题");
        await open(page);
        await page.getByRole("button", { name: "编辑节点名称：尚未失焦的新标题" }).waitFor();
        expect(await page.getByRole("button", { name: "编辑节点名称：尚未失焦的新标题" }).count()).toBe(1);
    } finally { release(); await page.close(); }
}, 30000);

test("保存失败保留草稿，重试成功后重开恢复", async () => {
    const page = await browser.newPage();
    try {
        await open(page);
        fail = true;
        await page.getByRole("button", { name: "编辑笔记", exact: true }).click();
        await page.getByRole("textbox", { name: "笔记正文" }).fill("失败后必须保留的草稿");
        await page.evaluate(() => (window as any).__lifecycle.close("1"));
        await page.waitForFunction(() => (window as any).__lifecycle.acknowledgements.length === 1);
        expect(await page.evaluate(() => (window as any).__lifecycle.acknowledgements[0])).toEqual({ id: "1", saved: false });
        expect(backend.nodes[0]!.metadata.content).toBe("初始笔记");
        expect(await page.evaluate(() => (window as any).__lifecycle.dirty())).toBe(true);
        expect(await page.getByText("失败后必须保留的草稿", { exact: true }).count()).toBe(1);
        fail = false;
        await page.evaluate(() => (window as any).__lifecycle.close("2"));
        await page.waitForFunction(() => (window as any).__lifecycle.acknowledgements.some((ack: any) => ack.id === "2" && ack.saved));
        expect(backend.nodes[0]!.metadata.content).toBe("失败后必须保留的草稿");
        await open(page);
        await page.waitForFunction(() => document.querySelector('[data-canvas-node-type="note"]')?.textContent?.includes("失败后必须保留的草稿"));
    } finally { await page.close(); }
}, 30000);

test("关闭超时解除模态，旧响应不确认退出，后续请求保存最新修改", async () => {
    const page = await browser.newPage();
    try {
        await open(page);
        gate = new Promise<void>(resolve => { release = resolve; });
        await page.getByRole("button", { name: "编辑笔记", exact: true }).click();
        await page.getByRole("textbox", { name: "笔记正文" }).fill("第一版");
        await page.evaluate(() => (window as any).__lifecycle.close("1"));
        await page.waitForFunction(() => document.querySelector("dialog:modal"));
        await page.evaluate(() => (window as any).__lifecycle.timeout("1"));
        expect(await page.locator("dialog:modal").count()).toBe(0);
        await page.getByRole("button", { name: "编辑笔记", exact: true }).click();
        await page.getByRole("textbox", { name: "笔记正文" }).fill("超时后继续编辑的最新版本");
        await page.evaluate(() => (window as any).__lifecycle.close("2"));
        release();
        await page.waitForFunction(() => (window as any).__lifecycle.acknowledgements.some((ack: any) => ack.id === "2" && ack.saved));
        expect(await page.evaluate(() => (window as any).__lifecycle.acknowledgements)).toEqual([{ id: "2", saved: true }]);
        expect(backend.nodes[0]!.metadata.content).toBe("超时后继续编辑的最新版本");
        expect(commits).toBeGreaterThanOrEqual(1);
    } finally { release(); await page.close(); }
}, 30000);

test("明暗主题的笔记入口、长文滚动与关闭反馈可见", async () => {
    const evidenceDir = resolve(import.meta.dir, "../../.local/stage1-evidence");
    mkdirSync(evidenceDir, { recursive: true });
    for (const theme of ["light", "dark"] as const) {
        const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
        try {
            await open(page);
            await page.evaluate(theme => (window as any).__lifecycle.setTheme(theme), theme);
            await page.waitForFunction(theme => {
                const content = document.querySelector('[data-canvas-node-type="note"] .thin-scrollbar');
                return content && getComputedStyle(content).color === (theme === "light" ? "rgb(31, 41, 55)" : "rgba(255, 255, 255, 0.92)");
            }, theme);
            const edit = page.getByRole("button", { name: "编辑笔记", exact: true });
            expect(await edit.isVisible()).toBe(true);
            await page.screenshot({ path: resolve(evidenceDir, `note-${theme}.png`) });
            await edit.click();
            const textarea = page.getByRole("textbox", { name: "笔记正文" });
            gate = new Promise<void>(resolve => { release = resolve; });
            await textarea.fill(Array.from({ length: 30 }, (_, i) => `${theme} 第 ${i + 1} 行：雨夜街道，人物戴红色围巾。`).join("\n"));
            const scroll = await textarea.evaluate(element => ({
                overflow: element.scrollHeight > element.clientHeight,
                horizontalOverflow: element.scrollWidth > element.clientWidth,
                padding: Number.parseFloat(getComputedStyle(element).paddingTop),
            }));
            expect(scroll.overflow).toBe(true);
            expect(scroll.horizontalOverflow).toBe(false);
            expect(scroll.padding).toBeGreaterThanOrEqual(32);
            await textarea.evaluate(element => { element.scrollTop = 0; });
            await page.screenshot({ path: resolve(evidenceDir, `note-edit-${theme}.png`) });
            await page.evaluate(() => (window as any).__lifecycle.close("visual"));
            await page.waitForFunction(() => document.querySelector("dialog:modal"));
            const dialog = page.locator("dialog:modal");
            const bounds = await dialog.boundingBox();
            expect(bounds).toEqual({ x: 0, y: 0, width: 1000, height: 700 });
            expect(await dialog.innerText()).toContain("正在保存工作区");
            await page.screenshot({ path: resolve(evidenceDir, `close-save-${theme}.png`) });
            release();
            await page.waitForFunction(() => (window as any).__lifecycle.acknowledgements.some((ack: any) => ack.id === "visual" && ack.saved));
        } finally { release(); await page.close(); }
    }
}, 30000);
