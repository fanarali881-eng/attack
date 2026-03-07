'use client';
import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [durationMin, setDurationMin] = useState('5');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState('');
  const [showServerPanel, setShowServerPanel] = useState(false);
  const [servers, setServers] = useState([
    { host: '138.68.141.40', username: 'root' },
    { host: '144.126.234.13', username: 'root' },
    { host: '46.101.52.177', username: 'root' },
    { host: '142.93.41.217', username: 'root' },
    { host: '167.99.94.250', username: 'root' },
    { host: '165.22.118.138', username: 'root' },
    { host: '167.71.135.147', username: 'root' },
    { host: '138.68.141.255', username: 'root' },
    { host: '206.189.21.125', username: 'root' }
  ]);
  const [newHost, setNewHost] = useState('');
  const [newUsername, setNewUsername] = useState('root');
  const [useProxy, setUseProxy] = useState(true);
  const [proxyHost, setProxyHost] = useState('proxy.packetstream.io');
  const [proxyPort, setProxyPort] = useState('31112');
  const [proxyUser, setProxyUser] = useState('');
  const [proxyPass, setProxyPass] = useState('');
  const [proxyCount, setProxyCount] = useState('10');
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaApiKey, setCaptchaApiKey] = useState('');
  const [monitoring, setMonitoring] = useState(false);
  const [serverStatus, setServerStatus] = useState([]);
  const [attackStartTime, setAttackStartTime] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [attackSummary, setAttackSummary] = useState(null);
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);
  const [proxyStatus, setProxyStatus] = useState(null);
  const [panelApiKey, setPanelApiKey] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('panelApiKey') || 'Fadi@Attack2026!SecureKey#X9';
    return 'Fadi@Attack2026!SecureKey#X9';
  });
  const [showApiKeyInput, setShowApiKeyInput] = useState(true);

  // Persist API key in localStorage
  useEffect(() => {
    if (panelApiKey) localStorage.setItem('panelApiKey', panelApiKey);
  }, [panelApiKey]);

  const addLog = (msg) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  // Check proxy balance/validity
  const checkProxy = async () => {
    setProxyStatus('checking');
    try {
      const res = await fetch('/api/proxy-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': panelApiKey },
        body: JSON.stringify({ host: proxyHost, port: proxyPort, username: proxyUser, password: proxyPass })
      });
      const data = await res.json();
      setProxyStatus(data.status);
      if (data.status === 'expired') addLog('⚠️ البروكسي منتهي - يجب إضافة رصيد');
      else if (data.status === 'active') addLog('✅ البروكسي شغال');
      else addLog(`⚠️ حالة البروكسي: ${data.message}`);
    } catch(e) {
      setProxyStatus('error');
      addLog('❌ فشل فحص البروكسي');
    }
  };

  // Auto-check proxy when enabled
  useEffect(() => {
    if (useProxy && proxyHost && proxyPass) {
      checkProxy();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useProxy, proxyHost, proxyPass]);

  // Dynamic calculations based on duration
  const WAVE_SIZE = 150;
  const VISITS_PER_MINUTE = 300;
  const calcTotalVisits = (min) => {
    const m = parseInt(min) || 0;
    return m * VISITS_PER_MINUTE * servers.length;
  };
  const calcTotalWaves = (min) => {
    const m = parseInt(min) || 0;
    return m * 2; // 2 waves per minute per server
  };
  const calcVisitsPerServer = (min) => {
    const m = parseInt(min) || 0;
    return m * VISITS_PER_MINUTE;
  };

  const totalVisitsEstimate = calcTotalVisits(durationMin);
  const totalWaves = calcTotalWaves(durationMin);
  const visitsPerServer = calcVisitsPerServer(durationMin);
  const activeVisitorsEstimate = WAVE_SIZE * servers.length;

  const formatDuration = (seconds) => {
    if (seconds <= 0) return '0 ثانية';
    if (seconds < 60) return `${seconds} ثانية`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (secs === 0) return `${mins} دقيقة`;
    return `${mins} دقيقة و ${secs} ثانية`;
  };

  // Countdown timer
  useEffect(() => {
    if (attackStartTime && monitoring && serverStatus.length > 0) {
      const activeServers = serverStatus.filter(s => s.status === 'running' || s.status === 'starting');
      const finishedServers = serverStatus.filter(s => s.status === 'finished');
      const totalDone = serverStatus.reduce((sum, s) => sum + (s.visits || 0), 0);
      const totalTarget = serverStatus.reduce((sum, s) => sum + (s.target || 0), 0);
      const maxElapsed = Math.max(...serverStatus.map(s => s.elapsed || 0), 1);
      
      if (totalDone > 0 && totalTarget > 0) {
        const realSpeed = totalDone / maxElapsed;
        const remaining = totalTarget - totalDone;
        if (realSpeed > 0) {
          const secsLeft = Math.ceil(remaining / realSpeed);
          setRemainingSeconds(secsLeft);
        }
      }
      
      if (activeServers.length === 0 && finishedServers.length > 0) {
        setRemainingSeconds(0);
      }
    }
  }, [serverStatus, attackStartTime, monitoring]);

  // Tick countdown every second
  useEffect(() => {
    if (remainingSeconds !== null && remainingSeconds > 0 && monitoring) {
      countdownRef.current = setInterval(() => {
        setRemainingSeconds(prev => prev !== null && prev > 0 ? prev - 1 : 0);
      }, 1000);
      return () => clearInterval(countdownRef.current);
    }
  }, [remainingSeconds, monitoring]);

  // Fetch status from all servers
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': panelApiKey },
        body: JSON.stringify({ servers })
      });
      const data = await res.json();
      if (data.results) {
        const filtered = data.results.map(s => {
          if (s.status === 'finished' && !attackStartTime) {
            return { ...s, status: 'idle', visits: 0, target: 0, progress: 0, elapsed: 0, errors: 0 };
          }
          if (s.timestamp && attackStartTime && (s.timestamp * 1000) < attackStartTime) {
            return { ...s, status: 'starting', visits: 0, target: visitsPerServer, progress: 0, elapsed: 0, errors: 0 };
          }
          return s;
        });
        setServerStatus(filtered);
        const activeServers = filtered.filter(s => s.status === 'running');
        const finishedServers = filtered.filter(s => s.status === 'finished');
        const allDone = activeServers.length === 0 && finishedServers.length > 0;
        if (allDone) {
          stopMonitoring();
          const sumVisits = filtered.reduce((sum, s) => sum + (s.visits || 0), 0);
          const sumErrors = filtered.reduce((sum, s) => sum + (s.errors || 0), 0);
          const maxElapsed = Math.max(...filtered.map(s => s.elapsed || 0), 0);
          const totalRate = maxElapsed > 0 ? Math.round((sumVisits / maxElapsed) * 60) : 0;
          const totalActiveVisitors = filtered.reduce((sum, s) => sum + (s.active_visitors || 0), 0);
          setAttackSummary({ target: totalVisitsEstimate, visits: sumVisits, errors: sumErrors, elapsed: maxElapsed, rate: totalRate, activeVisitors: totalActiveVisitors });
          addLog(`✅ انتهت جميع العمليات | المدة: ${durationMin} دقيقة | الزيارات: ${sumVisits} | الفاشلة: ${sumErrors} | الوقت: ${formatTime(maxElapsed)} | السرعة: ${totalRate}/دقيقة`);
        }
      }
    } catch (err) {
      // silent fail
    }
  };

  const startMonitoring = () => {
    setMonitoring(true);
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 15000);
  };

  const stopMonitoring = () => {
    setMonitoring(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

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
    if (!panelApiKey) return addLog('❌ خطأ: الرجاء إدخال مفتاح API أولاً');
    if (action === 'start' && !url) return addLog('❌ خطأ: الرجاء إدخال الرابط أولاً');
    if (action === 'start' && !/^https?:\/\//i.test(url)) return addLog('❌ خطأ: الرابط لازم يبدأ بـ http:// أو https://');
    if (action === 'start' && !durationMin) return addLog('❌ خطأ: الرجاء إدخال المدة بالدقائق');

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
      addLog(`📊 المدة: ${durationMin} دقيقة | الزيارات المتوقعة: ${totalVisitsEstimate.toLocaleString()} | 👥 ${activeVisitorsEstimate} زائر نشط | 🌊 ${totalWaves} موجة/سيرفر`);
      stopMonitoring();
      setServerStatus([]);
      setAttackStartTime(null);
      setRemainingSeconds(null);
    }

    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': panelApiKey },
        body: JSON.stringify({ action, url, durationMin: parseInt(durationMin), servers, proxies: useProxy ? buildProxyList() : [], captchaApiKey: captchaEnabled ? captchaApiKey : '' })
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
        if (action === 'start') {
          setAttackStartTime(Date.now());
          setRemainingSeconds(parseInt(durationMin) * 60);
          setAttackSummary(null);
          addLog('⏳ انتظار بدء العمليات على السيرفرات...');
          setTimeout(() => {
            startMonitoring();
          }, 8000);
        }
        if (action === 'stop') {
          stopMonitoring();
          setServerStatus([]);
          setAttackStartTime(null);
          setRemainingSeconds(null);
        }
      }
    } catch (err) {
      addLog(`❌ خطأ في النظام: ${err.message}`);
    }
    setLoading(false);
    setActiveAction('');
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'running': return '#22c55e';
      case 'starting': return '#facc15';
      case 'finished': return '#3b82f6';
      case 'idle': return '#6b7280';
      case 'offline': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getModeText = (mode) => {
    switch(mode) {
      case 'stealth': return '🕵️ STEALTH';
      case 'fast': return '⚡ FAST';
      case 'normal': return '🌐 NORMAL';
      case 'flaresolverr': return '🔥 FLARE';
      case 'wave_cf': return '🌊 WAVE+CF';
      case 'wave_fast': return '🌊 WAVE';
      default: return '';
    }
  };

  const getModeColor = (mode) => {
    switch(mode) {
      case 'stealth': return '#a855f7';
      case 'fast': return '#22c55e';
      case 'normal': return '#3b82f6';
      case 'flaresolverr': return '#f97316';
      case 'wave_cf': return '#06b6d4';
      case 'wave_fast': return '#06b6d4';
      default: return '#6b7280';
    }
  };

  const getStatusText = (status) => {
    switch(status) {
      case 'running': return '🟢 شغال';
      case 'starting': return '🟡 يبدأ...';
      case 'finished': return '🔵 انتهى';
      case 'idle': return '⚪ خامل';
      case 'offline': return '🔴 غير متصل';
      default: return '⚪ غير معروف';
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const buildProxyList = () => {
    const list = [];
    const count = parseInt(proxyCount) || 10;
    for (let i = 1; i <= count; i++) {
      list.push({ host: proxyHost, port: proxyPort, username: proxyUser, password: proxyPass });
    }
    return list;
  };

  const fontFamily = "'Courier New', 'Noto Sans Arabic', 'Segoe UI', Tahoma, monospace";

  const styles = {
    page: { minHeight: '100vh', backgroundColor: '#000', color: '#22c55e', padding: '32px', fontFamily, direction: 'rtl' },
    container: { maxWidth: '800px', margin: '0 auto', border: '1px solid #166534', padding: '24px', borderRadius: '8px', backgroundColor: '#111827' },
    title: { fontSize: '28px', fontWeight: 'bold', marginBottom: '24px', textAlign: 'center', borderBottom: '1px solid #166534', paddingBottom: '16px', color: '#22c55e' },
    serverToggle: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#facc15', cursor: 'pointer', background: 'none', border: 'none', marginBottom: '12px', fontFamily },
    serverPanel: { border: '1px solid #14532d', borderRadius: '8px', padding: '16px', marginBottom: '16px', backgroundColor: '#000' },
    serverItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#111827', padding: '8px 12px', borderRadius: '6px', fontSize: '14px', color: '#4ade80', marginBottom: '8px' },
    deleteBtn: { color: '#ef4444', cursor: 'pointer', background: 'none', border: 'none', fontSize: '16px', fontFamily },
    addServerRow: { display: 'flex', gap: '8px', marginTop: '12px' },
    input: { flex: 1, backgroundColor: '#000', border: '1px solid #166534', padding: '12px', borderRadius: '6px', color: '#fff', fontSize: '14px', fontFamily, outline: 'none' },
    inputSmall: { width: '100px', backgroundColor: '#000', border: '1px solid #166534', padding: '12px', borderRadius: '6px', color: '#fff', fontSize: '14px', fontFamily, outline: 'none' },
    addBtn: { display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#14532d', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', border: 'none', fontSize: '14px', fontFamily },
    label: { display: 'block', marginBottom: '8px', fontSize: '14px', color: '#22c55e' },
    urlInput: { width: '100%', backgroundColor: '#000', border: '1px solid #166534', padding: '12px', borderRadius: '6px', color: '#fff', fontSize: '16px', fontFamily, outline: 'none', boxSizing: 'border-box' },
    inputRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' },
    numberInput: { width: '100%', backgroundColor: '#000', border: '1px solid #166534', padding: '12px', borderRadius: '6px', color: '#fff', fontSize: '16px', fontFamily, outline: 'none', boxSizing: 'border-box', textAlign: 'center' },
    inputGroup: { display: 'flex', flexDirection: 'column' },
    buttonGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '24px' },
    btnSetup: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#581c87', color: '#fff', padding: '16px 8px', borderRadius: '6px', cursor: 'pointer', border: 'none', fontSize: '13px', fontFamily },
    btnDeploy: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#1e3a5f', color: '#fff', padding: '16px 8px', borderRadius: '6px', cursor: 'pointer', border: 'none', fontSize: '13px', fontFamily },
    btnStart: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#7f1d1d', color: '#fff', padding: '16px 8px', borderRadius: '6px', cursor: 'pointer', border: 'none', fontSize: '13px', fontFamily },
    btnStop: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#374151', color: '#fff', padding: '16px 8px', borderRadius: '6px', cursor: 'pointer', border: 'none', fontSize: '13px', fontFamily },
    disabledBtn: { opacity: 0.5, cursor: 'not-allowed' },
    monitorPanel: { marginTop: '24px', border: '1px solid #14532d', borderRadius: '8px', padding: '16px', backgroundColor: '#0a0a0a' },
    monitorTitle: { fontSize: '16px', color: '#22c55e', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    monitorRefresh: { fontSize: '12px', color: '#6b7280', cursor: 'pointer', background: 'none', border: '1px solid #374151', padding: '4px 12px', borderRadius: '4px', fontFamily },
    serverCard: { backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '16px', marginBottom: '12px' },
    serverCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
    serverIp: { fontSize: '14px', color: '#9ca3af' },
    statusBadge: { fontSize: '12px', padding: '2px 8px', borderRadius: '12px', fontFamily },
    statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' },
    statBox: { textAlign: 'center', padding: '8px', backgroundColor: '#000', borderRadius: '6px', border: '1px solid #1f2937' },
    statValue: { fontSize: '18px', fontWeight: 'bold', color: '#fff' },
    statLabel: { fontSize: '10px', color: '#6b7280', marginTop: '2px' },
    progressBar: { width: '100%', height: '8px', backgroundColor: '#1f2937', borderRadius: '4px', overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: '4px', transition: 'width 0.5s ease' },
    totalsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '16px', padding: '12px', backgroundColor: '#111827', borderRadius: '8px', border: '1px solid #166534' },
    totalBox: { textAlign: 'center' },
    totalValue: { fontSize: '24px', fontWeight: 'bold', color: '#22c55e' },
    totalLabel: { fontSize: '12px', color: '#9ca3af' },
    logsHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', marginTop: '32px' },
    logsTitle: { fontSize: '14px', color: '#9ca3af' },
    clearBtn: { fontSize: '12px', color: '#6b7280', cursor: 'pointer', background: 'none', border: 'none', fontFamily },
    logsBox: { backgroundColor: '#000', border: '1px solid #14532d', height: '200px', overflowY: 'auto', padding: '16px', borderRadius: '6px', fontSize: '12px', fontFamily },
    logItem: { marginBottom: '4px', borderBottom: '1px solid #111827', paddingBottom: '4px' },
    placeholder: { color: '#4b5563' },
    noServers: { color: '#4b5563', fontSize: '14px', textAlign: 'center' }
  };

  // Calculate totals from monitoring
  const totalVisits = serverStatus.reduce((sum, s) => sum + (s.visits || 0), 0);
  const totalTarget = totalVisitsEstimate;
  const totalErrors = serverStatus.reduce((sum, s) => sum + (s.errors || 0), 0);
  const totalActiveVisitors = serverStatus.reduce((sum, s) => sum + (s.active_visitors || 0), 0);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>
          ⚔️ لوحة تحكم الهجوم (Attack Panel)
        </h1>

        {/* API Key Authentication */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <label style={{ fontSize: '14px', color: '#ef4444' }}>🔑 مفتاح الدخول (API Key)</label>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="password" value={panelApiKey} onChange={(e) => setPanelApiKey(e.target.value)} placeholder="ادخل مفتاح API هنا..." style={{...styles.urlInput, borderColor: panelApiKey ? '#22c55e' : '#ef4444'}} />
          </div>
          <div style={{ marginTop: '4px', fontSize: '11px', color: panelApiKey ? '#22c55e' : '#ef4444' }}>
            {panelApiKey ? '🔒 المفتاح مُدخل' : '⚠️ يجب إدخال مفتاح API للتحكم - حطه في إعدادات Vercel كـ PANEL_API_KEY'}
          </div>
        </div>

        {/* Server Management */}
        <div style={{ marginBottom: '24px' }}>
          <button onClick={() => setShowServerPanel(!showServerPanel)} style={styles.serverToggle}>
            🖥️ إدارة السيرفرات ({servers.length} سيرفر) {showServerPanel ? '▲' : '▼'}
          </button>
          {showServerPanel && (
            <div style={styles.serverPanel}>
              <div>
                {servers.map((server, i) => (
                  <div key={i} style={styles.serverItem}>
                    <span>🖥️ {server.host} ({server.username})</span>
                    <button onClick={() => removeServer(server.host)} style={styles.deleteBtn}>🗑️</button>
                  </div>
                ))}
                {servers.length === 0 && <p style={styles.noServers}>لا يوجد سيرفرات</p>}
              </div>
              <div style={styles.addServerRow}>
                <input type="text" value={newHost} onChange={(e) => setNewHost(e.target.value)} placeholder="عنوان IP (مثال: 192.168.1.1)" style={styles.input} />
                <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="المستخدم" style={styles.inputSmall} />
                <button onClick={addServer} style={styles.addBtn}>+ إضافة</button>
              </div>
            </div>
          )}
        </div>

        {/* Proxy Settings */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <label style={{ fontSize: '14px', color: '#22c55e' }}>🌐 بروكسي سعودي (Saudi Proxy)</label>
            <button onClick={() => setUseProxy(!useProxy)} style={{ background: useProxy ? '#22c55e' : '#374151', color: '#fff', border: 'none', padding: '4px 16px', borderRadius: '12px', cursor: 'pointer', fontSize: '12px', fontFamily }}>
              {useProxy ? '✅ مفعّل' : '❌ معطّل'}
            </button>
            {useProxy && proxyStatus === 'expired' && (
              <span style={{ background: '#dc2626', color: '#fff', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', animation: 'pulse 1.5s infinite' }}>⚠️ يجب إضافة رصيد</span>
            )}
            {useProxy && proxyStatus === 'active' && (
              <span style={{ background: '#166534', color: '#4ade80', padding: '4px 12px', borderRadius: '12px', fontSize: '12px' }}>✅ الرصيد متاح</span>
            )}
            {useProxy && proxyStatus === 'checking' && (
              <span style={{ background: '#374151', color: '#facc15', padding: '4px 12px', borderRadius: '12px', fontSize: '12px' }}>⏳ جاري الفحص...</span>
            )}
            {useProxy && (proxyStatus === 'error' || proxyStatus === 'timeout') && (
              <span style={{ background: '#92400e', color: '#fbbf24', padding: '4px 12px', borderRadius: '12px', fontSize: '12px' }}>⚠️ تعذر فحص البروكسي</span>
            )}
            {useProxy && proxyStatus !== 'checking' && (
              <button onClick={checkProxy} style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontFamily }}>🔄 فحص</button>
            )}
          </div>
          {useProxy && (
            <div style={{ border: '1px solid #14532d', borderRadius: '8px', padding: '16px', backgroundColor: '#000' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Proxy Host</label>
                  <input type="text" value={proxyHost} onChange={(e) => setProxyHost(e.target.value)} style={styles.urlInput} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Port</label>
                  <input type="text" value={proxyPort} onChange={(e) => setProxyPort(e.target.value)} style={styles.urlInput} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Username</label>
                  <input type="text" value={proxyUser} onChange={(e) => setProxyUser(e.target.value)} style={styles.urlInput} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Password</label>
                  <input type="text" value={proxyPass} onChange={(e) => setProxyPass(e.target.value)} style={styles.urlInput} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>عدد البروكسيات</label>
                  <input type="number" value={proxyCount} onChange={(e) => setProxyCount(e.target.value)} min="1" max="50" style={styles.urlInput} />
                </div>
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#4ade80' }}>🇸🇦 بروكسي سعودي جاهز - PacketStream ({proxyUser})</div>
            </div>
          )}
        </div>

        {/* CAPTCHA Solver */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <label style={{ fontSize: '14px', color: '#f59e0b' }}>🔓 حل الكابتشا (CAPTCHA Solver)</label>
            <button onClick={() => setCaptchaEnabled(!captchaEnabled)} style={{ background: captchaEnabled ? '#f59e0b' : '#374151', color: captchaEnabled ? '#000' : '#fff', border: 'none', padding: '4px 16px', borderRadius: '12px', cursor: 'pointer', fontSize: '12px', fontFamily }}>
              {captchaEnabled ? '✅ مفعّل' : '❌ معطّل'}
            </button>
          </div>
          {captchaEnabled && (
            <div style={{ border: '1px solid #92400e', borderRadius: '8px', padding: '16px', backgroundColor: '#000' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>API Key (2Captcha / Anti-Captcha / CapSolver)</label>
                <input type="text" value={captchaApiKey} onChange={(e) => setCaptchaApiKey(e.target.value)} placeholder="ادخل API Key هنا..." style={styles.urlInput} />
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', color: captchaApiKey ? '#f59e0b' : '#6b7280' }}>
                {captchaApiKey ? '🔓 جاهز - سيتم حل CAPTCHA تلقائياً (الخدمة تُكتشف تلقائياً)' : '⚠️ ادخل API Key للتفعيل - احصل عليه من 2captcha.com أو anti-captcha.com أو capsolver.com'}
              </div>
            </div>
          )}
        </div>

        {/* Target URL */}
        <div>
          <label style={styles.label}>🔗 الرابط المستهدف (Target URL)</label>
          <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" style={styles.urlInput} />
        </div>

        {/* Duration & Stats */}
        <div style={styles.inputRow}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>⏱️ المدة (بالدقائق)</label>
            <input type="number" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="5" min="1" style={styles.numberInput} />
            <div style={{fontSize: '10px', color: '#6b7280', textAlign: 'center', marginTop: '4px'}}>
              كل دقيقة = {VISITS_PER_MINUTE} زيارة/سيرفر
            </div>
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>⏳ الوقت المتبقي</label>
            <div style={{...styles.numberInput, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: remainingSeconds !== null ? (remainingSeconds === 0 ? '#052e16' : '#1a1a2e') : '#0a1628', color: remainingSeconds !== null ? (remainingSeconds === 0 ? '#22c55e' : '#facc15') : '#4ade80', fontSize: '18px', fontWeight: 'bold', border: remainingSeconds !== null && remainingSeconds > 0 ? '1px solid #facc15' : undefined}}>
              {remainingSeconds !== null ? (remainingSeconds === 0 ? '✅ انتهى!' : `⏳ ${formatDuration(remainingSeconds)}`) : `${durationMin || 0} دقيقة`}
            </div>
          </div>
        </div>

        {/* Dynamic Stats Box */}
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '12px', padding: '12px', backgroundColor: '#0a1628', borderRadius: '8px', border: '1px solid #1e3a5f'}}>
          <div style={{textAlign: 'center'}}>
            <div style={{fontSize: '20px', fontWeight: 'bold', color: '#06b6d4'}}>{totalVisitsEstimate.toLocaleString()}</div>
            <div style={{fontSize: '10px', color: '#6b7280'}}>إجمالي الزيارات المتوقعة</div>
          </div>
          <div style={{textAlign: 'center'}}>
            <div style={{fontSize: '20px', fontWeight: 'bold', color: '#22c55e'}}>👥 {activeVisitorsEstimate}</div>
            <div style={{fontSize: '10px', color: '#6b7280'}}>زائر نشط دائماً</div>
          </div>
          <div style={{textAlign: 'center'}}>
            <div style={{fontSize: '20px', fontWeight: 'bold', color: '#facc15'}}>🌊 {totalWaves * servers.length}</div>
            <div style={{fontSize: '10px', color: '#6b7280'}}>إجمالي الموجات</div>
          </div>
          <div style={{textAlign: 'center'}}>
            <div style={{fontSize: '20px', fontWeight: 'bold', color: '#a855f7'}}>30s</div>
            <div style={{fontSize: '10px', color: '#6b7280'}}>مدة بقاء الزائر</div>
          </div>
        </div>

        {/* Control Buttons */}
        <div style={styles.buttonGrid}>
          <button onClick={() => handleAction('setup')} disabled={loading} style={loading ? {...styles.btnSetup, ...styles.disabledBtn} : styles.btnSetup}>
            {activeAction === 'setup' ? '⏳' : '⚙️'} 0. تجهيز السيرفرات
          </button>
          <button onClick={() => handleAction('deploy')} disabled={loading} style={loading ? {...styles.btnDeploy, ...styles.disabledBtn} : styles.btnDeploy}>
            {activeAction === 'deploy' ? '⏳' : '📤'} 1. رفع السكريبت
          </button>
          <button onClick={() => handleAction('start')} disabled={loading} style={loading ? {...styles.btnStart, ...styles.disabledBtn} : styles.btnStart}>
            {activeAction === 'start' ? '⏳' : '▶️'} 2. بدء الهجوم
          </button>
          <button onClick={() => handleAction('stop')} disabled={loading} style={loading ? {...styles.btnStop, ...styles.disabledBtn} : styles.btnStop}>
            {activeAction === 'stop' ? '⏳' : '⏹️'} إيقاف الكل
          </button>
        </div>

        {/* Live Monitoring Panel */}
        {(serverStatus.length > 0 || monitoring) && (
          <div style={styles.monitorPanel}>
            <div style={styles.monitorTitle}>
              <span>📡 المراقبة الحية {monitoring && <span style={{color:'#22c55e', fontSize:'12px'}}> (تحديث كل 15 ثانية)</span>}</span>
              <div style={{display:'flex', gap:'8px'}}>
                {!monitoring && <button onClick={startMonitoring} style={{...styles.monitorRefresh, borderColor:'#22c55e', color:'#22c55e'}}>▶ تشغيل</button>}
                {monitoring && <button onClick={stopMonitoring} style={{...styles.monitorRefresh, borderColor:'#ef4444', color:'#ef4444'}}>⏹ إيقاف</button>}
                <button onClick={fetchStatus} style={styles.monitorRefresh}>🔄 تحديث</button>
              </div>
            </div>

            {/* Active Visitors Banner */}
            {totalActiveVisitors > 0 && (
              <div style={{textAlign:'center', padding:'12px', marginBottom:'12px', backgroundColor:'#052e16', border:'1px solid #22c55e', borderRadius:'8px'}}>
                <div style={{fontSize:'28px', fontWeight:'bold', color:'#22c55e'}}>👥 {totalActiveVisitors}</div>
                <div style={{fontSize:'12px', color:'#4ade80'}}>زائر نشط الآن على الموقع</div>
              </div>
            )}

            {/* Server Cards */}
            {serverStatus.map((s, i) => (
              <div key={i} style={styles.serverCard}>
                <div style={styles.serverCardHeader}>
                  <span style={styles.serverIp}>🖥️ {s.host}</span>
                  <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
                    {s.mode && <span style={{...styles.statusBadge, color: getModeColor(s.mode), border: `1px solid ${getModeColor(s.mode)}`, fontSize:'10px'}}>{getModeText(s.mode)}</span>}
                    <span style={{...styles.statusBadge, color: getStatusColor(s.status), border: `1px solid ${getStatusColor(s.status)}`}}>
                      {getStatusText(s.status)}
                    </span>
                  </div>
                </div>
                {s.rate > 0 && <div style={{fontSize:'11px', color:'#4ade80', textAlign:'center', marginBottom:'8px'}}>⚡ {s.rate} زيارة/دقيقة</div>}
                {s.active_visitors > 0 && <div style={{fontSize:'11px', color:'#06b6d4', textAlign:'center', marginBottom:'8px'}}>👥 {s.active_visitors} زائر نشط | 🌊 موجة {s.waves_done || 0}/{s.total_waves || 0}</div>}

                {s.status !== 'offline' && s.status !== 'idle' && (
                  <>
                    <div style={styles.statsRow}>
                      <div style={styles.statBox}>
                        <div style={styles.statValue}>{(s.visits || 0).toLocaleString()}</div>
                        <div style={styles.statLabel}>زيارات</div>
                      </div>
                      <div style={styles.statBox}>
                        <div style={styles.statValue}>{(s.target || 0).toLocaleString()}</div>
                        <div style={styles.statLabel}>الهدف</div>
                      </div>
                      <div style={styles.statBox}>
                        <div style={{...styles.statValue, color: '#4ade80'}}>{formatTime(s.elapsed || 0)}</div>
                        <div style={styles.statLabel}>الوقت</div>
                      </div>
                      <div style={styles.statBox}>
                        <div style={{...styles.statValue, color: (s.errors || 0) > 0 ? '#ef4444' : '#22c55e'}}>{s.errors || 0}</div>
                        <div style={styles.statLabel}>أخطاء</div>
                      </div>
                    </div>

                    <div style={styles.progressBar}>
                      <div style={{
                        ...styles.progressFill,
                        width: `${s.progress || 0}%`,
                        backgroundColor: s.status === 'finished' ? '#3b82f6' : '#22c55e'
                      }}></div>
                    </div>
                    <div style={{textAlign: 'center', fontSize: '12px', color: '#9ca3af', marginTop: '4px'}}>
                      {s.progress || 0}%
                    </div>
                  </>
                )}

                {s.status === 'offline' && (
                  <div style={{color: '#ef4444', fontSize: '12px'}}>❌ {s.error || 'غير متصل'}</div>
                )}
              </div>
            ))}

            {/* Totals */}
            {serverStatus.some(s => s.visits > 0) && (
              <div style={styles.totalsRow}>
                <div style={styles.totalBox}>
                  <div style={styles.totalValue}>{totalVisits.toLocaleString()}</div>
                  <div style={styles.totalLabel}>إجمالي الزيارات</div>
                </div>
                <div style={styles.totalBox}>
                  <div style={styles.totalValue}>{totalTarget.toLocaleString()}</div>
                  <div style={styles.totalLabel}>إجمالي الهدف</div>
                </div>
                <div style={styles.totalBox}>
                  <div style={{...styles.totalValue, color: '#06b6d4'}}>{totalActiveVisitors}</div>
                  <div style={styles.totalLabel}>زوار نشطين الآن</div>
                </div>
                <div style={styles.totalBox}>
                  <div style={{...styles.totalValue, color: totalErrors > 0 ? '#ef4444' : '#22c55e'}}>{totalErrors}</div>
                  <div style={styles.totalLabel}>إجمالي الأخطاء</div>
                </div>
              </div>
            )}

            {/* Summary after completion */}
            {attackSummary && (
              <div style={{marginTop:'16px', padding:'20px', backgroundColor:'#0f172a', border:'2px solid #22c55e', borderRadius:'12px', textAlign:'center'}}>
                <div style={{fontSize:'18px', color:'#22c55e', marginBottom:'16px', fontWeight:'bold'}}>✅ ملخص العملية</div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:'12px'}}>
                  <div style={{padding:'12px', backgroundColor:'#111827', borderRadius:'8px', border:'1px solid #1f2937'}}>
                    <div style={{fontSize:'22px', fontWeight:'bold', color:'#3b82f6'}}>{attackSummary.target.toLocaleString()}</div>
                    <div style={{fontSize:'11px', color:'#9ca3af', marginTop:'4px'}}>الهدف</div>
                  </div>
                  <div style={{padding:'12px', backgroundColor:'#111827', borderRadius:'8px', border:'1px solid #1f2937'}}>
                    <div style={{fontSize:'22px', fontWeight:'bold', color:'#22c55e'}}>{attackSummary.visits.toLocaleString()}</div>
                    <div style={{fontSize:'11px', color:'#9ca3af', marginTop:'4px'}}>زيارات ناجحة</div>
                  </div>
                  <div style={{padding:'12px', backgroundColor:'#111827', borderRadius:'8px', border:'1px solid #1f2937'}}>
                    <div style={{fontSize:'22px', fontWeight:'bold', color: attackSummary.errors > 0 ? '#ef4444' : '#22c55e'}}>{attackSummary.errors.toLocaleString()}</div>
                    <div style={{fontSize:'11px', color:'#9ca3af', marginTop:'4px'}}>زيارات فاشلة</div>
                  </div>
                  <div style={{padding:'12px', backgroundColor:'#111827', borderRadius:'8px', border:'1px solid #1f2937'}}>
                    <div style={{fontSize:'22px', fontWeight:'bold', color:'#facc15'}}>{formatTime(attackSummary.elapsed)}</div>
                    <div style={{fontSize:'11px', color:'#9ca3af', marginTop:'4px'}}>الوقت</div>
                  </div>
                  <div style={{padding:'12px', backgroundColor:'#111827', borderRadius:'8px', border:'1px solid #1f2937'}}>
                    <div style={{fontSize:'22px', fontWeight:'bold', color:'#a855f7'}}>{attackSummary.rate.toLocaleString()}</div>
                    <div style={{fontSize:'11px', color:'#9ca3af', marginTop:'4px'}}>زيارة/دقيقة</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* System Logs */}
        <div>
          <div style={styles.logsHeader}>
            <span style={styles.logsTitle}>💻 سجل النظام (System Logs)</span>
            <button onClick={() => setLogs([])} style={styles.clearBtn}>مسح السجل</button>
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
