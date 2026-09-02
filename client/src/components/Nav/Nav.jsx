import { Link } from 'react-router-dom';
import './Nav.css';

export default function Nav() {
  return (
    <nav className="sidebar-nav">
      <ul className="nav-list">
        <li><Link to="/" className="nav-link">Home</Link></li>
        <li><Link to="/kubernetes" className="nav-link">Kubernetes</Link></li>
        <li><Link to="/chaos" className="nav-link">Chaos Mode</Link></li>
      </ul>
    </nav>
  );
}