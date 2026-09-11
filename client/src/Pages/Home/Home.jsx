import React, { useCallback, useEffect, useState } from "react";
import "./Home.css";

const POLL_INTERVAL_MS = 5000;
// Make sure this matches your Node.js backend port
const API_BASE_URL = '/api';

function StatusBadge({ status }) {
  const normalized = (status || "unknown").toLowerCase().replace(/\s+/g, "-");
  return <span className={`status-badge status-${normalized}`}>{status}</span>;
}

function TierBadge({ tier }) {
  if (!tier || tier === "other") return null;
  return <span className={`tier-badge tier-${tier}`}>{tier}</span>;
}

function UsageBar({ label, value }) {
  const pct = typeof value === "number" ? Math.min(100, Math.max(0, value)) : null;
  const level = pct === null ? "unknown" : pct >= 85 ? "high" : pct >= 60 ? "mid" : "low";
  return (
    <div className="usage-row">
      <div className="usage-row-top">
        <span className="usage-label">{label}</span>
        <span className="usage-value">{pct === null ? "—" : `${pct}%`}</span>
      </div>
      <div className="usage-track">
        <div
          className={`usage-fill usage-fill-${level}`}
          style={{ width: `${pct === null ? 0 : pct}%` }}
        />
      </div>
    </div>
  );
}

function PodCard({ pod, onDelete, onRestart, busy }) {
  return (
    <div className="pod-card">
      <div className="pod-card-header">
        <div>
          <div className="pod-name">{pod.name}</div>
          <div className="pod-namespace">{pod.namespace}</div>
        </div>
        <div className="pod-badges">
          <TierBadge tier={pod.tier} />
          <StatusBadge status={pod.status} />
        </div>
      </div>

      <UsageBar label="CPU" value={pod.cpuPercent} />
      <UsageBar label="Memory" value={pod.memoryPercent} />

      <div className="pod-meta">
        <span>Restarts: {pod.restarts}</span>
        <span>Age: {pod.age}</span>
      </div>

      <div className="pod-actions">
        <button
          className="pod-action-btn danger"
          disabled={busy}
          onClick={() => onDelete(pod.name)}
        >
          Delete Pod
        </button>
        {pod.deployment && (
          <button
            className="pod-action-btn"
            disabled={busy}
            onClick={() => onRestart(pod.deployment)}
          >
            Restart Deployment
          </button>
        )}
      </div>
    </div>
  );
}

