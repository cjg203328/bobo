import { useEffect, useRef, useState } from "react";
import { ArrowRight, CircleAlert, Sparkles } from "lucide-react";

import { ApiError } from "@/services/api/request";
import { loginRemoteAccount, registerRemoteAccount } from "@/services/api/auth";
import "./remote-account-gate.css";

type AccountMode = "login" | "register";

export function RemoteAccountGate() {
    const [mode, setMode] = useState<AccountMode>("login");
    const [email, setEmail] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (media.matches && videoRef.current) videoRef.current.pause();
    }, []);

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        if (mode === "register" && password.length < 12) {
            setError("密码至少需要 12 个字符。");
            return;
        }
        setSubmitting(true);
        try {
            if (mode === "register") await registerRemoteAccount(email, displayName, password);
            else await loginRemoteAccount(email, password);
            window.location.reload();
        } catch (reason) {
            setError(reason instanceof ApiError ? reason.message : "暂时无法连接账号服务，请检查网络后重试。");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="remote-account-page">
            <section className="remote-account-visual" aria-label="波波 AI 画布">
                <video ref={videoRef} className="remote-account-film" autoPlay muted loop playsInline poster="/bobo-hero-poster.jpg">
                    <source src="/bobo-hero.mp4" type="video/mp4" />
                </video>
                <div className="remote-account-brand">
                    <span className="remote-account-mark" aria-hidden="true"><Sparkles size={17} strokeWidth={1.8} /></span>
                    <span>波波 AI 画布</span>
                </div>
            </section>
            <section className="remote-account-panel">
                <div className="remote-account-form-shell">
                    <div className="remote-account-switch" role="tablist" aria-label="账号操作">
                        <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "is-active" : ""} onClick={() => { setMode("login"); setError(""); }}>登录</button>
                        <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "is-active" : ""} onClick={() => { setMode("register"); setError(""); }}>创建账号</button>
                    </div>
                    <header className="remote-account-heading">
                        <p className="remote-account-eyebrow">BOBO AI CANVAS</p>
                        <h1>{mode === "login" ? "欢迎回来" : "创建你的账号"}</h1>
                        <p>{mode === "login" ? "登录后继续你的画布。" : "你的项目和素材将保存在云端。"}</p>
                    </header>
                    <form className="remote-account-form" onSubmit={submit}>
                        {mode === "register" && (
                            <label>
                                <span>称呼</span>
                                <input autoComplete="name" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
                            </label>
                        )}
                        <label>
                            <span>邮箱</span>
                            <input type="email" autoComplete="email" maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} required />
                        </label>
                        <label>
                            <span>密码</span>
                            <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 12 : undefined} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} required />
                        </label>
                        {error && <p className="remote-account-error" role="alert"><CircleAlert size={16} />{error}</p>}
                        <button className="remote-account-submit" type="submit" disabled={submitting}>
                            <span>{submitting ? "正在连接…" : mode === "login" ? "登录" : "创建账号"}</span>
                            {!submitting && <ArrowRight size={17} aria-hidden="true" />}
                        </button>
                    </form>
                    <p className="remote-account-footnote">登录即表示你同意将项目与素材保存到你的云端空间。</p>
                </div>
            </section>
        </main>
    );
}
