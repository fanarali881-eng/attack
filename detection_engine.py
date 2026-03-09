"""
ULTIMATE PROTECTION DETECTION ENGINE v3.0
==========================================
Multi-layer detection system that accurately identifies:
  - 25+ WAF/Anti-bot protection types
  - 10 CAPTCHA types with site key extraction
  - Protection level (none/low/medium/high/extreme)
  - Challenge type detection
  - Socket.IO endpoints
  - Analytics platforms
  - Rate limiting & progressive blocking
  - Best attack strategy recommendation

Detection layers:
  Layer 1: HTTP Response Headers (deep inspection)
  Layer 2: Cookie Analysis (pattern + regex)
  Layer 3: HTML Content Analysis (signals + challenges)
  Layer 4: CAPTCHA Detection (10 types)
  Layer 5: JavaScript Deep Scan (protection + socket)
  Layer 6: Multi-Request Probe (rate limiting detection)
  Layer 7: Content Verification (real page vs challenge)
"""

import re
import time
import random
import json
import threading
from urllib.parse import urlparse

# ╔══════════════════════════════════════════════════════════════════╗
# ║        ULTIMATE PROTECTION SIGNATURES DATABASE v3.0              ║
# ║        25+ Anti-Bot / WAF / CDN Signatures                      ║
# ╚══════════════════════════════════════════════════════════════════╝

