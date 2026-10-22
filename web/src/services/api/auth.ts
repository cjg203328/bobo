import type { LocalUser } from "@/stores/use-user-store";
import { http } from "@/services/api/request";
import { setRemoteCSRFToken } from "@/services/api/request";

export type RemoteAuthSession = {
    authenticated: boolean;
    user: LocalUser | null;
    csrfToken?: string;
};

export async function getRemoteAuthSession() {
    const session = await http.get<RemoteAuthSession>("/auth/session");
    setRemoteCSRFToken(session.csrfToken);
    return session;
}

export async function loginRemoteAccount(email: string, password: string) {
    const session = await http.post<{ user: LocalUser; csrfToken: string }>("/auth/login", { email, password });
    setRemoteCSRFToken(session.csrfToken);
    return session.user;
}

export async function registerRemoteAccount(email: string, displayName: string, password: string) {
    const session = await http.post<{ user: LocalUser; csrfToken: string }>("/auth/register", { email, displayName, password });
    setRemoteCSRFToken(session.csrfToken);
    return session.user;
}

export async function logoutRemoteAccount() {
    await http.post<{ ok: boolean }>("/auth/logout");
    setRemoteCSRFToken(undefined);
}
