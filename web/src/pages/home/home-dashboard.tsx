import { ArrowRight, ArrowUpRight, Clapperboard, Image, ImagePlus, Package, Plus, RefreshCw, ScanSearch, Sparkles, WandSparkles } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { CanvasLibrarySummary } from "@/services/api/workspace-data";
import { ProjectPreview } from "@/components/canvas/canvas-project-card";
import type { WorkspaceModule } from "@/lib/workspace-modules";
import { assistantCreationDraft, ASSISTANT_AGENT_ACTIONS, ASSISTANT_WORKFLOW_TEMPLATES, type AssistantAgentActionId, type AssistantCreationKind, type AssistantWorkflowId } from "@/lib/agent/assistant-workflows";
import { createAssistantDraftHandoff } from "@/services/assistant-draft-handoff";

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

function agentActionDraft(current: string, actionId: AssistantAgentActionId) {
    const action = ASSISTANT_AGENT_ACTIONS.find(item => item.id === actionId);
    if (!action) return current;
    const existing = current.trimEnd();
    return existing ? `${existing}\n\n${action.prompt}` : action.prompt;
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
    const [handoffError, setHandoffError] = useState("");
    const [startingTask, setStartingTask] = useState(false);

    const startTask = () => {
        const text = task.trim();
        if (!text || startingTask) return;
        setStartingTask(true);
        const handoffId = createAssistantDraftHandoff(text);
        if (!handoffId) {
            setHandoffError("任务没有带入画布，请重试。");
            setStartingTask(false);
            return;
        }
        setHandoffError("");
        navigate(`/canvas?mode=new&start=agent&assistantDraft=${encodeURIComponent(handoffId)}`);
    };

    const startDirectCreation = (kind: AssistantCreationKind) => {
        setTask(current => assistantCreationDraft(current, kind));
        setSelectedWorkflow(null);
        setHandoffError("");
    };

    const startAgentAction = (actionId: AssistantAgentActionId) => {
        setTask(current => agentActionDraft(current, actionId));
        setSelectedWorkflow(null);
        setHandoffError("");
    };

    return (
        <main className="huabu-home" aria-label="波波 AI 画工作台">
            <header className="huabu-home-header">
                <div className="huabu-home-heading"><span>波波 AI 画</span><h1>工作台</h1></div>
                <Link className="huabu-home-secondary-action" to="/canvas?mode=new"><Plus aria-hidden="true" />空白画布</Link>
            </header>

            <section className="huabu-agent-launcher" aria-labelledby="huabu-agent-title">
                <div className="huabu-agent-heading">
                    <div className="huabu-agent-heading-meta"><span className="huabu-home-eyebrow">波波创作 Agent</span><span className="huabu-agent-state"><i aria-hidden="true" />先聊清楚，再开始生成</span></div>
                    <h2 id="huabu-agent-title">这次要完成什么？</h2>
                    <p>从一句话、参考图或已有提示词开始，Agent 会把想法整理成可检查的画布方案。</p>
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
                        {handoffError ? <span className="huabu-agent-error" role="alert">{handoffError}</span> : null}
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
                <div className="huabu-agent-tools" aria-label="Agent 专项能力">
                    <div className="huabu-agent-tools-heading"><span>常用能力</span><small>结果会作为可编辑草稿带入画布</small></div>
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
                <div className="huabu-agent-workflows" aria-label="创作场景">
                    {ASSISTANT_WORKFLOW_TEMPLATES.map((workflow) => {
                        const Icon = WORKFLOW_ICONS[workflow.id];
                        return (
                            <button
                                key={workflow.id}
                                type="button"
                                className="huabu-agent-workflow"
                                data-workflow={workflow.id}
                                aria-pressed={selectedWorkflow === workflow.id}
                                onClick={() => { setTask(workflow.homePrompt); setSelectedWorkflow(workflow.id); setHandoffError(""); }}
                            >
                                <Icon aria-hidden="true" />
                                <span><strong>{workflow.title}</strong><small>{workflow.summary}</small></span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <section className="huabu-home-section huabu-modules" aria-labelledby="huabu-modules-title">
                <header className="huabu-section-heading"><h2 id="huabu-modules-title">模块</h2></header>
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
                                <span className="huabu-recent-preview"><ProjectPreview project={{ id: project.id, nodes: project.previewNodes }} emptyVariant="libtv" /></span>
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
