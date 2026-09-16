import React, { useState, useEffect } from 'react';
import './CICD.css';

export default function CICD() {
  const [currentMsg, setCurrentMsg] = useState('Loading...');
  const [inputMsg, setInputMsg] = useState('');
  const [targetMsg, setTargetMsg] = useState(''); // NEW: Tracks the exact message we are waiting for
  const [isDeploying, setIsDeploying] = useState(false);
  const [activeStage, setActiveStage] = useState(0); // 0=None, 1=Commit, 2=Build, 3=Trivy, 4=Push, 5=Rollout, 6=Done
  
  // UPDATED: Changed the final stage to reflect the actual K8s pod creation
  const stages = [
    { id: 1, name: 'Git Commit', meta: 'message.txt' },
    { id: 2, name: 'Docker Build', meta: 'ARM64 QEMU' },
    { id: 3, name: 'Trivy Scan', meta: 'Security Check' },
    { id: 4, name: 'Push Image', meta: 'Docker Hub' },
    { id: 5, name: 'Pod Rollout', meta: 'Waiting for K8s...' } 
  ];

  const fetchMessage = async () => {
    try {
      const res = await fetch('/api/demo/message');
      const data = await res.json();
      setCurrentMsg(data.message);
    } catch (err) {
      console.error("Failed to fetch message", err);
    }
  };

  // 1. Standard polling every 10 seconds
  useEffect(() => {
    fetchMessage();
    const interval = setInterval(fetchMessage, 10000); 
    return () => clearInterval(interval);
  }, []);

  // 2. NEW: The "Smart Watcher" for the final step
  useEffect(() => {
    // If we are waiting at step 5, and the live message finally matches what we typed...
    if (isDeploying && activeStage === 5 && currentMsg === targetMsg) {
      setActiveStage(6); // Mark all as completed (Green Checks)
      setIsDeploying(false); // Enable the input field again
      setInputMsg(''); // Clear the input field automatically
    }
  }, [currentMsg, targetMsg, isDeploying, activeStage]);

  // 3. Visual Simulator (Only handles steps 1 through 4 now)
  useEffect(() => {
    if (isDeploying && activeStage > 0 && activeStage < 5) {
      const timings = { 1: 3000, 2: 45000, 3: 20000, 4: 15000 };
      
      const timer = setTimeout(() => {
        setActiveStage(prev => prev + 1);
      }, timings[activeStage] || 5000);
      
      return () => clearTimeout(timer);
    }
    // Notice there is no timer for step 5 anymore! 
    // It will spin forever until the Smart Watcher (above) clears it.
  }, [isDeploying, activeStage]);

  const triggerPipeline = async () => {
    if (!inputMsg.trim()) return;
    
    setTargetMsg(inputMsg.trim()); // Save the target string to compare against later
    setIsDeploying(true);
    setActiveStage(1); 
    
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

      <div className="cicd-card">
        <div className="pipeline-run-header">
          <div className="pipeline-run-info">
            <h3>Pipeline Run {activeStage > 0 ? '#484' : '#483'}</h3>
            <p>UI Trigger • commit {activeStage > 0 ? 'pending...' : 'latest'}</p>
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
    </div>
  );
}