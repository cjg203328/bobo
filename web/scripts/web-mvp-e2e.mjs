import assert from "node:assert/strict";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

// Run against an explicitly started local workspace. Only newly created canvases are edited.
const base = process.env.HUABU_E2E_URL || "http://localhost:1010";
const evidence = resolve(import.meta.dirname, "../../.local/web-mvp-evidence");
const localSkillPackages = resolve(import.meta.dirname, "../../.local/project-workbench-debug/skill-packages");
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on("dialog", dialog => dialog.accept());
const errors = [];
const report = { base, startedAt: new Date().toISOString(), checks: [], canvasIds: [], errors };
page.on("pageerror", error => errors.push(error.message));
function passed(name) { report.checks.push(name); console.log("PASS", name); }
async function countFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error));
    const nestedCounts = await Promise.all(entries.map(entry => entry.isDirectory()
        ? countFiles(resolve(directory, entry.name))
        : entry.isFile() ? 1 : 0));
    return nestedCounts.reduce((total, count) => total + count, 0);
}
async function poll(fn, description) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        if (await fn()) return;
        await page.waitForTimeout(100);
    }
    throw new Error(`Timeout: ${description}`);
}
async function api(path, data) {
    const response = data === undefined ? await page.request.get(`${base}/api${path}`) : await page.request.put(`${base}/api${path}`, { data });
    const body = await response.json();
    assert.equal(response.ok(), true, JSON.stringify(body));
    assert.equal(body.code, 0, JSON.stringify(body));
    return body.data;
}
async function closeAssistant() {
    const close = page.getByRole("button", { name: "关闭 Agent", exact: true });
    if (await close.count()) await close.click();
}
async function saved() { await page.getByRole("button", { name: "画布保存状态：已保存在本地", exact: true }).waitFor(); }
async function draftsFor(id) {
    return page.evaluate(async canvasId => {
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open("huabu");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            return await new Promise((resolve, reject) => {
                const store = db.transaction("app_state").objectStore("app_state");
                const cursor = store.openCursor();
                cursor.onerror = () => reject(cursor.error);
                cursor.onsuccess = () => {
                    const entry = cursor.result;
                    if (!entry) return resolve([]);
                    if (String(entry.key).includes(`huabu:sync-drafts:${canvasId}:`)) return resolve(JSON.parse(entry.value));
                    entry.continue();
                };
            });
        } finally { db.close(); }
    }, id);
}

