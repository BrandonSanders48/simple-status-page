"use client";

import { useCallback, useEffect, useState } from "react";

export interface SessionState {
  authenticated: boolean;
  authRequired: boolean;
  csrfToken: string;
}

export function useSession() {
  const [session, setSession] = useState<SessionState | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/auth/session");
    const data = (await res.json()) as SessionState;
    setSession(data);
    return data;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (username: string, password: string) => {
      const csrfToken = session?.csrfToken ?? (await refresh()).csrfToken;
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed.");
      await refresh();
    },
    [session, refresh]
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await refresh();
  }, [refresh]);

  return { session, refresh, login, logout };
}