PROTECTION_SIGNATURES = {
    # ─────────── TIER 1: EXTREME DIFFICULTY ───────────
    "kasada": {
        "name": "Kasada",
        "tier": "extreme",
        "headers": {
            "must_have_any": [
                ("x-kpsdk-ct", None),
                ("x-kpsdk-cd", None),
                ("x-kpsdk-v", None),
            ],
        },
        "cookies": {
            "patterns": ["x-kpsdk-ct", "x-kpsdk-cd", "x-kpsdk-v"],
        },
        "html_signals": ["ips.js", "_kpsdk", "kasada"],
        "js_signals": ["ips.js", "kasada", "_kpsdk"],
        "challenge_indicators": {
            "blocked": ["blocked", "kasada"],
        },
    },
    "datadome": {
        "name": "DataDome",
        "tier": "extreme",
        "headers": {
            "must_have_any": [
                ("server", "datadome"),
                ("x-datadome-cid", None),
                ("x-datadome", None),
                ("x-dd-b", None),
                ("x-dd-type", None),
            ],
        },
        "cookies": {
            "patterns": ["datadome"],
        },
        "html_signals": ["datadome.co", "api-js.datadome.co", "dd.datadome",
                         "window.ddjskey", "DataDome"],
        "js_signals": ["datadome", "ddjskey", "dd_"],
        "challenge_indicators": {
            "captcha": ["geo.captcha-delivery.com", "interstitial.datadome"],
            "blocked": ["datadome"],
        },
    },
    "shape_security": {
        "name": "Shape Security (F5)",
        "tier": "extreme",
        "headers": {
            "must_have_any": [],
            "header_regex": [r"^x-[a-z0-9]{8}-(a|b|c|d|f|z)$"],
        },
        "cookies": {
            "patterns": [],
            "regex_patterns": [r"^[A-Za-z0-9]{8}$"],
        },
        "html_signals": ["shapesecurity", "__xr_bmobdb"],
        "js_signals": ["shapesecurity", "__xr_bmobdb"],
        "challenge_indicators": {
            "blocked": ["Access Denied"],
        },
    },

    # ─────────── TIER 2: HIGH DIFFICULTY ───────────
    "perimeterx": {
        "name": "PerimeterX / HUMAN",
        "tier": "high",
        "headers": {
            "must_have_any": [
                ("x-px-", None),
            ],
        },
        "cookies": {
            "patterns": ["_pxvid", "_px2", "_px3", "_pxff_", "_pxmvid",
                         "_pxhd", "pxcts", "_pxde", "_pxttld"],
        },
        "html_signals": ["perimeterx.net", "px-cdn.net", "px-cloud.net",
                         "pxchk.net", "px-client.net", "px-captcha"],
        "js_signals": ["_pxAppId", "pxInit", "_pxAction", "perimeterx"],
        "challenge_indicators": {
            "captcha": ["px-captcha", "Press & Hold", "human verification"],
            "blocked": ["blocked by px", "Request blocked"],
        },
    },
    "akamai": {
        "name": "Akamai Bot Manager",
        "tier": "high",
        "headers": {
            "must_have_any": [
                ("server", "akamaighost"),
                ("server", "akamaighostcn"),
                ("x-akamai-transformed", None),
                ("akamai-ghost", None),
                ("akamai-request-id", None),
                ("x-edgeconnect-midmile-rtt", None),
                ("x-akamai-staging", None),
                ("x-akamai-request-id", None),
            ],
        },
        "cookies": {
            "patterns": ["_abck", "ak_bmsc", "bm_sz", "bm_sv", "bm_mi", "bm_so", "bm_s"],
        },
        "html_signals": ["akamai", "_abck", "ak_bmsc", "bmak.", "sensor_data"],
        "js_signals": ["bmak", "sensor_data", "_abck", "ak_bmsc", "bazadebezolkohpepadr"],
        "challenge_indicators": {
            "sensor_challenge": ["_abck", "sensor_data", "bmak"],
            "blocked": ["Access Denied", "Reference #"],
        },
    },
    "cloudflare": {
        "name": "Cloudflare",
        "tier": "high",
        "headers": {
            "must_have_any": [
                ("server", "cloudflare"),
                ("cf-ray", None),
                ("cf-cache-status", None),
                ("cf-mitigated", None),
                ("cf-request-id", None),
                ("cf-connecting-ip", None),
                ("cf-edge-cache", None),
            ],
            "strong_signals": [
                ("nel", "cloudflare"),
                ("report-to", "cloudflare"),
            ],
        },
        "cookies": {
            "patterns": ["__cf_bm", "cf_clearance", "__cflb", "__cfruid",
                         "_cfuvid", "cf_ob_info", "cf_use_ob"],
        },
        "html_signals": [
            "challenges.cloudflare.com", "/cdn-cgi/", "cf-browser-verification",
            "cf-chl-widget", "cf-challenge-running", "cloudflare-static/",
            "_cf_chl_opt", "cdn-cgi/challenge-platform",
        ],
        "js_signals": ["_cf_chl_opt", "turnstile", "cf-challenge", "cloudflare"],
        "challenge_indicators": {
            "js_challenge": ["Just a moment", "Checking your browser",
                             "cf-spinner-please-wait", "cf-challenge-running"],
            "managed_challenge": ["challenges.cloudflare.com/turnstile", "cf-turnstile",
                                  "cdn-cgi/challenge-platform/h/g/orchestrate"],
            "interactive_captcha": ["cf-hcaptcha-container", "g-recaptcha",
                                    "cf-captcha-container"],
            "blocked": ["Sorry, you have been blocked", "Access denied",
                        "Error 1020", "Error 1015", "Error 1012"],
            "rate_limited": ["Error 1015", "You are being rate limited"],
        },
    },
    "imperva": {
        "name": "Imperva / Incapsula",
        "tier": "high",
        "headers": {
            "must_have_any": [
                ("x-cdn", "imperva"),
                ("x-cdn", "incapsula"),
                ("x-iinfo", None),
            ],
        },
        "cookies": {
            "patterns": ["visid_incap_", "incap_ses_", "__utmvc", "reese84",
                         "nlbi_", "utmvc"],
        },
        "html_signals": ["incapsula", "imperva", "_Incapsula_Resource", "reese84"],
        "js_signals": ["_Incapsula", "reese84", "incapsula"],
        "challenge_indicators": {
            "js_challenge": ["_Incapsula_Resource"],
            "blocked": ["Request unsuccessful", "Incapsula incident"],
        },
    },
    "botguard": {
        "name": "Google BotGuard",
        "tier": "high",
        "headers": {"must_have_any": []},
        "cookies": {"patterns": []},
        "html_signals": ["botguard"],
        "js_signals": ["botguard", "/bg/", "BotGuard"],
        "challenge_indicators": {},
    },
    "cheq": {
        "name": "CHEQ",
        "tier": "high",
        "headers": {"must_have_any": []},
        "cookies": {"patterns": []},
        "html_signals": ["cheq.ai", "CheqSdk"],
        "js_signals": ["CheqSdk", "cheq_invalidUsers", "cheq.ai"],
        "challenge_indicators": {},
    },
    "radware": {
        "name": "Radware Bot Manager",
        "tier": "high",
        "headers": {
            "must_have_any": [("x-bot-manager", None)],
        },
        "cookies": {
            "patterns": ["ShieldSquare", "reese84"],
        },
        "html_signals": ["radware", "ShieldSquare"],
        "js_signals": ["ShieldSquare", "radware"],
        "challenge_indicators": {
            "blocked": ["Radware Bot Manager"],
        },
    },
    "threatmetrix": {
        "name": "ThreatMetrix (LexisNexis)",
        "tier": "high",
        "headers": {"must_have_any": []},
        "cookies": {"patterns": []},
        "html_signals": ["ThreatMetrix"],
        "js_signals": ["ThreatMetrix", "fp/check.js", "org_id=", "BNQL"],
        "challenge_indicators": {},
    },

    # ─────────── TIER 3: MEDIUM DIFFICULTY ───────────
    "f5": {
        "name": "F5 BIG-IP ASM",
        "tier": "medium",
        "headers": {
            "must_have_any": [
                ("x-powered-by", "f5"),
                ("server", "bigip"),
                ("server", "big-ip"),
            ],
        },
        "cookies": {
            "patterns": ["TSPD_101", "f5_cspm", "f5avraaaaaaa", "MRHSession"],
            "regex_patterns": [r"^TS[0-9a-f]{8,}$", r"^BIGipServer"],
        },
        "html_signals": ["f5.com", "big-ip"],
        "js_signals": ["f5.com"],
        "challenge_indicators": {
            "blocked": ["The requested URL was rejected"],
        },
    },
    "aws_waf": {
        "name": "AWS WAF / CloudFront",
        "tier": "medium",
        "headers": {
            "must_have_any": [
                ("server", "cloudfront"),
                ("x-amz-cf-id", None),
                ("x-amz-cf-pop", None),
                ("x-amzn-waf-action", None),
                ("x-amzn-requestid", None),
            ],
        },
        "cookies": {
            "patterns": ["aws-waf-token", "AWSALB", "AWSALBCORS"],
        },
        "html_signals": ["aws-waf", "awswaf", "aws_captcha"],
        "js_signals": ["aws-waf-token", "awswaf"],
        "challenge_indicators": {
            "captcha": ["aws_captcha", "awswaf", "aws-waf-captcha"],
            "blocked": ["Request blocked", "ERROR: The request could not be satisfied"],
        },
    },
    "sucuri": {
        "name": "Sucuri / CloudProxy",
        "tier": "medium",
        "headers": {
            "must_have_any": [
                ("server", "sucuri"),
                ("server", "cloudproxy"),
                ("x-sucuri-id", None),
                ("x-sucuri-cache", None),
            ],
        },
        "cookies": {
            "patterns": ["sucuri_cloudproxy_"],
        },
        "html_signals": ["sucuri.net", "cloudproxy", "sucuri_cloudproxy",
                         "Sucuri WebSite Firewall"],
        "js_signals": ["sucuri"],
        "challenge_indicators": {
            "js_challenge": ["sucuri_cloudproxy_js"],
            "blocked": ["Access Denied - Sucuri", "Sucuri WebSite Firewall"],
        },
    },
    "reblaze": {
        "name": "Reblaze",
        "tier": "medium",
        "headers": {
            "must_have_any": [
                ("server", "reblaze"),
                ("rbzid", None),
            ],
        },
        "cookies": {
            "patterns": ["rbzid", "rbzsessionid"],
            "regex_patterns": [r"^rbz"],
        },
        "html_signals": ["reblaze", "rbzid"],
        "js_signals": ["reblaze", "rbzid"],
        "challenge_indicators": {
            "blocked": ["Access Denied"],
        },
    },
    "ddos_guard": {
        "name": "DDoS-Guard",
        "tier": "medium",
        "headers": {
            "must_have_any": [("server", "ddos-guard")],
        },
        "cookies": {
            "patterns": ["__ddg1_", "__ddg2_", "__ddgid_", "__ddgmark_"],
        },
        "html_signals": ["ddos-guard", "ddos-guard.net"],
        "js_signals": ["ddos-guard"],
        "challenge_indicators": {
            "js_challenge": ["DDoS-Guard", "ddos protection"],
        },
    },
    "google_cloud_armor": {
        "name": "Google Cloud Armor",
        "tier": "medium",
        "headers": {
            "must_have_any": [
                ("server", "google frontend"),
                ("server", "gws"),
                ("x-cloud-trace-context", None),
            ],
            "prefix_headers": ["x-goog-"],
        },
        "cookies": {"patterns": []},
        "html_signals": ["google cloud armor"],
        "js_signals": [],
        "challenge_indicators": {
            "blocked": ["Your client does not have permission"],
            "captcha": ["recaptcha"],
        },
    },
    "azure_front_door": {
        "name": "Azure Front Door / WAF",
        "tier": "medium",
        "headers": {
            "must_have_any": [
                ("x-azure-ref", None),
                ("x-fd-healthprobe", None),
                ("x-ms-routing-name", None),
            ],
        },
        "cookies": {"patterns": []},
        "html_signals": ["azure front door"],
        "js_signals": [],
        "challenge_indicators": {
            "blocked": ["This request was blocked by the security rules"],
        },
    },
    "fortinet": {
        "name": "Fortinet FortiWeb",
        "tier": "medium",
        "headers": {
            "must_have_any": [("server", "fortiweb")],
        },
        "cookies": {
            "patterns": ["FORTIWAFSID"],
        },
        "html_signals": ["fortiweb", "fortinet"],
        "js_signals": [],
        "challenge_indicators": {
            "blocked": ["FortiWeb"],
        },
    },
    "barracuda": {
        "name": "Barracuda WAF",
        "tier": "medium",
        "headers": {
            "must_have_any": [("server", "barracuda")],
        },
        "cookies": {
            "patterns": ["barra_counter_session"],
        },
        "html_signals": ["barracuda"],
        "js_signals": [],
        "challenge_indicators": {
            "blocked": ["Barracuda"],
        },
    },
    "meetrics": {
        "name": "Meetrics",
        "tier": "medium",
        "headers": {"must_have_any": []},
        "cookies": {"patterns": []},
        "html_signals": ["meetricsGlobal", "mxcdn.net"],
        "js_signals": ["meetricsGlobal", "suspicious_mouse_movement", "mtrcs_"],
        "challenge_indicators": {},
    },
    "ocule": {
        "name": "Ocule",
        "tier": "medium",
        "headers": {"must_have_any": []},
        "cookies": {"patterns": []},
        "html_signals": ["ocule.co.uk"],
        "js_signals": ["proxy.ocule.co.uk", "ocule"],
        "challenge_indicators": {},
    },

    # ─────────── TIER 4: LOW DIFFICULTY ───────────
    "fastly": {
        "name": "Fastly",
        "tier": "low",
        "headers": {
            "must_have_any": [
                ("server", "fastly"),
                ("x-served-by", "cache-"),
                ("x-fastly-request-id", None),
            ],
            "strong_signals": [("via", "varnish")],
        },
        "cookies": {"patterns": []},
        "html_signals": [],
        "js_signals": [],
        "challenge_indicators": {},
    },
    "stackpath": {
        "name": "StackPath / Highwinds",
        "tier": "low",
        "headers": {
            "must_have_any": [
                ("server", "stackpath"),
                ("server", "highwinds"),
                ("x-hw", None),
            ],
        },
        "cookies": {"patterns": ["sp_"]},
        "html_signals": ["stackpath"],
        "js_signals": [],
        "challenge_indicators": {},
    },
    "vercel": {
        "name": "Vercel Firewall",
        "tier": "low",
        "headers": {
            "must_have_any": [
                ("server", "vercel"),
                ("x-vercel-id", None),
            ],
        },
        "cookies": {"patterns": ["__vercel"]},
        "html_signals": [],
        "js_signals": [],
        "challenge_indicators": {},
    },
    "edgecast": {
        "name": "Edgecast / Verizon",
        "tier": "low",
        "headers": {
            "must_have_any": [("server", "ecs")],
            "prefix_headers": ["x-ec-"],
        },
        "cookies": {"patterns": []},
        "html_signals": [],
        "js_signals": [],
        "challenge_indicators": {},
    },
}

