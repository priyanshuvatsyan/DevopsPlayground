import React, { useState, useEffect, useRef } from 'react';
import './ContainerLogs.css';

export default function ContainerLogs() {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalEndRef = useRef(null);

 // Replace BOTH of your existing useEffects (the initial data and the setInterval) with this:
  
  const fetchLogs = async () => {
    if (isPaused) return; // Don't fetch new logs if paused
    
    try {
      const res = await fetch('/api/monitoring/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
      }
    } catch (err) {
      console.error("Failed to fetch logs", err);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000); // Poll for new logs every 3 seconds
    return () => clearInterval(interval);
  }, [isPaused]);


  // Handle Auto-scroll
  useEffect(() => {
    if (autoScroll) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Filter logs based on search input and level buttons
  const filteredLogs = logs.filter(log => {
    const matchesSearch = search === '' || 
      log.msg.toLowerCase().includes(search.toLowerCase()) || 
      log.source.toLowerCase().includes(search.toLowerCase());
    
    const matchesFilter = filter === 'ALL' || log.level === filter;
    
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="logs-wrapper">
      <div className="logs-page-header">
        <h1>Container Logs</h1>
        {/* <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
             <div style={{width: 12, height: 12, borderRadius: '50%', background: '#00c7e6'}}></div>
             <div style={{width: 12, height: 12, borderRadius: '50%', background: '#0052cc'}}></div>
             <div style={{width: 12, height: 12, borderRadius: '50%', background: '#998dd9'}}></div>
             <div style={{width: 12, height: 12, borderRadius: '50%', background: '#ffc400'}}></div>
             <div style={{width: 12, height: 12, borderRadius: '50%', background: '#36b37e'}}></div>
          </div>
          <span style={{ color: '#6b778c', fontFamily: 'monospace' }}>4:29:30 PM</span>
          <span style={{ color: '#36b37e', fontWeight: 'bold' }}>● Healthy</span>
        </div> */}
      </div>

      <div className="logs-toolbar">
        <input 
          type="text" 
          className="search-input" 
          placeholder="Search logs..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        
        {['ALL', 'INFO', 'WARN', 'ERROR'].map(f => (
          <button 
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}

        <button className="control-btn" onClick={() => setIsPaused(!isPaused)}>
          {isPaused ? '▶ Play' : '⏸ Pause'}
        </button>

        <label className="auto-scroll-label">
          <input 
            type="checkbox" 
            checked={autoScroll} 
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          Auto-scroll
        </label>
      </div>

      <div className="terminal-window">
        <div className="terminal-header">
          <div className="terminal-header-left">
            <div className={`status-dot ${isPaused ? 'paused' : ''}`}></div>
            <span>{isPaused ? 'Paused' : 'Streaming'} · {filteredLogs.length} lines</span>
          </div>
          <div>cluster-prod-01</div>
        </div>
        
        <div className="terminal-body">
          {filteredLogs.map((log, idx) => (
            <div key={idx} className={`log-line line-${log.level}`}>
              <div className="log-time">{log.time}</div>
              <div className={`log-level level-${log.level}`}>{log.level}</div>
              <div className="log-source">{log.source}</div>
              <div className="log-msg">{log.msg}</div>
            </div>
          ))}
          {!isPaused && autoScroll && <div className="cursor-block"></div>}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
}