import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";

const globalsCss = await Bun.file(new URL("../src/styles/globals.css", import.meta.url)).text();
const workspaceCss = await Bun.file(new URL("../src/styles/workspace-product.css", import.meta.url)).text();
const homeCss = await Bun.file(new URL("../src/pages/home/home-platform.css", import.meta.url)).text();

let browser: Browser;
let page: Page;

beforeAll(async () => {
    const executablePath = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((path): path is string => Boolean(path && existsSync(path)));
    browser = await chromium.launch({ headless: true, executablePath });
    page = await browser.newPage();
}, 30_000);

afterAll(async () => {
    await browser?.close();
}, 30_000);

async function readPalette({ dark, home, width = 1440 }: { dark: boolean; home: boolean; width?: number }) {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`
        <html class="${dark ? "dark" : ""}"><head><style>${globalsCss}\n${workspaceCss}\n${homeCss}</style></head>
        <body><div class="app-user-workspace app-product-workspace ${home ? "app-home-route" : ""}">
            <div class="app-workspace-shell">
                <aside class="app-workspace-sidebar"><div class="app-workspace-sidebar-nav"></div><div class="app-workspace-sidebar-footer"></div></aside>
                <div class="app-workspace-stage"><main class="huabu-home">
                    <section class="huabu-agent-launcher"><h2>这次要完成什么？</h2><textarea></textarea><div class="huabu-agent-quick-actions">
                        <button class="huabu-agent-quick-action">直接生图</button><button class="huabu-agent-quick-action">直接生视频</button>
                    </div><div class="huabu-agent-workflows">
                        <button class="huabu-agent-workflow">商品宣传套图</button><button class="huabu-agent-workflow">社媒图文内容</button><button class="huabu-agent-workflow">短视频素材方案</button>
                    </div></section>
                    <a class="huabu-module-link" data-module="canvas"><span class="huabu-module-icon"></span>画布</a>
                    <a class="huabu-recent-card"><span class="huabu-recent-preview"></span><span class="huabu-recent-copy">项目</span></a>
                    <div class="project-library-card"></div><div class="libtv-create-project-card"></div><div class="libtv-folder-card-cover"></div>
                    <div class="assets-library-page"><div class="canvas-library-frame"></div><div class="workspace-expandable-search-input"></div></div>
                    <div class="settings-page"><div class="settings-library-frame"><div class="settings-channel"></div></div></div>
                </main></div>
            </div>
        </div></body></html>
    `);
    return page.evaluate(() => {
        const background = (selector: string) => getComputedStyle(document.querySelector(selector)!).backgroundColor;
        return {
            stage: background(".app-workspace-stage"),
            sidebar: background(".app-workspace-sidebar"),
            sidebarNav: background(".app-workspace-sidebar-nav"),
            sidebarFooter: background(".app-workspace-sidebar-footer"),
            launcher: background(".huabu-agent-launcher"),
            launcherText: getComputedStyle(document.querySelector(".huabu-agent-launcher h2")!).color,
            launcherBackdrop: getComputedStyle(document.querySelector(".huabu-agent-launcher")!).backdropFilter,
            workflowBoxes: [...document.querySelectorAll(".huabu-agent-workflow")].map(element => {
                const rect = element.getBoundingClientRect();
                return { x: rect.x, right: rect.right, width: rect.width };
            }),
            quickActionBoxes: [...document.querySelectorAll(".huabu-agent-quick-action")].map(element => {
                const rect = element.getBoundingClientRect();
                return { x: rect.x, right: rect.right, width: rect.width };
            }),
            viewportWidth: window.innerWidth,
            module: background(".huabu-module-link"),
            recent: background(".huabu-recent-card"),
            projectCard: background(".project-library-card"),
            projectCreateCard: background(".libtv-create-project-card"),
            assetFrame: background(".assets-library-page .canvas-library-frame"),
            modelFrame: background(".settings-library-frame"),
            modelChannel: background(".settings-channel"),
        };
    });
}

test("Bobo workspace keeps its Agent intake, modules and projects legible in both themes", async () => {
    for (const width of [1440, 840, 390]) {
        const dark = await readPalette({ dark: true, home: true, width });
        expect(dark.launcher).not.toBe("rgba(0, 0, 0, 0)");
        expect(dark.launcher).not.toBe("rgb(23, 61, 59)");
        expect(dark.launcherText).not.toBe(dark.launcher);
        expect(dark.launcherBackdrop).not.toBe("none");
        expect(dark.workflowBoxes).toHaveLength(3);
        expect(dark.workflowBoxes.every(box => box.width > 0 && box.x >= 0 && box.right <= dark.viewportWidth)).toBe(true);
        expect(dark.quickActionBoxes).toHaveLength(2);
        expect(dark.quickActionBoxes.every(box => box.width > 0 && box.x >= 0 && box.right <= dark.viewportWidth)).toBe(true);
        expect(dark.module).toBe(dark.sidebarNav);
        expect(dark.recent).toBe(dark.sidebarNav);
        expect(dark.stage).not.toBe(dark.launcher);

        const light = await readPalette({ dark: false, home: true, width });
        expect(light.stage).toBe("rgb(248, 248, 250)");
        expect(light.launcher).not.toBe("rgba(0, 0, 0, 0)");
        expect(light.launcherText).not.toBe(light.launcher);
        expect(light.launcherBackdrop).not.toBe("none");
        expect(light.workflowBoxes.every(box => box.width > 0 && box.x >= 0 && box.right <= light.viewportWidth)).toBe(true);
        expect(light.quickActionBoxes.every(box => box.width > 0 && box.x >= 0 && box.right <= light.viewportWidth)).toBe(true);
        expect(light.module).toBe("rgb(255, 255, 255)");
    }
});

test("dark project folder and asset search do not keep the brighter gray fills", async () => {
    await readPalette({ dark: true, home: false });
    const colors = await page.evaluate(() => ({
        folder: getComputedStyle(document.querySelector(".libtv-folder-card-cover")!).backgroundImage,
        search: getComputedStyle(document.querySelector(".workspace-expandable-search-input")!).backgroundColor,
    }));
    const folderTop = colors.folder.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(folderTop).not.toBeNull();
    expect(Number(folderTop![1])).toBeLessThanOrEqual(48);
    expect(colors.search).toBe("rgb(32, 32, 32)");
});
