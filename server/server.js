import express from "express";
import cors from "cors";
import * as k8s from "@kubernetes/client-node";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const NAMESPACE = process.env.K8S_NAMESPACE || "default";

// Initialize the native Kubernetes Client
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
const k8sCustomApi = kc.makeApiClient(k8s.CustomObjectsApi);

// Kubernetes resource names: lowercase alphanumerics and '-', RFC 1123 label.
const K8S_NAME_RE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

function isValidK8sName(name) {
  return typeof name === "string" && K8S_NAME_RE.test(name);
}

function parseCpu(qty) {
  if (!qty) return null;
  if (typeof qty === "number") return qty * 1000;
  if (qty.endsWith("n")) return parseFloat(qty) / 1000000; // nanocores to millicores
  if (qty.endsWith("u")) return parseFloat(qty) / 1000; // microcores to millicores
  if (qty.endsWith("m")) return parseFloat(qty); // millicores
  return parseFloat(qty) * 1000; // full cores to millicores
}

function parseMemoryToMi(qty) {
  if (!qty) return null;
  const units = { Ki: 1 / 1024, Mi: 1, Gi: 1024, K: 1 / 1024, M: 1, G: 1024 };
  const match = qty.match(/^([\d.]+)([A-Za-z]*)$/);
  if (!match) return null;
  const [, num, unit] = match;
  const factor = units[unit] ?? 1 / (1024 * 1024);
  return parseFloat(num) * factor;
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

async function getPodMetrics(namespace) {
  try {
    const res = await k8sCustomApi.listNamespacedCustomObject(
      "metrics.k8s.io",
      "v1beta1",
      namespace,
      "pods"
    );
    const byName = {};
    res.body.items.forEach((item) => {
      let cpuMilli = 0;
      let memMi = 0;
      item.containers.forEach((c) => {
        cpuMilli += parseCpu(c.usage.cpu) || 0;
        memMi += parseMemoryToMi(c.usage.memory) || 0;
      });
      byName[item.metadata.name] = { cpuMilli, memMi };
    });
    return byName;
  } catch (err) {
    return {}; // Returns empty if metrics-server is still booting or unavailable
  }
}

app.get("/api/pods", async (req, res) => {
  try {
    const response = await k8sApi.listNamespacedPod(NAMESPACE);
    const items = response.body.items || [];
    const metrics = await getPodMetrics(NAMESPACE);

    let totalMemMi = 0;

    const pods = items.map((pod) => {
      const name = pod.metadata.name;
      const container = pod.spec?.containers?.[0];
      const limits = container?.resources?.limits || {};
      
      // Fallback limits: 1000m (1 CPU Core) and 512Mi if none exist in your YAML
      const cpuLimitMilli = parseCpu(limits.cpu) || 1000; 
      const memLimitMi = parseMemoryToMi(limits.memory) || 512; 
      
      const usage = metrics[name] || {};
      if (usage.memMi) totalMemMi += usage.memMi;

      const restarts = (pod.status?.containerStatuses || []).reduce((sum, c) => sum + (c.restartCount || 0), 0);

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
        // Calculate proper percentages using the usage and limits
        cpuPercent: usage.cpuMilli != null ? Math.round((usage.cpuMilli / cpuLimitMilli) * 100) : 0,
        memoryPercent: usage.memMi != null ? Math.round((usage.memMi / memLimitMi) * 100) : 0,
      };
    });

    const runningCount = pods.filter((p) => p.status === "Running").length;
    
    const cpuValues = pods.map((p) => p.cpuPercent).filter((v) => v !== null);
    const cpuAvgPercent = cpuValues.length ? Math.round(cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length) : 0;
    
    const memValues = pods.map((p) => p.memoryPercent).filter((v) => v !== null);
    const memAvgPercent = memValues.length ? Math.round(memValues.reduce((a, b) => a + b, 0) / memValues.length) : 0;

    res.json({
      namespace: NAMESPACE,
      pods,
      summary: {
        runningCount,
        totalCount: pods.length,
        cpuAvgPercent,
        memoryUsedGb: (totalMemMi / 1024).toFixed(2),
        memoryTotalGb: ((pods.length * 512) / 1024).toFixed(2),
        memoryPercent: memAvgPercent,
        clusterName: kc.getCurrentCluster()?.name || "local-cluster",
        healthy: pods.every((p) => p.status === "Running" || p.status === "Pending"),
      },
    });
  } catch (err) {
    console.error("GET /api/pods failed:", err.message);
    res.status(500).json({ error: "Failed to fetch pods" });
  }
});

app.get("/api/services", async (req, res) => {
  try {
    const response = await k8sApi.listNamespacedService(NAMESPACE);
    const services = response.body.items || [];

    const result = services.map((svc) => {
      return {
        name: svc.metadata.name,
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
        readyEndpoints: 1, // Simplified
        notReadyEndpoints: 0,
        health: "Healthy",
      };
    });

    res.json({
      namespace: NAMESPACE,
      services: result,
      summary: {
        totalCount: result.length,
        healthyCount: result.length,
      },
    });
  } catch (err) {
    console.error("GET /api/services failed:", err.message);
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

app.delete("/api/pods/:name", async (req, res) => {
  const { name } = req.params;
  if (!isValidK8sName(name)) {
    return res.status(400).json({ error: "Invalid pod name." });
  }
  try {
    await k8sApi.deleteNamespacedPod(name, NAMESPACE);
    res.json({ ok: true, message: `Deleted pod ${name}. The controller will recreate it.` });
  } catch (err) {
    console.error(`DELETE /api/pods/${name} failed:`, err.message);
    res.status(500).json({ error: "Failed to delete pod." });
  }
});

app.post("/api/deployments/:name/restart", async (req, res) => {
  const { name } = req.params;
  if (!isValidK8sName(name)) {
    return res.status(400).json({ error: "Invalid deployment name." });
  }
  try {
    const patch = [
      {
        op: "replace",
        path: "/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt",
        value: new Date().toISOString()
      }
    ];
    const options = { headers: { "Content-type": k8s.PatchUtils.PATCH_FORMAT_JSON_PATCH } };
    await k8sAppsApi.patchNamespacedDeployment(name, NAMESPACE, patch, undefined, undefined, undefined, undefined, undefined, options);
    res.json({ ok: true, message: `Rolling restart triggered for ${name}.` });
  } catch (err) {
    console.error(`POST /api/deployments/${name}/restart failed:`, err.message);
    res.status(500).json({ error: "Failed to restart deployment." });
  }
});

app.get("/healthz", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`DevOps Playground API listening on :${PORT} (namespace: ${NAMESPACE})`);
});