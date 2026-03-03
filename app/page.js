'use client';
import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [visitors, setVisitors] = useState('100');
  // Duration is display-only (estimated time), not sent to servers
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState('');
  const [showServerPanel, setShowServerPanel] = useState(false);
  const [servers, setServers] = useState([
    { host: '167.172.51.232', username: 'root' },
    { host: '167.99.90.211', username: 'root' },
    { host: '46.101.86.238', username: 'root' },
    { host: '138.68.153.135', username: 'root' },
    { host: '188.166.159.196', username: 'root' },
    { host: '46.101.78.167', username: 'root' },
    { host: '188.166.174.51', username: 'root' },
    { host: '188.166.174.85', username: 'root' },
    { host: '144.126.239.247', username: 'root' },
    { host: '167.71.143.164', username: 'root' },
    { host: '144.126.234.13', username: 'root' },
    { host: '138.68.141.40', username: 'root' },
    { host: '46.101.52.177', username: 'root' }
  ]);
  const [newHost, setNewHost] = useState('');
  const [newUsername, setNewUsername] = useState('root');
  const [useProxy, setUseProxy] = useState(true);
  const [proxyHost, setProxyHost] = useState('p.webshare.io');
  const [proxyPort, setProxyPort] = useState('80');
  const [proxyUser, setProxyUser] = useState('rbtthqr-sa');
  const [proxyPass, setProxyPass] = useState('3opjjm7k9oh2');
  const [proxyCount, setProxyCount] = useState('10');
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaApiKey, setCaptchaApiKey] = useState('');
  // captchaService auto-detected from API key
  const [monitoring, setMonitoring] = useState(false);
  const [serverStatus, setServerStatus] = useState([]);
  const [attackStartTime, setAttackStartTime] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [attackSummary, setAttackSummary] = useState(null);
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);

  const addLog = (msg) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  // Estimated time display (120 visits/min per server - ultimate stealth with fast behavior)
  const VISITS_PER_MIN_PER_SERVER = 120;
  const calcEstimatedSeconds = (v) => {
    const numVisitors = parseInt(v) || 0;
    if (numVisitors <= 0) return 0;
    const perServer = Math.ceil(numVisitors / servers.length);
    return Math.ceil((perServer / VISITS_PER_MIN_PER_SERVER) * 60);
  };
  const formatDuration = (seconds) => {
    if (seconds <= 0) return '0 ثانية';
    if (seconds < 60) return `${seconds} ثانية`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (secs === 0) return `${mins} دقيقة`;
    return `${mins} دقيقة و ${secs} ثانية`;
  };

  const handleVisitorsChange = (val) => {
    setVisitors(val);
  };
  const estimatedSeconds = calcEstimatedSeconds(visitors);

  // Countdown timer - updates every second based on real speed
  useEffect(() => {
    if (attackStartTime && monitoring && serverStatus.length > 0) {
      // Calculate real speed from actual data
      const activeServers = serverStatus.filter(s => s.status === 'running' || s.status === 'starting');
      const finishedServers = serverStatus.filter(s => s.status === 'finished');
      const totalDone = serverStatus.reduce((sum, s) => sum + (s.visits || 0), 0);
      const totalTarget = serverStatus.reduce((sum, s) => sum + (s.target || 0), 0);
      const maxElapsed = Math.max(...serverStatus.map(s => s.elapsed || 0), 1);
      
      if (totalDone > 0 && totalTarget > 0) {
        const realSpeed = totalDone / maxElapsed; // visits per second across all servers
        const remaining = totalTarget - totalDone;
        if (realSpeed > 0) {
          const secsLeft = Math.ceil(remaining / realSpeed);
          setRemainingSeconds(secsLeft);
        }
      }
      
      // All done
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
  }, [remainingSeconds !== null && remainingSeconds > 0, monitoring]);

  // Fetch status from all servers
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers })
      });
      const data = await res.json();
      if (data.results) {
        // Filter out old results - if no active attack, show as idle
        const filtered = data.results.map(s => {
          if (s.status === 'finished' && !attackStartTime) {
            return { ...s, status: 'idle', visits: 0, target: 0, progress: 0, elapsed: 0, errors: 0 };
          }
          // If attack started and result timestamp is older than attack start, show as starting
          if (s.timestamp && attackStartTime && (s.timestamp * 1000) < attackStartTime) {
            return { ...s, status: 'starting', visits: 0, target: parseInt(visitors) ? Math.ceil(parseInt(visitors) / servers.length) : 0, progress: 0, elapsed: 0, errors: 0 };
          }
          return s;
        });
        setServerStatus(filtered);
        // Auto-stop monitoring if all servers finished
        const allDone = filtered.every(s => s.status === 'finished' || s.status === 'idle' || s.status === 'offline');
        if (allDone && filtered.some(s => s.status === 'finished')) {
          stopMonitoring();
          const sumVisits = filtered.reduce((sum, s) => sum + (s.visits || 0), 0);
          const sumErrors = filtered.reduce((sum, s) => sum + (s.errors || 0), 0);
          const maxElapsed = Math.max(...filtered.map(s => s.elapsed || 0), 0);
          const totalRate = maxElapsed > 0 ? Math.round((sumVisits / maxElapsed) * 60) : 0;
          const userTarget = parseInt(visitors) || 0;
          setAttackSummary({ target: userTarget, visits: sumVisits, errors: sumErrors, elapsed: maxElapsed, rate: totalRate });
          addLog(`✅ انتهت جميع العمليات | الهدف: ${userTarget} | الزيارات الناجحة: ${sumVisits} | الفاشلة: ${sumErrors} | الوقت: ${formatTime(maxElapsed)} | السرعة: ${totalRate}/دقيقة`);
        }
      }
    } catch (err) {
      // silent fail
    }
  };

  const startMonitoring = () => {
    setMonitoring(true);
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 5000);
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
    if (action === 'start' && !url) return addLog('❌ خطأ: الرجاء إدخال الرابط أولاً');
    if (action === 'start' && !visitors) return addLog('❌ خطأ: الرجاء إدخال عدد الزوار');

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
      addLog(`📊 عدد الزوار: ${visitors} | الوقت المتوقع: ~${formatDuration(estimatedSeconds)} | أقصى سرعة`);
      // Clear old results immediately
      stopMonitoring();
      setServerStatus([]);
      setAttackStartTime(null);
      setRemainingSeconds(null);
    }

    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, url, visitors: parseInt(visitors), servers, proxies: useProxy ? buildProxyList() : [], captchaApiKey: captchaEnabled ? captchaApiKey : '' })
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
        // Start monitoring after starting attack - delay 8 seconds for servers to clean and start
        if (action === 'start') {
          setAttackStartTime(Date.now());
          setRemainingSeconds(estimatedSeconds);
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
      default: return '';
    }
  };

  const getModeColor = (mode) => {
    switch(mode) {
      case 'stealth': return '#a855f7';
      case 'fast': return '#22c55e';
      case 'normal': return '#3b82f6';
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
      list.push({ host: proxyHost, port: proxyPort, username: `${proxyUser}-${i}`, password: proxyPass });
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
    // Monitoring Panel
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
    // Totals
    totalsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '16px', padding: '12px', backgroundColor: '#111827', borderRadius: '8px', border: '1px solid #166534' },
    totalBox: { textAlign: 'center' },
    totalValue: { fontSize: '24px', fontWeight: 'bold', color: '#22c55e' },
    totalLabel: { fontSize: '12px', color: '#9ca3af' },
    // Logs
    logsHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', marginTop: '32px' },
    logsTitle: { fontSize: '14px', color: '#9ca3af' },
    clearBtn: { fontSize: '12px', color: '#6b7280', cursor: 'pointer', background: 'none', border: 'none', fontFamily },
    logsBox: { backgroundColor: '#000', border: '1px solid #14532d', height: '200px', overflowY: 'auto', padding: '16px', borderRadius: '6px', fontSize: '12px', fontFamily },
    logItem: { marginBottom: '4px', borderBottom: '1px solid #111827', paddingBottom: '4px' },
    placeholder: { color: '#4b5563' },
    noServers: { color: '#4b5563', fontSize: '14px', textAlign: 'center' }
  };

  // Calculate totals
  const totalVisits = serverStatus.reduce((sum, s) => sum + (s.visits || 0), 0);
  const totalTarget = parseInt(visitors) || 0;  // User-entered target (not sum of server targets)
  const totalErrors = serverStatus.reduce((sum, s) => sum + (s.errors || 0), 0);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>
          ⚔️ لوحة تحكم الهجوم (Attack Panel)
        </h1>

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
                  <label style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Username Prefix</label>
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
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#4ade80' }}>🇸🇦 {proxyCount} بروكسي سعودي جاهز ({proxyUser}-1 إلى {proxyUser}-{proxyCount})</div>
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

        {/* Visitors & Duration */}
        <div style={styles.inputRow}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>👥 عدد الزوار</label>
            <input type="number" value={visitors} onChange={(e) => handleVisitorsChange(e.target.value)} placeholder="100" min="1" style={styles.numberInput} />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>⏱️ المدة المتوقعة</label>
            <div style={{...styles.numberInput, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: remainingSeconds !== null ? (remainingSeconds === 0 ? '#052e16' : '#1a1a2e') : '#0a1628', color: remainingSeconds !== null ? (remainingSeconds === 0 ? '#22c55e' : '#facc15') : '#4ade80', fontSize: '18px', fontWeight: 'bold', border: remainingSeconds !== null && remainingSeconds > 0 ? '1px solid #facc15' : undefined}}>
              {remainingSeconds !== null ? (remainingSeconds === 0 ? '✅ انتهى!' : `⏳ ${formatDuration(remainingSeconds)}`) : formatDuration(estimatedSeconds)}
            </div>
            <div style={{fontSize: '10px', color: '#6b7280', textAlign: 'center', marginTop: '4px'}}>
              {remainingSeconds !== null ? 'الوقت المتبقي بناءً على السرعة الفعلية' : `${servers.length} سيرفر × ${VISITS_PER_MIN_PER_SERVER} زيارة/دقيقة | بدون حد زمني ⚡`}
            </div>
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
              <span>📡 المراقبة الحية {monitoring && <span style={{color:'#22c55e', fontSize:'12px'}}> (تحديث كل 5 ثوان)</span>}</span>
              <div style={{display:'flex', gap:'8px'}}>
                {!monitoring && <button onClick={startMonitoring} style={{...styles.monitorRefresh, borderColor:'#22c55e', color:'#22c55e'}}>▶ تشغيل</button>}
                {monitoring && <button onClick={stopMonitoring} style={{...styles.monitorRefresh, borderColor:'#ef4444', color:'#ef4444'}}>⏹ إيقاف</button>}
                <button onClick={fetchStatus} style={styles.monitorRefresh}>🔄 تحديث</button>
              </div>
            </div>

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
