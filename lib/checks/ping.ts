import { execFile } from "node:child_process";

/**
 * ICMP ping via the OS `ping` binary, using an argument array (execFile) rather than a
 * shell string, so there is no shell-injection surface regardless of host content.
 */
export function checkPing(host: string, timeoutMs = 2000): Promise<boolean> {
  const isWin = process.platform === "win32";
  const args = isWin
    ? ["-n", "1", "-w", String(timeoutMs), host]
    : ["-c", "1", "-W", String(Math.ceil(timeoutMs / 1000)), host];

  return new Promise((resolve) => {
    execFile("ping", args, { timeout: timeoutMs + 1000 }, (error) => {
      resolve(!error);
    });
  });
}
