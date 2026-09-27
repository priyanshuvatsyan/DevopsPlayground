//server.js
import { metricsMiddleware } from "./utils/metrics.js";

import express from "express";
import cors from "cors";
import * as api from "./api.js";

const app = express();
const PORT = process.env.PORT || 4000;
app.use(metricsMiddleware);

app.use(cors());
app.use(express.json());

app.get("/api/pods", api.getPods);
app.get("/api/services", api.getServices);
app.delete("/api/pods/:name", api.deletePod);
app.post("/api/deployments/:name/restart", api.restartDeployment);
app.get("/api/demo/message", api.getDemoMessage);
app.post("/api/demo/trigger", api.triggerDemoPipeline);
app.get("/api/gitops/commits", api.getGitOpsCommits);
app.get("/api/gitops/resources", api.getGitOpsResources);
app.get("/api/gitops/sync-status", api.getGitOpsSyncStatus);
app.get("/api/monitoring/http-metrics", api.getHttpMetrics);
app.get("/healthz", api.healthCheck);
app.get("/api/monitoring/cluster-metrics", api.getClusterMetrics);

app.listen(PORT, () => {
  console.log(`DevOps Playground API listening on :${PORT}`);
});