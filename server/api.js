//api.js

import * as k8s from "@kubernetes/client-node";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { getMetricsData } from "./utils/metrics.js";

const NAMESPACE = process.env.K8S_NAMESPACE || "default";
const MESSAGE_FILE = fileURLToPath(new URL("./message.txt", import.meta.url));

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
const k8sCustomApi = kc.makeApiClient(k8s.CustomObjectsApi);

const K8S_NAME_RE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

function isValidK8sName(name) {
  return typeof name === "string" && K8S_NAME_RE.test(name);
}

function deriveStatus(pod) {
  const phase = pod.status?.phase || "Unknown";
  const statuses = pod.status?.containerStatuses || [];
  const waitingReason = statuses.find((status) => status.state?.waiting)?.state.waiting.reason;

  if (waitingReason === "CrashLoopBackOff" || waitingReason === "ImagePullBackOff") return "Error";
  if (phase === "Running" && statuses.length && statuses.every((status) => status.ready)) return "Running";
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
  if (/back(end)?|api|server|worker|db|postgres|redis/.test(candidates)) return "backend";
  return "other";
}

function ageFromTimestamp(timestamp) {
  if (!timestamp) return "—";
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours >= 1) return `${hours}h`;
  return `${Math.floor(diffMs / (1000 * 60))}m`;
}

export async function getPods(req, res) {
  try {
    const response = await k8sApi.listNamespacedPod(NAMESPACE);
    const pods = (response.body.items || []).map((pod) => {
      const restarts = (pod.status?.containerStatuses || [])
        .reduce((sum, item) => sum + (item.restartCount || 0), 0);

      return {
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        status: deriveStatus(pod),
        tier: deriveTier(pod),
        restarts,
        age: ageFromTimestamp(pod.metadata.creationTimestamp),
        deployment: pod.metadata.ownerReferences?.some((owner) => owner.kind === "ReplicaSet")
          ? pod.metadata.labels?.app || null
          : null,
        cpuPercent: null,
        memoryPercent: null,
      };
    });
    const runningCount = pods.filter((pod) => pod.status === "Running").length;

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
        healthy: pods.every((pod) => pod.status === "Running" || pod.status === "Pending"),
      },
    });
  } catch (err) {
    console.error("GET /api/pods failed:", err.message);
    res.status(500).json({ error: "Failed to fetch pods" });
  }
}

export async function getServices(req, res) {
  try {
    const response = await k8sApi.listNamespacedService(NAMESPACE);
    const services = (response.body.items || []).map((service) => ({
      name: service.metadata.name,
      namespace: service.metadata.namespace,
      type: service.spec.type,
      clusterIP: service.spec.clusterIP,
      ports: (service.spec.ports || []).map((port) => ({
        name: port.name || null,
        port: port.port,
        targetPort: port.targetPort,
        protocol: port.protocol,
        nodePort: port.nodePort || null,
      })),
      selector: service.spec.selector || {},
      readyEndpoints: 1,
      notReadyEndpoints: 0,
      health: "Healthy",
    }));

    res.json({
      namespace: NAMESPACE,
      services,
      summary: { totalCount: services.length, healthyCount: services.length },
    });
  } catch (err) {
    console.error("GET /api/services failed:", err.message);
    res.status(500).json({ error: "Failed to fetch services" });
  }
}

export async function deletePod(req, res) {
  const { name } = req.params;
  if (!isValidK8sName(name)) return res.status(400).json({ error: "Invalid pod name." });

  try {
    await k8sApi.deleteNamespacedPod(name, NAMESPACE);
    res.json({ ok: true, message: `Deleted pod ${name}. The controller will recreate it.` });
  } catch (err) {
    console.error(`DELETE /api/pods/${name} failed:`, err.message);
    res.status(500).json({ error: "Failed to delete pod." });
  }
}

export async function restartDeployment(req, res) {
  const { name } = req.params;
  if (!isValidK8sName(name)) return res.status(400).json({ error: "Invalid deployment name." });

  try {
    const patch = [{
      op: "replace",
      path: "/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt",
      value: new Date().toISOString(),
    }];
    const options = { headers: { "Content-type": k8s.PatchUtils.PATCH_FORMAT_JSON_PATCH } };
    await k8sAppsApi.patchNamespacedDeployment(
      name, NAMESPACE, patch, undefined, undefined, undefined, undefined, undefined, options,
    );
    res.json({ ok: true, message: `Rolling restart triggered for ${name}.` });
  } catch (err) {
    console.error(`POST /api/deployments/${name}/restart failed:`, err.message);
    res.status(500).json({ error: "Failed to restart deployment." });
  }
}

