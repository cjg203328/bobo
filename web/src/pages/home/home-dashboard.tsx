import { ArrowRight, Plus, RefreshCw } from "lucide-react";
import { Link, useNavigate } from "react-router";
import type { CanvasLibrarySummary } from "@/services/api/workspace-data";
import { ProjectPreview } from "@/components/canvas/canvas-project-card";
import { huabuCapabilityItems } from "./home-data";
function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "刚刚更新";
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replaceAll("/", "-");
}

export function HomeDashboard({ projects, loading, error, onRetry }: { projects: CanvasLibrarySummary[]; loading: boolean; error: boolean; onRetry: () => void }) {
    const navigate = useNavigate();
    return (
        <main className="huabu-home" aria-label="Huabu 首页">
            <section className="huabu-home-hero" aria-label="新建画布">
                <span className="huabu-home-dot-base" aria-hidden />
                <span className="huabu-home-dot-flow" aria-hidden />
                <span className="huabu-home-dot-flow huabu-home-dot-flow-delay" aria-hidden />
                <button type="button" className="huabu-home-create" onClick={() => navigate("/canvas?mode=new")}>
                    <span className="huabu-home-create-icon"><Plus /></span>
                    <span className="huabu-home-create-title">新建画布创作</span>
                </button>
            </section>

            <nav className="huabu-capabilities" aria-label="创作能力">
                {huabuCapabilityItems.map(({ id, label, detail, to, icon: Icon, disabled }) => (
                    disabled ? (
                        <span key={id} className="huabu-capability is-disabled" aria-disabled="true" title={`${label}：${detail}`}>
                            <span className="huabu-capability-icon"><Icon /></span>
                            <strong>{label}</strong>
                        </span>
                    ) : (
                        <Link key={id} to={to} className="huabu-capability" title={detail}>
                            <span className="huabu-capability-icon"><Icon /></span>
                            <strong>{label}</strong>
                        </Link>
                    )
                ))}
            </nav>

            <section className="huabu-home-section huabu-recents">
                <header className="huabu-section-heading"><h2>最近项目</h2><Link to="/project">查看全部 <ArrowRight /></Link></header>
                {error ? (
                    <button className="huabu-home-error" type="button" onClick={onRetry}><RefreshCw />画布读取失败，点击重试</button>
                ) : (
                    <div className="huabu-recent-grid">
                        {loading ? Array.from({ length: 4 }, (_, index) => <div className="huabu-recent-card is-loading" key={index} />) : projects.length ? projects.map((project) => {
                            return <Link to={`/canvas/${project.id}`} className="huabu-recent-card" key={project.id}>
                                <span className="huabu-recent-preview"><ProjectPreview project={{ id: project.id, nodes: project.previewNodes }} emptyVariant="libtv" /></span>
                                <span className="huabu-recent-copy"><strong>{project.title || "未命名"}</strong><small>{formatDate(project.updatedAt)}</small></span>
                                <ArrowRight className="huabu-recent-arrow" />
                            </Link>;
                        }) : <button type="button" className="huabu-recent-card is-empty" onClick={() => navigate("/canvas?mode=new")}><span className="huabu-recent-preview"><Plus /></span><span className="huabu-recent-copy"><strong>创建第一个画布</strong><small>让灵感有一个开始的地方</small></span></button>}
                    </div>
                )}
            </section>
        </main>
    );
}
