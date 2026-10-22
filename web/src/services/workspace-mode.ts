let capabilitySnapshot: WorkspaceCapabilityContract | null = null;

export type WorkspaceCapabilityContract = {
    contractVersion: number;
    profile: "local" | "remote";
    capabilities: {
        localAssets: boolean;
        providerCalls: boolean;
        auth?: boolean;
        cloudStorage?: boolean;
        remoteSync?: boolean;
    };
};

/** Central runtime boundary shared by local and remote workspace UI. */
export function isLocalWorkspaceMode() {
    if (capabilitySnapshot) return capabilitySnapshot.profile === "local";
    return import.meta.env.VITE_CANVAS_LOCAL_MODE !== "false";
}

/**
 * Single capability projection for UI boundaries. Keep the hosted profile
 * available, but make the local-first contract explicit instead of repeating
 * storageMode/username checks throughout pages.
 */
export type WorkspaceCapabilities = { local: boolean; localAssets: boolean; providerCalls: boolean; auth: boolean; cloudStorage: boolean; remoteSync: boolean };

export function workspaceCapabilities(): WorkspaceCapabilities {
    const local = capabilitySnapshot ? capabilitySnapshot.profile === "local" : import.meta.env.VITE_CANVAS_LOCAL_MODE !== "false";
    return {
        local,
        localAssets: capabilitySnapshot?.capabilities.localAssets ?? local,
        providerCalls: capabilitySnapshot?.capabilities.providerCalls ?? local,
        auth: capabilitySnapshot?.capabilities.auth ?? !local,
        cloudStorage: capabilitySnapshot?.capabilities.cloudStorage ?? !local,
        remoteSync: capabilitySnapshot?.capabilities.remoteSync ?? !local,
    };
}

export function setWorkspaceCapabilitySnapshot(snapshot: WorkspaceCapabilityContract | null) {
    capabilitySnapshot = snapshot;
}

export function resetWorkspaceMode() {
    capabilitySnapshot = null;
}
