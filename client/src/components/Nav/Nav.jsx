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
import Home from '../../Pages/Home/Home';
import './Nav.css';

export default function Nav() {
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
          <span className="status-dot"></span>
          <span className="status-text">cluster-prod-01</span>
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

        <div className="nav-section">
          <span className="section-label">SYSTEM</span>
          <ul className="nav-list">
            <li>
              <NavLink to="/settings" className="nav-link">
                <Settings className="nav-icon" size={18} /> Settings
              </NavLink>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Footer Section */}
      <div className="nav-footer">
        <div className="footer-stat">
          <span>Nodes</span>
          <span className="stat-value text-green">3/3</span>
        </div>
        <div className="footer-stat">
          <span>Namespaces</span>
          <span className="stat-value text-blue">8</span>
        </div>
      </div>
    </nav>
  );
}