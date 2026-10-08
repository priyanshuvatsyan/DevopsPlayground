import React, { useState } from 'react';
import './Chaos.css';

export default function Chaos() {
  // Modal & Interaction State
  const [showKillModal, setShowKillModal] = useState(false);
  const [availablePods, setAvailablePods] = useState([]);
  const [selectedPod, setSelectedPod] = useState(null);
  const [isFetchingPods, setIsFetchingPods] = useState(false);
  const [isKilling, setIsKilling] = useState(false);
  const [isStressing, setIsStressing] = useState(false);
  const [isScaling, setIsScaling] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [isLeaking, setIsLeaking] = useState(false);
  const [isPartitioning, setIsPartitioning] = useState(false);

  // Dynamic History State
  const [history, setHistory] = useState([
    { id: 'exp-001', name: 'Pod Kill Resilience', status: 'Pass', time: '2h ago' },
    { id: 'exp-002', name: 'Network Latency 200ms', status: 'Pass', time: '5h ago' },
    { id: 'exp-003', name: 'CPU Saturation 90%', status: 'Fail', time: '1d ago' },
  ]);

  const chaosExperiments = [
    {
      id: 'kill-pod',
      title: 'Kill Pod',
      target: 'Select active pod',
      desc: 'Force-terminates selected pod. K8s will reschedule.',
      theme: 'red',
      icon: <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    },
{
      id: 'network-partition',
      title: 'Network Partition',
      target: 'Isolate devops-client',
      desc: isPartitioning ? 'Traffic dropped. Auto-recovering in 30s...' : 'Introduces network partition via NetworkPolicy (Deny All).',
      theme: 'orange',
      icon: <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
    },
    {
      id: 'cpu-stress',
      title: 'CPU Stress',
      target: '45s on api-server',
      desc: isStressing ? 'Stress test in progress. Check Monitoring...' : 'Injects CPU pressure to test HPA scaling behavior.',
      theme: 'orange',
      icon: <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><path d="M12 2l4 8H8z"></path></svg>
    },
    {
      id: 'memory-leak',
      title: 'Memory Leak',
      target: 'Simulate OOMKill',
      desc: isLeaking ? 'Allocating memory. Awaiting Kubernetes OOMKill termination...' : 'Allocates memory until OOMKill triggers and pod restarts.',
      theme: 'purple',
      icon: <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><polygon points="12 2 22 12 12 22 2 12 12 2"></polygon></svg>
    },
    {
      id: 'rollback',
      title: 'Rollback Deployment',
      target: 'devops-server → v1.14.2',
      desc: isRollingBack ? 'Injecting drift...' : 'Rolls back via image patch. Argo CD will auto-sync to recover.',
      theme: 'blue',
      icon: <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
    },
    {
      id: 'scale-zero',
      title: 'Scale to Zero',
      target: 'devops-client deployment',
      desc: isScaling ? 'Outage in progress. 30s automated recovery scheduled...' : 'Induced outage (replicas: 0). Automated recovery triggers in 30s.',
      theme: 'green',
      icon: <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><path d="M12 22l-4-8h8z"></path></svg>
    }
  ];

  // Execute Network Partition
  const executeNetworkPartition = async () => {
    if (isPartitioning) return;
    setIsPartitioning(true);
    const newExpId = `exp-${Math.floor(100 + Math.random() * 900)}`;
    
    try {
      const res = await fetch('/api/chaos/network-partition', { method: 'POST' });
      if (res.ok) {
        setHistory(prev => [{ id: newExpId, name: `Network Partition (devops-client)`, status: 'Pass', time: 'Just now' }, ...prev]);
      } else {
        throw new Error("Failed to trigger partition");
      }
    } catch (err) {
      console.error(err);
      setHistory(prev => [{ id: newExpId, name: `Network Partition failed`, status: 'Fail', time: 'Just now' }, ...prev]);
    } finally {
      // Keep UI in loading state for the exact duration of the backend outage
      setTimeout(() => setIsPartitioning(false), 30000);
    }
  };

  // Fetch running pods for the Kill Pod modal
  const handleKillPodClick = async () => {
    setShowKillModal(true);
    setIsFetchingPods(true);
    setSelectedPod(null);
    try {
      const res = await fetch('/api/pods');
      if (res.ok) {
        const data = await res.json();
        const killablePods = data.pods.filter(p => p.status !== 'Error');
        setAvailablePods(killablePods);
      }
    } catch (err) {
      console.error("Failed to fetch pods for chaos action", err);
    } finally {
      setIsFetchingPods(false);
    }
  };

  // Execute Pod Deletion
  const executePodKill = async () => {
    if (!selectedPod) return;
    setIsKilling(true);
    try {
      const res = await fetch(`/api/pods/${selectedPod}`, { method: 'DELETE' });
      const newExpId = `exp-${Math.floor(100 + Math.random() * 900)}`;
      
      if (res.ok) {
        setHistory(prev => [
          { id: newExpId, name: `Killed pod: ${selectedPod}`, status: 'Pass', time: 'Just now' },
          ...prev
        ]);
        setShowKillModal(false);
      } else {
        setHistory(prev => [
          { id: newExpId, name: `Failed to kill: ${selectedPod}`, status: 'Fail', time: 'Just now' },
          ...prev
        ]);
      }
    } catch (err) {
      console.error("Failed to kill pod", err);
    } finally {
      setIsKilling(false);
    }
  };

  // Execute CPU Stress
  const executeCpuStress = async () => {
    if (isStressing) return;
    setIsStressing(true);
    
    const newExpId = `exp-${Math.floor(100 + Math.random() * 900)}`;
    
    try {
      const res = await fetch('/api/chaos/cpu-stress', { method: 'POST' });
      if (res.ok) {
        setHistory(prev => [
          { id: newExpId, name: 'CPU Saturation (45s)', status: 'Pass', time: 'Just now' },
          ...prev
        ]);
      } else {
        throw new Error("Failed to trigger stress");
      }
    } catch (err) {
      console.error(err);
      setHistory(prev => [
        { id: newExpId, name: 'CPU Saturation (45s)', status: 'Fail', time: 'Just now' },
        ...prev
      ]);
    } finally {
      setTimeout(() => setIsStressing(false), 1000); 
    }
  };

  // Execute Scale to Zero
  const executeScaleToZero = async () => {
    if (isScaling) return;
    setIsScaling(true);
    const targetDeployment = "devops-client"; 
    const newExpId = `exp-${Math.floor(100 + Math.random() * 900)}`;
    
    try {
      const res = await fetch(`/api/chaos/deployments/${targetDeployment}/scale-zero`, { method: 'POST' });
      if (res.ok) {
        setHistory(prev => [{ id: newExpId, name: `Scaled to 0: ${targetDeployment}`, status: 'Pass', time: 'Just now' }, ...prev]);
      } else {
        throw new Error("Failed to scale");
      }
    } catch (err) {
      console.error(err);
      setHistory(prev => [{ id: newExpId, name: `Scale failed: ${targetDeployment}`, status: 'Fail', time: 'Just now' }, ...prev]);
    } finally {
      setTimeout(() => setIsScaling(false), 1000);
    }
  };

  // Execute Rollback
  const executeRollback = async () => {
    if (isRollingBack) return;
    setIsRollingBack(true);
    const targetDeployment = "devops-server"; 
    const newExpId = `exp-${Math.floor(100 + Math.random() * 900)}`;
    
    try {
      const res = await fetch(`/api/chaos/deployments/${targetDeployment}/rollback`, { method: 'POST' });
      if (res.ok) {
        setHistory(prev => [{ id: newExpId, name: `Manual Rollback: ${targetDeployment}`, status: 'Pass', time: 'Just now' }, ...prev]);
      } else {
        throw new Error("Failed to rollback");
      }
    } catch (err) {
      console.error(err);
      setHistory(prev => [{ id: newExpId, name: `Rollback failed: ${targetDeployment}`, status: 'Fail', time: 'Just now' }, ...prev]);
    } finally {
      setTimeout(() => setIsRollingBack(false), 1000);
    }
  };

  // Execute Memory Leak
  const executeMemoryLeak = async () => {
    if (isLeaking) return;
    setIsLeaking(true);
    const newExpId = `exp-${Math.floor(100 + Math.random() * 900)}`;
    
    try {
      const res = await fetch('/api/chaos/memory-leak', { method: 'POST' });
      if (res.ok) {
        setHistory(prev => [{ id: newExpId, name: `Simulated OOMKill (Memory Leak)`, status: 'Pass', time: 'Just now' }, ...prev]);
      } else {
        throw new Error("Failed to trigger memory leak");
      }
    } catch (err) {
      console.error(err);
      setHistory(prev => [{ id: newExpId, name: `Memory Leak failed`, status: 'Fail', time: 'Just now' }, ...prev]);
    } finally {
      setTimeout(() => setIsLeaking(false), 3000);
    }
  };

  // Route clicks to the right experiment handler
const handleCardClick = (expId) => {
    if (expId === 'kill-pod') handleKillPodClick();
    if (expId === 'cpu-stress') executeCpuStress();
    if (expId === 'scale-zero') executeScaleToZero();
    if (expId === 'rollback') executeRollback();
    if (expId === 'memory-leak') executeMemoryLeak(); 
    if (expId === 'network-partition') executeNetworkPartition(); 
  };

  return (
    <div className="chaos-wrapper">
      {/* KILL POD MODAL */}
      {showKillModal && (
        <div className="chaos-modal-overlay">
          <div className="chaos-modal">
            <h2>Select Pod to Terminate</h2>
            <p>Kubernetes will immediately detect the missing pod and attempt to schedule a replacement to maintain the desired replica count.</p>
            
            <div className="pod-selection-list">
              {isFetchingPods ? (
                <div className="modal-loading">Loading live pods...</div>
              ) : availablePods.length === 0 ? (
                <div className="modal-loading">No active pods found.</div>
              ) : (
                availablePods.map(pod => (
                  <div 
                    key={pod.name} 
                    className={`pod-selection-item ${selectedPod === pod.name ? 'selected' : ''}`}
                    onClick={() => setSelectedPod(pod.name)}
                  >
                    <div className="pod-name">{pod.name}</div>
                    <div className="pod-meta">Tier: {pod.tier} | Age: {pod.age}</div>
                  </div>
                ))
              )}
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowKillModal(false)} disabled={isKilling}>Cancel</button>
              <button 
                className="btn-danger" 
                onClick={executePodKill} 
                disabled={!selectedPod || isKilling}
              >
                {isKilling ? 'Terminating...' : 'Inject Fault (Kill Pod)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="chaos-page-header">
        <h1>Chaos Engineering</h1>
      </div>

      {/* MAIN CARDS */}
      <div className="chaos-main-card">
        <div className="chaos-grid">
          {chaosExperiments.map((exp) => (
            <div 
              key={exp.id} 
              className={`chaos-card theme-${exp.theme}`}
              onClick={() => handleCardClick(exp.id)}
            >
              <div className="card-icon">{exp.icon}</div>
              <h3>{exp.title}</h3>
              <div className="card-target">{exp.target}</div>
              <p className="card-desc">{exp.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* HISTORY TABLE */}
      <div className="history-section">
        <h3>Experiment History</h3>
        <div className="history-list">
          {history.map((item, idx) => (
            <div key={item.id + idx} className="history-row">
              <div className={`status-indicator ${item.status.toLowerCase()}`}></div>
              <div className="history-id code-text">{item.id}</div>
              <div className="history-name">{item.name}</div>
              <div className={`status-badge badge-${item.status.toLowerCase()}`}>{item.status}</div>
              <div className="history-time">{item.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}