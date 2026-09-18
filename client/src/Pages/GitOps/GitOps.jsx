import React, { useState, useEffect } from 'react';
import { Hexagon, Check, RefreshCw } from 'lucide-react';
import './GitOps.css';

export default function GitOps() {
  const [commits, setCommits] = useState([]);
  const [resources, setResources] = useState([]);
  const [syncStatus, setSyncStatus] = useState({
    status: 'Loading...',
    health: 'Loading...',
    commit: '...'
  });
  const [isSyncing, setIsSyncing] = useState(false);

  // Helper to format GitHub timestamps (e.g., "3m ago", "2h ago")
  const timeAgo = (dateString) => {
    if (!dateString) return '';
    const seconds = Math.round((new Date() - new Date(dateString)) / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const fetchGitOpsData = async () => {
    try {
      // Fetch all three endpoints concurrently
      const [commitsRes, resourcesRes, syncRes] = await Promise.all([
        fetch('/api/gitops/commits'),
        fetch('/api/gitops/resources'),
        fetch('/api/gitops/sync-status')
      ]);

      if (commitsRes.ok) {
        const commitsData = await commitsRes.json();
        setCommits(commitsData.commits || []);
      }
      
      if (resourcesRes.ok) {
        const resourcesData = await resourcesRes.json();
        setResources(resourcesData.resources || []);
      }

      if (syncRes.ok) {
        const syncData = await syncRes.json();
        setSyncStatus({
          status: syncData.syncStatus || 'Unknown',
          health: syncData.healthStatus || 'Unknown',
          commit: syncData.syncCommit || 'Unknown'
        });
      }
    } catch (err) {
      console.error("Failed to fetch live GitOps data:", err);
    }
  };

  // Fetch immediately on mount, then poll every 15 seconds
  useEffect(() => {
    fetchGitOpsData();
    const interval = setInterval(fetchGitOpsData, 15000);
    return () => clearInterval(interval);
  }, []);

  // Optional: Wire up the Force Sync button
  const handleForceSync = () => {
    setIsSyncing(true);
    // You can add a POST route to trigger ArgoCD sync here later
    setTimeout(() => {
      fetchGitOpsData();
      setIsSyncing(false);
    }, 2000);
  };

  // Determine the "Desired" version (latest commit in GitHub)
  const latestCommit = commits.length > 0 ? commits[0].hash : '...';

  return (
    <div className="gitops-wrapper">
      <div className="gitops-page-header">
        <h1>GitOps</h1>
      </div>

      <div className="gitops-dashboard">
        
        {/* LEFT COLUMN: Git Repository */}
        <div className="panel-card">
          <div className="panel-header">
            <div className="panel-title">
              <Hexagon size={16} className="icon" />
              priyanshuvatsyan/DevopsPlayground
            </div>
            <div className="panel-badge">master</div>
          </div>
          <div className="panel-subheader text-blue">
            Desired: {latestCommit}
          </div>
          <div className="panel-list">
            {commits.length === 0 ? (
              <div style={{ padding: '20px', color: '#6b778c' }}>Loading commits...</div>
            ) : (
              commits.map((commit, idx) => (
                <div key={idx} className="list-item">
                  <div className="commit-header">
                    <div className="commit-hash">
                      {commit.hash}
                      {commit.isHead && <span className="head-badge">HEAD</span>}
                    </div>
                    <div className="commit-time">{timeAgo(commit.time)}</div>
                  </div>
                  <p className="commit-msg">{commit.msg}</p>
                  <div className="commit-author">{commit.author}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* CENTER COLUMN: Argo CD Controller */}
        <div className="sync-center">
          <div className="sync-label">Argo CD Sync</div>
          <div className="sync-circle" style={{ borderColor: syncStatus.status === 'Synced' ? '#36b37e' : '#ffc400' }}>
            {isSyncing ? (
              <RefreshCw size={36} strokeWidth={3} className="spin-animation" style={{ color: '#0052cc' }}/>
            ) : (
              <Check size={36} strokeWidth={3} style={{ color: syncStatus.status === 'Synced' ? '#36b37e' : '#ffc400' }} />
            )}
          </div>
          <div className="sync-status" style={{ color: syncStatus.status === 'Synced' ? '#36b37e' : '#ffc400' }}>
            {syncStatus.status}
          </div>
          <button 
            className="btn-force-sync" 
            onClick={handleForceSync}
            disabled={isSyncing}
          >
            {isSyncing ? 'Syncing...' : 'Force Sync'}
          </button>
          
          <div className="sync-flow">
            <p className="text-gray">Repo → Cluster</p>
            <p className="text-purple">{latestCommit}</p>
            <p className="text-gray">↓</p>
            <p className="text-green">{syncStatus.commit}</p>
          </div>
        </div>

        {/* RIGHT COLUMN: Kubernetes Cluster */}
        <div className="panel-card">
          <div className="panel-header">
            <div className="panel-title">
              <Hexagon size={16} className="icon" />
              devopsplayground-cluster
            </div>
          </div>
          <div className="panel-subheader text-green">
            Running: {syncStatus.commit}
          </div>
          <div className="panel-list">
            {resources.length === 0 ? (
              <div style={{ padding: '20px', color: '#6b778c' }}>Loading resources...</div>
            ) : (
              resources.map((res, idx) => (
                <div key={idx} className="list-item">
                  <div className="resource-header">
                    <div className="resource-name">
                      <span>{res.type}</span>
                      <strong>{res.name}</strong>
                    </div>
                    <div className="resource-status">{res.status}</div>
                  </div>
                  <div className="resource-image">{res.image}</div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}