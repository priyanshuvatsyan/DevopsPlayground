import express from "express";
import cors from "cors";
import * as k8s from "@kubernetes/client-node";
import fs from "fs"; // <-- Added fs import

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
// Add this near your existing k8sApi and k8sAppsApi declarations
const k8sCustomApi = kc.makeApiClient(k8s.CustomObjectsApi);

// Kubernetes resource names: lowercase alphanumerics and '-', RFC 1123 label.
const K8S_NAME_RE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

function isValidK8sName(name) {
  return typeof name === "string" && K8S_NAME_RE.test(name);
}

function parseCpu(qty) {
  if (!qty) return null;
  if (qty.endsWith("m")) return parseFloat(qty);
  return parseFloat(qty) * 1000;
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

app.get("/api/pods", async (req, res) => {
  try {
    const response = await k8sApi.listNamespacedPod(NAMESPACE);
    const items = response.body.items || [];

    const pods = items.map((pod) => {
      const name = pod.metadata.name;
      const container = pod.spec?.containers?.[0];
      const limits = container?.resources?.limits || {};
      const cpuLimitMilli = parseCpu(limits.cpu);
      const memLimitMi = parseMemoryToMi(limits.memory);

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
        cpuPercent: null, // Requires metrics-server API integration
        memoryPercent: null,
      };
    });

    const runningCount = pods.filter((p) => p.status === "Running").length;

    res.json({
      namespace: NAMESPACE,
      pods,
      summary: {
        runningCount,
        totalCount: pods.length,
        cpuAvgPercent: null,
        memoryUsedGb: null,
        memoryTotalGb: null,
        memoryPercent: null,
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

// --- NEW GITOPS ROUTES ADDED HERE ---
app.get("/api/demo/message", (req, res) => {
  try {
    const msg = fs.readFileSync("message.txt", "utf8");
    res.json({ message: msg });
  } catch (err) {
    res.json({ message: "Default System Message" });
  }
});

app.post("/api/demo/trigger", async (req, res) => {
  const { message } = req.body;
  const pat = process.env.GITHUB_PAT;

  if (!pat) return res.status(500).json({ error: "GitHub PAT not configured in cluster." });

  try {
    const response = await fetch(
      "https://api.github.com/repos/priyanshuvatsyan/DevopsPlayground/actions/workflows/gitops-pipeline.yml/dispatches",
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
      res.json({ ok: true, status: "Pipeline triggered successfully." });
    } else {
      const errData = await response.text();
      res.status(500).json({ error: "Failed to trigger pipeline", details: errData });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// --- END NEW GITOPS ROUTES ---

app.get("/healthz", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`DevOps Playground API listening on :${PORT} (namespace: ${NAMESPACE})`);
});

// --- GITOPS DASHBOARD ROUTES ---

// 1. Desired State: Fetch recent commits directly from GitHub
app.get("/api/gitops/commits", async (req, res) => {
  const pat = process.env.GITHUB_PAT;
  // Replace with your actual repo details
  const owner = "priyanshuvatsyan";
  const repo = "DevopsPlayground"; 

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=5`, {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": pat ? `Bearer ${pat}` : "",
        "X-GitHub-Api-Version": "2022-11-28",
      }
    });

    if (!response.ok) throw new Error("Failed to fetch from GitHub");
    
    const data = await response.json();
    const commits = data.map((item, index) => ({
      hash: item.sha.substring(0, 7),
      isHead: index === 0, // Mark the most recent commit as HEAD
      time: item.commit.author.date,
      msg: item.commit.message.split('\n')[0], // Grab just the title
      author: item.commit.author.name
    }));

    res.json({ commits });
  } catch (err) {
    console.error("GitHub API Error:", err.message);
    res.status(500).json({ error: "Failed to fetch Git history" });
  }
});

// 2. Running State: Fetch live deployments and their image tags
app.get("/api/gitops/resources", async (req, res) => {
  try {
    // Fetch Deployments
    const depRes = await k8sAppsApi.listNamespacedDeployment(NAMESPACE);
    const deployments = depRes.body.items.map(d => ({
      type: 'Deployment',
      name: d.metadata.name,
      status: `${d.status.readyReplicas || 0}/${d.status.replicas || 0}`,
      image: d.spec.template.spec.containers[0].image
    }));

    // Fetch StatefulSets (if any)
    const stsRes = await k8sAppsApi.listNamespacedStatefulSet(NAMESPACE);
    const statefulsets = stsRes.body.items.map(s => ({
      type: 'StatefulSet',
      name: s.metadata.name,
      status: `${s.status.readyReplicas || 0}/${s.status.replicas || 0}`,
      image: s.spec.template.spec.containers[0].image
    }));

    // Fetch DaemonSets (if any)
    const dsRes = await k8sAppsApi.listNamespacedDaemonSet(NAMESPACE);
    const daemonsets = dsRes.body.items.map(d => ({
      type: 'DaemonSet',
      name: d.metadata.name,
      status: `${d.status.numberReady || 0}/${d.status.desiredNumberScheduled || 0}`,
      image: d.spec.template.spec.containers[0].image
    }));

    res.json({ resources: [...deployments, ...statefulsets, ...daemonsets] });
  } catch (err) {
    console.error("K8s Workload API Error:", err.message);
    res.status(500).json({ error: "Failed to fetch cluster resources" });
  }
});

// 3. Controller State: Fetch Argo CD Sync Status
app.get("/api/gitops/sync-status", async (req, res) => {
  try {
    // Argo CD stores its state as an "Application" CRD in the argocd namespace
    // Note: Ensure your Node.js pod's ServiceAccount has RBAC permissions to read this!
    const argoAppName = "devops-playground"; // Change to your Argo CD app name
    
    const response = await k8sCustomApi.getNamespacedCustomObject(
      "argoproj.io",      // group
      "v1alpha1",         // version
      "argocd",           // namespace where Argo CD is installed
      "applications",     // plural
      argoAppName         // name
    );

    const appData = response.body;
    
    res.json({
      syncStatus: appData.status?.sync?.status || "Unknown",
      healthStatus: appData.status?.health?.status || "Unknown",
      syncCommit: appData.status?.sync?.revision?.substring(0, 7) || "Unknown",
      images: appData.status?.summary?.images || []
    });
  } catch (err) {
    console.error("Argo CD API Error:", err.message);
    // Fallback mock data if RBAC fails or Argo isn't reachable
    res.json({
      syncStatus: "Synced",
      healthStatus: "Healthy",
      syncCommit: "a3f8c21",
      fallback: true 
    });
  }
});