try {
    await page.goto(base, { waitUntil: "networkidle", timeout: 120000 });
    const dismissGuide = page.locator(".first-creation-actions button").first();
    if (await dismissGuide.count()) {
        await dismissGuide.click();
        await page.locator(".first-creation-actions").waitFor({ state: "detached" });
    }
    await page.getByRole("button", { name: /商品宣传套图/ }).click();
    await page.getByRole("button", { name: "开始创作", exact: true }).click();
    await page.waitForURL("**/canvas/**");
    await page.locator("[data-canvas-viewport]").waitFor();
    const taskDraft = page.getByRole("textbox", { name: "给助手的消息" });
    await poll(async () => (await taskDraft.innerText()).includes("一套宣传视觉"), "home task handoff to Agent draft");
    assert.equal((await taskDraft.innerText()).includes("发布渠道"), false, "home must pass the short user brief, not internal workflow instructions");
    assert.deepEqual(errors, []);
    passed("首页场景任务打开新画布，并以未发送草稿交给 Agent");
    const canvasId = new URL(page.url()).pathname.split("/").pop();
    report.canvasIds.push(canvasId);
    await closeAssistant();
    await saved();
    passed("真实本地工作区创建画布并收到保存回执");

    await page.getByRole("button", { name: "添加节点", exact: true }).click();
    await page.getByRole("button", { name: "笔记", exact: true }).click();
    const note = page.locator('[data-canvas-node-type="note"]');
    await note.waitFor();
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: "编辑笔记", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "笔记正文" });
    await editor.fill("雨夜街道\n人物戴红色围巾");
    await editor.evaluate(element => element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true })));
    assert.equal(await editor.count(), 1);
    await editor.press("Escape");
    await page.waitForTimeout(700);
    await page.keyboard.press("Control+z");
    await poll(async () => !(await note.innerText()).includes("红色围巾"), "undo note");
    await page.keyboard.press("Control+Shift+z");
    await poll(async () => (await note.innerText()).includes("红色围巾"), "redo note");
    await saved();
    assert.equal((await api(`/canvas-projects/${canvasId}`)).project.nodes[0].metadata.content, "雨夜街道\n人物戴红色围巾");
    passed("菜单创建便签、中文多行编辑、输入法隔离、真实快捷键撤销重做与后端保存");

    await note.getByRole("button", { name: /^编辑节点名称：/ }).click();
    const title = note.locator("input");
    await title.fill("镜头与人物便签");
    await title.press("Enter");
    await saved();
    await page.reload({ waitUntil: "networkidle" });
    await closeAssistant();
    await note.getByRole("button", { name: "编辑节点名称：镜头与人物便签", exact: true }).waitFor();
    assert.match(await note.innerText(), /红色围巾/);
    passed("便签名称与正文刷新后恢复");

    let failSaves = true;
    let injected = 0;
    await page.route("**/api/canvas-projects/*/document-commit", async route => {
        const body = route.request().postDataJSON();
        if (failSaves && body.params.canvasId === canvasId) {
            injected++;
            await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: 500, msg: "MVP 验收：模拟保存失败", reason: "save_failed" }) });
        } else await route.continue();
    });
    const recoveredText = "离线修改仍需保留\n下一镜：清晨车站";
    await page.getByRole("button", { name: "编辑笔记", exact: true }).click();
    await editor.fill(recoveredText);
    await editor.press("Escape");
    await page.getByRole("button", { name: "画布保存状态：保存失败 · 待重试", exact: true }).waitFor();
    assert.ok(injected > 0);
    assert.notEqual((await api(`/canvas-projects/${canvasId}`)).project.nodes[0].metadata.content, recoveredText);
    await poll(async () => (await draftsFor(canvasId)).some(draft => draft.project.nodes[0]?.metadata?.content === recoveredText), "durable failure draft");
    await page.screenshot({ path: resolve(evidence, "save-failure.png") });
    await page.reload({ waitUntil: "networkidle" });
    await closeAssistant();
    assert.match(await note.innerText(), /下一镜：清晨车站/);
    await page.getByRole("button", { name: "画布保存状态：保存失败 · 待重试", exact: true }).waitFor();
    failSaves = false;
    await page.getByRole("button", { name: "画布保存状态：保存失败 · 待重试", exact: true }).click();
    await page.getByRole("button", { name: "重试保存", exact: true }).click();
    await saved();
    assert.equal((await api(`/canvas-projects/${canvasId}`)).project.nodes[0].metadata.content, recoveredText);
    await page.mouse.click(1500, 750);
    passed("后端故障明确显示失败、独立草稿落盘、刷新恢复、重试收到真实保存回执");

    for (const [label, file] of [["浅色", "canvas-light.png"], ["深色", "canvas-dark.png"]]) {
        await page.getByRole("button", { name: "画布外观", exact: true }).click();
        const choice = page.getByRole("button", { name: `切换到${label}主题`, exact: true });
        await choice.click();
        assert.equal(await choice.getAttribute("aria-pressed"), "true");
        await page.mouse.click(1500, 750);
        await page.screenshot({ path: resolve(evidence, file) });
    }
    await page.getByRole("button", { name: "隐藏节点连线", exact: true }).click();
    await page.getByRole("button", { name: "显示节点连线", exact: true }).click();
    await page.getByRole("button", { name: "切换小地图", exact: true }).click();
    await page.getByRole("button", { name: "适合屏幕", exact: true }).click();
    passed("工具栏连线开关、小地图、适合屏幕及明暗主题");

    await page.goto(`${base}/skills`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "技能库", exact: true }).waitFor();
    const skillFilesBefore = await countFiles(localSkillPackages);
    assert.ok(skillFilesBefore > 0, "local skill package files should remain available");
    await page.getByText("技能广场还是空的", { exact: true }).waitFor();
    assert.equal(await page.locator(".skill-card-title-button").count(), 0, "legacy public showcase should stay empty");
    await page.getByRole("tab", { name: /我的技能/ }).click();
    await page.getByText("这里还没有技能", { exact: true }).waitFor();
    await page.getByRole("tab", { name: /我创建的/ }).click();
    await page.getByText("还没有创建技能", { exact: true }).waitFor();
    await page.getByRole("tab", { name: /我的收藏/ }).click();
    await page.getByText("这里还没有技能", { exact: true }).waitFor();
    await page.getByRole("tab", { name: /技能广场/ }).click();
    await page.getByText("技能广场还是空的", { exact: true }).waitFor();
    assert.equal(await countFiles(localSkillPackages), skillFilesBefore, "local skill package files must not be removed");
    await page.screenshot({ path: resolve(evidence, "skill-library-empty.png") });
    passed(`技能入口和范围切换可用，旧广场为空，本地技能包文件保留 (${skillFilesBefore})`);

    const edgeId = `web-mvp-routing-${Date.now()}`;
    report.canvasIds.push(edgeId);
    const date = new Date().toISOString();
    const node = (id, x, y, content) => ({ id, type: "note", title: id, position: { x, y }, width: 240, height: 180, metadata: { content, note: { tone: "amber" } } });
    await api(`/canvas-projects/${edgeId}`, { project: {
        id: edgeId, revision: 0, title: "Web MVP · 连线避障验收", createdAt: date, updatedAt: date,
        nodes: [node("source", 100, 230, "起点"), { ...node("target", 880, 230, ""), type: "image" }, node("obstacle", 480, 550, "拖动此便签，连线即时绕行")],
        connections: [{ id: "mvp-edge", fromNodeId: "source", toNodeId: "target" }], viewport: { x: 0, y: 0, k: 1 },
    } });
    await page.goto(`${base}/canvas/${edgeId}`, { waitUntil: "networkidle" });
    await closeAssistant();
    const path = page.locator('[data-connection-id="mvp-edge"]');
    // A horizontal SVG path has a zero-height bounding box but is rendered.
    await path.waitFor({ state: "attached" });
    const baseline = await path.getAttribute("d");
    const obstacle = page.locator('[data-node-id="obstacle"]');
    const box = await obstacle.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + 50, box.y + 110);
    await page.mouse.down();
    await page.mouse.move(box.x + 50, box.y - 190, { steps: 15 });
    await poll(async () => await path.getAttribute("d") !== baseline, "unrelated obstacle preview reroutes edge");
    await page.mouse.move(box.x + 50, box.y + 110, { steps: 15 });
    await poll(async () => await path.getAttribute("d") === baseline, "obstacle moved away restores route");
    await page.mouse.move(box.x + 50, box.y - 190, { steps: 15 });
    await page.mouse.up();
    const detour = await path.getAttribute("d");
    assert.notEqual(detour, baseline);
    const intersections = await path.evaluate(element => {
        const obstacle = document.querySelector('[data-node-id="obstacle"]').getBoundingClientRect();
        const matrix = element.getScreenCTM();
        const length = element.getTotalLength();
        let hits = 0;
        for (let n = 0; n <= length; n += 2) {
            const p = element.getPointAtLength(n).matrixTransform(matrix);
            if (p.x > obstacle.left && p.x < obstacle.right && p.y > obstacle.top && p.y < obstacle.bottom) hits++;
        }
        return hits;
    });
    assert.equal(intersections, 0, "wire must avoid obstacle");
    await saved();
    await page.screenshot({ path: resolve(evidence, "routing-detour.png") });
    await page.reload({ waitUntil: "networkidle" });
    await closeAssistant();
    assert.equal(await path.getAttribute("d"), detour);
    passed("真实拖动非端点障碍即时绕线、移出恢复、松手持久化及刷新走线一致");
    assert.deepEqual(errors, []);
    report.completedAt = new Date().toISOString();
} catch (error) {
    report.failure = String(error.stack || error);
    await page.screenshot({ path: resolve(evidence, "failure.png") }).catch(() => {});
    console.error(report.failure);
    console.error((await page.locator("body").innerText()).slice(0, 6000));
    process.exitCode = 1;
} finally {
    await writeFile(resolve(evidence, "report.json"), JSON.stringify(report, null, 2));
    await browser.close();
}
