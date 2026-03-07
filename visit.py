#!/usr/bin/env python3
"""
TURBO v12 - ULTIMATE UNIVERSAL TRAFFIC ENGINE
===============================================
Bypasses ALL protection types:
  Mode A: Socket.IO  → Direct WebSocket connection (fastest)
  Mode B: Cloudflare → TLS spoofing + shared cookies + CAPTCHA solving
  Mode C: Advanced Bot Protection → TLS spoofing (Akamai, DataDome, PerimeterX)
  Mode D: Plain HTTP → Direct requests with Saudi proxy (fast)

Protection Bypass:
  - Cloudflare Free/Pro/Business: curl_cffi TLS fingerprint + FlareSolverr
  - Cloudflare Enterprise: curl_cffi + CAPTCHA solver (2Captcha/CapSolver)
  - Cloudflare Turnstile: CAPTCHA solver API
  - reCAPTCHA v2/v3: CAPTCHA solver API
  - hCaptcha: CAPTCHA solver API
  - Akamai Bot Manager: curl_cffi TLS + real browser headers
  - DataDome: curl_cffi TLS + sensor data simulation
  - PerimeterX: curl_cffi TLS + PX cookie generation
  - GeoIP blocking: Saudi proxy

Each visitor:
  - Real browser TLS fingerprint (JA3/JA4 matches real browser)
  - Unique Saudi IP (real proxy)
  - Unique fingerprint (OS, browser, device)
  - Stays ~30s then leaves, replaced by new wave
  - ~200 active visitors per server
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
        return f"http://{PROXY_USER}:{PROXY_PASS}_country-SaudiArabia_session-{sess}@{PROXY_HOST}:{PROXY_PORT}"
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
            },f)
    except: pass

def log_progress():
    with lock:
        total = stats["success"]+stats["failed"]
        if total % 10 == 0 or total <= 5:
            e = time.time()-stats["start_time"]
            r = stats["success"]/e*60 if e>0 else 0
            write_status()
            print(f"  [W{stats['waves_done']}/{stats['total_waves']}] "
                  f"✅{stats['success']} ❌{stats['failed']} | "
                  f"{r:.0f}/min | 👥{stats['active_visitors']} active "
                  f"(peak:{stats['peak_active']}) | "
                  f"🌍{stats['unique_ips']} IPs | mode:{stats['mode']}", flush=True)


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


# ============ CLOUDFLARE BLOCK DETECTION ============
def is_cf_blocked(response):
    """Check if Cloudflare actually BLOCKED the request (challenge page).
    Many Cloudflare sites include 'challenge-platform' script in normal pages.
    This function distinguishes real blocks from normal pages with CF scripts."""
    try:
        text = response.text.lower()
        status = response.status_code
        
        # Definite block: 403/503 status
        if status in [403, 503]:
            return True
        
        # Definite block: Cloudflare challenge/interstitial page
        if 'just a moment' in text or 'checking your browser' in text:
            return True
        if 'cf-chl-widget' in text or 'cf-challenge-running' in text:
            return True
        
        # If status is 200 and page has real content, it's NOT blocked
        # even if challenge-platform script is injected (normal for CF sites)
        if status == 200:
            has_title = '<title>' in text and '</title>' in text
            has_body_content = len(text) > 1500
            if has_title and has_body_content:
                return False  # Real page with CF script - NOT blocked
        
        # Fallback: if challenge-platform is present and no real content, it's blocked
        if 'challenge-platform' in text and len(text) < 5000:
            return True
        
        return False
    except:
        return False


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


# ============ DETECTION ============
def verify_socketio(url):
    """Verify if a URL has a real Socket.IO endpoint. Uses curl_cffi to bypass Cloudflare."""
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
    
    # Step 5: Determine mode
    if result["has_socketio"]:
        result["mode"] = "socketio"
        if not result["socket_url"]:
            result["socket_url"] = base
    elif result["protection"] in ["cloudflare", "akamai", "datadome", "perimeterx"]:
        result["mode"] = "cloudflare"  # All advanced protections use same bypass strategy
    else:
        result["mode"] = "http"
    
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
            print(f"  [LINK] Found socket URL: {url_m} (with token)", flush=True)
            return (url_m, tok_m)
    
    # Then try URL-only patterns
    for pattern in [
        r'(?:const|let|var)\s+\w*(?:SOCKET|socket|server|api|SERVER|API)\w*\s*=\s*[\'"]([\'"]+)[\'"]',
        r'io\([\'"]([\'"]+)[\'"]',
        r'connect\([\'"]([\'"]+)[\'"]',
        r'socketUrl\s*[:=]\s*[\'"]([\'"]+)[\'"]',
        r'SOCKET_URL\s*[:=]\s*[\'"]([\'"]+)[\'"]',
        r'serverUrl\s*[:=]\s*[\'"]([\'"]+)[\'"]',
    ]:
        matches = re.findall(pattern, html)
        for m in matches:
            if m.startswith("http") and "socket.io" not in m and "cdn" not in m.lower():
                skip = ['google', 'facebook', 'twitter', 'apple.com', 'play.google', 'flagcdn',
                        'fonts.', 'github', 'wikipedia', 'w3.org', 'apache.org', 'reactjs',
                        'mui.com', 'radix-ui', 'mediawiki']
                if any(s in m.lower() for s in skip):
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
    
    sio = sio_lib.Client(reconnection=False, http_session=http_session, request_timeout=60, ssl_verify=False)
    connected = threading.Event()
    registered = threading.Event()
    
    @sio.event
    def connect():
        connected.set()
        # Send register with correct format: {existingVisitorId: null}
        sio.emit(site_info["register_event"], {"existingVisitorId": None})
    
    @sio.on(site_info["connected_event"])
    def on_ok(data):
        registered.set()
        # Send initial page enter after registration
        page = random.choice(site_info["pages"]) if site_info["pages"] else "/"
        sio.emit(site_info["page_change_event"], page)
    
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
            for _attempt in range(3):
                try:
                    # Use SAME proxy_url as Socket.IO session for consistency
                    if HAS_CFFI:
                        reg_proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None
                        reg_r = cffi_requests.post(
                            site_info["socket_url"] + "/visitors",
                            json=reg_body, headers=reg_headers,
                            impersonate=random.choice(["chrome120", "chrome119", "chrome116"]),
                            proxies=reg_proxies, timeout=15, verify=False
                        )
                    else:
                        reg_r = requests.post(
                            site_info["socket_url"] + "/visitors",
                            json=reg_body, headers=reg_headers, timeout=15, verify=False,
                            proxies=http_session.proxies if http_session else None
                        )
                    if reg_r.status_code in [200, 201]:
                        reg_data = reg_r.json()
                        visitor_jwt = reg_data.get("token")
                        break
                    # If blocked by geo/Fortinet, try new proxy session
                    proxy_url = get_proxy_url()
                    if proxy_url and http_session:
                        http_session.proxies = {"http": proxy_url, "https": proxy_url}
                except:
                    proxy_url = get_proxy_url()
                    if proxy_url and http_session:
                        http_session.proxies = {"http": proxy_url, "https": proxy_url}
            
            if visitor_jwt:
                auth_dict = {"nf-api-key": site_info["socket_token"], "token": visitor_jwt}
            else:
                # No JWT = cannot authenticate, skip this visitor
                with lock: stats["failed"] += 1
                log_progress()
                return False
        
        # Try websocket first (bypasses Cloudflare WAF), fall back to polling
        try:
            sio.connect(site_info["socket_url"], auth=auth_dict, transports=['websocket'], wait_timeout=30)
        except:
            try:
                sio.connect(site_info["socket_url"], auth=auth_dict, transports=['polling'], wait_timeout=60)
            except:
                sio.connect(site_info["socket_url"], auth=auth_dict, wait_timeout=60)  # Let it choose
        
        if not connected.wait(timeout=30):
            with lock: stats["failed"] += 1
            log_progress()
            try: sio.disconnect()
            except: pass
            return False
        
        # Wait for server to confirm registration (longer timeout for proxy)
        if not registered.wait(timeout=20):
            # Still count as success if connected - registration might be delayed
            pass
        
        with lock:
            stats["success"] += 1
            stats["active_visitors"] += 1
            stats["unique_ips"] += 1
            if stats["active_visitors"] > stats["peak_active"]:
                stats["peak_active"] = stats["active_visitors"]
        log_progress()
        
        stay = STAY_TIME + random.randint(-5, 5)
        end_time = time.time() + max(stay, 15)
        
        while time.time() < end_time and not stop_event.is_set():
            time.sleep(random.uniform(5, 10))
            if time.time() >= end_time or stop_event.is_set(): break
            try:
                new_page = random.choice(site_info["pages"]) if site_info["pages"] else "/"
                # pageEnter expects just the path string, not an object
                sio.emit(site_info["page_change_event"], new_page)
            except: break
        
        try: sio.disconnect()
        except: pass
        with lock: stats["active_visitors"] -= 1
        return True
        
    except Exception as e:
        with lock: stats["failed"] += 1
        log_progress()
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
        
        # Check if blocked
        if r.status_code == 403 or is_cf_blocked(r):
            with cf_cookie_cache["lock"]:
                cf_cookie_cache["fail_count"] += 1
                if cf_cookie_cache["fail_count"] >= 3:
                    print(f"  ⚠️ Shared cookies failing, switching to per-proxy", flush=True)
                    cf_cookie_cache["mode"] = "per_proxy"
            return visitor_protected_per_proxy(site_info, vid)
        
        if r.status_code in [200, 301, 302]:
            with lock:
                stats["success"] += 1
                stats["active_visitors"] += 1
                stats["unique_ips"] += 1
                if stats["active_visitors"] > stats["peak_active"]:
                    stats["peak_active"] = stats["active_visitors"]
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
            
            with lock: stats["active_visitors"] -= 1
            return True
        else:
            with lock: stats["failed"] += 1
            log_progress()
            return False
            
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
            
            if r.status_code == 200 and not is_cf_blocked(r):
                cookies = dict(r.cookies)
                with lock:
                    stats["success"] += 1
                    stats["active_visitors"] += 1
                    stats["unique_ips"] += 1
                    if stats["active_visitors"] > stats["peak_active"]:
                        stats["peak_active"] = stats["active_visitors"]
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
                
                with lock: stats["active_visitors"] -= 1
                return True
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
            cookies = {c["name"]: c["value"] for c in solution.get("cookies", [])}
            ua = solution.get("userAgent", profile["ua"])
            
            with lock:
                stats["success"] += 1
                stats["active_visitors"] += 1
                stats["unique_ips"] += 1
                if stats["active_visitors"] > stats["peak_active"]:
                    stats["peak_active"] = stats["active_visitors"]
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
            
            with lock: stats["active_visitors"] -= 1
            return True
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
        
        if r.status_code in [200, 301, 302]:
            with lock:
                stats["success"] += 1
                stats["active_visitors"] += 1
                stats["unique_ips"] += 1
                if stats["active_visitors"] > stats["peak_active"]:
                    stats["peak_active"] = stats["active_visitors"]
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
            
            with lock: stats["active_visitors"] -= 1
            return True
        else:
            with lock: stats["failed"] += 1
            log_progress()
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
        # Socket.IO through proxy needs slower sending - proxy can handle ~15-20 concurrent
        actual_wave_size = WAVE_SIZE
        delay_between = 0.5  # 500ms between each connection
    
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
    
    # For socketio mode: check if socket server is behind Cloudflare and get cookies
    if site_info["mode"] == "socketio" and site_info.get("socket_url"):
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
    
    # For socketio with proxy, use more frequent smaller waves
    if site_info['mode'] == 'socketio' and PROXY_USER:
        # More waves, shorter interval between them
        total_waves = max(1, duration_min * 6)  # 6 waves per minute
        WAVE_INTERVAL_ACTUAL = 10  # 10 seconds between waves
    else:
        total_waves = max(1, duration_min * 2)
        WAVE_INTERVAL_ACTUAL = WAVE_INTERVAL
    total_visits = total_waves * WAVE_SIZE
    
    print(f"\n{'='*60}", flush=True)
    print(f"🚀 TURBO v12 - ULTIMATE UNIVERSAL ENGINE", flush=True)
    print(f"Target: {url}", flush=True)
    print(f"Mode: {site_info['mode'].upper()}", flush=True)
    print(f"Protection: {site_info['protection'].upper()}", flush=True)
    print(f"TLS Spoof: {'curl_cffi ✅' if HAS_CFFI else 'No ❌'}", flush=True)
    print(f"CAPTCHA Solver: {'Yes ✅' if CAPTCHA_API_KEY else 'No (set CAPTCHA_API_KEY)'}", flush=True)
    if site_info['socket_url']:
        print(f"Socket: {site_info['socket_url']}", flush=True)
    if site_info['mode'] == 'cloudflare':
        print(f"CF Bypass: {cf_cookie_cache['mode'].upper()}", flush=True)
    print(f"Duration: {duration_min} min | Waves: {total_waves}", flush=True)
    print(f"Visitors/wave: {WAVE_SIZE} | Stay: {STAY_TIME}s", flush=True)
    print(f"Expected: ~{WAVE_SIZE} active visitors", flush=True)
    print(f"Pages: {len(site_info['pages'])}", flush=True)
    print(f"Proxy: {'Yes' if PROXY_USER else 'No'}", flush=True)
    print(f"{'='*60}\n", flush=True)
    
    stats["start_time"] = time.time()
    stats["target"] = total_visits
    stats["total_waves"] = total_waves
    stats["duration_min"] = duration_min
    stats["success"] = 0
    stats["failed"] = 0
    stats["active_visitors"] = 0
    stats["peak_active"] = 0
    stats["waves_done"] = 0
    stats["unique_ips"] = 0
    write_status()
    
    all_threads = []
    for wave in range(total_waves):
        if stop_event.is_set(): break
        wave_threads = run_wave(wave, site_info)
        all_threads.extend(wave_threads)
        
        if wave < total_waves - 1:
            wait_time = WAVE_INTERVAL_ACTUAL
            print(f"  ⏳ Next wave in {wait_time}s... (👥 {stats['active_visitors']} active)", flush=True)
            for _ in range(wait_time):
                if stop_event.is_set(): break
                time.sleep(1)
    
    print("\n⏳ Waiting for last visitors...", flush=True)
    for t in all_threads[-WAVE_SIZE:]:
        t.join(timeout=STAY_TIME + 10)
    
    write_status()
    t = time.time() - stats["start_time"]
    print(f"\n{'='*60}", flush=True)
    print(f"🏁 DONE! ✅{stats['success']}/{total_visits} ❌{stats['failed']}", flush=True)
    if t > 0:
        print(f"⏱️ {t:.0f}s | 🚀{stats['success']/t*60:.0f}/min", flush=True)
    print(f"Mode: {site_info['mode']}/{site_info['protection']} | Peak: {stats['peak_active']} active", flush=True)
    print(f"🌍 {stats['unique_ips']} unique IPs | TLS: {'curl_cffi' if HAS_CFFI else 'standard'}", flush=True)
    print(f"{'='*60}", flush=True)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 visit.py <URL> [duration_minutes] [socket_url]")
        sys.exit(1)
    target_url = sys.argv[1]
    duration = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    manual_socket = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("SOCKET_URL", "")
    run(target_url, duration, manual_socket=manual_socket if manual_socket else None)
