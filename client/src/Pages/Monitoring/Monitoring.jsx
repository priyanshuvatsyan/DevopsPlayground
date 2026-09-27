import React, { useState, useEffect } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import './Monitoring.css';

export default function Monitoring() {
  const [httpMetrics, setHttpMetrics] = useState({ breakdown: [], latestLogs: [] });
  const [chartData, setChartData] = useState([]); // Stores the rolling history for charts
  
  const [currentCpu, setCurrentCpu] = useState("0.0");
  const [currentMem, setCurrentMem] = useState("0.0");
  const [currentRps, setCurrentRps] = useState("0.00");
  const [currentLatency, setCurrentLatency] = useState("0.0");

  const fetchMetrics = async () => {
    try {
      const [httpRes, clusterRes] = await Promise.all([
        fetch('/api/monitoring/http-metrics'),
        fetch('/api/monitoring/cluster-metrics')
      ]);

      let newRps = "0.00", newLatency = 0;
      let newCpu = "0.0", newMem = "0.0";

      if (httpRes.ok) {
        const httpData = await httpRes.json();
        setHttpMetrics(httpData);
        newRps = httpData.requestsPerSecond;
        // Calculate average latency from the top hit route
        if (httpData.breakdown.length > 0) {
           newLatency = parseFloat(httpData.breakdown[0].avgTime);
        }
      }

      if (clusterRes.ok) {
        const clusterData = await clusterRes.json();
        newCpu = clusterData.cpu;
        newMem = clusterData.memory;
      }

      setCurrentCpu(newCpu);
      setCurrentMem(newMem);
      setCurrentRps(newRps);
      setCurrentLatency(newLatency.toFixed(1));

      // Append new data to the rolling chart array (keep max 20 points)
      setChartData(prev => {
        const newDataPoint = {
          time: new Date().toLocaleTimeString(),
          cpu: parseFloat(newCpu),
          memory: parseFloat(newMem),
          rps: parseFloat(newRps),
          latency: newLatency
        };
        const updated = [...prev, newDataPoint];
        if (updated.length > 20) updated.shift();
        return updated;
      });

    } catch (err) {
      console.error("Failed to fetch monitoring metrics", err);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, []);

  // Helper component to render the Recharts area chart
  const MetricChart = ({ dataKey, color }) => (
    <ResponsiveContainer width="100%" height={100}>
      <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`color${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.8}/>
            <stop offset="95%" stopColor={color} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <YAxis domain={[0, 'dataMax + 10']} hide={true} />
        <Area type="monotone" dataKey={dataKey} stroke={color} fillOpacity={1} fill={`url(#color${dataKey})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );

  return (
    <div className="monitoring-wrapper">
      <div className="monitoring-header">
        <h1>Monitoring</h1>
        <div style={{ color: '#36b37e', fontWeight: 'bold' }}>● Healthy</div>
      </div>

      <div className="metrics-grid">
        {/* CPU Chart */}
        <div className="metric-card">
          <div className="metric-header">
            <span>CPU Usage %</span>
            <span className="text-blue">{currentCpu}%</span>
          </div>
          <div className="mock-chart">
            <MetricChart dataKey="cpu" color="#0052cc" />
          </div>
        </div>

        {/* Memory Chart */}
        <div className="metric-card">
          <div className="metric-header">
            <span>Memory Usage %</span>
            <span className="text-purple">{currentMem}%</span>
          </div>
          <div className="mock-chart">
            <MetricChart dataKey="memory" color="#6554c0" />
          </div>
        </div>

        {/* RPS Chart */}
        <div className="metric-card">
          <div className="metric-header">
            <span>Requests / sec</span>
            <span className="text-green">{currentRps} rps</span>
          </div>
          <div className="mock-chart">
            <MetricChart dataKey="rps" color="#36b37e" />
          </div>
        </div>

        {/* Latency Chart */}
        <div className="metric-card">
          <div className="metric-header">
            <span>Response Time (ms)</span>
            <span className="text-orange">{currentLatency}ms</span>
          </div>
          <div className="mock-chart">
            <MetricChart dataKey="latency" color="#ff991f" />
          </div>
        </div>
      </div>

      {/* Request Breakdown by Endpoint Table */}
      <div className="breakdown-card">
        <h3>Request Breakdown by Endpoint</h3>
        <div className="breakdown-list">
          {httpMetrics.breakdown.length === 0 ? (
            <div style={{ padding: '20px', color: '#6b778c' }}>Waiting for HTTP traffic...</div>
          ) : (
            httpMetrics.breakdown.map((item, idx) => (
              <div key={idx} className="breakdown-row">
                <div className="row-hits text-green">{item.hits}</div>
                <div className="row-route">{item.route}</div>
                <div className="row-time">{item.avgTime}</div>
                <div className={`row-status ${item.status.startsWith('2') ? 'text-green' : 'text-red'}`}>
                  {item.status}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}