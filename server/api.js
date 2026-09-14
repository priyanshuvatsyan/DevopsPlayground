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

// Read the active message baked into the current Docker container
app.get("/api/demo/message", (req, res) => {
  try {
    const msg = fs.readFileSync("message.txt", "utf8");
    res.json({ message: msg });
  } catch (err) {
    res.json({ message: "Default System Message" });
  }
});

// Fire the webhook to GitHub Actions
app.post("/api/demo/trigger", async (req, res) => {
  const { message } = req.body;
  const pat = process.env.GITHUB_PAT;

  if (!pat) return res.status(500).json({ error: "GitHub PAT not configured in cluster." });

  try {
    const response = await fetch(
      "https://api.github.com/repos/priyanshuvatsyan/DevopsPlayground/actions/workflows/pipeline.yml/dispatches",
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${pat}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          ref: "master",
          inputs: { user_message: message },
        }),
      }
    );

    if (response.ok) {
      res.json({ ok: true, status: "Pipeline triggered successfully. ETA 3-5 minutes." });
    } else {
      const errData = await response.text();
      res.status(500).json({ error: "Failed to trigger pipeline", details: errData });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const api = { getPods, getServices, deletePod, restartDeployment };
export default api;