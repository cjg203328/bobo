import { isLocalWorkspaceMode } from "@/services/workspace-mode";
import { createLocalCanvasProject, deleteLocalCanvasProjects } from "@/services/local-workspace-repository";
import { createCanvasProjectWithRemoteSync, deleteCanvasProjectsWithRemoteSync } from "@/services/local-workspace-sync";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";

type InitialCanvasContent = Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId">>;

/**
 * Single project-storage boundary for workspace UI code.
 * Local mode writes only to the local repository; hosted mode keeps the
 * existing remote-sync implementation and its retry semantics.
 */
export async function createWorkspaceCanvasProject(title: string, projectId?: string, initialContent?: InitialCanvasContent, workspaceProjectId?: string) {
    if (isLocalWorkspaceMode()) {
        const local = await createLocalCanvasProject(title, projectId, initialContent, workspaceProjectId);
        return { ...local, syncError: undefined as undefined };
    }
    return createCanvasProjectWithRemoteSync(title, projectId, initialContent, workspaceProjectId);
}

export async function deleteWorkspaceCanvasProjects(ids: readonly string[]) {
    if (isLocalWorkspaceMode()) return deleteLocalCanvasProjects(ids);
    return deleteCanvasProjectsWithRemoteSync([...ids]);
}