# ╔══════════════════════════════════════════════════════════════════╗
# ║        CAPTCHA SIGNATURES DATABASE (10 types)                    ║
# ╚══════════════════════════════════════════════════════════════════╝

CAPTCHA_SIGNATURES = {
    "turnstile": {
        "name": "Cloudflare Turnstile",
        "html_signals": ["challenges.cloudflare.com/turnstile", "cf-turnstile"],
        "js_signals": ["turnstile"],
        "site_key_pattern": r'data-sitekey=["\']([^"\']+)["\']',
    },
    "recaptcha_v2": {
        "name": "reCAPTCHA v2",
        "html_signals": ["google.com/recaptcha", "gstatic.com/recaptcha", "g-recaptcha"],
        "js_signals": ["grecaptcha.render", "g-recaptcha"],
        "site_key_pattern": r'data-sitekey=["\']([^"\']+)["\']',
        "exclude": ["recaptcha/api.js?render="],
    },
    "recaptcha_v3": {
        "name": "reCAPTCHA v3",
        "html_signals": ["recaptcha/api.js?render="],
        "js_signals": ["grecaptcha.execute", "recaptcha/api.js?render="],
        "site_key_pattern": r'render=([^&"\']+)',
    },
    "hcaptcha": {
        "name": "hCaptcha",
        "html_signals": ["hcaptcha.com", "h-captcha"],
        "js_signals": ["hcaptcha.render", "hcaptcha.execute"],
        "site_key_pattern": r'data-sitekey=["\']([^"\']+)["\']',
    },
    "funcaptcha": {
        "name": "FunCaptcha (Arkose Labs)",
        "html_signals": ["client-api.arkoselabs.com", "api.funcaptcha.com"],
        "js_signals": ["ArkoseEnforce", "arkoseCallback", "funcaptcha"],
        "site_key_pattern": r'data-pkey=["\']([^"\']+)["\']',
    },
    "geetest": {
        "name": "GeeTest",
        "html_signals": ["api.geetest.com", "static.geetest.com"],
        "js_signals": ["initGeetest", "geetestUtils"],
        "site_key_pattern": None,
    },
    "aws_captcha": {
        "name": "AWS WAF CAPTCHA",
        "html_signals": ["aws_captcha", "awswaf", "aws-waf-captcha"],
        "js_signals": ["aws-waf-token"],
        "site_key_pattern": None,
    },
    "qcloud": {
        "name": "QCloud / Tencent CAPTCHA",
        "html_signals": ["turing.captcha.qcloud.com", "TencentCaptcha"],
        "js_signals": ["TencentCaptcha"],
        "site_key_pattern": None,
    },
    "captcha_eu": {
        "name": "Captcha.eu",
        "html_signals": ["captcha.eu", "CaptchaEU"],
        "js_signals": ["CaptchaEU"],
        "site_key_pattern": None,
    },
    "friendly_captcha": {
        "name": "Friendly Captcha",
        "html_signals": ["friendlycaptcha.com", "frc-captcha"],
        "js_signals": ["friendlyChallenge", "frc-captcha"],
        "site_key_pattern": None,
    },
}

# ╔══════════════════════════════════════════════════════════════════╗
# ║        CHALLENGE PAGE INDICATORS (comprehensive)                 ║
# ╚══════════════════════════════════════════════════════════════════╝

CHALLENGE_INDICATORS = [
    # Cloudflare
    "just a moment", "checking your browser", "cf-browser-verification",
    "cf-challenge-running", "enable javascript and cookies to continue",
    "performance & security by cloudflare",
    # Generic
    "please wait while we verify", "one more step",
    "please complete the security check", "attention required",
    "access denied", "you have been blocked", "error 1020",
    "ddos protection by", "please turn javascript on",
    "pardon our interruption", "press & hold", "verifying you are human",
    "checking if the site connection is secure",
    "this process is automatic", "your browser will redirect",
    "ray id:", "please allow up to 5 seconds",
    # Imperva
    "request unsuccessful", "incapsula incident",
    # Akamai
    "reference #",
    # Sucuri
    "sucuri website firewall", "access denied - sucuri",
    # AWS
    "the request could not be satisfied",
    # Generic bot
    "bot detected", "automated access", "suspicious activity",
    "unusual traffic", "are you a robot", "prove you are human",
    "browser verification required", "security verification",
]


# ╔══════════════════════════════════════════════════════════════════╗
# ║        DETECTION ENGINE CLASS                                    ║
# ╚══════════════════════════════════════════════════════════════════╝

