import React, { useState, useEffect } from 'react';
import './CICD.css';

export default function CICD() {
  const [currentMsg, setCurrentMsg] = useState('Loading...');
  const [inputMsg, setInputMsg] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [activeStage, setActiveStage] = useState(0); // 0=None, 1=Commit, 2=Build, 3=Trivy, 4=Push, 5=ArgoCD
  
  // Pipeline definition based on your GitHub Actions YAML
  const stages = [
    { id: 1, name: 'Git Commit', meta: 'message.txt' },
    { id: 2, name: 'Docker Build', meta: 'ARM64 QEMU' },
    { id: 3, name: 'Trivy Scan', meta: 'Security Check' },
    { id: 4, name: 'Push Image', meta: 'Docker Hub' },
    { id: 5, name: 'Argo CD Sync', meta: 'K8s Deployment' }
  ];

  // Fetch current live message from Kubernetes
  const fetchMessage = async () => {
    try {
      const res = await fetch('/api/demo/message');
      const data = await res.json();
      setCurrentMsg(data.message);
    } catch (err) {
      console.error("Failed to fetch message", err);
    }
  };

  useEffect(() => {
    fetchMessage();
    const interval = setInterval(fetchMessage, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, []);

  // Visual Simulator for the Pipeline UI
  useEffect(() => {
    if (isDeploying && activeStage > 0 && activeStage <= 5) {
      // Simulate pipeline progression times (adjust timings for demo purposes)
      const timings = { 1: 3000, 2: 45000, 3: 20000, 4: 15000, 5: 30000 };
      
      const timer = setTimeout(() => {
        if (activeStage === 5) {
          setIsDeploying(false);
          setActiveStage(6); // 6 = all complete
          fetchMessage(); // Force refresh to catch the new pod
        } else {
          setActiveStage(prev => prev + 1);
        }
      }, timings[activeStage] || 5000);
      
      return () => clearTimeout(timer);
    }
  }, [isDeploying, activeStage]);

  const triggerPipeline = async () => {
    if (!inputMsg.trim()) return;
    setIsDeploying(true);
    setActiveStage(1); // Start at step 1
    
    try {
      const res = await fetch('/api/demo/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: inputMsg })
      });
      
      if (!res.ok) {
        setIsDeploying(false);
        setActiveStage(0);
        alert('Pipeline failed to trigger. Check API logs.');
      }
    } catch (err) {
      setIsDeploying(false);
      setActiveStage(0);
      alert('Error connecting to backend.');
    }
  };

  return (
    <div className="cicd-wrapper">
      <div className="cicd-header">
        <h1>CI/CD Pipeline</h1>
        <div style={{ color: '#36b37e', fontWeight: 'bold' }}>
          ● Cluster Healthy
        </div>
      </div>

      {/* GitOps Trigger Component */}
      <div className="cicd-card">
        <h3 style={{ marginTop: 0, marginBottom: '16px' }}>GitOps Live Demo</h3>
        <div className="gitops-trigger-section">
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '0.85rem', color: '#6b778c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Active Message in Kubernetes Pod
            </span>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#172b4d', marginTop: '4px' }}>
              "{currentMsg}"
            </div>
          </div>
          <input 
            className="gitops-input"
            type="text" 
            placeholder="Enter new code message..."
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            disabled={isDeploying}
          />
          <button 
            className="gitops-btn" 
            onClick={triggerPipeline}
            disabled={isDeploying || !inputMsg.trim()}
          >
            {isDeploying ? 'Pipeline Running...' : 'Commit & Deploy ►'}
          </button>
        </div>
      </div>

      {/* Active Pipeline Visualizer */}
      <div className="cicd-card">
        <div className="pipeline-run-header">
          <div className="pipeline-run-info">
            <h3>Pipeline Run {activeStage > 0 ? '#483' : '#482'}</h3>
            <p>UI Trigger • commit {activeStage > 0 ? 'pending...' : 'a3f8c21'}</p>
          </div>
        </div>

        <div className="pipeline-stages-container">
          {stages.map((stage, index) => {
            let stateClass = 'stage-pending';
            let icon = '•';
            
            if (activeStage > stage.id || activeStage === 6) {
              stateClass = 'stage-success';
              icon = '✓';
            } else if (activeStage === stage.id) {
              stateClass = 'stage-active';
              icon = '⚙';
            }

            return (
              <React.Fragment key={stage.id}>
                <div className={`pipeline-stage ${stateClass}`}>
                  <div className="stage-status-icon">{icon}</div>
                  <div className="stage-title">{stage.name}</div>
                  <div className="stage-meta">{stage.meta}</div>
                </div>
                
                {/* Don't render a connector line after the last stage */}
                {index < stages.length - 1 && (
                  <div className={`stage-connector ${
                    activeStage > stage.id ? 'connector-success' : 
                    activeStage === stage.id ? 'connector-active' : ''
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Recent Runs History */}
      <div className="cicd-card">
        <h3 style={{ margin: '0 0 20px 0' }}>Recent Runs</h3>
        <table className="recent-runs-table">
          <tbody>
            <tr>
              <td><span className="status-dot dot-active"></span> #483</td>
              <td>UI Trigger: Update message</td>
              <td style={{ textAlign: 'right' }}>{activeStage > 0 ? 'running' : 'pending'}</td>
            </tr>
            <tr>
              <td><span className="status-dot dot-success"></span> #482</td>
              <td>chore(gitops): update image tags</td>
              <td style={{ textAlign: 'right' }}>a3f8c21 • 12m ago</td>
            </tr>
            <tr>
              <td><span className="status-dot dot-success"></span> #481</td>
              <td>feat: enable advanced multi-arch builds</td>
              <td style={{ textAlign: 'right' }}>b91d4f0 • 1h ago</td>
            </tr>
            <tr>
              <td><span className="status-dot dot-failed"></span> #480</td>
              <td>fix: correct env indentation for github secret</td>
              <td style={{ textAlign: 'right' }}>c44e2b1 • 3h ago</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}