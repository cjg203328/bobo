import { ArrowRight, ArrowUpRight, ChevronRight, Clapperboard, Image, ImagePlus, Layers3, Package, Paperclip, Plus, RefreshCw, ScanSearch, Search, Sparkles, WandSparkles } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { CanvasLibrarySummary } from "@/services/api/workspace-data";
import { ProjectPreview } from "@/components/canvas/canvas-project-card";
import type { WorkspaceModule } from "@/lib/workspace-modules";
import { assistantCreationDraft, ASSISTANT_AGENT_ACTIONS, ASSISTANT_WORKFLOW_TEMPLATES, type AssistantAgentActionId, type AssistantCreationKind, type AssistantWorkflowId } from "@/lib/agent/assistant-workflows";
import { createAssistantDraftHandoff } from "@/services/assistant-draft-handoff";
import { createWorkspaceCanvasProject } from "@/services/workspace-project-repository";

const WORKFLOW_ICONS: Record<AssistantWorkflowId, typeof Package> = {
    "product-visual": Package,
    "social-content": Image,
    "short-video": Clapperboard,
};

const AGENT_ACTION_ICONS: Record<AssistantAgentActionId, typeof Sparkles> = {
    "reverse-prompt": ScanSearch,
    "optimize-prompt": WandSparkles,
    "refine-image": Sparkles,
};

const SCENE_FILTERS = [
    { id: "all", label: "全部" },
    { id: "image", label: "图片" },
    { id: "video", label: "视频" },
    { id: "copy", label: "图文" },
] as const;

type SceneFilter = (typeof SCENE_FILTERS)[number]["id"];

function agentActionDraft(current: string, actionId: AssistantAgentActionId) {
    const action = ASSISTANT_AGENT_ACTIONS.find(item => item.id === actionId);
    if (!action) return current;
    const existing = current.trimEnd();
    return existing ? `${existing}\n\n${action.prompt}` : action.prompt;
}

function appendReferenceDraft(current: string) {
    const existing = current.trimEnd();
    return `${existing}${existing ? "\n\n" : ""}参考素材：请在画布中上传并分析我提供的图片或视频。`;
}

function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "刚刚更新";
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replaceAll("/", "-");
}

