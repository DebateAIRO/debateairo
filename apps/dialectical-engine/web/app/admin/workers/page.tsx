"use client";

import { useEffect, useState } from "react";
import { backendStatus } from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";
import { relativeTime } from "@/lib/format";
import type { WorkerStatus } from "@/lib/types";

export default function WorkersPage() {
  return <AuthGate>{() => <WorkersView />}</AuthGate>;
}

function WorkersView() {
  const [workers, setWorkers] = useState<WorkerStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const rows = await backendStatus();
        if (active) {
          setWorkers(rows);
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (exc) {
        if (active) setError(exc instanceof Error ? exc.message : "Unable to load worker status");
      }
    }
    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const online = workers.filter((worker) => worker.status === "online").length;
  const degraded = workers.filter((worker) => worker.status === "degraded").length;
  const offline = workers.filter((worker) => worker.status === "offline").length;
  const capabilities = Array.from(new Set(workers.flatMap((worker) => worker.capabilities))).length;

  const metrics: { label: string; value: string }[] = [
    { label: "Online", value: String(online) },
    { label: "Degraded", value: String(degraded) },
    { label: "Offline", value: String(offline) },
    { label: "Capabilities", value: String(capabilities) },
    { label: "Refreshed", value: lastUpdated ? lastUpdated.toLocaleTimeString() : "—" }
  ];

  return (
    <div className="screen scroll">
      <div className="screenInner wide">
        <div className="eyebrow">Infrastructure</div>
        <h1 className="display sm" style={{ marginTop: 12 }}>
          Workers
        </h1>
        <p className="lede" style={{ marginTop: 6 }}>
          Live status, capabilities, current job, and heartbeat for every connected worker.
        </p>

        <div className="workerMetrics">
          {metrics.map((metric) => (
            <div key={metric.label} className="miniCard">
              <span className="optionHint">{metric.label}</span>
              <div className="big" style={{ fontSize: 20, marginTop: 4 }}>
                {metric.value}
              </div>
            </div>
          ))}
        </div>

        {error ? (
          <div className="error" style={{ marginTop: 18 }}>
            {error}
          </div>
        ) : null}

        <div className="sectionHead">
          <h2>Connected workers</h2>
          <span className="count">{workers.length} total</span>
        </div>

        <div className="recentList">
          {workers.length === 0 ? (
            <div className="emptyState">No workers registered.</div>
          ) : (
            workers.map((worker) => {
              const pillClass =
                worker.status === "online" ? "pillOk" : worker.status === "offline" ? "pillBad" : "pillGen";
              return (
                <div key={worker.id} className="debateCard" style={{ cursor: "default" }}>
                  <div className="debateCardBody">
                    <div className="debateCardClaim" style={{ fontSize: 15 }}>
                      {worker.name}
                    </div>
                    <div className="debateCardMeta">
                      <span>{worker.current_job_id ? `Job ${worker.current_job_id}` : "Idle"}</span>
                      <span className="sep">·</span>
                      <span>seen {relativeTime(worker.last_seen)}</span>
                    </div>
                    {worker.capabilities.length ? (
                      <div className="roleChips" style={{ marginTop: 10 }}>
                        {worker.capabilities.map((capability) => (
                          <span key={capability} className="roleChip">
                            {capability}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className={`pill ${pillClass}`}>
                    <span className="dot" />
                    {worker.status}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
