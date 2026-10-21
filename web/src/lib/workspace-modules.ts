import { Blocks, Images, LibraryBig, ListTodo, PanelsTopLeft, Plug, Settings2 } from "lucide-react";

export type WorkspaceModule = {
    id: string;
    title: string;
    description: string;
    to: string;
    icon: typeof PanelsTopLeft;
    group: "creation" | "workspace" | "configuration";
    feature?: "taskCenterEnabled" | "pluginCenterEnabled";
    home: boolean;
};

export const workspaceModules: WorkspaceModule[] = [
    { id: "canvas", title: "画布", description: "编排文本、素材与生成节点", to: "/project", icon: PanelsTopLeft, group: "creation", home: true },
    { id: "assets", title: "素材", description: "浏览图片、视频与音频素材", to: "/assets", icon: Images, group: "workspace", home: true },
    { id: "tasks", title: "任务", description: "查看生成进度和失败记录", to: "/tasks", icon: ListTodo, group: "workspace", feature: "taskCenterEnabled", home: true },
    { id: "skills", title: "技能库", description: "管理已安装和自建技能", to: "/skills", icon: LibraryBig, group: "workspace", home: true },
    { id: "settings:channels", title: "模型配置", description: "管理模型渠道与生成参数", to: "/settings?section=channels", icon: Settings2, group: "configuration", home: true },
    { id: "agents", title: "外部助手", description: "连接 Codex、Claude Code 与 Cursor", to: "/agents", icon: Plug, group: "configuration", home: true },
    { id: "plugins", title: "插件中心", description: "查看可用扩展", to: "/plugins", icon: Blocks, group: "configuration", feature: "pluginCenterEnabled", home: false },
];

type WorkspaceModuleFeatures = { taskCenterEnabled: boolean; pluginCenterEnabled: boolean };

export function availableWorkspaceModules(features: WorkspaceModuleFeatures) {
    return workspaceModules.filter((module) => !module.feature || features[module.feature] !== false);
}

export function homeWorkspaceModules(features: WorkspaceModuleFeatures) {
    return availableWorkspaceModules(features).filter((module) => module.home);
}
