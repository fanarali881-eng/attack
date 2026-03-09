import { NextResponse } from 'next/server';

function validateApiKey(req) {
  const authHeader = req.headers.get('x-api-key') || '';
  const validKey = process.env.PANEL_API_KEY;
  if (!validKey || authHeader !== validKey) return false;
  return true;
}

// ============ PROTECTION SIGNATURES DATABASE ============
const PROTECTION_SIGNATURES = {
  cloudflare: {
    name: "Cloudflare",
    headers: [
      { key: "server", value: "cloudflare" },
      { key: "cf-ray", value: null },
      { key: "cf-cache-status", value: null },
      { key: "cf-mitigated", value: null },
      { key: "cf-request-id", value: null },
    ],
    cookies: ["__cf_bm", "cf_clearance", "__cflb", "__cfruid", "_cfuvid"],
    htmlSignals: [
      "challenges.cloudflare.com", "/cdn-cgi/", "cf-browser-verification",
      "cf-chl-widget", "cf-challenge-running", "cloudflare-static/",
    ],
    challenges: {
      js_challenge: ["Just a moment", "Checking your browser", "cf-spinner-please-wait"],
      managed_challenge: ["challenges.cloudflare.com/turnstile", "cf-turnstile"],
      interactive_captcha: ["cf-hcaptcha-container", "g-recaptcha", "cf-captcha-container"],
      blocked: ["Sorry, you have been blocked", "Access denied", "Error 1020"],
    },
  },
  akamai: {
    name: "Akamai Bot Manager",
    headers: [
      { key: "server", value: "akamaighost" },
      { key: "x-akamai-transformed", value: null },
      { key: "akamai-ghost", value: null },
      { key: "akamai-request-id", value: null },
      { key: "x-edgeconnect-midmile-rtt", value: null },
      { key: "x-akamai-staging", value: null },
    ],
    cookies: ["_abck", "ak_bmsc", "bm_sz", "bm_sv", "bm_mi"],
    htmlSignals: ["akamai", "_abck", "ak_bmsc"],
    challenges: {
      sensor_challenge: ["_abck", "sensor_data", "bmak"],
      blocked: ["Access Denied", "Reference #"],
    },
  },
  perimeterx: {
    name: "PerimeterX / HUMAN",
    headers: [{ key: "x-px-", value: null, prefix: true }],
    cookies: ["_pxvid", "_px2", "_px3", "_pxff_", "_pxmvid", "_pxhd", "pxcts", "_pxde", "_pxttld"],
    htmlSignals: ["perimeterx.net", "px-cdn.net", "px-cloud.net", "pxchk.net", "px-client.net", "px-captcha"],
    challenges: {
      captcha: ["px-captcha", "Press & Hold", "human verification"],
      blocked: ["blocked by px", "Request blocked"],
    },
  },
  datadome: {
    name: "DataDome",
    headers: [
      { key: "server", value: "datadome" },
      { key: "x-datadome-cid", value: null },
      { key: "x-datadome", value: null },
    ],
    cookies: ["datadome"],
    htmlSignals: ["datadome.co", "api-js.datadome.co", "dd.datadome", "window.ddjskey", "DataDome"],
    challenges: {
      captcha: ["geo.captcha-delivery.com", "interstitial.datadome"],
      blocked: ["datadome"],
    },
  },
  imperva: {
    name: "Imperva / Incapsula",
    headers: [
      { key: "x-cdn", value: "imperva" },
      { key: "x-cdn", value: "incapsula" },
      { key: "x-iinfo", value: null },
    ],
    cookies: ["visid_incap_", "incap_ses_", "__utmvc", "reese84", "nlbi_"],
    htmlSignals: ["incapsula", "imperva", "_Incapsula_Resource", "reese84"],
    challenges: {
      js_challenge: ["_Incapsula_Resource"],
      blocked: ["Request unsuccessful", "Incapsula incident"],
    },
  },
  sucuri: {
    name: "Sucuri / CloudProxy",
    headers: [
      { key: "server", value: "sucuri" },
      { key: "server", value: "cloudproxy" },
      { key: "x-sucuri-id", value: null },
      { key: "x-sucuri-cache", value: null },
    ],
    cookies: ["sucuri_cloudproxy_"],
    htmlSignals: ["sucuri.net", "cloudproxy", "sucuri_cloudproxy"],
    challenges: {
      js_challenge: ["sucuri_cloudproxy_js"],
      blocked: ["Access Denied - Sucuri", "Sucuri WebSite Firewall"],
    },
  },
  aws_waf: {
    name: "AWS WAF / CloudFront",
    headers: [
      { key: "server", value: "cloudfront" },
      { key: "x-amz-cf-id", value: null },
      { key: "x-amz-cf-pop", value: null },
    ],
    cookies: ["aws-waf-token", "AWSALB", "AWSALBCORS"],
    htmlSignals: ["aws-waf", "awswaf"],
    challenges: {
      captcha: ["aws_captcha", "awswaf"],
      blocked: ["Request blocked", "ERROR: The request could not be satisfied"],
    },
  },
  f5: {
    name: "F5 / Shape Security",
    headers: [
      { key: "x-powered-by", value: "f5" },
      { key: "server", value: "bigip" },
    ],
    cookies: ["TSPD_101", "f5_cspm", "f5avraaaaaaa", "MRHSession"],
    cookieRegex: [/^TS[0-9a-f]{8,}$/i],
    htmlSignals: ["f5.com", "shape security"],
    challenges: {
      blocked: ["The requested URL was rejected"],
    },
  },
  kasada: {
    name: "Kasada",
    headers: [
      { key: "x-kpsdk-ct", value: null },
      { key: "x-kpsdk-cd", value: null },
      { key: "x-kpsdk-v", value: null },
    ],
    cookies: ["x-kpsdk-ct", "x-kpsdk-cd", "x-kpsdk-v"],
    htmlSignals: ["ips.js", "_kpsdk", "kasada"],
    challenges: { blocked: ["blocked", "kasada"] },
  },
  ddos_guard: {
    name: "DDoS-Guard",
    headers: [{ key: "server", value: "ddos-guard" }],
    cookies: ["__ddg1_", "__ddg2_", "__ddgid_", "__ddgmark_"],
    htmlSignals: ["ddos-guard", "ddos-guard.net"],
    challenges: { js_challenge: ["DDoS-Guard"] },
  },
  vercel_fw: {
    name: "Vercel Firewall",
    headers: [
      { key: "server", value: "vercel" },
      { key: "x-vercel-id", value: null },
    ],
    cookies: ["__vercel"],
    htmlSignals: [],
    challenges: {},
  },
  stackpath: {
    name: "StackPath",
    headers: [{ key: "server", value: "stackpath" }],
    cookies: ["sp_"],
    htmlSignals: ["stackpath"],
    challenges: {},
  },
};

