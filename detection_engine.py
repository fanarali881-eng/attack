"""
ADVANCED PROTECTION DETECTION ENGINE v2.0
==========================================
Multi-layer detection system that accurately identifies:
  - 12+ WAF/Anti-bot protection types
  - Protection level (low/medium/high/extreme)
  - CAPTCHA type and site key
  - Socket.IO endpoints
  - Analytics platforms
  - Best attack strategy recommendation

Detection layers:
  Layer 1: HTTP Response Headers
  Layer 2: Cookie Analysis
  Layer 3: HTML Content Analysis
  Layer 4: JavaScript Resource Analysis
  Layer 5: Response Behavior Analysis
  Layer 6: Content Verification (real page vs challenge)
"""

import re
import time
import random
import json
import threading
from urllib.parse import urlparse

# ============ PROTECTION SIGNATURES DATABASE ============
# Each protection has multiple detection signals across different layers

PROTECTION_SIGNATURES = {
    "cloudflare": {
        "name": "Cloudflare",
        "headers": {
            "must_have_any": [
                ("server", "cloudflare"),
                ("cf-ray", None),           # Any value = match
                ("cf-cache-status", None),
                ("cf-mitigated", None),
                ("cf-request-id", None),
            ],
            "strong_signals": [
                ("nel", "cloudflare"),       # NEL header containing cloudflare
                ("report-to", "cloudflare"),
            ],
        },
        "cookies": {
            "patterns": ["__cf_bm", "cf_clearance", "__cflb", "__cfruid", "_cfuvid"],
        },
        "html_signals": [
            "challenges.cloudflare.com",
            "/cdn-cgi/",
            "cf-browser-verification",
            "cf-chl-widget",
            "cf-challenge-running",
            "cloudflare-static/",
        ],
        "challenge_indicators": {
            "js_challenge": ["Just a moment", "Checking your browser", "cf-spinner-please-wait"],
            "managed_challenge": ["challenges.cloudflare.com/turnstile", "cf-turnstile"],
            "interactive_captcha": ["cf-hcaptcha-container", "g-recaptcha", "cf-captcha-container"],
            "blocked": ["Sorry, you have been blocked", "Access denied", "Error 1020"],
        },
    },
    "akamai": {
        "name": "Akamai Bot Manager",
        "headers": {
            "must_have_any": [
                ("server", "akamaighost"),
                ("server", "akamai"),
                ("x-akamai-transformed", None),
                ("akamai-ghost", None),
                ("akamai-request-id", None),
                ("x-edgeconnect-midmile-rtt", None),
                ("x-akamai-staging", None),
                ("x-akamai-request-id", None),
            ],
            "strong_signals": [
                ("x-cache", "tcp_hit"),      # Akamai cache pattern
            ],
        },
        "cookies": {
            "patterns": ["_abck", "ak_bmsc", "bm_sz", "bm_sv", "bm_mi", "akamai_generated"],
        },
        "html_signals": [
            "akamai",
            "_abck",
            "ak_bmsc",
        ],
        "challenge_indicators": {
            "sensor_challenge": ["_abck", "sensor_data", "bmak"],
            "blocked": ["Access Denied", "Reference #"],
        },
    },
    "perimeterx": {
        "name": "PerimeterX / HUMAN",
        "headers": {
            "must_have_any": [
                ("x-px-", None),             # Any header starting with x-px-
            ],
            "strong_signals": [],
        },
        "cookies": {
            "patterns": ["_pxvid", "_px2", "_px3", "_pxff_", "_pxmvid", "_pxhd",
                         "pxcts", "_pxde", "_pxttld", "_px"],
        },
        "html_signals": [
            "perimeterx.net",
            "px-cdn.net",
            "px-cloud.net",
            "pxchk.net",
            "px-client.net",
            "px-captcha",
            "human.com/px",
        ],
        "challenge_indicators": {
            "captcha": ["px-captcha", "Press & Hold", "human verification"],
            "blocked": ["blocked by px", "Request blocked"],
        },
    },
    "datadome": {
        "name": "DataDome",
        "headers": {
            "must_have_any": [
                ("server", "datadome"),
                ("x-datadome-cid", None),
                ("x-datadome", None),
            ],
            "strong_signals": [],
        },
        "cookies": {
            "patterns": ["datadome"],
        },
        "html_signals": [
            "datadome.co",
            "api-js.datadome.co",
            "dd.datadome",
            "window.ddjskey",
            "DataDome",
        ],
        "challenge_indicators": {
            "captcha": ["geo.captcha-delivery.com", "interstitial.datadome"],
            "blocked": ["datadome"],
        },
    },
    "imperva": {
        "name": "Imperva / Incapsula",
        "headers": {
            "must_have_any": [
                ("x-cdn", "imperva"),
                ("x-cdn", "incapsula"),
                ("x-iinfo", None),
            ],
            "strong_signals": [],
        },
        "cookies": {
            "patterns": ["visid_incap_", "incap_ses_", "__utmvc", "reese84",
                         "nlbi_", "___utmvc"],
        },
        "html_signals": [
            "incapsula",
            "imperva",
            "_Incapsula_Resource",
            "reese84",
        ],
        "challenge_indicators": {
            "js_challenge": ["_Incapsula_Resource", "b.]]>"],
            "blocked": ["Request unsuccessful", "Incapsula incident"],
        },
    },
    "sucuri": {
        "name": "Sucuri / CloudProxy",
        "headers": {
            "must_have_any": [
                ("server", "sucuri"),
                ("server", "cloudproxy"),
                ("x-sucuri-id", None),
                ("x-sucuri-cache", None),
            ],
            "strong_signals": [],
        },
        "cookies": {
            "patterns": ["sucuri_cloudproxy_"],
        },
        "html_signals": [
            "sucuri.net",
            "cloudproxy",
            "sucuri_cloudproxy",
        ],
        "challenge_indicators": {
            "js_challenge": ["sucuri_cloudproxy_js"],
            "blocked": ["Access Denied - Sucuri", "Sucuri WebSite Firewall"],
        },
    },
    "aws_waf": {
        "name": "AWS WAF / CloudFront",
        "headers": {
            "must_have_any": [
                ("server", "cloudfront"),
                ("x-amz-cf-id", None),
                ("x-amz-cf-pop", None),
            ],
            "strong_signals": [
                ("x-amzn-requestid", None),
            ],
        },
        "cookies": {
            "patterns": ["aws-waf-token", "AWSALB", "AWSALBCORS"],
        },
        "html_signals": [
            "aws-waf",
            "awswaf",
        ],
        "challenge_indicators": {
            "captcha": ["aws_captcha", "awswaf"],
            "blocked": ["Request blocked", "ERROR: The request could not be satisfied"],
        },
    },
    "f5": {
        "name": "F5 / Shape Security",
        "headers": {
            "must_have_any": [
                ("x-powered-by", "f5"),
                ("server", "bigip"),
            ],
            "strong_signals": [],
        },
        "cookies": {
            "patterns": ["TS01", "TSPD_101", "TS_", "f5_cspm", "f5avraaaaaaa",
                         "MRHSession", "LastMRH_Session"],
            "regex_patterns": [r"^TS[0-9a-f]{8,}$"],
        },
        "html_signals": [
            "f5.com",
            "shape security",
        ],
        "challenge_indicators": {
            "blocked": ["The requested URL was rejected"],
        },
    },
    "kasada": {
        "name": "Kasada",
        "headers": {
            "must_have_any": [
                ("x-kpsdk-ct", None),
                ("x-kpsdk-cd", None),
                ("x-kpsdk-v", None),
            ],
            "strong_signals": [],
        },
        "cookies": {
            "patterns": ["x-kpsdk-ct", "x-kpsdk-cd", "x-kpsdk-v"],
        },
        "html_signals": [
            "ips.js",
            "_kpsdk",
            "kasada",
        ],
        "challenge_indicators": {
            "blocked": ["blocked", "kasada"],
        },
    },
    "vercel": {
        "name": "Vercel Firewall",
        "headers": {
            "must_have_any": [
                ("server", "vercel"),
                ("x-vercel-id", None),
                ("x-vercel-cache", None),
            ],
            "strong_signals": [],
        },
        "cookies": {
            "patterns": ["__vercel"],
        },
        "html_signals": [],
        "challenge_indicators": {},
    },
    "ddos_guard": {
        "name": "DDoS-Guard",
        "headers": {
            "must_have_any": [
                ("server", "ddos-guard"),
            ],
            "strong_signals": [],
        },
        "cookies": {
            "patterns": ["__ddg1_", "__ddg2_", "__ddgid_", "__ddgmark_"],
        },
        "html_signals": [
            "ddos-guard",
            "ddos-guard.net",
        ],
        "challenge_indicators": {
            "js_challenge": ["DDoS-Guard"],
        },
    },
    "stackpath": {
        "name": "StackPath / Highwinds",
        "headers": {
            "must_have_any": [
                ("server", "stackpath"),
                ("x-sp-", None),
            ],
            "strong_signals": [],
        },
        "cookies": {
            "patterns": ["sp_"],
        },
        "html_signals": [
            "stackpath",
        ],
        "challenge_indicators": {},
    },
}


