const express = require("express");
const cors = require("cors");
const path = require("path");
const { execFile } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const NAMESPACE = process.env.K8S_NAMESPACE || "devopsplayground";
const GET_PODS_SCRIPT = path.join(__dirname, "scripts", "get-pods.sh");
const GET_SERVICES_SCRIPT = path.join(__dirname, "scripts", "get-services.sh");

// Kubernetes resource names: lowercase alphanumerics and '-', RFC 1123 label.
// Anything sent to kubectl on the command line is validated against this first.
const K8S_NAME_RE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

function isValidK8sName(name) {
  return typeof name === "string" && K8S_NAME_RE.test(name);
}

/** Promise wrapper around execFile — never uses a shell, so no argument is ever
 *  string-interpolated into a shell command. */
function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 10_000, ...options }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        return reject(err);
      }
      resolve(stdout);
    });
  });
}

/** Parse a Kubernetes CPU quantity ("250m", "1", "2") into millicores. */
function parseCpu(qty) {
  if (!qty) return null;
  if (qty.endsWith("m")) return parseFloat(qty);
  return parseFloat(qty) * 1000;
}

/** Parse a Kubernetes memory quantity ("128Mi", "1Gi", "512Ki") into MiB. */
function parseMemoryToMi(qty) {
  if (!qty) return null;
  const units = { Ki: 1 / 1024, Mi: 1, Gi: 1024, K: 1 / 1024, M: 1, G: 1024 };
  const match = qty.match(/^([\d.]+)([A-Za-z]*)$/);
  if (!match) return null;
  const [, num, unit] = match;
  const factor = units[unit] ?? 1 / (1024 * 1024); // bare bytes fallback
  return parseFloat(num) * factor;
}

/** Send a helpful error response when the platform or script invocation fails. */
function scriptErrorResponse(res, err, action) {
  console.error(`${action} failed:`, err.stderr || err.message);
  const isWindows = typeof process !== 'undefined' && process.platform === 'win32';
  let message;
  if (isWindows) {
    message = 'Server is running on Windows; the included shell scripts require a Unix shell (bash). Install WSL/Git Bash, run the server on Linux, or replace the scripts with PowerShell equivalents.';
  } else {
    message = 'Failed to run cluster helper scripts.';
  }
  // Attach stderr when available for debugging (trim to avoid huge payloads).
  if (err && err.stderr) {
    const detail = String(err.stderr).slice(0, 2000);
    return res.status(500).json({ error: message, details: detail });
  }
  return res.status(500).json({ error: message });
}

function deriveStatus(pod) {
  const phase = pod.status?.phase || "Unknown";
  const statuses = pod.status?.containerStatuses || [];
  const waitingReason = statuses.find((s) => s.state?.waiting)?.state.waiting.reason;
  if (waitingReason === "CrashLoopBackOff" || waitingReason === "ImagePullBackOff") {
    return "Error";
  }
  if (phase === "Running" && statuses.length && statuses.every((s) => s.ready)) return "Running";
  if (phase === "Failed") return "Error";
  if (phase === "Pending") return "Pending";
  return phase;
}

/** Classify a pod as frontend/backend/other from common label conventions
 *  (tier, component, app, app.kubernetes.io/component). Falls back to "other". */
function deriveTier(pod) {
  const labels = pod.metadata?.labels || {};
  const candidates = [
    labels.tier,
    labels.component,
    labels["app.kubernetes.io/component"],
    labels.app,
    labels["app.kubernetes.io/name"],
  ].filter(Boolean).join(" ").toLowerCase();

  if (/front(end)?|ui|web(app)?|react|nginx/.test(candidates)) return "frontend";
  if (/back(end)?|api|server|worker|db|postgres|redis|worker/.test(candidates)) return "backend";
  return "other";
}

function ageFromTimestamp(ts) {
  if (!ts) return "—";
  const diffMs = Date.now() - new Date(ts).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours >= 1) return `${hours}h`;
  const mins = Math.floor(diffMs / (1000 * 60));
  return `${mins}m`;
}

/** Best-effort `kubectl top pods` lookup; returns {} if metrics-server isn't installed. */
async function getPodMetrics(namespace) {
  try {
    const stdout = await run("kubectl", [
      "top", "pods", "-n", namespace, "--no-headers",
    ]);
    const byName = {};
    stdout.trim().split("\n").filter(Boolean).forEach((line) => {
      const [name, cpu, mem] = line.trim().split(/\s+/);
      byName[name] = { cpuMilli: parseCpu(cpu), memMi: parseMemoryToMi(mem) };
    });
    return byName;
  } catch {
    return {}; // metrics-server not available — UI will show "—" for usage
  }
}

