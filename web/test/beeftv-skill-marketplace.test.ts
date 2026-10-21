import { describe, expect, test } from "bun:test";

async function source(path: string) {
    return Bun.file(new URL(path, import.meta.url)).text();
}

/**
 * 技能市场的可达性分级。
 *
 * 上游按“公共工作区未完成”把 /skill 与 /skills 重定向回首页；但本仓库是本地优先
 * 工作区，`isLocalWorkspaceMode()` 恒为 true，"公共工作区分支"已不存在——上游的
 * 隐藏理由失去保护对象，因此技能库在本地可用（本次浏览器实测：/skills 渲染技能广场，
 * 33 个内置技能分「短剧影视 / 电商营销」等分组，零应用错误）。
 *
 * 若将来恢复 hosted/public 工作区，下面的前提守卫会失败，届时需按 workspace mode
 * 重新分级这两个入口，而不是直接放开。
 */
describe("skill marketplace entrypoints", () => {
    test("前提：本地优先工作区契约成立（isLocalWorkspaceMode 恒为 true）", async () => {
        const mode = await source("../src/services/workspace-mode.ts");
        expect(mode).toMatch(/export function isLocalWorkspaceMode\(\)\s*\{\s*return true;\s*\}/);
    });

    test("技能库路由渲染 SkillsPage，不再重定向回首页", async () => {
        const router = await source("../src/router.tsx");
        expect(router).toContain("SkillsPage");
        expect(router).not.toContain('{ path: "/skills", element: <Navigate to="/" replace /> }');
        expect(router).not.toContain('{ path: "/skill", element: <Navigate to="/" replace /> }');
    });

    test("旧单数别名 /skill 收敛到 /skills，而不是首页", async () => {
        const router = await source("../src/router.tsx");
        expect(router).toContain('{ path: "/skill", element: <Navigate to="/skills" replace /> }');
    });

    test("技能橱窗页 /skills/reference 保持可达", async () => {
        const router = await source("../src/router.tsx");
        expect(router).toContain("SkillsReferencePage");
        expect(router).not.toContain('{ path: "/skills/reference", element: <Navigate to="/" replace /> }');
    });

    test("侧栏提供技能库入口并指向 /skills", async () => {
        const sidebar = await source("../src/components/layout/workspace-sidebar-nav.tsx");
        const modules = await source("../src/lib/workspace-modules.ts");
        expect(sidebar).toContain("availableWorkspaceModules");
        expect(modules).toContain('id: "skills"');
        expect(modules).toContain('to: "/skills"');
    });
});
