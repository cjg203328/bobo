import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { availableWorkspaceModules, homeWorkspaceModules, workspaceModules } from "../src/lib/workspace-modules";

const router = readFileSync(new URL("../src/router.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/layout/workspace-sidebar-nav.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../src/pages/home/home-dashboard.tsx", import.meta.url), "utf8");

test("workspace modules point to registered routes and are shared by home and navigation", () => {
    const ids = workspaceModules.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const module of workspaceModules) {
        const route = `/${module.to.split(/[/?]/u).filter(Boolean)[0]}`;
        expect(router).toContain(`path: "${route}"`);
    }

    expect(sidebar).toContain("availableWorkspaceModules(features)");
    expect(home).toContain("modules.map");
    expect(router).toContain('RequireFeature feature="taskCenterEnabled"');
});

test("disabled modules do not appear in either the home directory or sidebar directory", () => {
    const modules = availableWorkspaceModules({ taskCenterEnabled: false, pluginCenterEnabled: false });
    const homeModules = homeWorkspaceModules({ taskCenterEnabled: false, pluginCenterEnabled: false });
    expect(modules.map((module) => module.id)).not.toContain("tasks");
    expect(modules.map((module) => module.id)).not.toContain("plugins");
    expect(homeModules.map((module) => module.id)).not.toContain("tasks");
    expect(homeModules.map((module) => module.id)).not.toContain("plugins");
});

test("initial and canvas brand assets no longer reference the legacy product mark", () => {
    const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const appearance = readFileSync(new URL("../src/stores/use-appearance-store.ts", import.meta.url), "utf8");
    const mark = readFileSync(new URL("../public/bobo-mark.svg", import.meta.url), "utf8");
    const topbar = readFileSync(new URL("../src/pages/canvas/canvas-project-top-bar.tsx", import.meta.url), "utf8");

    expect(index).toContain("/bobo-mark.svg");
    expect(index).not.toContain("beef-logo.png");
    expect(appearance).toContain('logoUrl: "/bobo-mark.svg"');
    expect(appearance).not.toContain("BEEF CREATIVE STUDIO");
    expect(mark).not.toContain("beef-mark.png");
    expect(topbar).not.toContain(">B</span>");
});