class ProtectionDetector:
    """Ultimate multi-layer protection detection engine v3.0."""

    def __init__(self, requests_module=None, cffi_module=None, browser_profiles=None,
                 get_proxy_func=None):
        self.requests = requests_module
        self.cffi = cffi_module
        self.profiles = browser_profiles or []
        self.get_proxy = get_proxy_func
        self.results = {
            "protections_detected": [],
            "primary_protection": "none",
            "protection_level": "none",       # none, low, medium, high, extreme
            "challenge_type": "none",
            "captcha_info": {"type": None, "site_key": None},
            "all_captchas": [],
            "has_socketio": False,
            "socket_url": None,
            "socket_token": None,
            "analytics": {"type": None, "id": None, "endpoint": None, "hostname": None},
            "pages": [],
            "cdn_provider": None,
            "is_spa": False,
            "real_content_reached": False,
            "content_fingerprint": None,
            "detection_confidence": 0,
            "detection_details": [],
            "recommended_mode": "http",
            "recommended_strategy": "",
            "expected_success_rate": "",
            "rate_limiting": False,
            "progressive_blocking": False,
            "response_pattern": [],
            "raw_headers": {},
            "raw_cookies": {},
            "response_status": 0,
            "response_size": 0,
            "scan_layers": 7,
            "signatures_count": len(PROTECTION_SIGNATURES),
        }

    def log(self, msg):
        """Add to detection log."""
        self.results["detection_details"].append(msg)
        print(f"  [DETECT] {msg}", flush=True)

    def detect(self, url, html_content="", response=None, manual_socket=None):
        """
        Run full 7-layer detection on a URL.
        Returns comprehensive detection results.
        """
        parsed = urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"

        self.log(f"Starting ULTIMATE scan v3.0: {url}")
        self.log(f"Scanning {len(PROTECTION_SIGNATURES)} protection signatures across 7 layers...")

        # If we have a response object, analyze it
        if response is not None:
            self._analyze_response(response)
            if hasattr(response, 'text'):
                html_content = response.text

        # If no response yet, make our own request
        if not html_content and response is None:
            html_content = self._probe_site(url)

        # Layer 3: HTML Content Analysis
        if html_content:
            self._analyze_html(html_content, url)

        # Layer 4: CAPTCHA Detection (10 types)
        if html_content:
            self._detect_captcha_all(html_content)

        # Layer 5: JavaScript Deep Scan
        if html_content and not self.results["has_socketio"]:
            self._deep_scan_javascript(html_content, base)

        # Layer 6: Multi-Request Probe
        self._multi_request_probe(url)

        # Layer 7: Content Verification
        self._verify_content(html_content)

        # Manual socket override
        if manual_socket:
            self.results["has_socketio"] = True
            self.results["socket_url"] = manual_socket
            self.log(f"Manual Socket.IO URL: {manual_socket}")

        # Socket.IO discovery if not found yet
        if not self.results["has_socketio"]:
            self._discover_socketio(url, base, html_content)

        # Determine protection level
        self._calculate_protection_level()

        # Choose best attack strategy
        self._recommend_strategy(url, base)

        # Discover pages
        self.results["pages"] = self._discover_pages(url, base, html_content)

        # Detect analytics
        self.results["analytics"] = self._detect_analytics(html_content)
        self.results["analytics"]["hostname"] = parsed.netloc

        # Final summary
        self._print_summary()

        return self.results

    def _probe_site(self, url):
        """Make initial request to the site and analyze response."""
        html = ""
        profile = random.choice(self.profiles) if self.profiles else None

        # Try with curl_cffi first (better TLS fingerprint)
        if self.cffi and profile:
            try:
                proxy = self.get_proxy() if self.get_proxy else None
                proxies = {"http": proxy, "https": proxy} if proxy else None
                headers = self._get_headers(profile)
                r = self.cffi.get(url, impersonate=profile["impersonate"],
                                  headers=headers, proxies=proxies, timeout=20,
                                  allow_redirects=True, verify=False)
                self._analyze_response(r)
                html = r.text
                return html
            except Exception as e:
                self.log(f"curl_cffi probe failed: {type(e).__name__}")

        # Fallback to regular requests
        if self.requests:
            try:
                proxy = self.get_proxy() if self.get_proxy else None
                proxies = {"http": proxy, "https": proxy} if proxy else None
                headers = self._get_headers(profile) if profile else {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"
                }
                r = self.requests.get(url, headers=headers, proxies=proxies,
                                      timeout=20, allow_redirects=True, verify=False)
                self._analyze_response(r)
                html = r.text
                return html
            except Exception as e:
                self.log(f"requests probe failed: {type(e).__name__}")
                self.results["protections_detected"].append("unknown_waf")
                self.results["primary_protection"] = "unknown"
                self.results["protection_level"] = "high"

        return html

    def _analyze_response(self, response):
        """Layer 1+2: Analyze HTTP response headers and cookies."""
        status = response.status_code
        self.results["response_status"] = status
        self.results["response_size"] = len(response.text) if hasattr(response, 'text') else 0

        # Normalize headers
        headers = {}
        for k, v in dict(response.headers).items():
            headers[k.lower()] = v.lower() if isinstance(v, str) else str(v).lower()
        self.results["raw_headers"] = headers

        # Normalize cookies
        cookies = {}
        try:
            for k, v in dict(response.cookies).items():
                cookies[k] = v
        except:
            pass
        set_cookie = headers.get("set-cookie", "")
        if set_cookie:
            cookie_names = re.findall(r'([a-zA-Z0-9_.-]+)=', set_cookie)
            for cn in cookie_names:
                if cn not in cookies:
                    cookies[cn] = ""
        self.results["raw_cookies"] = cookies

        self.log(f"Response: status={status}, size={self.results['response_size']}, "
                 f"headers={len(headers)}, cookies={len(cookies)}")

        # === LAYER 1: Header Analysis ===
        for prot_id, sig in PROTECTION_SIGNATURES.items():
            score = 0

            # Check must_have_any headers
            for header_name, header_value in sig["headers"].get("must_have_any", []):
                if header_value is None:
                    if header_name.endswith("-"):
                        if any(h.startswith(header_name) for h in headers):
                            score += 3
                            self.log(f"[HEADER] {sig['name']}: prefix match \"{header_name}*\"")
                    elif header_name in headers:
                        score += 3
                        self.log(f"[HEADER] {sig['name']}: header \"{header_name}\" present")
                else:
                    if header_name in headers and header_value in headers[header_name]:
                        score += 3
                        self.log(f"[HEADER] {sig['name']}: \"{header_name}\" = \"{header_value}\"")

            # Check strong signals
            for header_name, header_value in sig["headers"].get("strong_signals", []):
                if header_value is None:
                    if header_name in headers:
                        score += 1
                else:
                    if header_name in headers and header_value in headers[header_name]:
                        score += 1

            # Check prefix headers
            for prefix in sig["headers"].get("prefix_headers", []):
                if any(h.startswith(prefix) for h in headers):
                    score += 3
                    self.log(f"[HEADER] {sig['name']}: prefix header \"{prefix}*\" found")

            # Check header regex patterns
            for regex_str in sig["headers"].get("header_regex", []):
                regex = re.compile(regex_str)
                for hk in headers:
                    if regex.match(hk):
                        score += 5
                        self.log(f"[HEADER] {sig['name']}: regex match on \"{hk}\"")
                        break

            if score >= 3:
                if prot_id not in self.results["protections_detected"]:
                    self.results["protections_detected"].append(prot_id)

        # === LAYER 2: Cookie Analysis ===
        for prot_id, sig in PROTECTION_SIGNATURES.items():
            cookie_patterns = sig["cookies"].get("patterns", [])
            regex_patterns = sig["cookies"].get("regex_patterns", [])
            found = False

            for cookie_name in cookies:
                for pattern in cookie_patterns:
                    if pattern.lower() in cookie_name.lower():
                        found = True
                        self.log(f"[COOKIE] {sig['name']}: \"{cookie_name}\" matches \"{pattern}\"")
                        break
                for regex_str in regex_patterns:
                    if re.match(regex_str, cookie_name):
                        found = True
                        self.log(f"[COOKIE] {sig['name']}: \"{cookie_name}\" matches regex")
                        break
                if found:
                    break

            if found and prot_id not in self.results["protections_detected"]:
                self.results["protections_detected"].append(prot_id)

        # Status code analysis
        if status == 403:
            self.log(f"[STATUS] 403 Forbidden - site is actively blocking")
            if not self.results["protections_detected"]:
                self.results["protections_detected"].append("unknown_waf")
        elif status == 503:
            self.log(f"[STATUS] 503 Service Unavailable - challenge page likely")
        elif status == 429:
            self.log(f"[STATUS] 429 Rate Limited")
            self.results["rate_limiting"] = True

    def _analyze_html(self, html, url):
        """Layer 3: Analyze HTML content for protection signals."""
        if not html:
            return

        html_lower = html.lower()

        # Check each protection's HTML signals
        for prot_id, sig in PROTECTION_SIGNATURES.items():
            for signal in sig.get("html_signals", []):
                if signal.lower() in html_lower:
                    if prot_id not in self.results["protections_detected"]:
                        self.results["protections_detected"].append(prot_id)
                        self.log(f"[HTML] Detected: {sig['name']} (signal: {signal})")
                    break

        # Check challenge indicators for each detected protection
        challenge_priority = {"none": 0, "js_challenge": 1, "sensor_challenge": 2,
                              "managed_challenge": 3, "captcha": 4,
                              "interactive_captcha": 4, "rate_limited": 4, "blocked": 5}

        for prot_id in self.results["protections_detected"]:
            sig = PROTECTION_SIGNATURES.get(prot_id, {})
            challenges = sig.get("challenge_indicators", {})

            for challenge_type, indicators in challenges.items():
                for indicator in indicators:
                    if indicator.lower() in html_lower:
                        current = self.results["challenge_type"]
                        new_p = challenge_priority.get(challenge_type, 0)
                        old_p = challenge_priority.get(current, 0)
                        if new_p > old_p:
                            self.results["challenge_type"] = challenge_type
                            self.log(f"[CHALLENGE] {sig.get('name', prot_id)}: {challenge_type} "
                                     f"(\"{indicator}\")")
                        break

        # Check if it's a SPA
        if '<div id="root"' in html or '<div id="app"' in html or \
           '<div id="__next"' in html or '<div id="__nuxt"' in html:
            self.results["is_spa"] = True
            self.log("[SPA] Single Page Application detected")

    def _detect_captcha_all(self, html):
        """Layer 4: Detect all CAPTCHA types (10 types) with site key extraction."""
        if not html:
            return

        html_lower = html.lower()
        all_captchas = []

        for captcha_id, sig in CAPTCHA_SIGNATURES.items():
            # Check exclusions
            if "exclude" in sig:
                excluded = False
                for ex in sig["exclude"]:
                    if ex.lower() in html_lower:
                        excluded = True
                        break
                if excluded:
                    continue

            found = False
            for signal in sig["html_signals"]:
                if signal.lower() in html_lower:
                    found = True
                    break

            if found:
                site_key = None
                if sig.get("site_key_pattern"):
                    m = re.search(sig["site_key_pattern"], html)
                    if m:
                        site_key = m.group(1)

                captcha_entry = {
                    "type": captcha_id,
                    "name": sig["name"],
                    "site_key": site_key,
                }
                all_captchas.append(captcha_entry)
                self.log(f"[CAPTCHA] {sig['name']} detected (key: {site_key or 'unknown'})")

        if all_captchas:
            self.results["captcha_info"] = {
                "type": all_captchas[0]["type"],
                "site_key": all_captchas[0]["site_key"],
            }
            self.results["all_captchas"] = all_captchas
        else:
            self.log("[CAPTCHA] No CAPTCHA detected")

    def _deep_scan_javascript(self, html, base):
        """Layer 5: Deep scan JavaScript bundles for hidden protections and sockets."""
        if not html:
            return

        js_urls = re.findall(r'src=["\']([^"\']*\.js[^"\']*?)["\']', html)
        if not js_urls:
            return

        self.log(f"[JS-DEEP] Scanning {len(js_urls)} JavaScript bundles...")
        profile = random.choice(self.profiles) if self.profiles else None
        skip_domains = ['googleapis.com', 'gstatic.com', 'cdnjs.com', 'unpkg.com',
                        'jsdelivr.net', 'bootstrapcdn.com', 'jquery.com']

        js_scanned = 0
        for js_path in js_urls[:20]:
            try:
                js_url = js_path
                if js_path.startswith('//'):
                    js_url = 'https:' + js_path
                elif js_path.startswith('/'):
                    js_url = base + js_path
                elif not js_path.startswith('http'):
                    js_url = base + '/' + js_path

                if any(d in js_url for d in skip_domains):
                    continue

                r = None
                if self.cffi and profile:
                    proxy = self.get_proxy() if self.get_proxy else None
                    proxies = {"http": proxy, "https": proxy} if proxy else None
                    r = self.cffi.get(js_url, impersonate=profile["impersonate"],
                                      proxies=proxies, timeout=15, verify=False)
                elif self.requests:
                    r = self.requests.get(js_url, timeout=15, verify=False,
                                          headers={"User-Agent": profile["ua"]} if profile else {})

                if r and r.status_code == 200 and len(r.text) > 500:
                    js_content = r.text
                    js_lower = js_content.lower()
                    js_scanned += 1

                    # Check protection JS signals
                    for prot_id, sig in PROTECTION_SIGNATURES.items():
                        if prot_id in self.results["protections_detected"]:
                            continue
                        for signal in sig.get("js_signals", []):
                            if signal.lower() in js_lower:
                                self.results["protections_detected"].append(prot_id)
                                self.log(f"[JS-DEEP] {sig['name']}: \"{signal}\" found in JS")
                                break

                    # Check CAPTCHA JS signals
                    for captcha_id, sig in CAPTCHA_SIGNATURES.items():
                        for signal in sig.get("js_signals", []):
                            if signal.lower() in js_lower:
                                self.log(f"[JS-CAPTCHA] {sig['name']}: \"{signal}\" found in JS")
                                break

                    # NexaFlow detection
                    if 'nf-api-key' in js_content or 'data-flow-apis' in js_content:
                        nf_match = re.search(r'["\'](https?://[^"\']*data-flow-apis[^"\']*)["\'"]', js_content)
                        nf_url = nf_match.group(1) if nf_match else 'https://data-flow-apis.cc'
                        nf_url = urlparse(nf_url).scheme + "://" + urlparse(nf_url).netloc
                        self.results["has_socketio"] = True
                        self.results["socket_url"] = nf_url
                        self.log(f"[JS-DEEP] NexaFlow detected! Socket: {nf_url}")
                        break

                    # Look for Socket.IO
                    if not self.results["has_socketio"]:
                        if 'socket.io' in js_lower or 'io(' in js_content:
                            socket_result = self._extract_socket_url(js_content)
                            if socket_result:
                                sock_url, sock_token = socket_result
                                if sock_token:
                                    self.results["socket_token"] = sock_token
                                self.results["socket_url"] = sock_url
                                self.log(f"[JS-DEEP] Socket.IO URL found in JS: {sock_url}")

                        # Backend URLs
                        backend_urls = re.findall(
                            r'https?://[\w.-]+\.(?:onrender\.com|railway\.app|herokuapp\.com|fly\.dev|up\.railway\.app)',
                            js_content
                        )
                        for bu in backend_urls:
                            if self._verify_socketio(bu):
                                self.results["has_socketio"] = True
                                self.results["socket_url"] = bu
                                self.log(f"[JS-DEEP] Socket.IO backend found: {bu}")
                                break

            except Exception:
                continue

        self.log(f"[JS-DEEP] Scanned {js_scanned} JS files")

    def _multi_request_probe(self, url):
        """Layer 6: Send multiple requests to detect rate limiting and progressive blocking."""
        if not self.requests:
            return

        self.log("[PROBE] Starting multi-request probe (3 requests)...")
        results = []
        uas = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
        ]

        for i in range(3):
            try:
                proxy = self.get_proxy() if self.get_proxy else None
                proxies = {"http": proxy, "https": proxy} if proxy else None
                r = self.requests.get(url, headers={"User-Agent": uas[i]},
                                      proxies=proxies, timeout=10, verify=False,
                                      allow_redirects=True)
                results.append(r.status_code)
            except:
                results.append(0)
            time.sleep(0.5)

        self.results["response_pattern"] = results
        unique = set(results)

        if 429 in results:
            self.results["rate_limiting"] = True
            self.log(f"[PROBE] Rate limiting active (429)")

        if results[0] == 200 and results[-1] != 200:
            self.results["progressive_blocking"] = True
            self.log(f"[PROBE] Progressive blocking: {' -> '.join(map(str, results))}")

        if len(unique) > 1 and 0 not in results:
            self.log(f"[PROBE] Inconsistent responses: {', '.join(map(str, results))}")

        self.log(f"[PROBE] Response pattern: {' -> '.join(map(str, results))}")

    def _verify_content(self, html):
        """Layer 7: Verify if we reached real content or a challenge page."""
        if not html:
            self.results["real_content_reached"] = False
            return

        html_lower = html.lower()

        # Challenge page check
        is_challenge = False
        for indicator in CHALLENGE_INDICATORS:
            if indicator in html_lower:
                is_challenge = True
                self.log(f"[VERIFY] Challenge page detected: '{indicator}'")
                break

        # Real content signals
        real_content_signals = 0
        if '<title>' in html_lower and '</title>' in html_lower:
            title = re.search(r'<title>([^<]+)</title>', html, re.IGNORECASE)
            if title:
                title_text = title.group(1).strip().lower()
                challenge_titles = ["just a moment", "attention required", "access denied",
                                    "cloudflare", "please wait", "ddos", "security check",
                                    "blocked", "error", "forbidden", "403", "503", "captcha"]
                if not any(ct in title_text for ct in challenge_titles):
                    real_content_signals += 2
                    self.log(f"[VERIFY] Real title: '{title.group(1).strip()[:50]}'")
                else:
                    is_challenge = True

        if '<nav' in html_lower or '<header' in html_lower:
            real_content_signals += 1
        if '<footer' in html_lower:
            real_content_signals += 1
        if '<main' in html_lower or '<article' in html_lower:
            real_content_signals += 1
        if html_lower.count('<a ') > 5:
            real_content_signals += 1
        if html_lower.count('<img') > 2:
            real_content_signals += 1
        if len(html) > 10000:
            real_content_signals += 1
        if '<form' in html_lower:
            real_content_signals += 1
        if 'stylesheet' in html_lower or '<style' in html_lower:
            real_content_signals += 1

        if is_challenge:
            self.results["real_content_reached"] = False
            self.log(f"[VERIFY] RESULT: Challenge page - real content NOT reached")
        elif real_content_signals >= 3:
            self.results["real_content_reached"] = True
            self.log(f"[VERIFY] RESULT: Real content reached (signals={real_content_signals})")
        elif self.results["response_status"] == 200 and real_content_signals >= 1:
            self.results["real_content_reached"] = True
            self.log(f"[VERIFY] RESULT: Likely real content (status=200, signals={real_content_signals})")
        elif self.results["is_spa"] and self.results["response_status"] == 200:
            self.results["real_content_reached"] = True
            self.log(f"[VERIFY] RESULT: SPA shell reached")
        else:
            self.results["real_content_reached"] = False
            self.log(f"[VERIFY] RESULT: Uncertain (signals={real_content_signals})")

        # Generate content fingerprint
        if self.results["real_content_reached"]:
            title_match = re.search(r'<title>([^<]+)</title>', html, re.IGNORECASE)
            title = title_match.group(1).strip() if title_match else ""
            links = set(re.findall(r'href=["\']([^"\']+)["\']', html))
            self.results["content_fingerprint"] = {
                "title": title,
                "size": len(html),
                "link_count": len(links),
                "has_nav": '<nav' in html_lower,
                "has_footer": '<footer' in html_lower,
            }

    def _calculate_protection_level(self):
        """Calculate overall protection level based on all detection results."""
        detected = self.results["protections_detected"]
        challenge = self.results["challenge_type"]

        if not detected or detected == ["vercel"]:
            self.results["primary_protection"] = "none"
            self.results["protection_level"] = "none"
            self.results["detection_confidence"] = 95
            return

        # Determine primary protection by tier
        tier_order = ["extreme", "high", "medium", "low"]
        primary = detected[0]
        highest_tier = "low"

        for prot_id in detected:
            sig = PROTECTION_SIGNATURES.get(prot_id, {})
            tier = sig.get("tier", "low")
            tier_idx = tier_order.index(tier) if tier in tier_order else 3
            current_idx = tier_order.index(highest_tier) if highest_tier in tier_order else 3
            if tier_idx < current_idx:
                highest_tier = tier
                primary = prot_id

        self.results["primary_protection"] = primary

        # Base level from tier
        level = highest_tier if highest_tier == "extreme" else highest_tier

        # Escalate based on challenge
        if challenge == "blocked":
            level = "extreme"
        elif challenge in ["captcha", "managed_challenge", "interactive_captcha"]:
            if level in ["low", "medium"]:
                level = "high"
            elif level == "high":
                level = "extreme"
        elif challenge in ["js_challenge", "sensor_challenge"]:
            if level == "low":
                level = "medium"
        elif challenge == "rate_limited":
            if level == "low":
                level = "medium"

        # Escalate if content not reached
        if not self.results["real_content_reached"] and self.results["response_status"] in [403, 503]:
            if level in ["low", "medium"]:
                level = "high"

        # Escalate for rate limiting / progressive blocking
        if self.results["rate_limiting"]:
            if level == "low":
                level = "medium"
        if self.results["progressive_blocking"]:
            if level in ["low", "medium"]:
                level = "high"

        # Multiple protections = harder
        if len(detected) >= 3 and level in ["low", "medium"]:
            level = "high"
        if len(detected) >= 4 and level == "high":
            level = "extreme"

        self.results["protection_level"] = level

        # Confidence score
        confidence = min(
            30 + len(detected) * 12 +
            (20 if challenge != "none" else 0) +
            (10 if self.results["rate_limiting"] or self.results["progressive_blocking"] else 0),
            99
        )
        self.results["detection_confidence"] = confidence

    def _recommend_strategy(self, url, base):
        """Choose the best attack strategy based on detection results."""
        protection = self.results["primary_protection"]
        level = self.results["protection_level"]
        challenge = self.results["challenge_type"]
        has_socket = self.results["has_socketio"]
        detected = self.results["protections_detected"]

        prot_name = PROTECTION_SIGNATURES.get(protection, {}).get("name", protection)
        all_prot_names = " + ".join([
            PROTECTION_SIGNATURES.get(p, {}).get("name", p)
            for p in detected if p != "unknown_waf"
        ])

        if has_socket and self.results["socket_url"]:
            self.results["recommended_mode"] = "socketio"
            self.results["recommended_strategy"] = (
                f"Socket.IO mode - connect directly to {self.results['socket_url']}. "
                f"WebSocket bypasses WAF completely. Best mode for maximum impact."
            )
            self.results["expected_success_rate"] = "90-99%"
            return

        if protection == "none" or level == "none":
            self.results["recommended_mode"] = "http"
            self.results["recommended_strategy"] = (
                "Direct HTTP mode - no protection detected. "
                "Use curl_cffi with TLS spoofing + Saudi proxy for maximum throughput."
            )
            self.results["expected_success_rate"] = "95-100%"
            return

        if level == "extreme":
            self.results["recommended_mode"] = "cloudflare"
            self.results["recommended_strategy"] = (
                f"EXTREME protection ({all_prot_names}). Challenge: {challenge}. "
                f"Headless browser (Playwright) + CAPTCHA solver required. "
                f"curl_cffi alone will NOT work. Consider Socket.IO bypass if available."
            )
            self.results["expected_success_rate"] = "5-20%"
        elif level == "high":
            captcha_note = ""
            if self.results["captcha_info"]["type"]:
                captcha_note = f" CAPTCHA: {self.results['captcha_info']['type']} (solver needed)."
            self.results["recommended_mode"] = "cloudflare"
            self.results["recommended_strategy"] = (
                f"HIGH protection ({all_prot_names}). Challenge: {challenge}. "
                f"curl_cffi TLS spoof + FlareSolverr + per-proxy cookies.{captcha_note}"
            )
            self.results["expected_success_rate"] = "20-50%"
        elif level == "medium":
            self.results["recommended_mode"] = "cloudflare"
            self.results["recommended_strategy"] = (
                f"MEDIUM protection ({all_prot_names}). Challenge: {challenge}. "
                f"curl_cffi TLS spoof should bypass most challenges. FlareSolverr as fallback."
            )
            self.results["expected_success_rate"] = "50-80%"
        elif level == "low":
            self.results["recommended_mode"] = "http"
            self.results["recommended_strategy"] = (
                f"LOW protection ({all_prot_names}). "
                f"curl_cffi with real browser TLS fingerprint + Saudi proxy. "
                f"Should work without special bypass."
            )
            self.results["expected_success_rate"] = "80-95%"

    def _discover_socketio(self, url, base, html_content):
        """Comprehensive Socket.IO discovery."""
        parsed = urlparse(url)

        # 1. Check same-origin
        if self._verify_socketio(base):
            self.results["has_socketio"] = True
            self.results["socket_url"] = base
            self.log(f"[SOCKET] Found at same origin: {base}")
            return

        # 2. Check HTML for socket URLs
        if html_content:
            socket_result = self._extract_socket_url(html_content)
            if socket_result:
                sock_url, sock_token = socket_result
                if sock_token:
                    self.results["socket_token"] = sock_token
                if self._verify_socketio(sock_url):
                    self.results["has_socketio"] = True
                    self.results["socket_url"] = sock_url
                    self.log(f"[SOCKET] Verified from HTML: {sock_url}")
                    return
                else:
                    self.results["socket_url"] = sock_url
                    self.log(f"[SOCKET] Candidate from HTML (unverified): {sock_url}")

        # 3. Try common backend patterns
        domain_name = parsed.netloc.replace('www.', '').split('.')[0]
        prefixes = [f"{domain_name}-server", f"{domain_name}-api", f"{domain_name}-backend",
                    f"{domain_name}", f"api-{domain_name}", f"server-{domain_name}"]
        hosts = [".onrender.com", ".railway.app", ".herokuapp.com", ".fly.dev"]

        candidates = []
        if html_content:
            backend_urls = re.findall(
                r'https?://[\w.-]+\.(?:onrender\.com|railway\.app|herokuapp\.com|fly\.dev|up\.railway\.app|vercel\.app|netlify\.app)',
                html_content
            )
            candidates.extend(backend_urls)

        for prefix in prefixes:
            for host in hosts:
                candidates.append(f"https://{prefix}{host}")

        for candidate in candidates:
            if self._verify_socketio(candidate):
                self.results["has_socketio"] = True
                self.results["socket_url"] = candidate.rstrip('/')
                self.log(f"[SOCKET] Backend discovered: {candidate}")
                return

    def _verify_socketio(self, url):
        """Verify if a URL has a real Socket.IO endpoint."""
        if not url or not self.requests:
            return False
        try:
            sio_url = f"{url.rstrip('/')}/socket.io/?EIO=4&transport=polling"
            if self.cffi:
                profile = random.choice(self.profiles) if self.profiles else None
                if profile:
                    r = self.cffi.get(sio_url, impersonate=profile["impersonate"],
                                      timeout=10, verify=False)
                    if r.status_code == 200 and '"sid"' in r.text and '<html' not in r.text.lower()[:200]:
                        return True

            proxy = self.get_proxy() if self.get_proxy else None
            if proxy:
                proxies = {"http": proxy, "https": proxy}
                if self.cffi and profile:
                    r2 = self.cffi.get(sio_url, impersonate=profile["impersonate"],
                                       proxies=proxies, timeout=10, verify=False)
                else:
                    r2 = self.requests.get(sio_url, proxies=proxies, timeout=10, verify=False)
                if r2.status_code == 200 and '"sid"' in r2.text and '<html' not in r2.text.lower()[:200]:
                    return True

            r3 = self.requests.get(sio_url, timeout=10, verify=False)
            if r3.status_code == 200 and '"sid"' in r3.text and '<html' not in r3.text.lower()[:200]:
                return True
        except:
            pass
        return False

    def _extract_socket_url(self, content):
        """Extract Socket.IO server URL and optional auth token."""
        if not content:
            return None

        token_pattern = r'"(https?://[\w.-]+\.[a-z]{2,}[^"]*)",\w+="([\w]{20,})"'
        token_matches = re.findall(token_pattern, content)
        skip_domains = ['google', 'facebook', 'twitter', 'apple.com', 'play.google', 'flagcdn',
                        'fonts.', 'github', 'wikipedia', 'w3.org', 'apache.org', 'reactjs',
                        'mui.com', 'radix-ui', 'mediawiki', 'cdn']
        for url_m, tok_m in token_matches:
            if url_m.startswith("http") and "socket.io" not in url_m:
                if not any(s in url_m.lower() for s in skip_domains):
                    return (url_m, tok_m)

        patterns = [
            r'(?:const|let|var)\s+\w*(?:SOCKET|socket|server|api|SERVER|API)\w*\s*=\s*[\'"]([^\'"]+)[\'"]',
            r'io\([\'"]([^\'"]+)[\'"]',
            r'connect\([\'"]([^\'"]+)[\'"]',
            r'socketUrl\s*[:=]\s*[\'"]([^\'"]+)[\'"]',
            r'SOCKET_URL\s*[:=]\s*[\'"]([^\'"]+)[\'"]',
            r'serverUrl\s*[:=]\s*[\'"]([^\'"]+)[\'"]',
            r'NEXT_PUBLIC_\w*(?:SOCKET|API|SERVER)\w*\s*[:=]\s*[\'"]([^\'"]+)[\'"]',
            r'REACT_APP_\w*(?:SOCKET|API|SERVER)\w*\s*[:=]\s*[\'"]([^\'"]+)[\'"]',
            r'VITE_\w*(?:SOCKET|API|SERVER)\w*\s*[:=]\s*[\'"]([^\'"]+)[\'"]',
        ]
        for pattern in patterns:
            matches = re.findall(pattern, content)
            for m in matches:
                if m.startswith("http") and "socket.io" not in m:
                    if not any(s in m.lower() for s in skip_domains):
                        return (m, None)
        return None

    def _discover_pages(self, url, base, html_content=""):
        """Discover pages from the website."""
        pages = ["/"]
        try:
            proxy = self.get_proxy() if self.get_proxy else None
            proxies = {"http": proxy, "https": proxy} if proxy else None
            ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"

            for path in ["/sitemap.xml", "/sitemap_index.xml"]:
                try:
                    r = self.requests.get(base + path, proxies=proxies, timeout=10,
                                          headers={"User-Agent": ua}, verify=False)
                    if r.status_code == 200 and "<loc>" in r.text:
                        locs = re.findall(r"<loc>([^<]+)</loc>", r.text)
                        for loc in locs[:20]:
                            p = urlparse(loc).path or "/"
                            if p not in pages:
                                pages.append(p)
                except:
                    pass

            try:
                r = self.requests.get(base + "/robots.txt", proxies=proxies, timeout=10,
                                      headers={"User-Agent": ua}, verify=False)
                if r.status_code == 200:
                    for line in r.text.split("\n"):
                        if "allow:" in line.lower():
                            p = line.split(":", 1)[1].strip()
                            if p and p != "/" and not p.startswith("*") and p not in pages:
                                pages.append(p)
            except:
                pass

            if html_content:
                hrefs = re.findall(r'href=["\']([^"\']+)["\']', html_content)
                for href in hrefs:
                    if href.startswith("/") and not href.startswith("//"):
                        if href not in pages and len(pages) < 30:
                            pages.append(href)
                    elif href.startswith(base):
                        p = urlparse(href).path or "/"
                        if p not in pages and len(pages) < 30:
                            pages.append(p)
        except:
            pass

        if len(pages) < 3:
            pages.extend(["/about", "/contact", "/services", "/faq"])

        return list(set(pages))[:20]

    def _detect_analytics(self, html_content):
        """Detect analytics platform."""
        analytics = {"type": None, "id": None, "endpoint": None, "hostname": None}
        if not html_content:
            return analytics

        # Umami
        umami_src = re.search(r'src=["\']([^"\']*umami[^"\']*)["\']', html_content)
        umami_id = re.search(r'data-website-id=["\']([^"\']+)["\']', html_content)
        if umami_src and umami_id:
            ep = umami_src.group(1)
            ep_parsed = urlparse(ep if ep.startswith('http') else 'https://' + ep.lstrip('/'))
            analytics["type"] = "umami"
            analytics["id"] = umami_id.group(1)
            analytics["endpoint"] = f"{ep_parsed.scheme}://{ep_parsed.netloc}/api/send"
            return analytics

        # GA4
        ga4 = re.search(r'["\']G-([A-Z0-9]+)["\']', html_content)
        if ga4:
            analytics["type"] = "ga4"
            analytics["id"] = "G-" + ga4.group(1)
            analytics["endpoint"] = "https://www.google-analytics.com/g/collect"
            return analytics

        # GTM
        gtm = re.search(r'googletagmanager\.com/gtag/js\?id=(G[TM]+-[A-Z0-9]+)', html_content)
        if gtm:
            tid = gtm.group(1)
            analytics["type"] = "ga4" if tid.startswith("G-") else "gtm"
            analytics["id"] = tid
            analytics["endpoint"] = "https://www.google-analytics.com/g/collect"
            return analytics

        # UA
        ua = re.search(r'["\']UA-([0-9]+-[0-9]+)["\']', html_content)
        if ua:
            analytics["type"] = "ua"
            analytics["id"] = "UA-" + ua.group(1)
            analytics["endpoint"] = "https://www.google-analytics.com/collect"
            return analytics

        return analytics

    def _get_headers(self, profile):
        """Generate realistic browser headers."""
        if not profile:
            return {}
        headers = {
            "User-Agent": profile["ua"],
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Cache-Control": "max-age=0",
            "sec-ch-ua-platform": f'"{profile["os"]}"',
        }
        if "Chrome" in profile.get("browser", "") or "Edge" in profile.get("browser", ""):
            headers["sec-ch-ua"] = '"Chromium";v="131", "Not_A Brand";v="24"'
            headers["sec-ch-ua-mobile"] = "?1" if profile.get("device") == "Mobile" else "?0"
        return headers

    def _print_summary(self):
        """Print detection summary."""
        r = self.results
        protections = ", ".join([PROTECTION_SIGNATURES.get(p, {}).get("name", p)
                                 for p in r["protections_detected"]]) or "None"

        print(f"\n{'='*60}", flush=True)
        print(f"  ULTIMATE DETECTION v3.0 RESULTS", flush=True)
        print(f"{'='*60}", flush=True)
        print(f"  Protections ({len(r['protections_detected'])}): {protections}", flush=True)
        print(f"  Primary Protection: {PROTECTION_SIGNATURES.get(r['primary_protection'], {}).get('name', r['primary_protection'])}", flush=True)
        print(f"  Protection Level  : {r['protection_level'].upper()}", flush=True)
        print(f"  Challenge Type    : {r['challenge_type']}", flush=True)
        print(f"  CAPTCHA           : {r['captcha_info']['type'] or 'None'}", flush=True)
        print(f"  All CAPTCHAs      : {len(r['all_captchas'])}", flush=True)
        print(f"  Real Content      : {'YES' if r['real_content_reached'] else 'NO'}", flush=True)
        print(f"  Rate Limiting     : {'YES' if r['rate_limiting'] else 'No'}", flush=True)
        print(f"  Progressive Block : {'YES' if r['progressive_blocking'] else 'No'}", flush=True)
        print(f"  Response Pattern  : {' -> '.join(map(str, r['response_pattern']))}", flush=True)
        print(f"  Socket.IO         : {r['socket_url'] or 'Not found'}", flush=True)
        print(f"  Analytics         : {r['analytics']['type'] or 'None'}", flush=True)
        print(f"  SPA               : {'Yes' if r['is_spa'] else 'No'}", flush=True)
        print(f"  Confidence        : {r['detection_confidence']}%", flush=True)
        print(f"  Recommended Mode  : {r['recommended_mode'].upper()}", flush=True)
        print(f"  Success Rate      : {r['expected_success_rate']}", flush=True)
        print(f"  Strategy          : {r['recommended_strategy']}", flush=True)
        print(f"{'='*60}\n", flush=True)

    def get_site_info(self, url):
        """
        Convert detection results to site_info format compatible with existing visit.py.
        This is the bridge between the new detection engine and the existing attack code.
        """
        r = self.results
        parsed = urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"

        site_info = {
            "mode": r["recommended_mode"],
            "socket_url": r["socket_url"],
            "socket_token": r.get("socket_token"),
            "pages": r["pages"],
            "has_cloudflare": r["primary_protection"] == "cloudflare",
            "has_socketio": r["has_socketio"],
            "has_captcha": r["captcha_info"]["type"] is not None,
            "captcha_type": r["captcha_info"]["type"],
            "captcha_key": r["captcha_info"]["site_key"],
            "protection": r["primary_protection"],
            "protection_level": r["protection_level"],
            "challenge_type": r["challenge_type"],
            "real_content_reached": r["real_content_reached"],
            "detection_confidence": r["detection_confidence"],
            "expected_success_rate": r["expected_success_rate"],
            "rate_limiting": r["rate_limiting"],
            "progressive_blocking": r["progressive_blocking"],
            "register_event": "visitor:register",
            "page_change_event": "visitor:pageEnter",
            "connected_event": "successfully-connected",
            "base_url": base,
            "target_url": url,
            "analytics": r["analytics"],
        }

        return site_info


