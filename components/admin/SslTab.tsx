"use client";

import { useEffect, useRef, useState } from "react";
import { labelCls } from "./styles";
import { SettingsGroup } from "./SettingsGroup";

interface SslStatus {
  certExists: boolean;
  keyExists: boolean;
  selfSigned: boolean;
}

export default function SslTab({ csrfToken }: { csrfToken: string }) {
  const [status, setStatus] = useState<SslStatus | null>(null);
  const [certStatus, setCertStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [keyStatus, setKeyStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const certInput = useRef<HTMLInputElement>(null);
  const keyInput = useRef<HTMLInputElement>(null);

  function refresh() {
    fetch("/api/admin/ssl-status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }

  useEffect(refresh, []);

  async function upload(type: "cert" | "key", file: File) {
    const setter = type === "cert" ? setCertStatus : setKeyStatus;
    setter(null);
    const formData = new FormData();
    formData.append("type", type);
    formData.append("file", file);
    const res = await fetch("/api/admin/upload/ssl", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      setter({ ok: false, text: data.error || "Upload failed." });
      return;
    }
    const other = type === "cert" ? "private key" : "certificate";
    setter({
      ok: true,
      text: data.hotSwapped
        ? "Uploaded and applied immediately."
        : data.pending
          ? `Uploaded. Waiting for the matching ${other} to apply the pair.`
          : "Uploaded.",
    });
    refresh();
  }

  const ready = !!status?.certExists && !!status?.keyExists && !status?.selfSigned;

  return (
    <div>
      <SettingsGroup title="SSL Certificate" description="Upload your own certificate and private key. Applied automatically once both are present.">
        {status && (
          <div className={`flex items-center gap-2 text-sm ${ready ? "text-emerald-600 dark:text-emerald-400" : "text-amber-500"}`}>
            <i className={`fa-solid ${ready ? "fa-circle-check" : "fa-circle-exclamation"} text-base`} />
            {ready
              ? "Custom certificate uploaded."
              : status.selfSigned || (!status.certExists && !status.keyExists)
                ? "Using self-signed certificate (no custom cert uploaded)."
                : status.certExists
                  ? "Certificate uploaded but private key is missing."
                  : "Private key uploaded but certificate is missing."}
          </div>
        )}

        <div>
          <span className={labelCls}>Certificate (.pem / .crt)</span>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-slate-400 flex-1">
              {status?.certExists ? <span className="text-emerald-600 dark:text-emerald-400">✓ Uploaded</span> : "Not uploaded"}
            </span>
            <button
              type="button"
              onClick={() => certInput.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-600 dark:text-indigo-300 text-xs font-semibold rounded-lg border border-indigo-200 dark:border-indigo-400/40"
            >
              <i className="fa-solid fa-upload text-[11px]" /> Upload
            </button>
            <input
              ref={certInput}
              type="file"
              aria-label="Upload certificate"
              accept=".pem,.crt"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload("cert", e.target.files[0])}
            />
          </div>
          {certStatus && <p className={`text-xs mt-1 ${certStatus.ok ? "text-emerald-600" : "text-red-500"}`}>{certStatus.text}</p>}
        </div>

        <div>
          <span className={labelCls}>Private Key (.pem / .key)</span>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-slate-400 flex-1">
              {status?.keyExists ? <span className="text-emerald-600 dark:text-emerald-400">✓ Uploaded</span> : "Not uploaded"}
            </span>
            <button
              type="button"
              onClick={() => keyInput.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-600 dark:text-indigo-300 text-xs font-semibold rounded-lg border border-indigo-200 dark:border-indigo-400/40"
            >
              <i className="fa-solid fa-upload text-[11px]" /> Upload
            </button>
            <input
              ref={keyInput}
              type="file"
              aria-label="Upload private key"
              accept=".pem,.key"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload("key", e.target.files[0])}
            />
          </div>
          {keyStatus && <p className={`text-xs mt-1 ${keyStatus.ok ? "text-emerald-600" : "text-red-500"}`}>{keyStatus.text}</p>}
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800/70">
          <ol className="space-y-2.5 text-sm text-slate-500 dark:text-slate-400">
            <li className="flex gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/30 text-indigo-600 dark:text-indigo-200 text-xs font-bold flex items-center justify-center">1</span>
              Upload your certificate and private key above.
            </li>
            <li className="flex gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-500/30 text-indigo-600 dark:text-indigo-200 text-xs font-bold flex items-center justify-center">2</span>
              The server validates the pair and applies it to the running HTTPS listener immediately, or on next restart if the server doesn&apos;t support hot-swap.
            </li>
          </ol>
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-500/20 border border-amber-200 dark:border-amber-400/40 rounded-lg text-xs text-amber-700 dark:text-amber-200">
            <i className="fa-solid fa-triangle-exclamation mr-1" />
            Certificate files are stored on the container&apos;s persistent data volume.
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
}