app.get("/api/pods", async (req, res) => {
  try {
    const stdout = await run("bash", [GET_PODS_SCRIPT, NAMESPACE]);
    const parsed = JSON.parse(stdout);
    const items = parsed.items || [];
    const metrics = await getPodMetrics(NAMESPACE);

    const pods = items.map((pod) => {
      const name = pod.metadata.name;
      const container = pod.spec?.containers?.[0];
      const limits = container?.resources?.limits || {};
      const cpuLimitMilli = parseCpu(limits.cpu);
      const memLimitMi = parseMemoryToMi(limits.memory);
      const usage = metrics[name] || {};
      const restarts = (pod.status?.containerStatuses || [])
        .reduce((sum, c) => sum + (c.restartCount || 0), 0);

      return {
        name,
        namespace: pod.metadata.namespace,
        status: deriveStatus(pod),
        tier: deriveTier(pod),
        restarts,
        age: ageFromTimestamp(pod.metadata.creationTimestamp),
        deployment: pod.metadata.ownerReferences?.find((o) => o.kind === "ReplicaSet")
          ? pod.metadata.labels?.app || null
          : null,
        cpuPercent: cpuLimitMilli && usage.cpuMilli != null
          ? Math.round((usage.cpuMilli / cpuLimitMilli) * 100)
          : null,
        memoryPercent: memLimitMi && usage.memMi != null
          ? Math.round((usage.memMi / memLimitMi) * 100)
          : null,
      };
    });

    const runningCount = pods.filter((p) => p.status === "Running").length;
    const cpuValues = pods.map((p) => p.cpuPercent).filter((v) => v !== null);
    const cpuAvgPercent = cpuValues.length
      ? Math.round(cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length)
      : null;

    res.json({
      namespace: NAMESPACE,
      pods,
      summary: {
        runningCount,
        totalCount: pods.length,
        cpuAvgPercent,
        memoryUsedGb: null,
        memoryTotalGb: null,
        memoryPercent: null,
        clusterName: process.env.CLUSTER_NAME || NAMESPACE,
        healthy: pods.every((p) => p.status === "Running" || p.status === "Pending"),
      },
    });
  } catch (err) {
    console.warn("GET /api/pods failed (scripts require Linux/bash):", err.message);
    res.json({
      namespace: NAMESPACE,
      pods: [],
      summary: {
        runningCount: 0,
        totalCount: 0,
        cpuAvgPercent: null,
        memoryUsedGb: null,
        memoryTotalGb: null,
        memoryPercent: null,
        clusterName: process.env.CLUSTER_NAME || NAMESPACE,
        healthy: true,
        warning: "Unable to fetch pods: kubectl scripts require Linux/bash. Install WSL or run on Linux.",
      },
    });
  }
});

app.get("/api/services", async (req, res) => {
  try {
    const stdout = await run("bash", [GET_SERVICES_SCRIPT, NAMESPACE]);
    const [servicesRaw, endpointsRaw] = stdout.split("___ENDPOINTS_SPLIT___");
    const services = JSON.parse(servicesRaw).items || [];
    const endpointsByName = {};
    (JSON.parse(endpointsRaw).items || []).forEach((ep) => {
      endpointsByName[ep.metadata.name] = ep;
    });

    const result = services.map((svc) => {
      const name = svc.metadata.name;
      const endpoints = endpointsByName[name];
      const subsets = endpoints?.subsets || [];
      const readyCount = subsets.reduce((sum, s) => sum + (s.addresses?.length || 0), 0);
      const notReadyCount = subsets.reduce((sum, s) => sum + (s.notReadyAddresses?.length || 0), 0);

      let health = "Healthy";
      if (readyCount === 0 && notReadyCount === 0) health = "No Endpoints";
      else if (readyCount === 0 && notReadyCount > 0) health = "Unhealthy";

      return {
        name,
        namespace: svc.metadata.namespace,
        type: svc.spec.type,
        clusterIP: svc.spec.clusterIP,
        ports: (svc.spec.ports || []).map((p) => ({
          name: p.name || null,
          port: p.port,
          targetPort: p.targetPort,
          protocol: p.protocol,
          nodePort: p.nodePort || null,
        })),
        selector: svc.spec.selector || {},
        readyEndpoints: readyCount,
        notReadyEndpoints: notReadyCount,
        health,
      };
    });

    res.json({
      namespace: NAMESPACE,
      services: result,
      summary: {
        totalCount: result.length,
        healthyCount: result.filter((s) => s.health === "Healthy").length,
      },
    });
  } catch (err) {
    console.warn("GET /api/services failed (scripts require Linux/bash):", err.message);
    res.json({
      namespace: NAMESPACE,
      services: [],
      summary: {
        totalCount: 0,
        healthyCount: 0,
        warning: "Unable to fetch services: kubectl scripts require Linux/bash. Install WSL or run on Linux.",
      },
    });
  }
});

app.delete("/api/pods/:name", async (req, res) => {
  const { name } = req.params;
  if (!isValidK8sName(name)) {
    return res.status(400).json({ error: "Invalid pod name." });
  }
  try {
    await run("kubectl", ["delete", "pod", name, "-n", NAMESPACE, "--wait=false"]);
    res.json({ ok: true, message: `Deleted pod ${name}. The controller will recreate it.` });
  } catch (err) {
    console.error(`DELETE /api/pods/${name} failed:`, err.stderr || err.message);
    res.status(500).json({ error: "Failed to delete pod." });
  }
});

app.post("/api/deployments/:name/restart", async (req, res) => {
  const { name } = req.params;
  if (!isValidK8sName(name)) {
    return res.status(400).json({ error: "Invalid deployment name." });
  }
  try {
    await run("kubectl", ["rollout", "restart", `deployment/${name}`, "-n", NAMESPACE]);
    res.json({ ok: true, message: `Rolling restart triggered for ${name}.` });
  } catch (err) {
    console.error(`POST /api/deployments/${name}/restart failed:`, err.stderr || err.message);
    res.status(500).json({ error: "Failed to restart deployment." });
  }
});

app.get("/healthz", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`DevOps Playground API listening on :${PORT} (namespace: ${NAMESPACE})`);
});