// metrics.js
const appMetrics = {
  history: [],
  startTime: Date.now(),
  totalRequests: 0,
  endpoints: {}
};

export const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime();

  res.on("finish", () => {
    const diff = process.hrtime(start);
    const durationMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
    
    appMetrics.totalRequests++;

    const routeName = `${req.method} ${req.originalUrl.split("?")[0]}`; 
    const statusType = `${res.statusCode.toString()[0]}xx`;

    if (!appMetrics.endpoints[routeName]) {
      appMetrics.endpoints[routeName] = { hits: 0, totalTime: 0, status: statusType };
    }
    
    appMetrics.endpoints[routeName].hits++;
    appMetrics.endpoints[routeName].totalTime += parseFloat(durationMs);
    appMetrics.endpoints[routeName].status = statusType;

    const logEntry = {
      timestamp: new Date().toISOString(),
      route: routeName,
      duration: `${durationMs}ms`,
      status: res.statusCode
    };
    
    appMetrics.history.unshift(logEntry);
    if (appMetrics.history.length > 50) appMetrics.history.pop();
  });

  next();
};

export const getMetricsData = () => {
  const uptimeSeconds = (Date.now() - appMetrics.startTime) / 1000;
  
  const currentRps = uptimeSeconds > 0 ? (appMetrics.totalRequests / uptimeSeconds).toFixed(2) : "0.00";

  const breakdown = Object.keys(appMetrics.endpoints).map((route) => {
    const data = appMetrics.endpoints[route];
    const avgResponseTime = (data.totalTime / data.hits).toFixed(0);
    return {
      route: route,
      hits: data.hits,
      avgTime: `${avgResponseTime}ms`,
      status: data.status
    };
  });

  breakdown.sort((a, b) => b.hits - a.hits);

  return {
    requestsPerSecond: currentRps,
    totalRequests: appMetrics.totalRequests,
    breakdown: breakdown,
    latestLogs: appMetrics.history.slice(0, 5)
  };
};