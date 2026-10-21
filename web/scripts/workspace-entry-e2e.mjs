import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const base = process.env.HUABU_ENTRY_E2E_URL || "http://localhost:1010";
const evidence = resolve(import.meta.dirname, "../../.local/huabu-platform-evidence");
await mkdir(evidence, { recursive: true });

const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
const pageErrors = [];
const legacyBrandRequests = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("request", (request) => {
    if (/beef-logo|beef-mark/i.test(request.url())) legacyBrandRequests.push(request.url());
});

try {
    const response = await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
    assert.equal(response?.ok(), true);
    await page.locator(".huabu-home").waitFor();
    const dismissGuide = page.locator(".first-creation-actions button").first();
    if (await dismissGuide.count()) {
        await dismissGuide.click();
        await page.locator(".first-creation-actions").waitFor({ state: "detached" });
    }

    const brand = await page.evaluate(() => ({
        title: document.title,
        favicon: document.querySelector('link[rel~="icon"]')?.getAttribute("href"),
        logo: document.querySelector(".app-workspace-brand-mark img")?.getAttribute("src"),
        moduleCount: document.querySelectorAll(".huabu-module-link").length,
    }));
    assert.match(brand.title, /波波 AI 画/);
    assert.equal(brand.favicon, "/bobo-mark.svg");
    assert.equal(brand.logo, "/bobo-mark.svg");
    assert.ok(brand.moduleCount >= 5);
    await page.screenshot({ path: resolve(evidence, "workspace-home-desktop.png"), fullPage: true });

    await page.getByRole("button", { name: /直接生图/ }).click();
    const taskInput = page.locator("#huabu-agent-task");
    assert.match(await taskInput.inputValue(), /参考素材/);
    await page.getByRole("button", { name: /直接生视频/ }).click();
    const videoTask = await taskInput.inputValue();
    assert.match(videoTask, /镜头运动/);
    assert.match(videoTask, /参考素材/);
    await page.getByRole("button", { name: /反推图片提示词/ }).click();
    const reversePromptTask = await taskInput.inputValue();
    assert.match(reversePromptTask, /反推提示词/);
    assert.match(reversePromptTask, /不生成图片/);

    await page.getByRole("link", { name: "任务", exact: true }).first().click();
    await page.waitForURL("**/tasks");
    await page.locator(".task-library-page").waitFor();

    await page.goto(`${base}/settings?section=channels`, { waitUntil: "domcontentloaded" });
    await page.locator(".settings-page").waitFor();
    await page.getByRole("heading", { name: "默认模型", exact: true }).waitFor();

    await page.goto(`${base}/agents`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "波波 AI 画 MCP", exact: true }).waitFor();

    await page.goto(`${base}/skills`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "技能库", exact: true }).waitFor();

    await page.getByRole("link", { name: "波波 AI 画首页" }).click();
    await page.locator(".huabu-home").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: resolve(evidence, "workspace-home-mobile.png"), fullPage: true });
    const mobileLayout = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        moduleColumns: getComputedStyle(document.querySelector(".huabu-module-grid")).gridTemplateColumns,
        moduleCount: document.querySelectorAll(".huabu-module-link").length,
        quickActions: [...document.querySelectorAll(".huabu-agent-quick-action")].map((item) => {
            const rect = item.getBoundingClientRect();
            return { left: rect.left, right: rect.right, width: rect.width };
        }),
    }));
    assert.ok(mobileLayout.documentWidth <= mobileLayout.viewportWidth, JSON.stringify(mobileLayout));
    assert.ok(mobileLayout.moduleCount >= 5);
    assert.equal(mobileLayout.quickActions.length, 2);
    assert.ok(mobileLayout.quickActions.every((item) => item.width > 0 && item.left >= 0 && item.right <= mobileLayout.viewportWidth), JSON.stringify(mobileLayout.quickActions));
    assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
    assert.equal(legacyBrandRequests.length, 0, legacyBrandRequests.join("\n"));

    console.log(JSON.stringify({ brand, mobileLayout, pageErrors, legacyBrandRequests }, null, 2));
} finally {
    await browser.close();
}
