import { describe, expect, test } from "bun:test";

async function source(path: string) {
    return Bun.file(new URL(path, import.meta.url)).text();
}

describe("personal skill library entrypoints", () => {
    test("技能库仅展示个人安装和自建范围", async () => {
        const page = await source("../src/pages/skills/index.tsx");
        expect(page).toContain('{ label: "已安装", value: "mine"');
        expect(page).toContain('{ label: "我创建的", value: "created"');
        expect(page).not.toContain('value: "public"');
        expect(page).not.toContain('value: "favorites"');
        expect(page).not.toContain("技能广场");
        expect(page).not.toContain("发布到广场");
    });

    test("旧橱窗路由回到技能库，个人技能入口保持可达", async () => {
        const router = await source("../src/router.tsx");
        expect(router).toContain("SkillsPage");
        expect(router).toContain('{ path: "/skills/reference", element: <Navigate to="/skills" replace /> }');
        expect(router).not.toContain("SkillsReferencePage");
    });

    test("旧单数别名 /skill 收敛到 /skills", async () => {
        const router = await source("../src/router.tsx");
        expect(router).toContain('{ path: "/skill", element: <Navigate to="/skills" replace /> }');
    });

    test("安装和编辑技能始终保持私有，技能包文件仍可安装/同步", async () => {
        const install = await source("../src/pages/skills/skill-install-modal.tsx");
        const editor = await source("../src/pages/skills/skill-editor-drawer.tsx");
        const api = await source("../src/services/api/skills.ts");
        expect(install).toContain("isPrivate: true");
        expect(editor).toContain("isPrivate: true");
        expect(install).not.toContain("is_public");
        expect(editor).not.toContain("is_public");
        expect(editor).toContain('name="markdownUrl"');
        expect(api).toContain("installSkillUpload");
        expect(api).toContain("installGitHubSkill");
        expect(api).toContain("listSkillFiles");
    });

    test("侧栏提供技能库入口并指向 /skills", async () => {
        const sidebar = await source("../src/components/layout/workspace-sidebar-nav.tsx");
        const modules = await source("../src/lib/workspace-modules.ts");
        expect(sidebar).toContain("availableWorkspaceModules");
        expect(modules).toContain('id: "skills"');
        expect(modules).toContain('to: "/skills"');
    });
});
