"use client";

import { useEffect, useState } from "react";

interface EndpointCheck {
  url: string;
  status: "pending" | "ok" | "fail";
  detail: string;
}

const ENDPOINTS = ["/api/status", "/api/rss", "/api/incidents", "/api/outages", "/api/auth/session"];

export default function DebugOverlay() {
  const [checks, setChecks] = useState<EndpointCheck[]>(
    ENDPOINTS.map((url) => ({ url, status: "pending", detail: "checking..." }))
  );

  useEffect(() => {
    ENDPOINTS.forEach((url, i) => {
      fetch(`${url}?cb=${Date.now()}`)
        .then(async (r) => {
          const text = await r.text();
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          let detail = text.slice(0, 100);
          try {
            const json = JSON.parse(text);
            if (Array.isArray(json)) detail = `array[${json.length}]`;
            else if (json.services) detail = `services=${json.services.length} local.ok=${json.local?.ok} wide.ok=${json.wide?.ok}`;
          } catch {
            /* leave raw text detail */
          }
          setChecks((prev) => prev.map((c, idx) => (idx === i ? { ...c, status: "ok", detail } : c)));
        })
        .catch((e) => {
          setChecks((prev) => prev.map((c, idx) => (idx === i ? { ...c, status: "fail", detail: e.message } : c)));
        });
    });
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[99999] bg-slate-900 text-slate-300 font-mono text-[11px] px-3 py-2 border-t-[3px] border-slate-700 max-h-[40vh] overflow-y-auto">
      <h4 className="text-slate-100 font-bold mb-1">🔍 Status Page Debug</h4>
      {checks.map((c) => (
        <div key={c.url}>
          {c.status === "ok" ? "✅" : c.status === "fail" ? "❌" : "⏳"} {c.url}: {c.detail}
        </div>
      ))}
    </div>
  );
}
