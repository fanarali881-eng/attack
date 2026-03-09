import { NextResponse } from 'next/server';

function validateApiKey(req) {
  const authHeader = req.headers.get('x-api-key') || '';
  const validKey = process.env.PANEL_API_KEY;
  if (!validKey || authHeader !== validKey) return false;
  return true;
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║        ULTIMATE PROTECTION SIGNATURES DATABASE v3.0             ║
// ║        25+ Anti-Bot / WAF / CDN / CAPTCHA Signatures            ║
// ╚══════════════════════════════════════════════════════════════════╝

const PROTECTION_SIGNATURES = {
  // ─────────── TIER 1: EXTREME DIFFICULTY ───────────
  kasada: {
    name: "Kasada",
    tier: "extreme",
    headers: [
      { key: "x-kpsdk-ct", value: null },
      { key: "x-kpsdk-cd", value: null },
      { key: "x-kpsdk-v", value: null },
    ],
    cookies: ["x-kpsdk-ct", "x-kpsdk-cd", "x-kpsdk-v"],
    htmlSignals: ["ips.js", "_kpsdk", "kasada"],
    jsSignals: ["ips.js", "kasada", "_kpsdk"],
    challenges: { blocked: ["blocked", "kasada"] },
  },
  datadome: {
    name: "DataDome",
    tier: "extreme",
    headers: [
      { key: "server", value: "datadome" },
      { key: "x-datadome-cid", value: null },
      { key: "x-datadome", value: null },
      { key: "x-dd-b", value: null },
      { key: "x-dd-type", value: null },
    ],
    cookies: ["datadome"],
    htmlSignals: ["datadome.co", "api-js.datadome.co", "dd.datadome", "window.ddjskey", "DataDome"],
    jsSignals: ["datadome", "ddjskey", "dd_"],
    challenges: {
      captcha: ["geo.captcha-delivery.com", "interstitial.datadome"],
      blocked: ["datadome"],
    },
  },
  shape_security: {
    name: "Shape Security (F5)",
    tier: "extreme",
    headers: [],
    headerRegex: [/^x-[a-z0-9]{8}-(a|b|c|d|f|z)$/],
    cookies: [],
    cookieRegex: [/^[A-Za-z0-9]{8}$/],
    htmlSignals: ["shapesecurity", "__xr_bmobdb"],
    jsSignals: ["shapesecurity", "__xr_bmobdb"],
    urlSignals: ["?seed="],
    challenges: { blocked: ["Access Denied"] },
  },

  // ─────────── TIER 2: HIGH DIFFICULTY ───────────
  perimeterx: {
    name: "PerimeterX / HUMAN",
    tier: "high",
    headers: [{ key: "x-px-", value: null, prefix: true }],
    cookies: ["_pxvid", "_px2", "_px3", "_pxff_", "_pxmvid", "_pxhd", "pxcts", "_pxde", "_pxttld"],
    htmlSignals: ["perimeterx.net", "px-cdn.net", "px-cloud.net", "pxchk.net", "px-client.net", "px-captcha"],
    jsSignals: ["_pxAppId", "pxInit", "_pxAction", "perimeterx"],
    challenges: {
      captcha: ["px-captcha", "Press & Hold", "human verification"],
      blocked: ["blocked by px", "Request blocked"],
    },
  },
  akamai: {
    name: "Akamai Bot Manager",
    tier: "high",
    headers: [
      { key: "server", value: "akamaighost" },
      { key: "server", value: "akamaighostcn" },
      { key: "x-akamai-transformed", value: null },
      { key: "akamai-ghost", value: null },
      { key: "akamai-request-id", value: null },
      { key: "x-edgeconnect-midmile-rtt", value: null },
      { key: "x-akamai-staging", value: null },
      { key: "x-akamai-request-id", value: null },
    ],
    cookies: ["_abck", "ak_bmsc", "bm_sz", "bm_sv", "bm_mi", "bm_so", "bm_s"],
    htmlSignals: ["akamai", "_abck", "ak_bmsc", "bmak.", "sensor_data"],
    jsSignals: ["bmak", "sensor_data", "_abck", "ak_bmsc", "bazadebezolkohpepadr"],
    urlSignals: ["/akam/", "/.well-known/sbsd/"],
    challenges: {
      sensor_challenge: ["_abck", "sensor_data", "bmak"],
      blocked: ["Access Denied", "Reference #"],
    },
  },
  cloudflare: {
    name: "Cloudflare",
    tier: "high",
    headers: [
      { key: "server", value: "cloudflare" },
      { key: "cf-ray", value: null },
      { key: "cf-cache-status", value: null },
      { key: "cf-mitigated", value: null },
      { key: "cf-request-id", value: null },
      { key: "cf-connecting-ip", value: null },
      { key: "cf-edge-cache", value: null },
    ],
    cookies: ["__cf_bm", "cf_clearance", "__cflb", "__cfruid", "_cfuvid", "cf_ob_info", "cf_use_ob"],
    htmlSignals: [
      "challenges.cloudflare.com", "/cdn-cgi/", "cf-browser-verification",
      "cf-chl-widget", "cf-challenge-running", "cloudflare-static/",
      "_cf_chl_opt", "cdn-cgi/challenge-platform",
    ],
    jsSignals: ["_cf_chl_opt", "turnstile", "cf-challenge", "cloudflare"],
    challenges: {
      js_challenge: ["Just a moment", "Checking your browser", "cf-spinner-please-wait", "cf-challenge-running"],
      managed_challenge: ["challenges.cloudflare.com/turnstile", "cf-turnstile", "cdn-cgi/challenge-platform/h/g/orchestrate"],
      interactive_captcha: ["cf-hcaptcha-container", "g-recaptcha", "cf-captcha-container"],
      blocked: ["Sorry, you have been blocked", "Access denied", "Error 1020", "Error 1015", "Error 1012"],
      rate_limited: ["Error 1015", "You are being rate limited"],
    },
  },
  imperva: {
    name: "Imperva / Incapsula",
    tier: "high",
    headers: [
      { key: "x-cdn", value: "imperva" },
      { key: "x-cdn", value: "incapsula" },
      { key: "x-iinfo", value: null },
    ],
    cookies: ["visid_incap_", "incap_ses_", "__utmvc", "reese84", "nlbi_", "utmvc"],
    htmlSignals: ["incapsula", "imperva", "_Incapsula_Resource", "reese84"],
    jsSignals: ["_Incapsula", "reese84", "incapsula"],
    challenges: {
      js_challenge: ["_Incapsula_Resource"],
      blocked: ["Request unsuccessful", "Incapsula incident"],
    },
  },

  // ─────────── TIER 3: MEDIUM DIFFICULTY ───────────
  f5: {
    name: "F5 BIG-IP ASM",
    tier: "medium",
    headers: [
      { key: "x-powered-by", value: "f5" },
      { key: "server", value: "bigip" },
      { key: "server", value: "big-ip" },
    ],
    cookies: ["TSPD_101", "f5_cspm", "f5avraaaaaaa", "MRHSession"],
    cookieRegex: [/^TS[0-9a-f]{8,}$/i, /^BIGipServer/i],
    htmlSignals: ["f5.com", "big-ip"],
    jsSignals: ["f5.com"],
    challenges: {
      blocked: ["The requested URL was rejected"],
    },
  },
  aws_waf: {
    name: "AWS WAF / CloudFront",
    tier: "medium",
    headers: [
      { key: "server", value: "cloudfront" },
      { key: "x-amz-cf-id", value: null },
      { key: "x-amz-cf-pop", value: null },
      { key: "x-amzn-waf-action", value: null },
      { key: "x-amzn-requestid", value: null },
    ],
    cookies: ["aws-waf-token", "AWSALB", "AWSALBCORS"],
    htmlSignals: ["aws-waf", "awswaf", "aws_captcha"],
    jsSignals: ["aws-waf-token", "awswaf"],
    challenges: {
      captcha: ["aws_captcha", "awswaf", "aws-waf-captcha"],
      blocked: ["Request blocked", "ERROR: The request could not be satisfied"],
    },
  },
  sucuri: {
    name: "Sucuri / CloudProxy",
    tier: "medium",
    headers: [
      { key: "server", value: "sucuri" },
      { key: "server", value: "cloudproxy" },
      { key: "x-sucuri-id", value: null },
      { key: "x-sucuri-cache", value: null },
    ],
    cookies: ["sucuri_cloudproxy_"],
    htmlSignals: ["sucuri.net", "cloudproxy", "sucuri_cloudproxy", "Sucuri WebSite Firewall"],
    jsSignals: ["sucuri"],
    challenges: {
      js_challenge: ["sucuri_cloudproxy_js"],
      blocked: ["Access Denied - Sucuri", "Sucuri WebSite Firewall"],
    },
  },
  reblaze: {
    name: "Reblaze",
    tier: "medium",
    headers: [
      { key: "server", value: "reblaze" },
      { key: "rbzid", value: null },
    ],
    cookies: ["rbzid", "rbzsessionid"],
    cookieRegex: [/^rbz/i],
    htmlSignals: ["reblaze", "rbzid"],
    jsSignals: ["reblaze", "rbzid"],
    challenges: { blocked: ["Access Denied"] },
  },
  ddos_guard: {
    name: "DDoS-Guard",
    tier: "medium",
    headers: [{ key: "server", value: "ddos-guard" }],
    cookies: ["__ddg1_", "__ddg2_", "__ddgid_", "__ddgmark_"],
    htmlSignals: ["ddos-guard", "ddos-guard.net"],
    jsSignals: ["ddos-guard"],
    challenges: { js_challenge: ["DDoS-Guard", "ddos protection"] },
  },

  // ─────────── TIER 4: LOW DIFFICULTY ───────────
  fastly: {
    name: "Fastly",
    tier: "low",
    headers: [
      { key: "server", value: "fastly" },
      { key: "x-served-by", value: "cache-" },
      { key: "x-fastly-request-id", value: null },
      { key: "via", value: "varnish" },
      { key: "x-cache", value: null, requiresOther: "via" },
    ],
    cookies: [],
    htmlSignals: [],
    jsSignals: [],
    challenges: {},
  },
  google_cloud_armor: {
    name: "Google Cloud Armor",
    tier: "medium",
    headers: [
      { key: "x-goog-", value: null, prefix: true },
      { key: "server", value: "google frontend" },
      { key: "server", value: "gws" },
      { key: "x-cloud-trace-context", value: null },
    ],
    cookies: [],
    htmlSignals: ["google cloud armor"],
    jsSignals: [],
    challenges: {
      blocked: ["Your client does not have permission"],
      captcha: ["recaptcha"],
    },
  },
  azure_front_door: {
    name: "Azure Front Door / WAF",
    tier: "medium",
    headers: [
      { key: "x-azure-ref", value: null },
      { key: "x-fd-healthprobe", value: null },
      { key: "x-ms-routing-name", value: null },
    ],
    cookies: [],
    htmlSignals: ["azure front door"],
    jsSignals: [],
    challenges: {
      blocked: ["This request was blocked by the security rules"],
    },
  },
  stackpath: {
    name: "StackPath / Highwinds",
    tier: "low",
    headers: [
      { key: "server", value: "stackpath" },
      { key: "server", value: "highwinds" },
      { key: "x-hw", value: null },
    ],
    cookies: ["sp_"],
    htmlSignals: ["stackpath"],
    jsSignals: [],
    challenges: {},
  },
  vercel_fw: {
    name: "Vercel Firewall",
    tier: "low",
    headers: [
      { key: "server", value: "vercel" },
      { key: "x-vercel-id", value: null },
    ],
    cookies: ["__vercel"],
    htmlSignals: [],
    jsSignals: [],
    challenges: {},
  },
  botguard: {
    name: "Google BotGuard",
    tier: "high",
    headers: [],
    cookies: [],
    htmlSignals: ["botguard"],
    jsSignals: ["botguard", "/bg/", "BotGuard"],
    urlSignals: ["/bg/"],
    challenges: {},
  },
  cheq: {
    name: "CHEQ",
    tier: "high",
    headers: [],
    cookies: [],
    htmlSignals: ["cheq.ai", "CheqSdk"],
    jsSignals: ["CheqSdk", "cheq_invalidUsers", "cheq.ai"],
    challenges: {},
  },
  threatmetrix: {
    name: "ThreatMetrix (LexisNexis)",
    tier: "high",
    headers: [],
    cookies: [],
    htmlSignals: ["ThreatMetrix"],
    jsSignals: ["ThreatMetrix", "fp/check.js", "org_id=", "BNQL"],
    urlSignals: ["fp/check.js"],
    challenges: {},
  },
  meetrics: {
    name: "Meetrics",
    tier: "medium",
    headers: [],
    cookies: [],
    htmlSignals: ["meetricsGlobal", "mxcdn.net"],
    jsSignals: ["meetricsGlobal", "suspicious_mouse_movement", "mtrcs_"],
    challenges: {},
  },
  ocule: {
    name: "Ocule",
    tier: "medium",
    headers: [],
    cookies: [],
    htmlSignals: ["ocule.co.uk"],
    jsSignals: ["proxy.ocule.co.uk", "ocule"],
    challenges: {},
  },
  fortinet: {
    name: "Fortinet FortiWeb",
    tier: "medium",
    headers: [
      { key: "server", value: "fortiweb" },
    ],
    cookies: ["FORTIWAFSID"],
    htmlSignals: ["fortiweb", "fortinet"],
    jsSignals: [],
    challenges: { blocked: ["FortiWeb"] },
  },
  barracuda: {
    name: "Barracuda WAF",
    tier: "medium",
    headers: [
      { key: "server", value: "barracuda" },
    ],
    cookies: ["barra_counter_session"],
    htmlSignals: ["barracuda"],
    jsSignals: [],
    challenges: { blocked: ["Barracuda"] },
  },
  edgecast: {
    name: "Edgecast / Verizon Digital Media",
    tier: "low",
    headers: [
      { key: "server", value: "ecs" },
      { key: "x-ec-", value: null, prefix: true },
    ],
    cookies: [],
    htmlSignals: [],
    jsSignals: [],
    challenges: {},
  },
  radware: {
    name: "Radware Bot Manager",
    tier: "high",
    headers: [
      { key: "x-bot-manager", value: null },
    ],
    cookies: ["ShieldSquare", "reese84"],
    htmlSignals: ["radware", "ShieldSquare"],
    jsSignals: ["ShieldSquare", "radware"],
    challenges: { blocked: ["Radware Bot Manager"] },
  },
};

// ╔══════════════════════════════════════════════════════════════════╗
// ║        CAPTCHA SIGNATURES DATABASE (10 types)                   ║
// ╚══════════════════════════════════════════════════════════════════╝

const CAPTCHA_SIGNATURES = {
  turnstile: {
    name: "Cloudflare Turnstile",
    htmlSignals: ["challenges.cloudflare.com/turnstile", "cf-turnstile"],
    jsSignals: ["turnstile"],
    siteKeyPattern: /data-sitekey=["']([^"']+)["']/,
  },
  recaptcha_v2: {
    name: "reCAPTCHA v2",
    htmlSignals: ["google.com/recaptcha", "gstatic.com/recaptcha", "g-recaptcha"],
    jsSignals: ["grecaptcha.render", "g-recaptcha"],
    siteKeyPattern: /data-sitekey=["']([^"']+)["']/,
    exclude: ["recaptcha/api.js?render="],
  },
  recaptcha_v3: {
    name: "reCAPTCHA v3",
    htmlSignals: ["recaptcha/api.js?render="],
    jsSignals: ["grecaptcha.execute", "recaptcha/api.js?render="],
    siteKeyPattern: /render=([^&"']+)/,
  },
  hcaptcha: {
    name: "hCaptcha",
    htmlSignals: ["hcaptcha.com", "h-captcha"],
    jsSignals: ["hcaptcha.render", "hcaptcha.execute"],
    siteKeyPattern: /data-sitekey=["']([^"']+)["']/,
  },
  funcaptcha: {
    name: "FunCaptcha (Arkose Labs)",
    htmlSignals: ["client-api.arkoselabs.com", "api.funcaptcha.com"],
    jsSignals: ["ArkoseEnforce", "arkoseCallback", "funcaptcha"],
    siteKeyPattern: /data-pkey=["']([^"']+)["']/,
  },
  geetest: {
    name: "GeeTest",
    htmlSignals: ["api.geetest.com", "static.geetest.com"],
    jsSignals: ["initGeetest", "geetestUtils"],
    siteKeyPattern: null,
  },
  aws_captcha: {
    name: "AWS WAF CAPTCHA",
    htmlSignals: ["aws_captcha", "awswaf", "aws-waf-captcha"],
    jsSignals: ["aws-waf-token"],
    siteKeyPattern: null,
  },
  qcloud: {
    name: "QCloud / Tencent CAPTCHA",
    htmlSignals: ["turing.captcha.qcloud.com", "TencentCaptcha"],
    jsSignals: ["TencentCaptcha"],
    siteKeyPattern: null,
  },
  captcha_eu: {
    name: "Captcha.eu",
    htmlSignals: ["captcha.eu", "CaptchaEU"],
    jsSignals: ["CaptchaEU"],
    siteKeyPattern: null,
  },
  friendly_captcha: {
    name: "Friendly Captcha",
    htmlSignals: ["friendlycaptcha.com", "frc-captcha"],
    jsSignals: ["friendlyChallenge", "frc-captcha"],
    siteKeyPattern: null,
  },
};

// ╔══════════════════════════════════════════════════════════════════╗
// ║        CHALLENGE PAGE INDICATORS (comprehensive)                ║
// ╚══════════════════════════════════════════════════════════════════╝

const CHALLENGE_INDICATORS = [
  // Cloudflare
  "just a moment", "checking your browser", "cf-browser-verification",
  "cf-challenge-running", "enable javascript and cookies to continue",
  "performance & security by cloudflare",
  // Generic
  "please wait while we verify", "one more step",
  "please complete the security check", "attention required",
  "access denied", "you have been blocked", "error 1020",
  "ddos protection by", "please turn javascript on",
  "pardon our interruption", "press & hold", "verifying you are human",
  "checking if the site connection is secure",
  "this process is automatic", "your browser will redirect",
  "ray id:", "please allow up to 5 seconds",
  // Imperva
  "request unsuccessful", "incapsula incident",
  // Akamai
  "access denied", "reference #",
  // Sucuri
  "sucuri website firewall", "access denied - sucuri",
  // AWS
  "the request could not be satisfied",
  // Generic bot
  "bot detected", "automated access", "suspicious activity",
  "unusual traffic", "are you a robot", "prove you are human",
  "browser verification required", "security verification",
];

// ╔══════════════════════════════════════════════════════════════════╗
// ║        FETCH HELPERS                                            ║
// ╚══════════════════════════════════════════════════════════════════╝

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
];

async function safeFetch(targetUrl, timeout = 15000, uaIndex = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENTS[uaIndex % USER_AGENTS.length],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
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

// ╔══════════════════════════════════════════════════════════════════╗
// ║        SOCKET.IO HELPERS (unchanged)                            ║
// ╚══════════════════════════════════════════════════════════════════╝

async function testSocketIO(url) {
  try {
    // Skip blacklisted URLs (protection services, analytics, CDNs)
    if (isBlacklistedSocketUrl(url)) {
      return false;
    }
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

// Blacklist of domains that should NEVER be treated as Socket.IO endpoints
const SOCKET_URL_BLACKLIST = [
  'datadome', 'data-flow-apis', 'dataflow', 'captcha-delivery',
  'cloudflare', 'cloudflareinsights', 'challenges.cloudflare',
  'akamai', 'edgekey', 'edgesuite', 'akadns',
  'imperva', 'incapsula',
  'perimeterx', 'px-cdn', 'px-cloud', 'pxchk', 'human.com',
  'kasada',
  'shapesecurity',
  'google-analytics', 'googletagmanager', 'googleapis', 'gstatic',
  'facebook.com', 'fbcdn', 'connect.facebook',
  'doubleclick', 'googlesyndication', 'adservice',
  'hotjar', 'clarity.ms', 'segment.io', 'mixpanel', 'amplitude',
  'sentry.io', 'newrelic', 'datadog', 'bugsnag',
  'recaptcha', 'hcaptcha', 'turnstile',
  'cdn.jsdelivr', 'cdnjs.cloudflare', 'unpkg.com',
];

function isBlacklistedSocketUrl(url) {
  const lower = url.toLowerCase();
  return SOCKET_URL_BLACKLIST.some(bl => lower.includes(bl));
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
      if (url.startsWith('http') && !url.includes('socket.io') && !url.includes('cdn') && !isBlacklistedSocketUrl(url)) {
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

// ╔══════════════════════════════════════════════════════════════════╗
// ║   LAYER 1: HEADER ANALYSIS (deep inspection)                    ║
// ╚══════════════════════════════════════════════════════════════════╝

function analyzeHeaders(response) {
  const detected = [];
  const headers = {};
  const details = [];
  const rawHeaders = {};

  for (const [k, v] of response.headers.entries()) {
    headers[k.toLowerCase()] = v.toLowerCase();
    rawHeaders[k.toLowerCase()] = v;
  }

  for (const [protId, sig] of Object.entries(PROTECTION_SIGNATURES)) {
    let score = 0;

    // Standard header checks
    for (const h of (sig.headers || [])) {
      if (h.prefix) {
        if (Object.keys(headers).some(k => k.startsWith(h.key))) {
          score += 3;
          details.push(`[HEADER] ${sig.name}: prefix match "${h.key}*"`);
        }
      } else if (h.value === null) {
        if (headers[h.key] !== undefined) {
          score += 3;
          details.push(`[HEADER] ${sig.name}: header "${h.key}" present`);
        }
      } else {
        if (headers[h.key] && headers[h.key].includes(h.value)) {
          score += 3;
          details.push(`[HEADER] ${sig.name}: "${h.key}" = "${h.value}"`);
        }
      }
    }

    // Regex header checks (Shape Security etc.)
    if (sig.headerRegex) {
      for (const regex of sig.headerRegex) {
        for (const hk of Object.keys(headers)) {
          if (regex.test(hk)) {
            score += 5;
            details.push(`[HEADER] ${sig.name}: regex match on "${hk}"`);
            break;
          }
        }
      }
    }

    if (score >= 3) {
      detected.push(protId);
    }
  }

  return { detected, headers, rawHeaders, details };
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║   LAYER 2: COOKIE ANALYSIS (deep inspection)                    ║
// ╚══════════════════════════════════════════════════════════════════╝

function analyzeCookies(response, existingDetected) {
  const detected = [...existingDetected];
  const details = [];
  const cookies = {};

  const setCookie = response.headers.get('set-cookie') || '';
  const cookieNames = setCookie.match(/(?:^|,\s*)([^=;\s]+)(?==)/g) || [];
  for (const cn of cookieNames) {
    const name = cn.replace(/^,\s*/, '').trim();
    cookies[name] = true;
  }

  for (const [protId, sig] of Object.entries(PROTECTION_SIGNATURES)) {
    if (detected.includes(protId)) continue;
    let found = false;

    // Standard cookie name check
    for (const cookieName of Object.keys(cookies)) {
      for (const pattern of (sig.cookies || [])) {
        if (cookieName.toLowerCase().includes(pattern.toLowerCase())) {
          found = true;
          details.push(`[COOKIE] ${sig.name}: "${cookieName}" matches "${pattern}"`);
          break;
        }
      }
      if (found) break;

      // Regex cookie check
      if (sig.cookieRegex) {
        for (const regex of sig.cookieRegex) {
          if (regex.test(cookieName)) {
            found = true;
            details.push(`[COOKIE] ${sig.name}: "${cookieName}" matches regex`);
            break;
          }
        }
      }
      if (found) break;
    }

    if (found) {
      detected.push(protId);
    }
  }

  return { detected, cookies, details };
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║   LAYER 3: HTML DEEP ANALYSIS                                   ║
// ╚══════════════════════════════════════════════════════════════════╝

function analyzeHtml(htmlContent, existingDetected) {
  const detected = [...existingDetected];
  const details = [];
  let challengeType = 'none';
  const htmlLower = htmlContent.toLowerCase();

  // Check HTML signals for each protection
  for (const [protId, sig] of Object.entries(PROTECTION_SIGNATURES)) {
    if (detected.includes(protId)) continue;
    for (const signal of (sig.htmlSignals || [])) {
      if (htmlLower.includes(signal.toLowerCase())) {
        detected.push(protId);
        details.push(`[HTML] ${sig.name}: signal "${signal}" found`);
        break;
      }
    }
  }

  // Check URL signals in HTML (script src, link href, etc.)
  for (const [protId, sig] of Object.entries(PROTECTION_SIGNATURES)) {
    if (detected.includes(protId)) continue;
    for (const signal of (sig.urlSignals || [])) {
      if (htmlLower.includes(signal.toLowerCase())) {
        detected.push(protId);
        details.push(`[URL-IN-HTML] ${sig.name}: URL signal "${signal}" found`);
        break;
      }
    }
  }

  // Determine challenge type
  const challengePriority = { none: 0, js_challenge: 1, sensor_challenge: 2, managed_challenge: 3, captcha: 4, interactive_captcha: 4, rate_limited: 4, blocked: 5 };
  for (const protId of detected) {
    const sig = PROTECTION_SIGNATURES[protId];
    if (!sig || !sig.challenges) continue;
    for (const [cType, indicators] of Object.entries(sig.challenges)) {
      for (const indicator of indicators) {
        if (htmlLower.includes(indicator.toLowerCase())) {
          const newP = challengePriority[cType] || 0;
          const oldP = challengePriority[challengeType] || 0;
          if (newP > oldP) {
            challengeType = cType;
            details.push(`[CHALLENGE] ${sig.name}: ${cType} ("${indicator}")`);
          }
          break;
        }
      }
    }
  }

  return { detected, challengeType, details };
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║   LAYER 4: CAPTCHA DETECTION (10 types)                         ║
// ╚══════════════════════════════════════════════════════════════════╝

function detectCaptcha(htmlContent) {
  const htmlLower = htmlContent.toLowerCase();
  const captchas = [];

  for (const [captchaId, sig] of Object.entries(CAPTCHA_SIGNATURES)) {
    // Check exclusions first (e.g., recaptcha_v2 excluded if v3 pattern found)
    if (sig.exclude) {
      let excluded = false;
      for (const ex of sig.exclude) {
        if (htmlLower.includes(ex.toLowerCase())) {
          excluded = true;
          break;
        }
      }
      if (excluded) continue;
    }

    let found = false;
    for (const signal of sig.htmlSignals) {
      if (htmlLower.includes(signal.toLowerCase())) {
        found = true;
        break;
      }
    }

    if (found) {
      let siteKey = null;
      if (sig.siteKeyPattern) {
        const m = htmlContent.match(sig.siteKeyPattern);
        if (m) siteKey = m[1];
      }
      captchas.push({ type: captchaId, name: sig.name, siteKey });
    }
  }

  // Return primary captcha (first found)
  const primary = captchas.length > 0 ? captchas[0] : { type: null, name: null, siteKey: null };
  return { primary, all: captchas };
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║   LAYER 5: JAVASCRIPT DEEP SCAN                                 ║
// ╚══════════════════════════════════════════════════════════════════╝

async function deepScanJavaScript(htmlContent, baseUrl, existingDetected, scanLog) {
  const detected = [...existingDetected];
  const details = [];
  let hasSocketIO = false;
  let socketUrl = null;
  let candidateSocketUrl = null;

  const jsUrls = extractJsUrls(htmlContent, baseUrl);
  const skipDomains = ['googleapis.com', 'gstatic.com', 'cdnjs.com', 'unpkg.com', 'jsdelivr.net', 'jquery.com', 'bootstrapcdn.com'];

  let jsScanned = 0;
  for (const jsUrl of jsUrls.slice(0, 20)) {
    if (skipDomains.some(d => jsUrl.includes(d))) continue;
    try {
      const jsRes = await safeFetch(jsUrl, 10000);
      if (!jsRes || !jsRes.ok) continue;
      const jsContent = await jsRes.text();
      const jsLower = jsContent.toLowerCase();
      jsScanned++;

      // Check protection JS signals
      for (const [protId, sig] of Object.entries(PROTECTION_SIGNATURES)) {
        if (detected.includes(protId)) continue;
        for (const signal of (sig.jsSignals || [])) {
          if (jsLower.includes(signal.toLowerCase())) {
            detected.push(protId);
            details.push(`[JS-DEEP] ${sig.name}: "${signal}" found in ${new URL(jsUrl).pathname}`);
            break;
          }
        }
      }

      // Check CAPTCHA JS signals
      for (const [captchaId, sig] of Object.entries(CAPTCHA_SIGNATURES)) {
        for (const signal of (sig.jsSignals || [])) {
          if (jsLower.includes(signal.toLowerCase())) {
            details.push(`[JS-CAPTCHA] ${sig.name}: "${signal}" found in JS`);
            break;
          }
        }
      }

      // NexaFlow / DataDome API detection (NOT Socket.IO - these are protection APIs)
      if (jsContent.includes('nf-api-key') || jsContent.includes('data-flow-apis') || jsContent.includes('nexaflow')) {
        // data-flow-apis.cc is a DataDome/NexaFlow analytics endpoint, NOT a Socket.IO server
        // Do NOT treat it as Socket.IO - it will cause wrong mode selection
        if (!detected.includes('datadome')) {
          detected.push('datadome');
        }
        details.push(`[JS-DEEP] DataDome/NexaFlow API detected (data-flow-apis) - NOT Socket.IO`);
        scanLog.push(`[JS-DEEP] DataDome/NexaFlow API found - correctly identified as protection, not Socket.IO`);
        // Do NOT set hasSocketIO or socketUrl here
      }

      // Socket URL search in JS
      if (!hasSocketIO) {
        const backendUrls = extractSocketUrls(jsContent);
        for (const bu of backendUrls) {
          if (await testSocketIO(bu)) {
            hasSocketIO = true;
            socketUrl = bu.replace(/\/$/, '');
            scanLog.push(`[JS-DEEP] Socket found in JS bundle: ${socketUrl}`);
            break;
          } else if (!candidateSocketUrl) {
            candidateSocketUrl = bu.replace(/\/$/, '');
          }
        }
      }

      if (hasSocketIO) break;
    } catch { continue; }
  }

  scanLog.push(`[JS-DEEP] Scanned ${jsScanned} JS files`);
  return { detected, details, hasSocketIO, socketUrl, candidateSocketUrl };
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║   LAYER 6: MULTI-REQUEST PROBE (Rate Limiting detection)        ║
// ╚══════════════════════════════════════════════════════════════════╝

async function multiRequestProbe(url, scanLog) {
  const results = [];
  const details = [];

  // Send 3 rapid requests with different UAs to detect rate limiting
  for (let i = 0; i < 3; i++) {
    const res = await safeFetch(url, 10000, i);
    if (res) {
      results.push({ status: res.status, headers: Object.fromEntries(res.headers.entries()) });
    } else {
      results.push({ status: 0, headers: {} });
    }
    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  // Analyze patterns
  const statuses = results.map(r => r.status);
  const uniqueStatuses = [...new Set(statuses)];

  // Rate limiting detection
  if (statuses.some(s => s === 429)) {
    details.push(`[MULTI-REQ] Rate limiting detected (429 response)`);
    scanLog.push(`[PROBE] Rate limiting active (429)`);
  }

  // Progressive blocking (first OK, then blocked)
  if (statuses[0] === 200 && statuses[2] !== 200) {
    details.push(`[MULTI-REQ] Progressive blocking detected (${statuses.join(' → ')})`);
    scanLog.push(`[PROBE] Progressive blocking: ${statuses.join(' → ')}`);
  }

  // Inconsistent responses (behavioral detection)
  if (uniqueStatuses.length > 1 && !statuses.includes(0)) {
    details.push(`[MULTI-REQ] Inconsistent responses: ${statuses.join(', ')}`);
    scanLog.push(`[PROBE] Response pattern: ${statuses.join(', ')}`);
  }

  // Check for new cookies/headers appearing in later requests
  if (results.length >= 2) {
    const firstHeaders = Object.keys(results[0].headers);
    const lastHeaders = Object.keys(results[results.length - 1].headers);
    const newHeaders = lastHeaders.filter(h => !firstHeaders.includes(h));
    if (newHeaders.length > 0) {
      details.push(`[MULTI-REQ] New headers appeared: ${newHeaders.join(', ')}`);
    }
  }

  return {
    hasRateLimiting: statuses.some(s => s === 429),
    hasProgressiveBlocking: statuses[0] === 200 && statuses[2] !== 200,
    responsePattern: statuses,
    details,
  };
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║   LAYER 7: CONTENT VERIFICATION (is real content reached?)      ║
// ╚══════════════════════════════════════════════════════════════════╝

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
  const signalDetails = [];

  // Real title check
  const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].trim().toLowerCase();
    const challengeTitles = ['just a moment', 'attention required', 'access denied',
      'cloudflare', 'please wait', 'ddos', 'security check', 'blocked', 'error',
      'forbidden', '403', '503', 'captcha', 'verification'];
    if (!challengeTitles.some(ct => title.includes(ct))) {
      signals += 2;
      signalDetails.push(`title: "${titleMatch[1].trim().substring(0, 50)}"`);
    }
  }

  // Structure signals
  if (htmlLower.includes('<nav')) { signals++; signalDetails.push('nav'); }
  if (htmlLower.includes('<header')) { signals++; signalDetails.push('header'); }
  if (htmlLower.includes('<footer')) { signals++; signalDetails.push('footer'); }
  if (htmlLower.includes('<main') || htmlLower.includes('<article')) { signals++; signalDetails.push('main/article'); }
  if (htmlContent.length > 10000) { signals++; signalDetails.push(`size:${htmlContent.length}`); }
  if ((htmlLower.match(/<a /g) || []).length > 5) { signals++; signalDetails.push('links'); }
  if ((htmlLower.match(/<img/g) || []).length > 2) { signals++; signalDetails.push('images'); }
  if (htmlLower.includes('<form')) { signals++; signalDetails.push('form'); }
  if (htmlLower.includes('stylesheet') || htmlLower.includes('<style')) { signals++; signalDetails.push('css'); }

  // SPA check
  const isSPA = htmlLower.includes('<div id="root"') ||
                htmlLower.includes('<div id="app"') ||
                htmlLower.includes('<div id="__next"') ||
                htmlLower.includes('<div id="__nuxt"');

  if (signals >= 3) {
    return { reached: true, reason: 'verified_real_content', signals, isSPA, signalDetails };
  } else if (signals >= 1 && status === 200 && htmlContent.length > 2000) {
    return { reached: true, reason: 'likely_real_content', signals, isSPA, signalDetails };
  } else if (isSPA && status === 200) {
    return { reached: true, reason: 'spa_shell', signals, isSPA, signalDetails };
  }

  return { reached: false, reason: `uncertain_signals_${signals}`, signals, isSPA, signalDetails };
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║   PROTECTION LEVEL CALCULATOR (enhanced)                        ║
// ╚══════════════════════════════════════════════════════════════════╝

function calculateProtectionLevel(detected, challengeType, contentReached, status, multiReqData) {
  if (!detected.length || (detected.length === 1 && detected[0] === 'vercel_fw')) {
    return { primary: 'none', level: 'none', confidence: 95 };
  }

  // Primary = strongest protection by tier
  const tierOrder = ['extreme', 'high', 'medium', 'low'];
  let primary = detected[0];
  let highestTier = 'low';

  for (const protId of detected) {
    const sig = PROTECTION_SIGNATURES[protId];
    if (!sig) continue;
    const tierIdx = tierOrder.indexOf(sig.tier || 'low');
    const currentIdx = tierOrder.indexOf(highestTier);
    if (tierIdx < currentIdx) {
      highestTier = sig.tier;
      primary = protId;
    }
  }

  // Base level from tier
  let level = highestTier === 'extreme' ? 'extreme' : highestTier;

  // Escalate based on challenge
  if (challengeType === 'blocked') level = 'extreme';
  else if (challengeType === 'captcha' || challengeType === 'managed_challenge' || challengeType === 'interactive_captcha') {
    if (level === 'low' || level === 'medium') level = 'high';
    else if (level === 'high') level = 'extreme';
  } else if (challengeType === 'js_challenge' || challengeType === 'sensor_challenge') {
    if (level === 'low') level = 'medium';
  } else if (challengeType === 'rate_limited') {
    if (level === 'low') level = 'medium';
  }

  // Escalate if content not reached
  if (!contentReached && (status === 403 || status === 503 || status === 429)) {
    if (level === 'low' || level === 'medium') level = 'high';
  }

  // Escalate for rate limiting
  if (multiReqData?.hasRateLimiting) {
    if (level === 'low') level = 'medium';
  }
  if (multiReqData?.hasProgressiveBlocking) {
    if (level === 'low' || level === 'medium') level = 'high';
  }

  // Multiple protections = harder
  if (detected.length >= 3 && (level === 'low' || level === 'medium')) level = 'high';
  if (detected.length >= 4 && level === 'high') level = 'extreme';

  const confidence = Math.min(30 + detected.length * 12 + (challengeType !== 'none' ? 20 : 0) + (multiReqData ? 10 : 0), 99);

  return { primary, level, confidence };
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║   STRATEGY RECOMMENDER (enhanced)                               ║
// ╚══════════════════════════════════════════════════════════════════╝

function recommendStrategy(primary, level, challengeType, hasSocket, socketUrl, captchaInfo, detected) {
  const protName = PROTECTION_SIGNATURES[primary]?.name || primary;
  const allProtNames = detected.map(p => PROTECTION_SIGNATURES[p]?.name || p).join(' + ');

  // Strong protections (extreme/high tier) that REQUIRE real browser - Socket.IO won't help
  const strongProtections = ['datadome', 'kasada', 'shape_security', 'perimeterx', 'akamai'];
  const hasStrongProtection = detected.some(p => strongProtections.includes(p));

  // Socket.IO should ONLY be used when:
  // 1. A verified socket endpoint exists
  // 2. No strong protection is detected (strong protections need real browsers)
  // 3. The socket URL belongs to the actual target site, not a protection service
  if (hasSocket && socketUrl && !hasStrongProtection && level !== 'extreme' && level !== 'high') {
    return {
      mode: 'socketio',
      strategy: `Socket.IO mode - connect directly to ${socketUrl}. WebSocket bypasses WAF completely.`,
      successRate: '90-99%',
    };
  }

  if (primary === 'none' || level === 'none') {
    return {
      mode: 'browser',
      strategy: 'Browser mode - real Playwright browser for NexaFlow-compatible visits. No protection detected.',
      successRate: '95-100%',
    };
  }

  if (level === 'extreme' || hasStrongProtection) {
    return {
      mode: 'browser',
      strategy: `EXTREME protection (${allProtNames}). Challenge: ${challengeType}. Real browser (Playwright stealth) required. CAPTCHA solver may be needed.`,
      successRate: '30-60%',
    };
  } else if (level === 'high') {
    const captchaNote = captchaInfo?.type ? ` CAPTCHA: ${captchaInfo.name} (solver needed).` : '';
    return {
      mode: 'browser',
      strategy: `HIGH protection (${allProtNames}). Challenge: ${challengeType}. Real browser (Playwright stealth) + FlareSolverr fallback.${captchaNote}`,
      successRate: '40-70%',
    };
  } else if (level === 'medium') {
    return {
      mode: 'browser',
      strategy: `MEDIUM protection (${allProtNames}). Challenge: ${challengeType}. Real browser with stealth mode should bypass most challenges.`,
      successRate: '60-85%',
    };
  } else {
    return {
      mode: 'browser',
      strategy: `LOW protection (${allProtNames}). Real browser (Playwright stealth) for NexaFlow-compatible visits.`,
      successRate: '80-95%',
    };
  }
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║   MAIN SCAN ENDPOINT                                            ║
// ╚══════════════════════════════════════════════════════════════════╝

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
    scanLog.push(`[SCAN] Starting ULTIMATE multi-layer scan v3.0: ${url}`);
    scanLog.push(`[SCAN] Scanning 25+ protection types across 7 layers...`);

    // ======= STEP 1: Initial Request + Header/Cookie Analysis =======
    let htmlContent = '';
    let responseStatus = 0;
    let allDetected = [];
    let allDetails = [];
    let challengeType = 'none';
    let captchaInfo = { primary: { type: null, name: null, siteKey: null }, all: [] };
    let contentVerification = { reached: false, reason: 'no_response', signals: 0, isSPA: false };

    const directRes = await safeFetch(url);
    if (directRes) {
      responseStatus = directRes.status;
      scanLog.push(`[STEP1] Response: status=${responseStatus}`);

      // LAYER 1: Header Analysis
      const headerResult = analyzeHeaders(directRes);
      allDetected = [...headerResult.detected];
      allDetails = [...headerResult.details];
      scanLog.push(`[LAYER1] Headers: ${headerResult.detected.length} protections found`);

      // LAYER 2: Cookie Analysis
      const cookieResult = analyzeCookies(directRes, allDetected);
      allDetected = cookieResult.detected;
      allDetails = [...allDetails, ...cookieResult.details];
      scanLog.push(`[LAYER2] Cookies: ${Object.keys(cookieResult.cookies).length} cookies analyzed`);

      htmlContent = await directRes.text();

      // LAYER 3: HTML Analysis
      const htmlResult = analyzeHtml(htmlContent, allDetected);
      allDetected = htmlResult.detected;
      challengeType = htmlResult.challengeType;
      allDetails = [...allDetails, ...htmlResult.details];
      scanLog.push(`[LAYER3] HTML: ${htmlResult.detected.length - cookieResult.detected.length} new protections, challenge=${challengeType}`);

      // LAYER 4: CAPTCHA Detection
      captchaInfo = detectCaptcha(htmlContent);
      if (captchaInfo.primary.type) {
        scanLog.push(`[LAYER4] CAPTCHA: ${captchaInfo.primary.name} (key: ${captchaInfo.primary.siteKey || 'unknown'})`);
        if (captchaInfo.all.length > 1) {
          scanLog.push(`[LAYER4] Additional CAPTCHAs: ${captchaInfo.all.slice(1).map(c => c.name).join(', ')}`);
        }
      } else {
        scanLog.push(`[LAYER4] No CAPTCHA detected`);
      }

      // LAYER 7: Content Verification
      contentVerification = verifyRealContent(htmlContent, responseStatus);
      scanLog.push(`[LAYER7] Content: reached=${contentVerification.reached} (${contentVerification.reason}, signals=${contentVerification.signals})`);

    } else {
      scanLog.push(`[STEP1] No response - site may be down or heavily protected`);
      allDetected.push('unknown_waf');
    }

    // ======= STEP 2: Multi-Request Probe (LAYER 6) =======
    scanLog.push(`[LAYER6] Starting multi-request probe (3 requests)...`);
    const multiReqData = await multiRequestProbe(url, scanLog);
    allDetails = [...allDetails, ...multiReqData.details];
    if (multiReqData.hasRateLimiting) {
      scanLog.push(`[LAYER6] ⚠ RATE LIMITING ACTIVE`);
    }
    if (multiReqData.hasProgressiveBlocking) {
      scanLog.push(`[LAYER6] ⚠ PROGRESSIVE BLOCKING DETECTED`);
    }
    scanLog.push(`[LAYER6] Response pattern: ${multiReqData.responsePattern.join(' → ')}`);

    // ======= STEP 3: JavaScript Deep Scan (LAYER 5) =======
    let hasSocketIO = false;
    let socketUrl = null;
    let candidateSocketUrl = null;

    if (htmlContent && contentVerification.reached) {
      scanLog.push(`[LAYER5] Starting deep JavaScript scan...`);
      const jsResult = await deepScanJavaScript(htmlContent, base, allDetected, scanLog);
      allDetected = jsResult.detected;
      allDetails = [...allDetails, ...jsResult.details];
      hasSocketIO = jsResult.hasSocketIO;
      socketUrl = jsResult.socketUrl;
      candidateSocketUrl = jsResult.candidateSocketUrl;
    }

    // ======= STEP 4: Socket.IO Discovery =======
    // Check HTML for socket references
    if (!hasSocketIO && htmlContent) {
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

    // Check same-origin Socket.IO
    if (!hasSocketIO) {
      if (await testSocketIO(base)) {
        hasSocketIO = true;
        socketUrl = base;
        scanLog.push(`[SOCKET] Found at same origin: ${base}`);
      }
    }

    // Try common backend patterns
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

    // Use candidate if nothing verified - BUT filter out protection/analytics URLs
    const SOCKET_BLACKLIST = [
      'datadome', 'data-flow', 'dataflow', 'captcha', 'challenge',
      'cloudflare', 'akamai', 'imperva', 'incapsula', 'perimeterx', 'human.com',
      'kasada', 'shape', 'distil', 'botguard', 'recaptcha', 'hcaptcha',
      'google-analytics', 'googletagmanager', 'gtag', 'analytics',
      'facebook.com', 'fbcdn', 'doubleclick', 'googlesyndication',
      'hotjar', 'clarity.ms', 'segment.io', 'mixpanel', 'amplitude',
      'sentry.io', 'newrelic', 'datadog', 'cdn.', 'static.',
    ];
    if (!hasSocketIO && candidateSocketUrl) {
      const candidateLower = candidateSocketUrl.toLowerCase();
      const isBlacklisted = SOCKET_BLACKLIST.some(bl => candidateLower.includes(bl));
      if (isBlacklisted) {
        scanLog.push(`[SOCKET] ❌ Candidate rejected (protection/analytics URL): ${candidateSocketUrl}`);
        candidateSocketUrl = null;
      } else {
        hasSocketIO = true;
        socketUrl = candidateSocketUrl;
        scanLog.push(`[SOCKET] Unverified candidate: ${candidateSocketUrl}`);
      }
    }

    // Try frontend deployments if blocked
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

    // ======= STEP 5: Final Calculation =======
    const finalProtLevel = calculateProtectionLevel(
      allDetected, challengeType, contentVerification.reached,
      responseStatus, multiReqData
    );
    const strategy = recommendStrategy(
      finalProtLevel.primary, finalProtLevel.level, challengeType,
      hasSocketIO, socketUrl, captchaInfo.primary, allDetected
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
      scan_method: 'vercel-ultimate-v3',

      // ADVANCED: Full detection data
      protections_detected: allDetected,
      protection_names: protNames,
      protection_count: allDetected.filter(p => p !== 'unknown_waf').length,
      protection_level: finalProtLevel.level,
      challenge_type: challengeType,
      captcha_info: captchaInfo.primary,
      all_captchas: captchaInfo.all,
      real_content_reached: contentVerification.reached,
      content_verification: contentVerification.reason,
      content_signals: contentVerification.signals,
      is_spa: contentVerification.isSPA,
      detection_confidence: finalProtLevel.confidence,
      recommended_strategy: strategy.strategy,
      expected_success_rate: strategy.successRate,
      rate_limiting: multiReqData.hasRateLimiting,
      progressive_blocking: multiReqData.hasProgressiveBlocking,
      response_pattern: multiReqData.responsePattern,
      detection_details: allDetails,
      scan_log: scanLog,
      scan_layers: 7,
      signatures_count: Object.keys(PROTECTION_SIGNATURES).length,
    };

    console.log(`[SCAN] ╔══════════════════════════════════════╗`);
    console.log(`[SCAN] ║   ULTIMATE SCAN v3.0 COMPLETE        ║`);
    console.log(`[SCAN] ╚══════════════════════════════════════╝`);
    console.log(`[SCAN] URL: ${url}`);
    console.log(`[SCAN] Protections (${protNames.length}): ${protNames.join(', ') || 'None'}`);
    console.log(`[SCAN] Level: ${finalProtLevel.level.toUpperCase()}`);
    console.log(`[SCAN] Challenge: ${challengeType}`);
    console.log(`[SCAN] CAPTCHA: ${captchaInfo.primary.name || 'None'}`);
    console.log(`[SCAN] Real Content: ${contentVerification.reached}`);
    console.log(`[SCAN] Rate Limiting: ${multiReqData.hasRateLimiting}`);
    console.log(`[SCAN] Mode: ${strategy.mode}`);
    console.log(`[SCAN] Socket: ${socketUrl || 'None'}`);
    console.log(`[SCAN] Confidence: ${finalProtLevel.confidence}%`);
    console.log(`[SCAN] Success Rate: ${strategy.successRate}`);
    console.log(`[SCAN] Strategy: ${strategy.strategy}`);

    return NextResponse.json({ scanResult: result });

  } catch (error) {
    console.error('[SCAN] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