export function HomeDashboard({ modules, projects, loading, error, onRetry }: { modules: WorkspaceModule[]; projects: CanvasLibrarySummary[]; loading: boolean; error: boolean; onRetry: () => void }) {
    const navigate = useNavigate();
    const [task, setTask] = useState("");
    const [selectedWorkflow, setSelectedWorkflow] = useState<AssistantWorkflowId | null>(null);
    const [sceneFilter, setSceneFilter] = useState<SceneFilter>("all");
    const [handoffError, setHandoffError] = useState("");
    const [startingTask, setStartingTask] = useState(false);

    const launchTask = async (draft: string) => {
        const text = draft.trim();
        if (!text || startingTask) return;
        setStartingTask(true);
        const handoffId = createAssistantDraftHandoff(text);
        if (!handoffId) {
            setHandoffError("任务没有带入画布，请重试。");
            setStartingTask(false);
            return;
        }
        try {
            const { id, syncError } = await createWorkspaceCanvasProject("未命名项目");
            if (syncError) setHandoffError("画布已创建，但云端同步暂未完成；内容会保留在当前浏览器。 ");
            else setHandoffError("");
            navigate(`/canvas/${encodeURIComponent(id)}?mode=new&start=agent&assistantDraft=${encodeURIComponent(handoffId)}`);
        } catch (error) {
            setHandoffError(error instanceof Error ? error.message : "新画布创建失败，请重试。");
            setStartingTask(false);
        }
    };

    const startTask = () => launchTask(task);

    const startDirectCreation = (kind: AssistantCreationKind) => {
        launchTask(assistantCreationDraft(task, kind));
    };

    const startAgentAction = (actionId: AssistantAgentActionId) => {
        launchTask(agentActionDraft(task, actionId));
    };

    const visibleWorkflows = ASSISTANT_WORKFLOW_TEMPLATES.filter((workflow) => {
        if (sceneFilter === "all") return true;
        if (sceneFilter === "video") return workflow.id === "short-video";
        if (sceneFilter === "copy") return workflow.id === "social-content";
        return workflow.id === "product-visual" || workflow.id === "social-content";
    });

    return (
        <main className="huabu-home" aria-label="波波 AI 画布工作台">
            <header className="huabu-home-header">
                <div className="huabu-home-heading"><span>波波 AI 画布 · 创作工作台</span><h1>今天想做什么？</h1></div>
                <div className="huabu-home-header-actions">
                    <Link className="huabu-home-search" to="/skills"><Search aria-hidden="true" /><span>探索内置 Skill</span></Link>
                    <Link className="huabu-home-secondary-action" to="/canvas?mode=new"><Plus aria-hidden="true" />空白画布</Link>
                </div>
            </header>

            <section className="huabu-agent-launcher" aria-labelledby="huabu-agent-title">
                <div className="huabu-agent-launcher-topline"><span className="huabu-agent-launcher-label"><Sparkles aria-hidden="true" />Agent 创作入口</span><span className="huabu-agent-state"><i aria-hidden="true" />在线，可随时接着创作</span></div>
                <div className="huabu-agent-heading">
                    <div className="huabu-agent-heading-meta"><span className="huabu-home-eyebrow">波波创作 Agent</span><span className="huabu-agent-state"><i aria-hidden="true" />先聊清楚，再开始生成</span></div>
                    <h2 id="huabu-agent-title">把一个想法，变成可编辑的画布</h2>
                    <p>描述目标、上传参考或粘贴提示词，Agent 会先梳理方案，再把结果带回画布继续修改。</p>
                </div>
                <form className="huabu-agent-intake" onSubmit={(event) => { event.preventDefault(); startTask(); }}>
                    <label className="sr-only" htmlFor="huabu-agent-task">描述创作任务</label>
                    <textarea
                        id="huabu-agent-task"
                        value={task}
                        onChange={(event) => { setTask(event.target.value); setSelectedWorkflow(null); setHandoffError(""); }}
                        placeholder="例如：为这款咖啡做一套春季新品宣传图"
                        rows={3}
                    />
                    <div className="huabu-agent-intake-footer">
                        <div className="huabu-agent-input-tools">
                            <button type="button" title="添加参考素材" onClick={() => setTask(appendReferenceDraft)}><Paperclip aria-hidden="true" /><span>参考素材</span></button>
                            <Link to="/skills" title="浏览内置 Skill"><Layers3 aria-hidden="true" /><span>内置 Skill</span></Link>
                            {handoffError ? <span className="huabu-agent-error" role="alert">{handoffError}</span> : <small>支持图片、视频、提示词和自然语言描述</small>}
                        </div>
                        <button type="submit" disabled={!task.trim() || startingTask}><ArrowUpRight aria-hidden="true" />开始创作</button>
                    </div>
                </form>
                <div className="huabu-agent-quick-actions" aria-label="直接创作">
                    <button type="button" className="huabu-agent-quick-action" onClick={() => startDirectCreation("image")}>
                        <ImagePlus aria-hidden="true" />
                        <span><strong>直接生图</strong><small>完善提示词并添加参考图</small></span>
                    </button>
                    <button type="button" className="huabu-agent-quick-action" onClick={() => startDirectCreation("video")}>
                        <Clapperboard aria-hidden="true" />
                        <span><strong>直接生视频</strong><small>整理画面、镜头和参考素材</small></span>
                    </button>
                </div>
            </section>

            <section className="huabu-home-section huabu-scenes" aria-labelledby="huabu-scenes-title">
                <header className="huabu-section-heading huabu-section-heading-with-tabs">
                    <div><span className="huabu-section-kicker">从场景开始</span><h2 id="huabu-scenes-title">精选创作场景</h2></div>
                    <nav className="huabu-scene-filters" aria-label="场景筛选">
                        {SCENE_FILTERS.map((filter) => <button key={filter.id} type="button" className={sceneFilter === filter.id ? "is-active" : ""} aria-pressed={sceneFilter === filter.id} onClick={() => setSceneFilter(filter.id)}>{filter.label}</button>)}
                    </nav>
                </header>
                <div className="huabu-agent-workflows" aria-label="创作场景">
                    {visibleWorkflows.map((workflow) => {
                        const Icon = WORKFLOW_ICONS[workflow.id];
                        return (
                            <button
                                key={workflow.id}
                                type="button"
                                className="huabu-agent-workflow"
                                data-workflow={workflow.id}
                                aria-pressed={selectedWorkflow === workflow.id}
                                onClick={() => {
                                    setSelectedWorkflow(workflow.id);
                                    launchTask(workflow.prompt);
                                }}
                            >
                                <span className="huabu-agent-workflow-art"><Icon aria-hidden="true" /><span /></span>
                                <span className="huabu-agent-workflow-copy"><small>波波 Agent 场景</small><strong>{workflow.title}</strong><span>{workflow.summary}</span></span>
                                <ChevronRight aria-hidden="true" />
                            </button>
                        );
                    })}
                </div>
            </section>

            <section className="huabu-home-section huabu-skills" aria-labelledby="huabu-skills-title">
                <header className="huabu-section-heading"><div><span className="huabu-section-kicker">Agent 内置能力</span><h2 id="huabu-skills-title">内置 Skill</h2></div><Link to="/skills">浏览技能库 <ArrowRight aria-hidden="true" /></Link></header>
                <div className="huabu-agent-tools" aria-label="Agent 专项能力">
                    <div className="huabu-agent-tools-heading"><span>从结果继续编辑</span><small>每次调用都会生成可检查的草稿节点</small></div>
                    <div className="huabu-agent-tools-grid">
                        {ASSISTANT_AGENT_ACTIONS.map((action) => {
                            const Icon = AGENT_ACTION_ICONS[action.id];
                            return <button key={action.id} type="button" className="huabu-agent-tool" data-agent-action={action.id} onClick={() => startAgentAction(action.id)}>
                                <span className="huabu-agent-tool-icon"><Icon aria-hidden="true" /></span>
                                <span><strong>{action.title}</strong><small>{action.summary}</small></span>
                                <ArrowRight aria-hidden="true" />
                            </button>;
                        })}
                    </div>
                </div>
            </section>

            <section className="huabu-home-section huabu-modules" aria-labelledby="huabu-modules-title">
                <header className="huabu-section-heading"><div><span className="huabu-section-kicker">工作台</span><h2 id="huabu-modules-title">继续你的创作</h2></div></header>
                <nav className="huabu-module-grid" aria-label="工作台模块">
                    {modules.map(({ id, title, to, icon: Icon }) => (
                        <Link key={id} to={to} className="huabu-module-link" data-module={id}>
                            <span className="huabu-module-icon"><Icon aria-hidden="true" /></span>
                            <span>{title}</span>
                            <ArrowRight className="huabu-module-arrow" aria-hidden="true" />
                        </Link>
                    ))}
                </nav>
            </section>

            <section className="huabu-home-section huabu-recents" aria-labelledby="huabu-recents-title">
                <header className="huabu-section-heading"><h2 id="huabu-recents-title">最近画布</h2><Link to="/project">全部画布 <ArrowRight /></Link></header>
                {error ? (
                    <button className="huabu-home-error" type="button" onClick={onRetry}><RefreshCw aria-hidden="true" />读取失败，点击重试</button>
                ) : (
                    <div className="huabu-recent-grid">
                        {loading ? Array.from({ length: 4 }, (_, index) => <div className="huabu-recent-card is-loading" key={index} />) : projects.length ? projects.map((project) => {
                            return <Link to={`/canvas/${project.id}`} className="huabu-recent-card" key={project.id}>
                                <span className="huabu-recent-preview"><ProjectPreview project={{ id: project.id, nodes: project.previewNodes }} emptyVariant="bobo" /></span>
                                <span className="huabu-recent-copy"><strong>{project.title || "未命名"}</strong><small>{formatDate(project.updatedAt)}</small></span>
                                <ArrowRight className="huabu-recent-arrow" />
                            </Link>;
                        }) : <button type="button" className="huabu-recent-empty" onClick={() => navigate("/canvas?mode=new")}><Plus aria-hidden="true" /><span>创建第一个画布</span></button>}
                    </div>
                )}
            </section>
        </main>
    );
}
