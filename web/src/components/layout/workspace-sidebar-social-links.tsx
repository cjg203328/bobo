import { Tooltip } from "antd";
import { BookOpen, Globe } from "lucide-react";
import Github from "@lobehub/icons/es/Github";
import { getDesktopAppBinding } from "@/services/desktop-runtime";

const BOBO_REPOSITORY = "https://github.com/cjg203328/bobo";

export function WorkspaceSidebarSocialLinks() {
    const openGitHub = async (event: React.MouseEvent<HTMLAnchorElement>) => {
        // The generated Wails binding keeps its legacy name for installed
        // clients; the destination is the current Bobo project.
        const openInBrowser = getDesktopAppBinding()?.OpenHuabuGitHub;
        if (!openInBrowser) return;
        event.preventDefault();
        await openInBrowser();
    };

    return (
        <div className="app-workspace-social-links">
            <a className="app-workspace-social-action" href={`${BOBO_REPOSITORY}#readme`} target="_blank" rel="noopener noreferrer" aria-label="打开波波 AI 画布项目主页" title="项目主页">
                <Globe aria-hidden="true" />
            </a>
            <Tooltip
                placement="top"
                trigger={["hover", "focus"]}
                mouseEnterDelay={0.15}
                mouseLeaveDelay={0.1}
                rootClassName="app-workspace-github-tooltip"
                title="在 GitHub 查看波波 AI 画布"
            >
                <a className="app-workspace-social-action" href={BOBO_REPOSITORY} target="_blank" rel="noopener noreferrer" aria-label="打开波波 AI 画布 GitHub 仓库" onClick={openGitHub}>
                    <Github aria-hidden="true" />
                </a>
            </Tooltip>
            <a className="app-workspace-social-action" href={`${BOBO_REPOSITORY}/blob/main/docs/product/bobo-ai-canvas-prd.md`} target="_blank" rel="noopener noreferrer" aria-label="查看波波 AI 画布产品文档" title="产品文档">
                <BookOpen aria-hidden="true" />
            </a>
        </div>
    );
}