function ServiceCard({ service }) {
  return (
    <div className="service-card">
      <div className="service-card-header">
        <div>
          <div className="pod-name">{service.name}</div>
          <div className="pod-namespace">{service.type} · {service.clusterIP}</div>
        </div>
        <StatusBadge status={service.health} />
      </div>

      <div className="service-ports">
        {service.ports.map((p) => (
          <span className="port-chip" key={`${p.port}-${p.protocol}`}>
            {p.name ? `${p.name}: ` : ""}{p.port}
            {p.nodePort ? ` → ${p.nodePort}` : ""} /{p.protocol}
          </span>
        ))}
      </div>

      <div className="pod-meta">
        <span>Ready endpoints: {service.readyEndpoints}</span>
        {service.notReadyEndpoints > 0 && <span>Not ready: {service.notReadyEndpoints}</span>}
      </div>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState(null);
  const [services, setServices] = useState(null);
  const [error, setError] = useState(null);
  const [busyPod, setBusyPod] = useState(null);

  const load = useCallback(async () => {
    try {
      // Fetch Pods
      const podRes = await fetch(`${API_BASE_URL}/pods`);
      if (!podRes.ok) throw new Error("Failed to fetch pods");
      const podResult = await podRes.json();

      // Fetch Services
      const svcRes = await fetch(`${API_BASE_URL}/services`);
      if (!svcRes.ok) throw new Error("Failed to fetch services");
      const serviceResult = await svcRes.json();

      setData(podResult);
      setServices(serviceResult);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  const handleDelete = async (podName) => {
    setBusyPod(podName);
    try {
      const res = await fetch(`${API_BASE_URL}/pods/${podName}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to delete pod");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyPod(null);
    }
  };

  const handleRestart = async (deploymentName) => {
    setBusyPod(deploymentName);
    try {
      const res = await fetch(`${API_BASE_URL}/deployments/${deploymentName}/restart`, { method: 'POST' });
      if (!res.ok) throw new Error("Failed to restart deployment");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyPod(null);
    }
  };

  const pods = data?.pods || [];
  const summary = data?.summary || {
    runningCount: 0,
    totalCount: 0,
    cpuAvgPercent: null,
    memoryUsedGb: null,
    memoryTotalGb: null,
    memoryPercent: null,
    clusterName: "cluster",
    healthy: true,
  };

  return (
    <div className="home">
      <main className="home-content">
        {error && (
          <div className="home-error">
            Could not reach the cluster: {error}. Retrying every {POLL_INTERVAL_MS / 1000}s.
          </div>
        )}

        <section className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-top">
              <span className="stat-label">Running Pods</span>
              <span className="stat-icon icon-purple">▶</span>
            </div>
            <div className="stat-value value-purple">
              {summary.runningCount}/{summary.totalCount}
            </div>
            <div className="stat-sub">{summary.clusterName}</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-top">
              <span className="stat-label">CPU Usage</span>
              <span className="stat-icon icon-purple">⚡</span>
            </div>
            <div className="stat-value value-purple">
              {summary.cpuAvgPercent === null ? "—" : `${summary.cpuAvgPercent}%`}
            </div>
            <div className="stat-track">
              <div
                className="stat-fill fill-purple"
                style={{ width: `${summary.cpuAvgPercent ?? 0}%` }}
              />
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-top">
              <span className="stat-label">Memory</span>
              <span className="stat-icon icon-green">◈</span>
            </div>
            <div className="stat-value value-green">
              {summary.memoryPercent === null ? "—" : `${summary.memoryPercent}%`}
            </div>
            <div className="stat-sub">
              {summary.memoryUsedGb === null
                ? "no metrics-server"
                : `${summary.memoryUsedGb} / ${summary.memoryTotalGb} GB`}
            </div>
            <div className="stat-track">
              <div
                className="stat-fill fill-green"
                style={{ width: `${summary.memoryPercent ?? 0}%` }}
              />
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-top">
              <span className="stat-label">Cluster Health</span>
              <span className="stat-icon icon-green">✓</span>
            </div>
            <div className={`stat-value ${summary.healthy ? "value-green" : "value-red"}`}>
              {summary.healthy ? "Healthy" : "Degraded"}
            </div>
            <div className="stat-sub">
              {summary.healthy ? "All systems go" : "Check pod events"}
            </div>
          </div>
        </section>

        <section>
          <div className="section-header">
            <h2>Pod Overview</h2>
            <div className="legend">
              <span className="legend-item">
                <span className="legend-dot dot-running" /> Running
              </span>
              <span className="legend-item">
                <span className="legend-dot dot-pending" /> Pending
              </span>
              <span className="legend-item">
                <span className="legend-dot dot-error" /> Error
              </span>
            </div>
          </div>

          {pods.length === 0 && !error ? (
            <div className="empty-state">No pods found in this namespace yet.</div>
          ) : (
            <div className="pod-grid">
              {pods.map((pod) => (
                <PodCard
                  key={pod.name}
                  pod={pod}
                  onDelete={handleDelete}
                  onRestart={handleRestart}
                  busy={busyPod === pod.name || busyPod === pod.deployment}
                />
              ))}
            </div>
          )}
        </section>

        <section className="services-section">
          <div className="section-header">
            <h2>Services</h2>
            <div className="legend">
              <span className="legend-item">
                <span className="legend-dot dot-running" /> Healthy
              </span>
              <span className="legend-item">
                <span className="legend-dot dot-error" /> Unhealthy
              </span>
              <span className="legend-item">
                <span className="legend-dot dot-pending" /> No Endpoints
              </span>
            </div>
          </div>

          {(!services || services.services.length === 0) && !error ? (
            <div className="empty-state">No services found in this namespace yet.</div>
          ) : (
            <div className="pod-grid">
              {services.services.map((svc) => (
                <ServiceCard key={svc.name} service={svc} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}