# ╔══════════════════════════════════════════════════════════════════╗
# ║   CONTENT VERIFICATION FOR VISITORS (used by visit.py)           ║
# ╚══════════════════════════════════════════════════════════════════╝

def verify_visit_success(response_text, content_fingerprint=None):
    """
    Verify if a visitor's request actually reached the real site content.
    Returns: (bool success, str reason)

    This replaces the old is_cf_blocked() with a much more accurate check.
    """
    if not response_text:
        return False, "empty_response"

    text_lower = response_text.lower()

    # === DEFINITE BLOCKS (25+ indicators) ===
    block_indicators = [
        ("just a moment", "cf_js_challenge"),
        ("checking your browser", "cf_js_challenge"),
        ("cf-browser-verification", "cf_verification"),
        ("cf-challenge-running", "cf_challenge"),
        ("verifying you are human", "cf_turnstile"),
        ("enable javascript and cookies to continue", "js_required"),
        ("access denied", "access_denied"),
        ("you have been blocked", "blocked"),
        ("error 1020", "cf_blocked"),
        ("sorry, you have been blocked", "cf_blocked"),
        ("attention required", "cf_attention"),
        ("please complete the security check", "security_check"),
        ("pardon our interruption", "bot_detected"),
        ("please wait while we verify", "verification"),
        ("one more step", "challenge_step"),
        ("ddos protection by", "ddos_protection"),
        ("press & hold", "px_challenge"),
        ("geo.captcha-delivery.com", "datadome_captcha"),
        ("request blocked", "waf_blocked"),
        ("the requested url was rejected", "f5_blocked"),
        ("reference #", "akamai_blocked"),
        ("request unsuccessful", "imperva_blocked"),
        ("incapsula incident", "imperva_incident"),
        ("sucuri website firewall", "sucuri_blocked"),
        ("the request could not be satisfied", "aws_blocked"),
        ("bot detected", "bot_detected"),
        ("automated access", "automated_blocked"),
        ("suspicious activity", "suspicious_blocked"),
        ("unusual traffic", "unusual_traffic"),
        ("are you a robot", "robot_check"),
        ("prove you are human", "human_check"),
        ("browser verification required", "browser_verify"),
        ("security verification", "security_verify"),
        ("checking if the site connection is secure", "cf_checking"),
        ("this process is automatic", "auto_challenge"),
    ]

    for indicator, reason in block_indicators:
        if indicator in text_lower:
            return False, reason

    # === DEFINITE SUCCESS ===
    success_signals = 0

    # Has a real title
    title_match = re.search(r'<title>([^<]+)</title>', response_text, re.IGNORECASE)
    if title_match:
        title = title_match.group(1).strip().lower()
        challenge_titles = ["just a moment", "attention required", "access denied",
                            "cloudflare", "please wait", "ddos", "security check",
                            "blocked", "error", "403", "503", "forbidden", "captcha",
                            "verification"]
        if not any(ct in title for ct in challenge_titles):
            success_signals += 2

    # Has navigation/structure
    if '<nav' in text_lower or '<header' in text_lower:
        success_signals += 1
    if '<footer' in text_lower:
        success_signals += 1
    if '<main' in text_lower or '<article' in text_lower:
        success_signals += 1
    if '<form' in text_lower:
        success_signals += 1

    # Has meaningful content size
    if len(response_text) > 5000:
        success_signals += 1

    # Content fingerprint verification
    if content_fingerprint:
        if title_match:
            current_title = title_match.group(1).strip()
            if content_fingerprint.get("title") and current_title == content_fingerprint["title"]:
                success_signals += 3

    # Challenge pages are typically small
    if len(response_text) < 3000 and ('challenge' in text_lower or 'cf-' in text_lower):
        return False, "small_challenge_page"

    if success_signals >= 3:
        return True, "verified_real_content"
    elif success_signals >= 1 and len(response_text) > 2000:
        return True, "likely_real_content"
    else:
        return False, f"uncertain_signals_{success_signals}"


# ╔══════════════════════════════════════════════════════════════════╗
# ║   STANDALONE USAGE                                               ║
# ╚══════════════════════════════════════════════════════════════════╝

if __name__ == "__main__":
    import sys
    import requests as req_module

    try:
        from curl_cffi import requests as cffi_module
        has_cffi = True
    except ImportError:
        cffi_module = None
        has_cffi = False

    if len(sys.argv) < 2:
        print("Usage: python3 detection_engine.py <URL>")
        sys.exit(1)

    url = sys.argv[1]

    profiles = [
        {"impersonate": "chrome131", "os": "Windows", "device": "Desktop", "browser": "Chrome",
         "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"},
    ]

    detector = ProtectionDetector(
        requests_module=req_module,
        cffi_module=cffi_module,
        browser_profiles=profiles,
        get_proxy_func=None,
    )

    results = detector.detect(url)
    print(json.dumps({k: v for k, v in results.items() if k != "detection_details"}, indent=2, default=str))
