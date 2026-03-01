'use client';
import { useState } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState('');
  const [showServerPanel, setShowServerPanel] = useState(false);
  const [servers, setServers] = useState([
    { host: '138.68.153.135', username: 'root' },
    { host: '188.166.159.196', username: 'root' },
    { host: '46.101.78.167', username: 'root' }
  ]);
  const [newHost, setNewHost] = useState('');
  const [newUsername, setNewUsername] = useState('root');

  const addLog = (msg) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const addServer = () => {
    if (!newHost) return addLog('\u274c \u0627\u0644\u0631\u062c\u0627\u0621 \u0625\u062f\u062e\u0627\u0644 \u0639\u0646\u0648\u0627\u0646 IP \u0644\u0644\u0633\u064a\u0631\u0641\u0631');
    if (servers.find(s => s.host === newHost)) return addLog('\u274c \u0647\u0630\u0627 \u0627\u0644\u0633\u064a\u0631\u0641\u0631 \u0645\u0648\u062c\u0648\u062f \u0645\u0633\u0628\u0642\u0627\u064b');
    setServers(prev => [...prev, { host: newHost, username: newUsername || 'root' }]);
    addLog(`\u2705 \u062a\u0645\u062a \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0633\u064a\u0631\u0641\u0631: ${newHost}`);
    setNewHost('');
    setNewUsername('root');
  };

  const removeServer = (host) => {
    setServers(prev => prev.filter(s => s.host !== host));
    addLog(`\ud83d\uddd1\ufe0f \u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0633\u064a\u0631\u0641\u0631: ${host}`);
  };

  const handleAction = async (action) => {
    if (action === 'start' && !url) return addLog('\u274c \u062e\u0637\u0623: \u0627\u0644\u0631\u062c\u0627\u0621 \u0625\u062f\u062e\u0627\u0644 \u0627\u0644\u0631\u0627\u0628\u0637 \u0623\u0648\u0644\u0627\u064b');
    if (servers.length === 0) return addLog('\u274c \u062e\u0637\u0623: \u0644\u0627 \u064a\u0648\u062c\u062f \u0633\u064a\u0631\u0641\u0631\u0627\u062a\u060c \u0623\u0636\u0641 \u0633\u064a\u0631\u0641\u0631 \u0623\u0648\u0644\u0627\u064b');

    setLoading(true);
    setActiveAction(action);

    const actionNames = {
      setup: '\u062a\u062c\u0647\u064a\u0632 \u0627\u0644\u0633\u064a\u0631\u0641\u0631\u0627\u062a',
      deploy: '\u0631\u0641\u0639 \u0627\u0644\u0633\u0643\u0631\u064a\u0628\u062a',
      start: '\u0628\u062f\u0621 \u0627\u0644\u0647\u062c\u0648\u0645',
      stop: '\u0625\u064a\u0642\u0627\u0641 \u0627\u0644\u0643\u0644'
    };

    addLog(`\ud83d\ude80 \u062c\u0627\u0631\u064a ${actionNames[action]}...`);
    if (action === 'setup') {
      addLog('\u23f3 \u062a\u062c\u0647\u064a\u0632 \u0627\u0644\u0633\u064a\u0631\u0641\u0631\u0627\u062a \u0642\u062f \u064a\u0633\u062a\u063a\u0631\u0642 \u0639\u062f\u0629 \u062f\u0642\u0627\u0626\u0642\u060c \u0627\u0644\u0631\u062c\u0627\u0621 \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631...');
    }

    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, url, servers })
      });
      const data = await res.json();

      if (data.error) {
        addLog(`\u274c \u062e\u0637\u0623: ${data.error}`);
      } else {
        data.results.forEach(r => {
          if (r.status === 'success') {
            addLog(`\u2705 ${r.host}: ${r.output || '\u062a\u0645 \u0628\u0646\u062c\u0627\u062d'}`);
          } else {
            addLog(`\u274c ${r.host}: ${r.error}`);
          }
        });
      }
    } catch (err) {
      addLog(`\u274c \u062e\u0637\u0623 \u0641\u064a \u0627\u0644\u0646\u0638\u0627\u0645: ${err.message}`);
    }
    setLoading(false);
    setActiveAction('');
  };

  const styles = {
    page: {
      minHeight: '100vh',
      backgroundColor: '#000',
      color: '#22c55e',
      padding: '32px',
      fontFamily: 'monospace',
      direction: 'rtl'
    },
    container: {
      maxWidth: '800px',
      margin: '0 auto',
      border: '1px solid #166534',
      padding: '24px',
      borderRadius: '8px',
      backgroundColor: '#111827'
    },
    title: {
      fontSize: '28px',
      fontWeight: 'bold',
      marginBottom: '24px',
      textAlign: 'center',
      borderBottom: '1px solid #166534',
      paddingBottom: '16px',
      color: '#22c55e'
    },
    serverToggle: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '14px',
      color: '#facc15',
      cursor: 'pointer',
      background: 'none',
      border: 'none',
      marginBottom: '12px',
      fontFamily: 'monospace'
    },
    serverPanel: {
      border: '1px solid #14532d',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '16px',
      backgroundColor: '#000'
    },
    serverItem: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#111827',
      padding: '8px 12px',
      borderRadius: '6px',
      fontSize: '14px',
      color: '#4ade80',
      marginBottom: '8px'
    },
    deleteBtn: {
      color: '#ef4444',
      cursor: 'pointer',
      background: 'none',
      border: 'none',
      fontSize: '16px',
      fontFamily: 'monospace'
    },
    addServerRow: {
      display: 'flex',
      gap: '8px',
      marginTop: '12px'
    },
    input: {
      flex: 1,
      backgroundColor: '#000',
      border: '1px solid #166534',
      padding: '12px',
      borderRadius: '6px',
      color: '#fff',
      fontSize: '14px',
      fontFamily: 'monospace',
      outline: 'none'
    },
    inputSmall: {
      width: '100px',
      backgroundColor: '#000',
      border: '1px solid #166534',
      padding: '12px',
      borderRadius: '6px',
      color: '#fff',
      fontSize: '14px',
      fontFamily: 'monospace',
      outline: 'none'
    },
    addBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      backgroundColor: '#14532d',
      color: '#fff',
      padding: '8px 16px',
      borderRadius: '6px',
      cursor: 'pointer',
      border: 'none',
      fontSize: '14px',
      fontFamily: 'monospace'
    },
    label: {
      display: 'block',
      marginBottom: '8px',
      fontSize: '14px',
      color: '#22c55e'
    },
    urlInput: {
      width: '100%',
      backgroundColor: '#000',
      border: '1px solid #166534',
      padding: '12px',
      borderRadius: '6px',
      color: '#fff',
      fontSize: '16px',
      fontFamily: 'monospace',
      outline: 'none',
      boxSizing: 'border-box'
    },
    buttonGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '12px',
      marginTop: '24px'
    },
    btnSetup: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      backgroundColor: '#581c87',
      color: '#fff',
      padding: '16px 8px',
      borderRadius: '6px',
      cursor: 'pointer',
      border: 'none',
      fontSize: '13px',
      fontFamily: 'monospace',
      transition: 'background 0.2s'
    },
    btnDeploy: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      backgroundColor: '#1e3a5f',
      color: '#fff',
      padding: '16px 8px',
      borderRadius: '6px',
      cursor: 'pointer',
      border: 'none',
      fontSize: '13px',
      fontFamily: 'monospace',
      transition: 'background 0.2s'
    },
    btnStart: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      backgroundColor: '#7f1d1d',
      color: '#fff',
      padding: '16px 8px',
      borderRadius: '6px',
      cursor: 'pointer',
      border: 'none',
      fontSize: '13px',
      fontFamily: 'monospace',
      transition: 'background 0.2s'
    },
    btnStop: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      backgroundColor: '#374151',
      color: '#fff',
      padding: '16px 8px',
      borderRadius: '6px',
      cursor: 'pointer',
      border: 'none',
      fontSize: '13px',
      fontFamily: 'monospace',
      transition: 'background 0.2s'
    },
    logsHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '8px',
      marginTop: '32px'
    },
    logsTitle: {
      fontSize: '14px',
      color: '#9ca3af'
    },
    clearBtn: {
      fontSize: '12px',
      color: '#6b7280',
      cursor: 'pointer',
      background: 'none',
      border: 'none',
      fontFamily: 'monospace'
    },
    logsBox: {
      backgroundColor: '#000',
      border: '1px solid #14532d',
      height: '288px',
      overflowY: 'auto',
      padding: '16px',
      borderRadius: '6px',
      fontSize: '12px',
      fontFamily: 'monospace'
    },
    logItem: {
      marginBottom: '4px',
      borderBottom: '1px solid #111827',
      paddingBottom: '4px'
    },
    placeholder: {
      color: '#4b5563'
    },
    noServers: {
      color: '#4b5563',
      fontSize: '14px',
      textAlign: 'center'
    },
    disabledBtn: {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>
          \u2694\ufe0f \u0644\u0648\u062d\u0629 \u062a\u062d\u0643\u0645 \u0627\u0644\u0647\u062c\u0648\u0645 (Attack Panel)
        </h1>

        {/* Server Management */}
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => setShowServerPanel(!showServerPanel)}
            style={styles.serverToggle}
          >
            \ud83d\udda5\ufe0f \u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0633\u064a\u0631\u0641\u0631\u0627\u062a ({servers.length} \u0633\u064a\u0631\u0641\u0631) {showServerPanel ? '\u25b2' : '\u25bc'}
          </button>

          {showServerPanel && (
            <div style={styles.serverPanel}>
              <div>
                {servers.map((server, i) => (
                  <div key={i} style={styles.serverItem}>
                    <span>\ud83d\udda5\ufe0f {server.host} ({server.username})</span>
                    <button
                      onClick={() => removeServer(server.host)}
                      style={styles.deleteBtn}
                    >
                      \ud83d\uddd1\ufe0f
                    </button>
                  </div>
                ))}
                {servers.length === 0 && (
                  <p style={styles.noServers}>\u0644\u0627 \u064a\u0648\u062c\u062f \u0633\u064a\u0631\u0641\u0631\u0627\u062a</p>
                )}
              </div>

              <div style={styles.addServerRow}>
                <input
                  type="text"
                  value={newHost}
                  onChange={(e) => setNewHost(e.target.value)}
                  placeholder="\u0639\u0646\u0648\u0627\u0646 IP (\u0645\u062b\u0627\u0644: 192.168.1.1)"
                  style={styles.input}
                />
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645"
                  style={styles.inputSmall}
                />
                <button onClick={addServer} style={styles.addBtn}>
                  + \u0625\u0636\u0627\u0641\u0629
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Target URL */}
        <div>
          <label style={styles.label}>\u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641 (Target URL)</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            style={styles.urlInput}
          />
        </div>

        {/* Control Buttons */}
        <div style={styles.buttonGrid}>
          <button
            onClick={() => handleAction('setup')}
            disabled={loading}
            style={loading ? {...styles.btnSetup, ...styles.disabledBtn} : styles.btnSetup}
          >
            {activeAction === 'setup' ? '\u23f3' : '\u2699\ufe0f'} 0. \u062a\u062c\u0647\u064a\u0632 \u0627\u0644\u0633\u064a\u0631\u0641\u0631\u0627\u062a
          </button>

          <button
            onClick={() => handleAction('deploy')}
            disabled={loading}
            style={loading ? {...styles.btnDeploy, ...styles.disabledBtn} : styles.btnDeploy}
          >
            {activeAction === 'deploy' ? '\u23f3' : '\ud83d\udce4'} 1. \u0631\u0641\u0639 \u0627\u0644\u0633\u0643\u0631\u064a\u0628\u062a
          </button>

          <button
            onClick={() => handleAction('start')}
            disabled={loading}
            style={loading ? {...styles.btnStart, ...styles.disabledBtn} : styles.btnStart}
          >
            {activeAction === 'start' ? '\u23f3' : '\u25b6\ufe0f'} 2. \u0628\u062f\u0621 \u0627\u0644\u0647\u062c\u0648\u0645
          </button>

          <button
            onClick={() => handleAction('stop')}
            disabled={loading}
            style={loading ? {...styles.btnStop, ...styles.disabledBtn} : styles.btnStop}
          >
            {activeAction === 'stop' ? '\u23f3' : '\u23f9\ufe0f'} \u0625\u064a\u0642\u0627\u0641 \u0627\u0644\u0643\u0644
          </button>
        </div>

        {/* System Logs */}
        <div>
          <div style={styles.logsHeader}>
            <span style={styles.logsTitle}>\ud83d\udcbb \u0633\u062c\u0644 \u0627\u0644\u0646\u0638\u0627\u0645 (System Logs)</span>
            <button onClick={() => setLogs([])} style={styles.clearBtn}>
              \u0645\u0633\u062d \u0627\u0644\u0633\u062c\u0644
            </button>
          </div>
          <div style={styles.logsBox}>
            {logs.length === 0 ? (
              <span style={styles.placeholder}>\u0628\u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0644\u0623\u0648\u0627\u0645\u0631...</span>
            ) : (
              logs.map((log, i) => (
                <div key={i} style={styles.logItem}>{log}</div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
