import React, { useEffect, useState } from 'react'

function App() {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    chrome.storage.local.get(['enabled'], (result) => {
      const res = result as any
      setEnabled(res.enabled !== undefined ? res.enabled : true)
    })
  }, [])

  const toggle = () => {
    const newState = !enabled
    setEnabled(newState)
    chrome.storage.local.set({ enabled: newState })
  }

  return (
    <div className="container">
      <div className="header">Auto Captcha</div>
      
      <div className="card toggle-row">
        <span>Status</span>
        <button 
          onClick={toggle}
          style={{ backgroundColor: enabled ? '#10b981' : '#ef4444' }}
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      <div className="card">
        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Recent Activity</div>
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Check console for details.
        </div>
      </div>
    </div>
  )
}

export default App