// ============ CHALLENGE PAGE INDICATORS ============
const CHALLENGE_INDICATORS = [
  "just a moment", "checking your browser", "cf-browser-verification",
  "cf-challenge-running", "enable javascript and cookies to continue",
  "please wait while we verify", "one more step",
  "please complete the security check", "attention required",
  "access denied", "you have been blocked", "error 1020",
  "performance & security by cloudflare", "ddos protection by",
  "please turn javascript on", "pardon our interruption",
  "press & hold", "verifying you are human",
];

// ============ FETCH HELPER ============
async function safeFetch(targetUrl, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

// ============ SOCKET.IO HELPERS ============
async function testSocketIO(url) {
  try {
    const sioUrl = `${url.replace(/\/$/, '')}/socket.io/?EIO=4&transport=polling`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(sioUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    clearTimeout(timer);
    const text = await res.text();
    if (res.status === 200 && text.includes('"sid"') &&
        !text.toLowerCase().startsWith('<!doctype') &&
        !text.toLowerCase().startsWith('<html')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function extractSocketUrls(content) {
  const urls = new Set();
  const patterns = [
    /(?:const|let|var)\s+\w*(?:SOCKET|socket|server|api|SERVER|API)\w*\s*=\s*['"]([^"']+)['"]/gi,
    /io\(['"]([^"']+)['"]/gi,
    /connect\(['"]([^"']+)['"]/gi,
    /socketUrl\s*[:=]\s*['"]([^"']+)['"]/gi,
    /SOCKET_URL\s*[:=]\s*['"]([^"']+)['"]/gi,
    /serverUrl\s*[:=]\s*['"]([^"']+)['"]/gi,
    /NEXT_PUBLIC_\w*(?:SOCKET|API|SERVER)\w*\s*[:=]\s*['"]([^"']+)['"]/gi,
    /REACT_APP_\w*(?:SOCKET|API|SERVER)\w*\s*[:=]\s*['"]([^"']+)['"]/gi,
    /VITE_\w*(?:SOCKET|API|SERVER)\w*\s*[:=]\s*['"]([^"']+)['"]/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const url = match[1];
      if (url.startsWith('http') && !url.includes('socket.io') && !url.includes('cdn')) {
        urls.add(url);
      }
    }
  }
  const backendPatterns = [
    /https?:\/\/[\w.-]+\.onrender\.com/gi,
    /https?:\/\/[\w.-]+\.railway\.app/gi,
    /https?:\/\/[\w.-]+\.herokuapp\.com/gi,
    /https?:\/\/[\w.-]+\.fly\.dev/gi,
    /https?:\/\/[\w.-]+\.up\.railway\.app/gi,
    /https?:\/\/[\w.-]+\.vercel\.app/gi,
    /https?:\/\/[\w.-]+\.netlify\.app/gi,
  ];
  for (const pattern of backendPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      urls.add(match[0]);
    }
  }
  return [...urls];
}

function extractJsUrls(html, baseUrl) {
  const jsUrls = new Set();
  const srcPattern = /src=["']([^"']*\.js[^"']*?)["']/gi;
  let match;
  while ((match = srcPattern.exec(html)) !== null) {
    let jsUrl = match[1];
    if (jsUrl.startsWith('//')) jsUrl = 'https:' + jsUrl;
    else if (jsUrl.startsWith('/')) jsUrl = baseUrl + jsUrl;
    else if (!jsUrl.startsWith('http')) jsUrl = baseUrl + '/' + jsUrl;
    jsUrls.add(jsUrl);
  }
  return [...jsUrls];
}

// ============ LAYER 1+2: HEADER & COOKIE ANALYSIS ============
function analyzeHeadersAndCookies(response, htmlContent) {
  const detected = [];
  const headers = {};
  const cookies = {};
  const details = [];

  // Normalize headers
  for (const [k, v] of response.headers.entries()) {
    headers[k.toLowerCase()] = v.toLowerCase();
  }

  // Extract cookies from set-cookie
  const setCookie = response.headers.get('set-cookie') || '';
  const cookieNames = setCookie.match(/([a-zA-Z0-9_.-]+)=/g) || [];
  for (const cn of cookieNames) {
    cookies[cn.replace('=', '')] = true;
  }

  // Check each protection signature
  for (const [protId, sig] of Object.entries(PROTECTION_SIGNATURES)) {
    let headerScore = 0;
    let cookieMatch = false;

    // Header check
    for (const h of sig.headers) {
      if (h.prefix) {
        // Prefix match
        if (Object.keys(headers).some(k => k.startsWith(h.key))) {
          headerScore += 3;
        }
      } else if (h.value === null) {
        // Just check existence
        if (headers[h.key] !== undefined) {
          headerScore += 3;
        }
      } else {
        // Check value contains
        if (headers[h.key] && headers[h.key].includes(h.value)) {
          headerScore += 3;
        }
      }
    }

    // Cookie check
    for (const cookieName of Object.keys(cookies)) {
      for (const pattern of sig.cookies) {
        if (cookieName.toLowerCase().includes(pattern.toLowerCase())) {
          cookieMatch = true;
          break;
        }
      }
      // Regex patterns (F5)
      if (!cookieMatch && sig.cookieRegex) {
        for (const regex of sig.cookieRegex) {
          if (regex.test(cookieName)) {
            cookieMatch = true;
            break;
          }
        }
      }
      if (cookieMatch) break;
    }

    if (headerScore >= 3 || cookieMatch) {
      detected.push(protId);
      const method = headerScore >= 3 ? 'HEADER' : 'COOKIE';
      details.push(`[${method}] ${sig.name} detected`);
    }
  }

  return { detected, headers, cookies, details };
}

// ============ LAYER 3: HTML ANALYSIS ============
function analyzeHtml(htmlContent, existingDetected) {
  const detected = [...existingDetected];
  const details = [];
  let challengeType = 'none';
  let captchaInfo = { type: null, siteKey: null };
  const htmlLower = htmlContent.toLowerCase();

  // Check HTML signals for each protection
  for (const [protId, sig] of Object.entries(PROTECTION_SIGNATURES)) {
    if (detected.includes(protId)) continue;
    for (const signal of sig.htmlSignals || []) {
      if (htmlLower.includes(signal.toLowerCase())) {
        detected.push(protId);
        details.push(`[HTML] ${sig.name} detected (signal: ${signal})`);
        break;
      }
    }
  }

  // Check challenge indicators for detected protections
  const challengePriority = { none: 0, js_challenge: 1, managed_challenge: 2, captcha: 3, blocked: 4 };
  for (const protId of detected) {
    const sig = PROTECTION_SIGNATURES[protId];
    if (!sig || !sig.challenges) continue;
    for (const [cType, indicators] of Object.entries(sig.challenges)) {
      for (const indicator of indicators) {
        if (htmlLower.includes(indicator.toLowerCase())) {
          const newPriority = challengePriority[cType] || 0;
          const oldPriority = challengePriority[challengeType] || 0;
          if (newPriority > oldPriority) {
            challengeType = cType;
            details.push(`[CHALLENGE] ${sig.name}: ${cType} (${indicator})`);
          }
          break;
        }
      }
    }
  }

  // Detect CAPTCHA type and site key
  if (htmlLower.includes('challenges.cloudflare.com/turnstile') || htmlLower.includes('cf-turnstile')) {
    captchaInfo.type = 'turnstile';
    const m = htmlContent.match(/data-sitekey=["']([^"']+)["']/);
    if (m) captchaInfo.siteKey = m[1];
    details.push(`[CAPTCHA] Cloudflare Turnstile (key: ${captchaInfo.siteKey || 'unknown'})`);
  } else if (htmlLower.includes('google.com/recaptcha') || htmlLower.includes('g-recaptcha')) {
    captchaInfo.type = htmlLower.includes('recaptcha/api.js?render=') ? 'recaptcha_v3' : 'recaptcha_v2';
    const m = htmlContent.match(/data-sitekey=["']([^"']+)["']/) || htmlContent.match(/render=([^&"']+)/);
    if (m) captchaInfo.siteKey = m[1];
    details.push(`[CAPTCHA] ${captchaInfo.type}`);
  } else if (htmlLower.includes('hcaptcha.com') || htmlLower.includes('h-captcha')) {
    captchaInfo.type = 'hcaptcha';
    const m = htmlContent.match(/data-sitekey=["']([^"']+)["']/);
    if (m) captchaInfo.siteKey = m[1];
    details.push(`[CAPTCHA] hCaptcha`);
  } else if (htmlLower.includes('aws_captcha') || htmlLower.includes('awswaf')) {
    captchaInfo.type = 'aws_captcha';
    details.push(`[CAPTCHA] AWS WAF CAPTCHA`);
  }

  return { detected, challengeType, captchaInfo, details };
}

// ============ LAYER 6: CONTENT VERIFICATION ============
function verifyRealContent(htmlContent, status) {
  if (!htmlContent) return { reached: false, reason: 'empty', signals: 0 };

  const htmlLower = htmlContent.toLowerCase();

  // Check for challenge page
  for (const indicator of CHALLENGE_INDICATORS) {
    if (htmlLower.includes(indicator)) {
      return { reached: false, reason: `challenge: ${indicator}`, signals: 0 };
    }
  }

  // Count real content signals
  let signals = 0;

  // Real title check
  const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].trim().toLowerCase();
    const challengeTitles = ['just a moment', 'attention required', 'access denied',
      'cloudflare', 'please wait', 'ddos', 'security check', 'blocked', 'error'];
    if (!challengeTitles.some(ct => title.includes(ct))) {
      signals += 2;
    }
  }

  // Structure signals
  if (htmlLower.includes('<nav')) signals++;
  if (htmlLower.includes('<header')) signals++;
  if (htmlLower.includes('<footer')) signals++;
  if (htmlLower.includes('<main') || htmlLower.includes('<article')) signals++;
  if (htmlContent.length > 10000) signals++;
  if ((htmlLower.match(/<a /g) || []).length > 5) signals++;
  if ((htmlLower.match(/<img/g) || []).length > 2) signals++;

  // SPA check
  const isSPA = htmlLower.includes('<div id="root"') ||
                htmlLower.includes('<div id="app"') ||
                htmlLower.includes('<div id="__next"');

  if (signals >= 3) {
    return { reached: true, reason: 'verified_real_content', signals, isSPA };
  } else if (signals >= 1 && status === 200 && htmlContent.length > 2000) {
    return { reached: true, reason: 'likely_real_content', signals, isSPA };
  } else if (isSPA && status === 200) {
    return { reached: true, reason: 'spa_shell', signals, isSPA };
  }

  return { reached: false, reason: `uncertain_signals_${signals}`, signals, isSPA };
}

// ============ PROTECTION LEVEL CALCULATOR ============
function calculateProtectionLevel(detected, challengeType, contentReached, status) {
  if (!detected.length || (detected.length === 1 && detected[0] === 'vercel_fw')) {
    return { primary: 'none', level: 'none', confidence: 95 };
  }

  // Primary = strongest protection
  const priorityOrder = ['kasada', 'datadome', 'perimeterx', 'akamai',
    'cloudflare', 'imperva', 'f5', 'aws_waf', 'sucuri', 'ddos_guard', 'stackpath', 'vercel_fw'];
  let primary = detected[0];
  for (const p of priorityOrder) {
    if (detected.includes(p)) { primary = p; break; }
  }

  // Base level
  const highLevel = ['kasada', 'datadome', 'perimeterx', 'akamai'];
  const mediumLevel = ['cloudflare', 'imperva', 'f5'];
  let level = 'low';
  if (highLevel.includes(primary)) level = 'high';
  else if (mediumLevel.includes(primary)) level = 'medium';

  // Escalate based on challenge
  if (challengeType === 'blocked') level = 'extreme';
  else if (challengeType === 'captcha' || challengeType === 'managed_challenge' || challengeType === 'interactive_captcha') {
    if (level === 'low' || level === 'medium') level = 'high';
    else if (level === 'high') level = 'extreme';
  } else if (challengeType === 'js_challenge' || challengeType === 'sensor_challenge') {
    if (level === 'low') level = 'medium';
  }

  // Escalate if blocked
  if (!contentReached && (status === 403 || status === 503)) {
    if (level === 'low' || level === 'medium') level = 'high';
  }

  // Multiple protections
  if (detected.length >= 3 && (level === 'low' || level === 'medium')) level = 'high';

  const confidence = Math.min(30 + detected.length * 15 + (challengeType !== 'none' ? 20 : 0), 99);

  return { primary, level, confidence };
}

// ============ STRATEGY RECOMMENDER ============
function recommendStrategy(primary, level, challengeType, hasSocket, socketUrl, captchaInfo) {
  if (hasSocket && socketUrl) {
    return {
      mode: 'socketio',
      strategy: `Socket.IO mode - connect directly to ${socketUrl}. WebSocket bypasses WAF. Best mode for maximum impact.`,
    };
  }

  if (primary === 'none' || level === 'none') {
    return {
      mode: 'http',
      strategy: 'Direct HTTP mode - no protection detected. Use curl_cffi with TLS spoofing + Saudi proxy for maximum throughput.',
    };
  }

  const protName = PROTECTION_SIGNATURES[primary]?.name || primary;

  if (level === 'extreme') {
    return {
      mode: 'cloudflare',
      strategy: `EXTREME protection (${protName}). Challenge: ${challengeType}. Strategy: headless browser (Playwright) + CAPTCHA solver required. curl_cffi alone will NOT work. Expected success rate: ~10-30%.`,
    };
  } else if (level === 'high') {
    const captchaNote = captchaInfo?.type ? ` CAPTCHA solver needed for ${captchaInfo.type}.` : '';
    return {
      mode: 'cloudflare',
      strategy: `HIGH protection (${protName}). Challenge: ${challengeType}. Strategy: curl_cffi TLS spoof + FlareSolverr + per-proxy cookies.${captchaNote} Expected success rate: ~30-60%.`,
    };
  } else if (level === 'medium') {
    return {
      mode: 'cloudflare',
      strategy: `MEDIUM protection (${protName}). Challenge: ${challengeType}. Strategy: curl_cffi TLS spoof should bypass most challenges. FlareSolverr as fallback. Expected success rate: ~60-85%.`,
    };
  } else {
    return {
      mode: 'http',
      strategy: `LOW protection (${protName}). Strategy: curl_cffi with real browser TLS fingerprint + Saudi proxy. Should work without special bypass. Expected success rate: ~85-95%.`,
    };
  }
}

// ============ MAIN SCAN ENDPOINT ============
export async function POST(req) {
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { url, proxies } = await req.json();

    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const parsed = new URL(url);
    const base = `${parsed.protocol}//${parsed.host}`;
    const domainName = parsed.hostname.replace('www.', '').split('.')[0];

    const scanLog = [];
    scanLog.push(`[SCAN] Starting advanced multi-layer scan: ${url}`);

    // ======= STEP 1: Initial Request =======
    let htmlContent = '';
    let responseStatus = 0;
    let allDetected = [];
    let allDetails = [];
    let challengeType = 'none';
    let captchaInfo = { type: null, siteKey: null };
    let contentVerification = { reached: false, reason: 'no_response', signals: 0, isSPA: false };

    const directRes = await safeFetch(url);
    if (directRes) {
      responseStatus = directRes.status;
      scanLog.push(`[STEP1] Response: status=${responseStatus}`);

      // Layer 1+2: Headers & Cookies
      const headerResult = analyzeHeadersAndCookies(directRes, '');
      allDetected = [...headerResult.detected];
      allDetails = [...headerResult.details];

      htmlContent = await directRes.text();

      // Layer 3: HTML Analysis
      const htmlResult = analyzeHtml(htmlContent, allDetected);
      allDetected = htmlResult.detected;
      challengeType = htmlResult.challengeType;
      captchaInfo = htmlResult.captchaInfo;
      allDetails = [...allDetails, ...htmlResult.details];

      // Layer 6: Content Verification
      contentVerification = verifyRealContent(htmlContent, responseStatus);
      scanLog.push(`[VERIFY] Real content: ${contentVerification.reached} (${contentVerification.reason}, signals=${contentVerification.signals})`);

    } else {
      scanLog.push(`[STEP1] No response - site may be down or heavily protected`);
      allDetected.push('unknown_waf');
    }

    // ======= STEP 2: Protection Level Calculation =======
    const protLevel = calculateProtectionLevel(allDetected, challengeType, contentVerification.reached, responseStatus);
    scanLog.push(`[LEVEL] Primary: ${protLevel.primary}, Level: ${protLevel.level}, Confidence: ${protLevel.confidence}%`);

    // ======= STEP 3: Socket.IO Discovery =======
    let hasSocketIO = false;
    let socketUrl = null;
    let candidateSocketUrl = null;

    // 3a: Check HTML for socket references
    if (htmlContent && !hasSocketIO) {
      const htmlLower = htmlContent.toLowerCase();
      if (htmlLower.includes('socket.io') || htmlContent.includes('io(')) {
        const socketUrls = extractSocketUrls(htmlContent);
        for (const su of socketUrls) {
          if (await testSocketIO(su)) {
            hasSocketIO = true;
            socketUrl = su.replace(/\/$/, '');
            scanLog.push(`[SOCKET] Verified from HTML: ${socketUrl}`);
            break;
          } else if (!candidateSocketUrl) {
            candidateSocketUrl = su.replace(/\/$/, '');
          }
        }
      }
    }

    // 3b: Check JS bundles
    if (!hasSocketIO && htmlContent && contentVerification.reached) {
      const jsUrls = extractJsUrls(htmlContent, base);
      const skipDomains = ['googleapis.com', 'gstatic.com', 'cdnjs.com', 'unpkg.com', 'jsdelivr.net'];
      for (const jsUrl of jsUrls.slice(0, 15)) {
        if (skipDomains.some(d => jsUrl.includes(d))) continue;
        try {
          const jsRes = await safeFetch(jsUrl, 10000);
          if (jsRes && jsRes.ok) {
            const jsContent = await jsRes.text();

            // NexaFlow detection
            if (jsContent.includes('nf-api-key') || jsContent.includes('data-flow-apis') || jsContent.includes('nexaflow')) {
              const nfMatch = jsContent.match(/["'](https?:\/\/[^"']*data-flow-apis[^"']*)["']/i);
              const nfSocketUrl = nfMatch ? new URL(nfMatch[1]).origin : 'https://data-flow-apis.cc';
              hasSocketIO = true;
              socketUrl = nfSocketUrl;
              scanLog.push(`[SOCKET] NexaFlow detected! Socket: ${nfSocketUrl}`);
              break;
            }

            // General socket URL search in JS
            const backendUrls = extractSocketUrls(jsContent);
            for (const bu of backendUrls) {
              if (await testSocketIO(bu)) {
                hasSocketIO = true;
                socketUrl = bu.replace(/\/$/, '');
                scanLog.push(`[SOCKET] Found in JS bundle: ${socketUrl}`);
                break;
              } else if (!candidateSocketUrl) {
                candidateSocketUrl = bu.replace(/\/$/, '');
              }
            }

            // Also check for protection signals in JS
            const jsLower = jsContent.toLowerCase();
            for (const [protId, sig] of Object.entries(PROTECTION_SIGNATURES)) {
              if (allDetected.includes(protId)) continue;
              for (const signal of sig.htmlSignals || []) {
                if (jsLower.includes(signal.toLowerCase())) {
                  allDetected.push(protId);
                  allDetails.push(`[JS] ${sig.name} detected in JS bundle`);
                  break;
                }
              }
            }

            if (hasSocketIO) break;
          }
        } catch { continue; }
      }
    }

    // 3c: Check same-origin Socket.IO
    if (!hasSocketIO) {
      if (await testSocketIO(base)) {
        hasSocketIO = true;
        socketUrl = base;
        scanLog.push(`[SOCKET] Found at same origin: ${base}`);
      }
    }

    // 3d: Try common backend patterns
    if (!hasSocketIO) {
      const prefixes = [
        `${domainName}-server`, `${domainName}-api`, `${domainName}-backend`,
        `${domainName}`, `api-${domainName}`, `server-${domainName}`,
      ];
      const hosts = ['.onrender.com', '.railway.app', '.herokuapp.com', '.fly.dev'];
      const candidates = [];

      if (htmlContent) {
        candidates.push(...extractSocketUrls(htmlContent));
      }
      for (const prefix of prefixes) {
        for (const host of hosts) {
          candidates.push(`https://${prefix}${host}`);
        }
      }

      for (let i = 0; i < candidates.length && !hasSocketIO; i += 5) {
        const batch = candidates.slice(i, i + 5);
        const results = await Promise.all(batch.map(c => testSocketIO(c).then(ok => ({ url: c, ok }))));
        for (const r of results) {
          if (r.ok) {
            hasSocketIO = true;
            socketUrl = r.url.replace(/\/$/, '');
            scanLog.push(`[SOCKET] Backend discovered: ${socketUrl}`);
            break;
          }
        }
      }
    }

    // 3e: Use candidate if nothing verified
    if (!hasSocketIO && candidateSocketUrl) {
      hasSocketIO = true;
      socketUrl = candidateSocketUrl;
      scanLog.push(`[SOCKET] Unverified candidate (CF may block): ${candidateSocketUrl}`);
    }

    // 3f: Try frontend deployments if blocked
    if (!hasSocketIO && !contentVerification.reached) {
      const frontendCandidates = [
        `https://${domainName}.vercel.app`,
        `https://${domainName}.netlify.app`,
        `https://${domainName}.onrender.com`,
      ];
      for (const frontendUrl of frontendCandidates) {
        if (hasSocketIO) break;
        try {
          const fRes = await safeFetch(frontendUrl, 10000);
          if (fRes && fRes.ok) {
            const fHtml = await fRes.text();
            if (fHtml.length > 200 && !fHtml.includes('Not Found')) {
              const fBase = new URL(frontendUrl).origin;
              const jsUrls = extractJsUrls(fHtml, fBase);
              for (const jsUrl of jsUrls.slice(0, 10)) {
                try {
                  const jsRes = await safeFetch(jsUrl, 10000);
                  if (jsRes && jsRes.ok) {
                    const jsContent = await jsRes.text();
                    const backendUrls = extractSocketUrls(jsContent);
                    for (const bu of backendUrls) {
                      if (await testSocketIO(bu)) {
                        hasSocketIO = true;
                        socketUrl = bu.replace(/\/$/, '');
                        scanLog.push(`[SOCKET] Found via frontend ${frontendUrl}: ${socketUrl}`);
                        break;
                      }
                    }
                    if (socketUrl) break;
                  }
                } catch { continue; }
              }
            }
          }
        } catch { continue; }
      }
    }

    // ======= STEP 4: Recalculate with all info =======
    const finalProtLevel = calculateProtectionLevel(allDetected, challengeType, contentVerification.reached, responseStatus);
    const strategy = recommendStrategy(
      finalProtLevel.primary, finalProtLevel.level, challengeType,
      hasSocketIO, socketUrl, captchaInfo
    );

    // ======= BUILD RESULT =======
    const protNames = allDetected
      .filter(p => p !== 'unknown_waf')
      .map(p => PROTECTION_SIGNATURES[p]?.name || p);

    const result = {
      // Compatible with existing code
      mode: strategy.mode,
      socket_url: socketUrl,
      has_cloudflare: allDetected.includes('cloudflare'),
      has_socketio: hasSocketIO,
      protection: finalProtLevel.primary,
      pages: ['/'],
      register_event: 'visitor:register',
      page_change_event: 'visitor:pageEnter',
      connected_event: 'successfully-connected',
      base_url: base,
      target_url: url,
      scan_method: 'vercel-advanced-v2',

      // NEW: Advanced detection data
      protections_detected: allDetected,
      protection_names: protNames,
      protection_level: finalProtLevel.level,
      challenge_type: challengeType,
      captcha_info: captchaInfo,
      real_content_reached: contentVerification.reached,
      content_verification: contentVerification.reason,
      is_spa: contentVerification.isSPA,
      detection_confidence: finalProtLevel.confidence,
      recommended_strategy: strategy.strategy,
      detection_details: allDetails,
      scan_log: scanLog,
    };

    console.log(`[SCAN] === ADVANCED SCAN COMPLETE ===`);
    console.log(`[SCAN] URL: ${url}`);
    console.log(`[SCAN] Protections: ${protNames.join(', ') || 'None'}`);
    console.log(`[SCAN] Level: ${finalProtLevel.level.toUpperCase()}`);
    console.log(`[SCAN] Challenge: ${challengeType}`);
    console.log(`[SCAN] Real Content: ${contentVerification.reached}`);
    console.log(`[SCAN] Mode: ${strategy.mode}`);
    console.log(`[SCAN] Socket: ${socketUrl || 'None'}`);
    console.log(`[SCAN] Confidence: ${finalProtLevel.confidence}%`);
    console.log(`[SCAN] Strategy: ${strategy.strategy}`);

    return NextResponse.json({ scanResult: result });

  } catch (error) {
    console.error('[SCAN] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