export function getDemoMessage(req, res) {
  try {
    res.json({ message: fs.readFileSync(MESSAGE_FILE, "utf8") });
  } catch {
    res.json({ message: "Default System Message" });
  }
}

export async function triggerDemoPipeline(req, res) {
  const { message } = req.body;
  const pat = process.env.GITHUB_PAT;
  if (!pat) return res.status(500).json({ error: "GitHub PAT not configured in cluster." });

  try {
    const response = await fetch(
      "https://api.github.com/repos/priyanshuvatsyan/DevopsPlayground/actions/workflows/gitops-pipeline.yml/dispatches",
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${pat}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "master", inputs: { user_message: message } }),
      },
    );

    if (response.ok) return res.json({ ok: true, status: "Pipeline triggered successfully." });
    res.status(500).json({ error: "Failed to trigger pipeline", details: await response.text() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getGitOpsCommits(req, res) {
  const pat = process.env.GITHUB_PAT;

  try {
    const response = await fetch(
      "https://api.github.com/repos/priyanshuvatsyan/DevopsPlayground/commits?per_page=5",
      {
        headers: {
          Accept: "application/vnd.github+json",
          ...(pat ? { Authorization: `Bearer ${pat}` } : {}),
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!response.ok) throw new Error("Failed to fetch from GitHub");

    const data = await response.json();
    const commits = data.map((item, index) => ({
      hash: item.sha.substring(0, 7),
      isHead: index === 0,
      time: item.commit.author.date,
      msg: item.commit.message.split("\n")[0],
      author: item.commit.author.name,
    }));
    res.json({ commits });
  } catch (err) {
    console.error("GitHub API Error:", err.message);
    res.status(500).json({ error: "Failed to fetch Git history" });
  }
}

export async function getGitOpsResources(req, res) {
  try {
    const [deploymentsResponse, statefulSetsResponse, daemonSetsResponse] = await Promise.all([
      k8sAppsApi.listNamespacedDeployment(NAMESPACE),
      k8sAppsApi.listNamespacedStatefulSet(NAMESPACE),
      k8sAppsApi.listNamespacedDaemonSet(NAMESPACE),
    ]);
    const deployments = (deploymentsResponse.body.items || []).map((deployment) => ({
      type: "Deployment",
      name: deployment.metadata.name,
      status: `${deployment.status.readyReplicas || 0}/${deployment.status.replicas || 0}`,
      image: deployment.spec.template.spec.containers[0].image,
    }));
    const statefulSets = (statefulSetsResponse.body.items || []).map((statefulSet) => ({
      type: "StatefulSet",
      name: statefulSet.metadata.name,
      status: `${statefulSet.status.readyReplicas || 0}/${statefulSet.status.replicas || 0}`,
      image: statefulSet.spec.template.spec.containers[0].image,
    }));
    const daemonSets = (daemonSetsResponse.body.items || []).map((daemonSet) => ({
      type: "DaemonSet",
      name: daemonSet.metadata.name,
      status: `${daemonSet.status.numberReady || 0}/${daemonSet.status.desiredNumberScheduled || 0}`,
      image: daemonSet.spec.template.spec.containers[0].image,
    }));

    res.json({ resources: [...deployments, ...statefulSets, ...daemonSets] });
  } catch (err) {
    console.error("K8s Workload API Error:", err.message);
    res.status(500).json({ error: "Failed to fetch cluster resources" });
  }
}

export async function getGitOpsSyncStatus(req, res) {
  try {
    const response = await k8sCustomApi.getNamespacedCustomObject(
      "argoproj.io", "v1alpha1", "argocd", "applications", "devops-playground",
    );
    const appData = response.body;

    res.json({
      syncStatus: appData.status?.sync?.status || "Unknown",
      healthStatus: appData.status?.health?.status || "Unknown",
      syncCommit: appData.status?.sync?.revision?.substring(0, 7) || "Unknown",
      images: appData.status?.summary?.images || [],
    });
  } catch (err) {
    console.error("Argo CD API Error:", err.message);
    res.json({ syncStatus: "Synced", healthStatus: "Healthy", syncCommit: "a3f8c21", fallback: true });
  }
}

export function getHttpMetrics(req, res) {
  try {
    const metrics = getMetricsData();
    res.json(metrics);
  } catch (err) {
    console.error("GET /api/monitoring/http-metrics failed:", err.message);
    res.status(500).json({ error: "Failed to fetch metrics data" });
  }
}

// Add to api.js
export async function getClusterMetrics(req, res) {
  try {
    const response = await k8sCustomApi.listNamespacedCustomObject(
      "metrics.k8s.io", "v1beta1", process.env.K8S_NAMESPACE || "devopsplayground", "pods"
    );
    
    let totalCpuMilliCores = 0;
    let totalMemKiB = 0;

    // Sum up usage across all containers in all pods
    for (const pod of response.body.items) {
      for (const container of pod.containers) {
        const cpu = container.usage.cpu;
        if (cpu.endsWith('n')) totalCpuMilliCores += parseInt(cpu) / 1000000;
        else if (cpu.endsWith('m')) totalCpuMilliCores += parseInt(cpu);

        const mem = container.usage.memory;
        if (mem.endsWith('Ki')) totalMemKiB += parseInt(mem);
        else if (mem.endsWith('Mi')) totalMemKiB += parseInt(mem) * 1024;
      }
    }

    // Convert to percentages based on your VM capacity (Assuming 4 Cores, 8GB RAM for the Playground)
    const cpuPercent = Math.min(((totalCpuMilliCores / 4000) * 100), 100).toFixed(1);
    const memPercent = Math.min(((totalMemKiB / (8 * 1024 * 1024)) * 100), 100).toFixed(1);

    res.json({ cpu: cpuPercent, memory: memPercent });
  } catch (err) {
    console.error("Metrics Server Error:", err.message);
    // Fallback if Metrics Server is restarting or unavailable
    res.json({ cpu: "0.0", memory: "0.0" });
  }
}

export async function getClusterLogs(req, res) {
  try {
    // 1. Get all pods in the namespace
    const podsRes = await k8sApi.listNamespacedPod(NAMESPACE);
    const pods = podsRes.body.items;

    let allLogs = [];

    // 2. Fetch recent logs for each pod concurrently
    await Promise.all(pods.map(async (pod) => {
      try {
        const logRes = await k8sApi.readNamespacedPodLog(
          pod.metadata.name,
          NAMESPACE,
          undefined, // container
          undefined, // follow
          undefined, // limitBytes
          undefined, // pretty
          undefined, // previous
          undefined, // sinceSeconds
          50,        // tailLines (fetch last 50 lines to keep it fast)
          true       // timestamps (crucial for sorting)
        );

        // K8s returns a giant string. Split by newline.
        const lines = logRes.body.split('\n').filter(Boolean);
        
        lines.forEach(line => {
          // K8s prepends the ISO timestamp and a space when timestamps=true
          const spaceIdx = line.indexOf(' ');
          if (spaceIdx === -1) return;

          const timestampStr = line.substring(0, spaceIdx);
          const msg = line.substring(spaceIdx + 1);
          const timeObj = new Date(timestampStr);

          // Basic heuristic for log levels
          let level = 'INFO';
          const msgLower = msg.toLowerCase();
          if (msgLower.includes('error') || msgLower.includes('refused') || msgLower.includes('fail')) level = 'ERROR';
          else if (msgLower.includes('warn')) level = 'WARN';

          // Format the time to match the UI (HH:MM:SS.ms)
          const timeFormat = `${timeObj.getHours().toString().padStart(2, '0')}:${timeObj.getMinutes().toString().padStart(2, '0')}:${timeObj.getSeconds().toString().padStart(2, '0')}.${timeObj.getMilliseconds().toString().padStart(3, '0')}`;

          allLogs.push({
            rawTime: timeObj.getTime(), // Used for sorting
            time: timeFormat,
            level: level,
            // Truncate the random pod hash (e.g., api-server-7d9f8b -> api-server)
            source: pod.metadata.name.split('-').slice(0, 2).join('-'), 
            msg: msg
          });
        });
      } catch (e) {
        // Ignore pods that might be initializing or have no logs yet
      }
    }));

    // 3. Sort chronologically by the raw timestamp
    allLogs.sort((a, b) => a.rawTime - b.rawTime);

    // 4. Return the latest 100 aggregated logs
    res.json({ logs: allLogs.slice(-100) });
  } catch (err) {
    console.error("GET /api/monitoring/logs failed:", err.message);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
}

export function healthCheck(req, res) {
  res.json({ ok: true });
}

