import { ArrowUpRight, LoaderCircle, LogOut, Settings } from "lucide-react";
import { App } from "antd";
import { useState } from "react";
import { Link } from "react-router";
import { useUserStore } from "@/stores/use-user-store";
import { isLocalWorkspaceMode } from "@/services/workspace-mode";
import { logoutRemoteAccount } from "@/services/api/auth";
import { UserAvatar } from "./user-avatar";
import "./workspace-account-card.css";

export function WorkspaceAccountCard({ onNavigate }: { onNavigate: () => void }) {
    const user = useUserStore((state) => state.user);
    const storageMode = useUserStore((state) => state.storageMode);
    const { message } = App.useApp();
    const [loggingOut, setLoggingOut] = useState(false);
    if (!user) return null;
    const localMode = isLocalWorkspaceMode() || storageMode === "local" || user.username === "local";
    const logout = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        try {
            await logoutRemoteAccount();
            onNavigate();
            window.location.reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "退出登录失败，请重试");
            setLoggingOut(false);
        }
    };
    return <section className="workspace-account-card" aria-label="我的账户">
        <header className="workspace-account-card-identity">
            <UserAvatar user={user} className="workspace-account-card-avatar" />
            <div><strong>{user.displayName || user.username}</strong><span>{user.email || `@${user.username}`}</span></div>
            <em>{user.role === "admin" ? "管理员" : "创作者"}</em>
        </header>
        <nav className="workspace-account-card-actions" aria-label="账户操作">
            <Link to="/settings" onClick={onNavigate}><Settings /><span>设置</span><ArrowUpRight /></Link>
            {!localMode ? <button type="button" onClick={() => void logout()} disabled={loggingOut} aria-busy={loggingOut}>
                {loggingOut ? <LoaderCircle className="animate-spin" /> : <LogOut />}<span>{loggingOut ? "正在退出" : "退出登录"}</span>
            </button> : null}
        </nav>
    </section>;
}
