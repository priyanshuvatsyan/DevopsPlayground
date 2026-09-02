// Base URL of the backend API. In the browser `process` is undefined, so prefer
// Vite's `import.meta.env.VITE_API_BASE_URL`. Keep a safe fallback for older
// setups or Node-based usage.
const BASE_URL =
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE_URL) ||
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  "http://localhost:4000";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response wasn't JSON, keep default message
    }
    throw new Error(message);
  }

  return res.json();
}

/** Fetch pod list + cluster summary stats (runs `kubectl get pods` server-side). */
export function getPods() {
  return request("/api/pods");
}

/** Fetch service list + health, derived from endpoint readiness server-side. */
export function getServices() {
  return request("/api/services");
}

/** Delete a single pod by name — the deployment/replicaset will recreate it (self-healing demo). */
export function deletePod(podName) {
  return request(`/api/pods/${encodeURIComponent(podName)}`, { method: "DELETE" });
}

/** Trigger a rolling restart of a deployment. */
export function restartDeployment(deploymentName) {
  return request(`/api/deployments/${encodeURIComponent(deploymentName)}/restart`, {
    method: "POST",
  });
}

const api = { getPods, getServices, deletePod, restartDeployment };
export default api;