import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Hexagon, 
  GitPullRequest, 
  CircleDot, 
  Activity, 
  List, 
  Star, 
  Settings 
} from 'lucide-react';
import './Nav.css';

export default function Nav() {
  const [clusterData, setClusterData] = useState({
    clusterName: 'loading...',
    nodes: { ready: '-', total: '-' },
    namespaces: '-'
  });

  useEffect(() => {
    const fetchClusterInfo = async () => {
      try {
        const res = await fetch('/api/cluster/info');
        if (res.ok) {
          const data = await res.json();
          setClusterData(data);
        }
      } catch (err) {
        console.error("Failed to fetch cluster info", err);
      }
    };

    fetchClusterInfo();
    const interval = setInterval(fetchClusterInfo, 30000); 
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="sidebar-nav">
      {/* Top Header Section */}
      <div className="nav-header">
        <div className="brand">
          <div className="logo-icon">
            <Hexagon size={20} strokeWidth={1.5} />
          </div>
          <div className="brand-text">
            <span className="brand-title">DevOps</span>
            <span className="brand-subtitle">Playground</span>
          </div>
        </div>
        <div className="cluster-status">
          <span className="status-dot healthy"></span>
          <span className="status-text">{clusterData.clusterName}</span>
        </div>
      </div>

      {/* Main Navigation Links */}
      <div className="nav-content">
        <div className="nav-section">
          <span className="section-label">WORKLOADS</span>
          <ul className="nav-list">
            <li>
              <NavLink to="/" className="nav-link">
                <Hexagon className="nav-icon" size={18} /> Kubernetes
              </NavLink>
            </li>
            <li>
              <NavLink to="/cicd" className="nav-link">
                <GitPullRequest className="nav-icon" size={18} /> CI/CD Pipeline
              </NavLink>
            </li>
          </ul>
        </div>

        <div className="nav-section">
          <span className="section-label">DELIVERY</span>
          <ul className="nav-list">
            <li>
              <NavLink to="/gitops" className="nav-link">
                <CircleDot className="nav-icon" size={18} /> GitOps
              </NavLink>
            </li>
          </ul>
        </div>

        <div className="nav-section">
          <span className="section-label">OBSERVABILITY</span>
          <ul className="nav-list">
            <li>
              <NavLink to="/monitoring" className="nav-link">
                <Activity className="nav-icon" size={18} /> Monitoring
              </NavLink>
            </li>
            <li>
              <NavLink to="/logs" className="nav-link">
                <List className="nav-icon" size={18} /> Logs
              </NavLink>
            </li>
          </ul>
        </div>

        <div className="nav-section">
          <span className="section-label">RESILIENCE</span>
          <ul className="nav-list">
            <li>
              <NavLink to="/chaos" className="nav-link">
                <Star className="nav-icon" size={18} /> Chaos Engineering
              </NavLink>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Footer Section */}
      <div className="nav-footer">
        <div className="footer-stat">
          <span>Nodes</span>
          <span className="stat-value text-green">
            {clusterData.nodes.ready}/{clusterData.nodes.total}
          </span>
        </div>
        <div className="footer-stat">
          <span>Namespaces</span>
          <span className="stat-value text-blue">
            {clusterData.namespaces}
          </span>
        </div>
      </div>
    </nav>
  );
}