# ============ DETECTION ENGINE ============

class ProtectionDetector:
    """Advanced multi-layer protection detection engine."""

    def __init__(self, requests_module=None, cffi_module=None, browser_profiles=None,
                 get_proxy_func=None):
        self.requests = requests_module
        self.cffi = cffi_module
        self.profiles = browser_profiles or []
        self.get_proxy = get_proxy_func
        self.results = {
            "protections_detected": [],     # List of detected protection names
            "primary_protection": "none",   # The main/strongest protection
            "protection_level": "none",     # none, low, medium, high, extreme
            "challenge_type": "none",       # none, js_challenge, managed_challenge, captcha, blocked
            "captcha_info": {"type": None, "site_key": None},
            "has_socketio": False,
            "socket_url": None,
            "socket_token": None,
            "analytics": {"type": None, "id": None, "endpoint": None, "hostname": None},
            "pages": [],
            "cdn_provider": None,
            "is_spa": False,
            "real_content_reached": False,  # KEY: Did we actually reach the real page?
            "content_fingerprint": None,    # Hash of real content for verification
            "detection_confidence": 0,      # 0-100 confidence score
            "detection_details": [],        # Human-readable detection log
            "recommended_mode": "http",     # socketio, cloudflare, http
            "recommended_strategy": "",     # Detailed strategy description
            "raw_headers": {},
            "raw_cookies": {},
            "response_status": 0,
            "response_size": 0,
        }

    def log(self, msg):
        """Add to detection log."""
        self.results["detection_details"].append(msg)
        print(f"  [DETECT] {msg}", flush=True)

    def detect(self, url, html_content="", response=None, manual_socket=None):
        """
        Run full multi-layer detection on a URL.
        Returns comprehensive detection results.
        """
        parsed = urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"

        self.log(f"Starting advanced scan: {url}")

        # If we have a response object, analyze it
        if response is not None:
            self._analyze_response(response)
        elif html_content:
            self._analyze_html(html_content, url)

        # If no response yet, make our own request
        if not html_content and response is None:
            html_content = self._probe_site(url)

        # Layer 1-2: Headers + Cookies (already done in _analyze_response)
        # Layer 3: HTML Content Analysis
        if html_content:
            self._analyze_html(html_content, url)

        # Layer 4: JavaScript Resource Analysis (for SPAs)
        if html_content and not self.results["has_socketio"]:
            self._analyze_js_bundles(html_content, base)

        # Layer 5: Response Behavior Analysis
        self._analyze_behavior(url, base)

        # Layer 6: Content Verification
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
                # Connection failure often means heavy protection
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
        # Also extract from Set-Cookie headers
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
            for header_name, header_value in sig["headers"]["must_have_any"]:
                if header_value is None:
                    # Just check if header exists (or starts with prefix)
                    if header_name.endswith("-"):
                        # Prefix match (e.g., "x-px-")
                        if any(h.startswith(header_name) for h in headers):
                            score += 3
                    elif header_name in headers:
                        score += 3
                else:
                    # Check if header contains value
                    if header_name in headers and header_value in headers[header_name]:
                        score += 3

            # Check strong signals
            for header_name, header_value in sig["headers"].get("strong_signals", []):
                if header_value is None:
                    if header_name in headers:
                        score += 1
                else:
                    if header_name in headers and header_value in headers[header_name]:
                        score += 1

            if score >= 3:
                if prot_id not in self.results["protections_detected"]:
                    self.results["protections_detected"].append(prot_id)
                    self.log(f"[HEADER] Detected: {sig['name']} (score={score})")

        # === LAYER 2: Cookie Analysis ===
        for prot_id, sig in PROTECTION_SIGNATURES.items():
            cookie_patterns = sig["cookies"].get("patterns", [])
            regex_patterns = sig["cookies"].get("regex_patterns", [])
            found = False

            for cookie_name in cookies:
                # Direct pattern match
                for pattern in cookie_patterns:
                    if pattern.lower() in cookie_name.lower():
                        found = True
                        break
                # Regex match
                for regex in regex_patterns:
                    if re.match(regex, cookie_name):
                        found = True
                        break
                if found:
                    break

            if found and prot_id not in self.results["protections_detected"]:
                self.results["protections_detected"].append(prot_id)
                self.log(f"[COOKIE] Detected: {sig['name']} (cookie match)")

        # Status code analysis
        if status == 403:
            self.log(f"[STATUS] 403 Forbidden - site is actively blocking")
            if not self.results["protections_detected"]:
                self.results["protections_detected"].append("unknown_waf")
        elif status == 503:
            self.log(f"[STATUS] 503 Service Unavailable - challenge page likely")
        elif status == 429:
            self.log(f"[STATUS] 429 Rate Limited")

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
        for prot_id in self.results["protections_detected"]:
            sig = PROTECTION_SIGNATURES.get(prot_id, {})
            challenges = sig.get("challenge_indicators", {})

            for challenge_type, indicators in challenges.items():
                for indicator in indicators:
                    if indicator.lower() in html_lower:
                        current = self.results["challenge_type"]
                        # Escalate challenge type (blocked > captcha > managed > js > none)
                        priority = {"none": 0, "js_challenge": 1, "managed_challenge": 2,
                                    "captcha": 3, "blocked": 4}
                        new_priority = priority.get(challenge_type, 0)
                        old_priority = priority.get(current, 0)
                        if new_priority > old_priority:
                            self.results["challenge_type"] = challenge_type
                            self.log(f"[CHALLENGE] {sig.get('name', prot_id)}: {challenge_type} "
                                     f"(indicator: {indicator})")
                        break

        # Detect CAPTCHA type and site key
        self._detect_captcha(html)

        # Check if it's a SPA
        if '<div id="root"' in html or '<div id="app"' in html or '<div id="__next"' in html:
            self.results["is_spa"] = True
            self.log("[SPA] Single Page Application detected")

    def _detect_captcha(self, html):
        """Detect CAPTCHA type and extract site key."""
        if not html:
            return

        # Cloudflare Turnstile
        if "challenges.cloudflare.com/turnstile" in html or "cf-turnstile" in html:
            self.results["captcha_info"]["type"] = "turnstile"
            m = re.search(r'data-sitekey=["\']([^"\']+)["\']', html)
            if m:
                self.results["captcha_info"]["site_key"] = m.group(1)
            else:
                m = re.search(r'sitekey["\s:]+["\']([^"\']+)["\']', html)
                if m:
                    self.results["captcha_info"]["site_key"] = m.group(1)
            self.log(f"[CAPTCHA] Cloudflare Turnstile detected (key: {self.results['captcha_info']['site_key']})")

        # reCAPTCHA v2
        elif "google.com/recaptcha" in html or "g-recaptcha" in html:
            self.results["captcha_info"]["type"] = "recaptcha_v2"
            m = re.search(r'data-sitekey=["\']([^"\']+)["\']', html)
            if m:
                self.results["captcha_info"]["site_key"] = m.group(1)
            # Check for v3
            if "recaptcha/api.js?render=" in html:
                self.results["captcha_info"]["type"] = "recaptcha_v3"
                m = re.search(r'render=([^&"\']+)', html)
                if m:
                    self.results["captcha_info"]["site_key"] = m.group(1)
            self.log(f"[CAPTCHA] {self.results['captcha_info']['type']} detected")

        # hCaptcha
        elif "hcaptcha.com" in html or "h-captcha" in html:
            self.results["captcha_info"]["type"] = "hcaptcha"
            m = re.search(r'data-sitekey=["\']([^"\']+)["\']', html)
            if m:
                self.results["captcha_info"]["site_key"] = m.group(1)
            self.log(f"[CAPTCHA] hCaptcha detected")

        # AWS WAF CAPTCHA
        elif "aws_captcha" in html.lower() or "awswaf" in html.lower():
            self.results["captcha_info"]["type"] = "aws_captcha"
            self.log(f"[CAPTCHA] AWS WAF CAPTCHA detected")

    def _analyze_js_bundles(self, html, base):
        """Layer 4: Analyze JavaScript bundles for protection and socket info."""
        if not html:
            return

        js_urls = re.findall(r'src=["\']([^"\']*\.js[^"\']*?)["\']', html)
        if not js_urls:
            return

        self.log(f"[JS] Scanning {len(js_urls)} JavaScript bundles...")
        profile = random.choice(self.profiles) if self.profiles else None

        for js_path in js_urls[:8]:  # Limit to 8 bundles
            try:
                js_url = js_path
                if js_path.startswith('//'):
                    js_url = 'https:' + js_path
                elif js_path.startswith('/'):
                    js_url = base + js_path
                elif not js_path.startswith('http'):
                    js_url = base + '/' + js_path

                # Skip CDN/external scripts
                skip_domains = ['googleapis.com', 'gstatic.com', 'cdnjs.com', 'unpkg.com',
                                'jsdelivr.net', 'bootstrapcdn.com', 'jquery.com']
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

                    # Check for protection-related code in JS
                    js_lower = js_content.lower()
                    for prot_id, sig in PROTECTION_SIGNATURES.items():
                        for signal in sig.get("html_signals", []):
                            if signal.lower() in js_lower:
                                if prot_id not in self.results["protections_detected"]:
                                    self.results["protections_detected"].append(prot_id)
                                    self.log(f"[JS] Detected: {sig['name']} in JS bundle")
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
                                self.log(f"[JS] Socket.IO URL found in JS: {sock_url}")

                        # Check for NexaFlow / analytics platforms
                        if 'nf-api-key' in js_content or 'data-flow-apis' in js_content:
                            nf_match = re.search(r'["\'](https?://[^"\']*data-flow-apis[^"\']*)["\'"]', js_content)
                            nf_url = nf_match.group(1) if nf_match else 'https://data-flow-apis.cc'
                            nf_url = urlparse(nf_url).scheme + "://" + urlparse(nf_url).netloc
                            self.results["has_socketio"] = True
                            self.results["socket_url"] = nf_url
                            self.log(f"[JS] NexaFlow detected! Socket: {nf_url}")

                    # Look for backend URLs
                    if not self.results["has_socketio"]:
                        backend_urls = re.findall(
                            r'https?://[\w.-]+\.(?:onrender\.com|railway\.app|herokuapp\.com|fly\.dev|up\.railway\.app)',
                            js_content
                        )
                        for bu in backend_urls:
                            if self._verify_socketio(bu):
                                self.results["has_socketio"] = True
                                self.results["socket_url"] = bu
                                self.log(f"[JS] Socket.IO backend found: {bu}")
                                break

            except Exception as e:
                continue

    def _analyze_behavior(self, url, base):
        """Layer 5: Analyze response behavior patterns."""
        # Check if multiple requests get different responses (bot detection)
        if not self.requests:
            return

        # Quick test: does the site redirect to a challenge?
        try:
            r = self.requests.get(url, timeout=10, allow_redirects=False,
                                  headers={"User-Agent": "Mozilla/5.0"}, verify=False)
            if r.status_code in [301, 302, 307, 308]:
                location = r.headers.get("Location", "")
                if "challenge" in location.lower() or "captcha" in location.lower():
                    self.log(f"[BEHAVIOR] Redirect to challenge: {location}")
                    self.results["challenge_type"] = "managed_challenge"
                elif "cdn-cgi" in location:
                    self.log(f"[BEHAVIOR] Cloudflare CDN-CGI redirect")
        except:
            pass

    def _verify_content(self, html):
        """Layer 6: Verify if we reached real content or a challenge page."""
        if not html:
            self.results["real_content_reached"] = False
            return

        html_lower = html.lower()

        # Challenge page indicators (NOT real content)
        challenge_indicators = [
            "just a moment",
            "checking your browser",
            "cf-browser-verification",
            "cf-challenge-running",
            "enable javascript and cookies to continue",
            "please wait while we verify",
            "one more step",
            "please complete the security check",
            "attention required",
            "access denied",
            "you have been blocked",
            "error 1020",
            "ray id:",
            "performance & security by cloudflare",
            "ddos protection by",
            "please turn javascript on",
            "pardon our interruption",
            "press & hold",
            "verifying you are human",
        ]

        is_challenge = False
        for indicator in challenge_indicators:
            if indicator in html_lower:
                is_challenge = True
                self.log(f"[VERIFY] Challenge page detected: '{indicator}'")
                break

        # Real content indicators
        real_content_signals = 0
        if '<title>' in html_lower and '</title>' in html_lower:
            title = re.search(r'<title>([^<]+)</title>', html, re.IGNORECASE)
            if title:
                title_text = title.group(1).strip().lower()
                # Challenge pages have specific titles
                challenge_titles = ["just a moment", "attention required", "access denied",
                                    "cloudflare", "please wait", "ddos", "security check",
                                    "blocked", "error"]
                if not any(ct in title_text for ct in challenge_titles):
                    real_content_signals += 2
                    self.log(f"[VERIFY] Real title found: '{title.group(1).strip()}'")
                else:
                    is_challenge = True

        # Check for meaningful HTML structure
        if '<nav' in html_lower or '<header' in html_lower or '<footer' in html_lower:
            real_content_signals += 1
        if '<main' in html_lower or '<article' in html_lower:
            real_content_signals += 1
        if html_lower.count('<a ') > 5:  # Multiple links = real page
            real_content_signals += 1
        if html_lower.count('<img') > 2:  # Multiple images = real page
            real_content_signals += 1
        if len(html) > 10000:  # Challenge pages are usually small
            real_content_signals += 1

        # Verdict
        if is_challenge:
            self.results["real_content_reached"] = False
            self.log(f"[VERIFY] RESULT: Challenge page - real content NOT reached")
        elif real_content_signals >= 3:
            self.results["real_content_reached"] = True
            self.log(f"[VERIFY] RESULT: Real content reached (signals={real_content_signals})")
        elif self.results["response_status"] == 200 and real_content_signals >= 1:
            self.results["real_content_reached"] = True
            self.log(f"[VERIFY] RESULT: Likely real content (status=200, signals={real_content_signals})")
        else:
            self.results["real_content_reached"] = False
            self.log(f"[VERIFY] RESULT: Uncertain - may not be real content (signals={real_content_signals})")

        # Generate content fingerprint for later verification
        if self.results["real_content_reached"]:
            # Extract key content identifiers
            title_match = re.search(r'<title>([^<]+)</title>', html, re.IGNORECASE)
            title = title_match.group(1).strip() if title_match else ""
            # Count unique links
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

        # Determine primary protection (strongest one)
        priority_order = ["kasada", "datadome", "perimeterx", "akamai",
                          "cloudflare", "imperva", "f5", "aws_waf",
                          "sucuri", "ddos_guard", "stackpath"]
        primary = "unknown"
        for p in priority_order:
            if p in detected:
                primary = p
                break
        if primary == "unknown" and detected:
            primary = detected[0]

        self.results["primary_protection"] = primary

        # Calculate protection level
        level = "low"

        # Base level from protection type
        high_level_protections = ["kasada", "datadome", "perimeterx", "akamai"]
        medium_level_protections = ["cloudflare", "imperva", "f5"]
        low_level_protections = ["sucuri", "aws_waf", "ddos_guard", "stackpath"]

        if primary in high_level_protections:
            level = "high"
        elif primary in medium_level_protections:
            level = "medium"
        elif primary in low_level_protections:
            level = "low"

        # Escalate based on challenge type
        if challenge == "blocked":
            level = "extreme"
        elif challenge == "captcha" or challenge == "managed_challenge":
            if level in ["low", "medium"]:
                level = "high"
            elif level == "high":
                level = "extreme"
        elif challenge == "js_challenge":
            if level == "low":
                level = "medium"

        # Escalate if multiple protections detected
        if len(detected) >= 3:
            if level in ["low", "medium"]:
                level = "high"

        # Escalate if we couldn't reach real content
        if not self.results["real_content_reached"] and self.results["response_status"] in [403, 503]:
            if level in ["low", "medium"]:
                level = "high"

        self.results["protection_level"] = level

        # Confidence score
        confidence = min(30 + len(detected) * 15 + (20 if challenge != "none" else 0), 99)
        self.results["detection_confidence"] = confidence

    def _recommend_strategy(self, url, base):
        """Choose the best attack strategy based on detection results."""
        protection = self.results["primary_protection"]
        level = self.results["protection_level"]
        challenge = self.results["challenge_type"]
        has_socket = self.results["has_socketio"]

        # Socket.IO is always the best if available
        if has_socket and self.results["socket_url"]:
            self.results["recommended_mode"] = "socketio"
            self.results["recommended_strategy"] = (
                f"Socket.IO mode - connect directly to {self.results['socket_url']}. "
                f"WebSocket bypasses WAF. Best mode for maximum impact."
            )
            return

        # No protection
        if protection == "none" or level == "none":
            self.results["recommended_mode"] = "http"
            self.results["recommended_strategy"] = (
                "Direct HTTP mode - no protection detected. "
                "Use curl_cffi with TLS spoofing + Saudi proxy for maximum throughput."
            )
            return

        # Based on protection type and level
        if level == "extreme":
            self.results["recommended_mode"] = "cloudflare"
            self.results["recommended_strategy"] = (
                f"EXTREME protection ({PROTECTION_SIGNATURES.get(protection, {}).get('name', protection)}). "
                f"Challenge: {challenge}. "
                f"Strategy: headless browser (Playwright) + CAPTCHA solver required. "
                f"curl_cffi alone will NOT work. Expect low success rate (~10-30%)."
            )
        elif level == "high":
            self.results["recommended_mode"] = "cloudflare"
            captcha_note = ""
            if self.results["captcha_info"]["type"]:
                captcha_note = f" CAPTCHA solver needed for {self.results['captcha_info']['type']}."
            self.results["recommended_strategy"] = (
                f"HIGH protection ({PROTECTION_SIGNATURES.get(protection, {}).get('name', protection)}). "
                f"Challenge: {challenge}. "
                f"Strategy: curl_cffi TLS spoof + FlareSolverr + per-proxy cookies.{captcha_note} "
                f"Expected success rate: ~30-60%."
            )
        elif level == "medium":
            self.results["recommended_mode"] = "cloudflare"
            self.results["recommended_strategy"] = (
                f"MEDIUM protection ({PROTECTION_SIGNATURES.get(protection, {}).get('name', protection)}). "
                f"Challenge: {challenge}. "
                f"Strategy: curl_cffi TLS spoof should bypass most challenges. "
                f"FlareSolverr as fallback. Expected success rate: ~60-85%."
            )
        elif level == "low":
            self.results["recommended_mode"] = "http"
            self.results["recommended_strategy"] = (
                f"LOW protection ({PROTECTION_SIGNATURES.get(protection, {}).get('name', protection)}). "
                f"Strategy: curl_cffi with real browser TLS fingerprint + Saudi proxy. "
                f"Should work without special bypass. Expected success rate: ~85-95%."
            )

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
                    # Save as candidate even if verification fails (CF may block polling)
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
            # Try with curl_cffi first
            if self.cffi:
                profile = random.choice(self.profiles) if self.profiles else None
                if profile:
                    r = self.cffi.get(sio_url, impersonate=profile["impersonate"], timeout=10, verify=False)
                    if r.status_code == 200 and '"sid"' in r.text and '<html' not in r.text.lower()[:200]:
                        return True

            # Try with proxy
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

            # Plain request
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

        # URL + token pair (NexaFlow pattern)
        token_pattern = r'"(https?://[\w.-]+\.[a-z]{2,}[^"]*)",\w+="([\w]{20,})"'
        token_matches = re.findall(token_pattern, content)
        skip_domains = ['google', 'facebook', 'twitter', 'apple.com', 'play.google', 'flagcdn',
                        'fonts.', 'github', 'wikipedia', 'w3.org', 'apache.org', 'reactjs',
                        'mui.com', 'radix-ui', 'mediawiki', 'cdn']
        for url_m, tok_m in token_matches:
            if url_m.startswith("http") and "socket.io" not in url_m:
                if not any(s in url_m.lower() for s in skip_domains):
                    return (url_m, tok_m)

        # URL-only patterns
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

            # Sitemap
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

            # Robots.txt
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

            # HTML links
            source = html_content
            if source:
                hrefs = re.findall(r'href=["\']([^"\']+)["\']', source)
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
        print(f"  ADVANCED DETECTION RESULTS", flush=True)
        print(f"{'='*60}", flush=True)
        print(f"  Protections Found : {protections}", flush=True)
        print(f"  Primary Protection: {PROTECTION_SIGNATURES.get(r['primary_protection'], {}).get('name', r['primary_protection'])}", flush=True)
        print(f"  Protection Level  : {r['protection_level'].upper()}", flush=True)
        print(f"  Challenge Type    : {r['challenge_type']}", flush=True)
        print(f"  CAPTCHA           : {r['captcha_info']['type'] or 'None'}", flush=True)
        print(f"  Real Content      : {'YES' if r['real_content_reached'] else 'NO'}", flush=True)
        print(f"  Socket.IO         : {r['socket_url'] or 'Not found'}", flush=True)
        print(f"  Analytics         : {r['analytics']['type'] or 'None'}", flush=True)
        print(f"  SPA               : {'Yes' if r['is_spa'] else 'No'}", flush=True)
        print(f"  Confidence        : {r['detection_confidence']}%", flush=True)
        print(f"  Recommended Mode  : {r['recommended_mode'].upper()}", flush=True)
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
            "register_event": "visitor:register",
            "page_change_event": "visitor:pageEnter",
            "connected_event": "successfully-connected",
            "base_url": base,
            "target_url": url,
            "analytics": r["analytics"],
        }

        return site_info


