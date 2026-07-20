import net from "node:net";

/** Raw TCP connect test: up if a connection can be established within the timeout. */
export function checkTcp(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export type TcpFailureReason = "refused" | "timeout" | "dns" | "unreachable" | "other";

/** Same raw TCP connect test as checkTcp, but reports *why* a failed connection
 * failed -- "refused" (something answered and actively rejected the port, i.e. the
 * host is up but nothing's listening there), "timeout" (no response at all within
 * the window, e.g. a firewall silently dropping it), "dns" (the hostname itself
 * didn't resolve), "unreachable" (routing-level rejection), or "other". Useful for
 * ad-hoc diagnostics (see /api/admin/test-network) where "failed" alone doesn't tell
 * you whether to go check the firewall, the service, or your typo. */
export function checkTcpDetailed(host: string, port: number, timeoutMs = 2000): Promise<{ ok: boolean; reason?: TcpFailureReason }> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (result: { ok: boolean; reason?: TcpFailureReason }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, reason: "timeout" }));
    socket.once("error", (err: NodeJS.ErrnoException) => {
      const code = err.code;
      if (code === "ECONNREFUSED") return finish({ ok: false, reason: "refused" });
      if (code === "ENOTFOUND" || code === "EAI_AGAIN") return finish({ ok: false, reason: "dns" });
      if (code === "EHOSTUNREACH" || code === "ENETUNREACH") return finish({ ok: false, reason: "unreachable" });
      finish({ ok: false, reason: "other" });
    });
  });
}
