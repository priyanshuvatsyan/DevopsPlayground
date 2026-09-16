import React, { useState, useEffect, useRef } from 'react';
import './CICD.css';

export default function CICD() {
  const [currentMsg, setCurrentMsg] = useState('Loading...');
  const [inputMsg, setInputMsg] = useState('');
  const [targetMsg, setTargetMsg] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);
  const [activeStage, setActiveStage] = useState(0); // 0=None, 1=Commit, 2=Build, 3=Trivy, 4=Push, 5=Rollout, 6=Done
  
  // NEW: Terminal States
  const [logs, setLogs] = useState([]);
  const terminalEndRef = useRef(null);
  
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
      setCurrentMsg(data.message.trim()); 
    } catch (err) {
      console.error("Failed to fetch message", err);
    }
  };

  // 1. Auto-scroll terminal to the bottom whenever logs update
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // 2. Standard polling every 10 seconds
  useEffect(() => {
    fetchMessage();
    const interval = setInterval(fetchMessage, 10000); 
    return () => clearInterval(interval);
  }, []);

  // 3. The "Smart Watcher" for the final step
  useEffect(() => {
    const isMatch = currentMsg.trim() === targetMsg.trim();

    if (isDeploying && activeStage === 5 && isMatch) {
      setActiveStage(6);
      setIsDeploying(false); 
      setInputMsg(''); 
    }
  }, [currentMsg, targetMsg, isDeploying, activeStage]);

  // 4. Visual Simulator (Only handles steps 1 through 4 now)
  useEffect(() => {
    if (isDeploying && activeStage > 0 && activeStage < 5) {
      const timings = { 1: 3000, 2: 45000, 3: 20000, 4: 15000 };
      
      const timer = setTimeout(() => {
        setActiveStage(prev => prev + 1);
      }, timings[activeStage] || 5000);
      
      return () => clearTimeout(timer);
    }
  }, [isDeploying, activeStage]);

  // 5. NEW: Terminal Log Generator
  useEffect(() => {
    if (!isDeploying) {
      if (activeStage === 0 && logs.length > 0) setLogs([]); // Clear logs on reset
      return;
    }

    const stageLogs = {
      1: [
        "git add server/message.txt",
        "git config --global user.name 'github-actions[bot]'",
        "git commit -m 'chore: update message from UI trigger'",
        "[master a3f8c21] chore: update message from UI trigger",
        " 1 file changed, 1 insertion(+)",
        "git push origin master",
        "✓ Push successful. Triggering workflow..."
      ],
      2: [
        "Setting up Docker Buildx...",
        "=> [internal] load build definition from Dockerfile",
        "=> => transferring dockerfile: 32B",
        "=> [internal] load .dockerignore",
        "=> [builder 1/4] FROM docker.io/library/node:18-alpine",
        "=> [builder 2/4] WORKDIR /app",
        "=> [builder 3/4] COPY package*.json ./",
        "=> [builder 4/4] RUN npm ci",
        "Building ARM64 architecture image...",
        "✓ Docker build completed successfully."
      ],
      3: [
        "Downloading Trivy vulnerability DB...",
        "INFO  Vulnerability scanning is enabled",
        "INFO  Secret scanning is enabled",
        "Scanning image priyanshuvatsyan/devops-server:latest...",
        "Total: 0 (UNKNOWN: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0)",
        "✓ Security check passed. No severe vulnerabilities found."
      ],
      4: [
        "Logging into Docker Hub...",
        "The push refers to repository [docker.io/priyanshuvatsyan/devops-server]",
        "5f70bf18a086: Pushed",
        "8234be24c43a: Pushed",
        "latest: digest: sha256:a1b2c3d4e5f6 size: 1365",
        "✓ Image successfully pushed to registry."
      ],
      5: [
        "Applying GitOps manifest updates...",
        "Updating k8s/server-deployment.yml with new image tag",
        "git commit -m 'chore(gitops): update image tags'",
        "Argo CD synchronization triggered...",
        "Waiting for rollout to finish: 1 old replicas are pending termination...",
        "Polling cluster for updated message string..."
      ]
    };

    if (activeStage > 0 && activeStage <= 5) {
      const currentStageLogs = stageLogs[activeStage];
      let logIndex = 0;

      setLogs(prev => [...prev, `[Stage ${activeStage}] Initiating ${stages[activeStage-1].name}...`]);

      const logStream = setInterval(() => {
        if (logIndex < currentStageLogs.length) {
          const newLog = currentStageLogs[logIndex];
          setLogs(prev => [...prev, newLog]);
          logIndex++;
        } else {
          clearInterval(logStream);
        }
      }, 1500); 

      return () => clearInterval(logStream);
    } else if (activeStage === 6) {
       setLogs(prev => [...prev, "✓ Deployment completely rolled out. Cluster is synced."]);
    }
  }, [activeStage, isDeploying]);

  const triggerPipeline = async () => {
    if (!inputMsg.trim()) return;
    
    setTargetMsg(inputMsg.trim());
    setIsDeploying(true);
    setActiveStage(1); 
    setLogs(["Initializing deployment pipeline..."]); // Reset logs on start
    
    try {
      const res = await fetch('/api/demo/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: inputMsg })
      });
      
      if (!res.ok) {
        setIsDeploying(false);
        setActiveStage(0);
        setLogs(prev => [...prev, "❌ ERROR: Pipeline failed to trigger. Check API logs."]);
        alert('Pipeline failed to trigger. Check API logs.');
      }
    } catch (err) {
      setIsDeploying(false);
      setActiveStage(0);
      setLogs(prev => [...prev, "❌ ERROR: Connection to backend failed."]);
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

      {/* NEW: Terminal Window */}
      <div className="terminal-container">
        <div className="terminal-header">
          <div className="terminal-dot dot-red"></div>
          <div className="terminal-dot dot-yellow"></div>
          <div className="terminal-dot dot-green"></div>
          <div className="terminal-title">bash -- github-actions@ubuntu-latest</div>
        </div>
        <div className="terminal-body">
          {logs.length === 0 ? (
            <div style={{ color: '#666' }}>Waiting for pipeline execution...</div>
          ) : (
            logs.map((log, index) => {
              let logClass = "log-line";
              if (log.includes("✓")) logClass += " log-success";
              if (log.includes("Total: 0")) logClass += " log-success";
              if (log.includes("Waiting for rollout")) logClass += " log-warning";
              if (log.includes("❌ ERROR")) logClass += " log-warning";

              const timeString = new Date().toISOString().substring(11, 19);

              return (
                <div key={index} className={logClass}>
                  <span className="log-time">[{timeString}]</span>
                  {log}
                </div>
              );
            })
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
}