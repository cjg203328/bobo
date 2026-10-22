import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { FullScreenLoader } from "@/components/ui/aceternity/full-screen-loader";
import { WorkspaceErrorState } from "@/components/layout/workspace-state";
import { appPathname } from "@/lib/app-routing";
import { preloadWorkspaceRoute } from "@/lib/workspace-route-modules";
import { applyUserSession, localWorkspaceConfig } from "@/lib/user-session";
import { getWorkspaceBootstrap, type WorkspaceBootstrapPayload } from "@/services/api/workspace";
import { getRemoteAuthSession } from "@/services/api/auth";
import { RemoteAccountGate } from "@/components/workspace/remote-account-gate";
import { commitModelConfig, flushModelConfig, hydrateModelConfig } from "@/services/model-config-repository";
import { normalizeConfigSnapshot, useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function WorkspaceBootstrapHydrator({ children }: { children: ReactNode }) {
    const hydrated = useUserStore((state) => state.hydrated);
    const modelConfigReady = useRef(false);
    const [restoreStatus, setRestoreStatus] = useState<"loading" | "ready" | "error">("loading");
    const [remoteAuthRequired, setRemoteAuthRequired] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const loadWorkspace = () => {
            const bootstrap = import.meta.env.VITE_CANVAS_LOCAL_MODE === "false"
                ? getRemoteAuthSession().then((session) => {
                    if (!session.authenticated) throw new RemoteAccountRequired();
                    return getWorkspaceBootstrap();
                })
                : getWorkspaceBootstrap();
            const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("本地工作区启动超时")), 15_000));
            return Promise.race([bootstrap, timeout]);
        };
        void initializeWorkspaceState({
            loadWorkspace,
            createLocalWorkspace: createLocalWorkspacePayload,
            applySession: applyUserSession,
            restoreModelConfig: import.meta.env.VITE_CANVAS_LOCAL_MODE === "false" ? async () => undefined : hydrateLocalModelConfig,
            allowLocalFallback: import.meta.env.VITE_CANVAS_LOCAL_MODE !== "false",
        })
            .then(() => {
                if (cancelled) return;
                modelConfigReady.current = true;
                setRestoreStatus("ready");
                preloadWorkspaceRoute(appPathname());
            })
            .catch((error) => {
                if (cancelled) return;
                // The browser cache deliberately has no credentials. If the
                // canonical file could not be read, never autosave that cache
                // over the existing workspace when the backend comes back.
                modelConfigReady.current = false;
                useUserStore.getState().setHydrated(true);
                setRemoteAuthRequired(error instanceof RemoteAccountRequired);
                setRestoreStatus("error");
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (import.meta.env.VITE_CANVAS_LOCAL_MODE === "false") return;
        let ready = false;
        const unsubscribe = useConfigStore.subscribe((state) => {
            if (!shouldSaveLocalModelConfig({ subscriptionReady: ready, modelConfigReady: modelConfigReady.current, channelCount: state.config.channels.length })) return;
            void commitModelConfig(state.config);
        });
        const flush = () => { void flushModelConfig(); };
        window.addEventListener("pagehide", flush);
        const markReady = () => { ready = true; };
        if (modelConfigReady.current) markReady();
        else window.setTimeout(markReady, 0);
        return () => {
            unsubscribe();
            window.removeEventListener("pagehide", flush);
            void flushModelConfig();
        };
    }, []);

    if (restoreStatus === "error" && remoteAuthRequired) return <RemoteAccountGate />;
    if (restoreStatus === "error") return <WorkspaceErrorState title="工作区暂时无法加载" description="项目或模型配置未能完成读取。原有配置不会被覆盖，请重新加载后再试。" onRetry={() => window.location.reload()} />;
    return hydrated && restoreStatus === "ready" ? children : <FullScreenLoader label={import.meta.env.VITE_CANVAS_LOCAL_MODE === "false" ? "正在准备云端工作区" : "正在准备本地工作区"} detail="加载项目、画布与模型配置" />;
}

export async function initializeWorkspaceState<T>({
    loadWorkspace,
    createLocalWorkspace,
    applySession,
    restoreModelConfig,
    allowLocalFallback = true,
}: {
    loadWorkspace: () => Promise<T>;
    createLocalWorkspace: () => T;
    applySession: (payload: T) => Promise<void>;
    restoreModelConfig: () => Promise<void>;
    allowLocalFallback?: boolean;
}) {
    try {
        try {
            await applySession(await loadWorkspace());
        } catch (error) {
            if (error instanceof RemoteAccountRequired || !allowLocalFallback) throw error;
            // Keep the desktop usable while the embedded backend is still
            // starting. There is no remote/account fallback in a local build.
            await applySession(createLocalWorkspace());
        }
    } finally {
        // The provider snapshot is an independent, canonical desktop file.
        // Browser persistence may be corrupt or unavailable; that must never
        // prevent configured channels and credentials from being restored.
        await restoreModelConfig();
    }
}

class RemoteAccountRequired extends Error {}

export function shouldSaveLocalModelConfig({ subscriptionReady, modelConfigReady, channelCount }: { subscriptionReady: boolean; modelConfigReady: boolean; channelCount: number }) {
    return subscriptionReady && modelConfigReady && channelCount > 0;
}

async function hydrateLocalModelConfig() {
    const result = await hydrateModelConfig();
    const normalizedConfig = localWorkspaceConfig(normalizeConfigSnapshot({ config: result.config }).config);
    useConfigStore.getState().replaceConfig(normalizedConfig);
    if (shouldPersistHydratedModelConfig(result.health)) await commitModelConfig(normalizedConfig);
}

export function shouldPersistHydratedModelConfig(health: string) {
    return health === "migrated" || health === "recovered";
}

function createLocalWorkspacePayload(): WorkspaceBootstrapPayload {
    return {
        contractVersion: 1,
        profile: "local",
        capabilities: {
            localAssets: true,
            providerCalls: true,
        },
        user: { id: "local", username: "local", displayName: "本地工作区", role: "user", status: "active", createdAt: "", updatedAt: "" },
        workspace: { id: "local", name: "本地工作区", owner: "local", storage: "sqlite" },
        storageMode: "local",
        features: { shortDramaEnabled: true, taskCenterEnabled: true, customChannelsEnabled: true, frontendModelsEnabled: false, pluginCenterEnabled: true, systemPluginsVisibleToUsers: true },
    };
}
