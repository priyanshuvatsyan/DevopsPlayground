import React, { useState } from 'react';

export default function ChaosMode() {
  const [loading, setLoading] = useState(false);

  const triggerStress = async () => {
    setLoading(true);
    
    // Fire 5 concurrent requests to hit multiple backend pods simultaneously
    const requests = Array.from({ length: 5 }).map(() =>
      fetch('/api/chaos/stress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: 45000 }) 
      })
    );
    
    try {
      await Promise.all(requests);
    } catch (err) {
      console.error("Stress test failed to initiate", err);
    }

    // Keep the button disabled for the duration of the 45-second test
    setTimeout(() => setLoading(false), 45000); 
  };

  return (
    <div style={{ padding: '30px' }}>
      <h2 style={{ marginBottom: '20px' }}>Chaos Mode Initiated</h2>
      
      <div style={{ 
        border: '1px solid #ff4d4f', 
        borderRadius: '8px', 
        padding: '20px', 
        backgroundColor: '#fff1f0',
        maxWidth: '550px'
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#cf1322' }}>🔥 CPU Stress Test (HPA Trigger)</h3>
        <p style={{ color: '#5c2018', marginBottom: '20px', lineHeight: '1.5' }}>
          This will flood the backend with intense, non-blocking mathematical computations for 45 seconds. 
          Watch the Home dashboard to see the CPU percentage spike and Kubernetes automatically spin up new pods to handle the load.
        </p>
        
        <button 
          onClick={triggerStress} 
          disabled={loading}
          style={{
            backgroundColor: loading ? '#ffa39e' : '#ff4d4f',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            fontSize: '14px',
            transition: 'background-color 0.2s'
          }}
        >
          {loading ? 'Stress Test Running (45s)...' : 'Trigger CPU Spike'}
        </button>
      </div>
    </div>
  );
}