# ============ CONTENT VERIFICATION FOR VISITORS ============

def verify_visit_success(response_text, content_fingerprint=None):
    """
    Verify if a visitor's request actually reached the real site content.
    Returns: (bool success, str reason)

    This replaces the old is_cf_blocked() with a much more accurate check.
    """
    if not response_text:
        return False, "empty_response"

    text_lower = response_text.lower()

    # === DEFINITE BLOCKS ===
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
    ]

    for indicator, reason in block_indicators:
        if indicator in text_lower:
            return False, reason

    # === DEFINITE SUCCESS ===
    # Check for real content signals
    success_signals = 0

    # Has a real title (not a challenge title)
    title_match = re.search(r'<title>([^<]+)</title>', response_text, re.IGNORECASE)
    if title_match:
        title = title_match.group(1).strip().lower()
        challenge_titles = ["just a moment", "attention required", "access denied",
                            "cloudflare", "please wait", "ddos", "security check",
                            "blocked", "error", "403", "503"]
        if not any(ct in title for ct in challenge_titles):
            success_signals += 2

    # Has navigation/structure
    if '<nav' in text_lower or '<header' in text_lower:
        success_signals += 1
    if '<footer' in text_lower:
        success_signals += 1
    if '<main' in text_lower or '<article' in text_lower:
        success_signals += 1

    # Has meaningful content size
    if len(response_text) > 5000:
        success_signals += 1

    # Content fingerprint verification (if available)
    if content_fingerprint:
        if title_match:
            current_title = title_match.group(1).strip()
            if content_fingerprint.get("title") and current_title == content_fingerprint["title"]:
                success_signals += 3  # Strong match

    # Challenge pages are typically small with specific structure
    if len(response_text) < 3000 and ('challenge' in text_lower or 'cf-' in text_lower):
        return False, "small_challenge_page"

    if success_signals >= 3:
        return True, "verified_real_content"
    elif success_signals >= 1 and len(response_text) > 2000:
        return True, "likely_real_content"
    else:
        return False, f"uncertain_signals_{success_signals}"


# ============ STANDALONE USAGE ============
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

    # Simple browser profiles for standalone testing
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
