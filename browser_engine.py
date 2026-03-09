"""
BROWSER ENGINE v2.0 - Real Browser Persistent Visitors (8GB RAM Optimized)
==========================================================================
Uses Playwright (real Chrome) to:
  1. Solve ANY protection challenge (Cloudflare, Akamai, DataDome, etc.)
  2. Harvest valid cookies bound to specific proxy IPs
  3. Feed cookies to curl_cffi workers for persistent browsing
  4. Keep visitors INSIDE the site, browsing like real humans
  5. Accumulate visitors over time (no one leaves until time is up)

Server Specs: 4 vCPU / 8GB RAM / 160GB Disk
Safe Limit: 120 persistent visitors per server (60% capacity)
Total: 9 servers x 120 = ~1,080 real visitors
"""

import threading
import time
import random
import json
import os
import re
from urllib.parse import urlparse, urljoin
from collections import deque

# ============ SAFE LIMITS FOR 8GB RAM ============
MAX_CONTEXTS_PER_SERVER = 120      # Safe limit (60% of ~200 max)
HARVESTER_CONTEXTS = 10            # Parallel harvesters
WAVE_SIZE_BROWSER = 20             # Visitors per wave
COOKIE_POOL_TARGET = 30            # Keep pool stocked
MEMORY_CHECK_INTERVAL = 30         # Check RAM every 30s
MAX_MEMORY_PERCENT = 70            # Stop spawning if RAM > 70%
PAGE_READ_TIME_MIN = 8             # Min seconds on each page
PAGE_READ_TIME_MAX = 25            # Max seconds on each page
MAX_PAGES_PER_VISIT = 50           # Max pages a visitor browses


# ============ COOKIE POOL (Thread-Safe) ============
class CookiePool:
    """Thread-safe pool of harvested cookies with their bound proxy IPs."""
    
    def __init__(self):
        self._pool = deque()
        self._lock = threading.Lock()
        self._stats = {
            "total_harvested": 0,
            "total_consumed": 0,
            "total_failed": 0,
            "active_harvesters": 0,
        }
    
    def add(self, cookie_set):
        with self._lock:
            self._pool.append(cookie_set)
            self._stats["total_harvested"] += 1
    
    def get(self):
        with self._lock:
            if self._pool:
                self._stats["total_consumed"] += 1
                return self._pool.popleft()
            return None
    
    def size(self):
        with self._lock:
            return len(self._pool)
    
    def stats(self):
        with self._lock:
            return dict(self._stats)
    
    def inc_harvesters(self):
        with self._lock:
            self._stats["active_harvesters"] += 1
    
    def dec_harvesters(self):
        with self._lock:
            self._stats["active_harvesters"] = max(0, self._stats["active_harvesters"] - 1)
    
    def inc_failed(self):
        with self._lock:
            self._stats["total_failed"] += 1


# Global cookie pool
cookie_pool = CookiePool()


# ============ MEMORY MONITOR ============
def get_memory_usage_percent():
    """Get current RAM usage percentage."""
    try:
        with open('/proc/meminfo', 'r') as f:
            lines = f.readlines()
        mem_total = int(lines[0].split()[1])
        mem_available = int(lines[2].split()[1])
        return int((1 - mem_available / mem_total) * 100)
    except:
        return 50  # Default safe value

def is_memory_safe():
    """Check if we have enough RAM to spawn more visitors."""
    return get_memory_usage_percent() < MAX_MEMORY_PERCENT


# ============ BROWSER STEALTH CONFIG ============
STEALTH_ARGS = [
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-site-isolation-trials",
    "--disable-web-security",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-infobars",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-ipc-flooding-protection",
    # Memory optimization (critical for 120 contexts)
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-software-rasterizer",
    "--disable-extensions",
    "--disable-component-extensions-with-background-pages",
    "--disable-default-apps",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-hang-monitor",
    "--disable-popup-blocking",
    "--disable-prompt-on-repost",
    "--disable-sync",
    "--disable-translate",
    "--metrics-recording-only",
    "--safebrowsing-disable-auto-update",
    "--js-flags=--max-old-space-size=64",  # Reduced from 128 to 64MB per context
    "--disable-logging",
    "--disable-breakpad",
    "--single-process",  # Share process to save RAM
    "--disable-features=TranslateUI",
    "--disable-features=BlinkGenPropertyTrees",
    "--disable-canvas-aa",
    "--disable-2d-canvas-clip-aa",
    "--disable-gl-drawing-for-tests",
    "--disable-accelerated-2d-canvas",
]

# Realistic viewport sizes
VIEWPORTS = [
    {"width": 1920, "height": 1080},
    {"width": 1366, "height": 768},
    {"width": 1536, "height": 864},
    {"width": 1440, "height": 900},
    {"width": 1280, "height": 720},
    {"width": 1600, "height": 900},
    {"width": 1280, "height": 800},
    {"width": 1680, "height": 1050},
]

# Realistic Chrome user agents
CHROME_UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
]

# Saudi Arabia locale/timezone
SA_LOCALE = "ar-SA"
SA_TIMEZONE = "Asia/Riyadh"
SA_GEOLOCATION = {"latitude": 24.7136, "longitude": 46.6753}  # Riyadh


# ============ HUMAN BEHAVIOR SIMULATOR ============
def human_scroll(page):
    """Simulate human-like scrolling - reads through the page naturally."""
    try:
        total_height = page.evaluate("document.body.scrollHeight")
        viewport_height = page.viewport_size["height"]
        current = 0
        
        # Scroll through 60-80% of page
        target = total_height * random.uniform(0.6, 0.8)
        
        while current < target:
            # Variable scroll speed - sometimes fast, sometimes slow
            if random.random() < 0.3:
                # Fast scroll (skimming)
                scroll_amount = random.randint(300, 600)
                time.sleep(random.uniform(0.1, 0.3))
            else:
                # Slow scroll (reading)
                scroll_amount = random.randint(80, 250)
                time.sleep(random.uniform(0.4, 1.5))
            
            current += scroll_amount
            page.evaluate(f"window.scrollBy(0, {scroll_amount})")
            
            # Sometimes pause to "read" a section
            if random.random() < 0.25:
                time.sleep(random.uniform(1.5, 4.0))
            
            # Sometimes scroll back up a bit (re-reading)
            if random.random() < 0.1:
                back = random.randint(50, 150)
                page.evaluate(f"window.scrollBy(0, -{back})")
                time.sleep(random.uniform(0.5, 1.5))
    except:
        pass


def human_mouse_move(page):
    """Simulate natural mouse movements - cursor follows reading pattern."""
    try:
        vw = page.viewport_size["width"]
        vh = page.viewport_size["height"]
        
        # Start from a natural position
        x = random.randint(200, vw - 200)
        y = random.randint(100, vh // 2)
        page.mouse.move(x, y, steps=random.randint(5, 10))
        
        for _ in range(random.randint(3, 8)):
            # Move to different areas of the page
            new_x = x + random.randint(-300, 300)
            new_y = y + random.randint(-200, 200)
            new_x = max(50, min(vw - 50, new_x))
            new_y = max(50, min(vh - 50, new_y))
            
            page.mouse.move(new_x, new_y, steps=random.randint(8, 20))
            time.sleep(random.uniform(0.2, 0.8))
            
            x, y = new_x, new_y
            
            # Sometimes hover over an element
            if random.random() < 0.2:
                time.sleep(random.uniform(0.5, 1.5))
    except:
        pass


def human_click_random(page):
    """Sometimes click on non-navigation elements (images, text, etc.)."""
    try:
        if random.random() < 0.15:  # 15% chance
            # Click on a random visible element
            page.evaluate("""() => {
                const elements = document.querySelectorAll('p, h2, h3, img, span');
                if (elements.length > 0) {
                    const el = elements[Math.floor(Math.random() * elements.length)];
                    el.click();
                }
            }""")
            time.sleep(random.uniform(0.3, 1.0))
    except:
        pass


def discover_internal_links(page, base_url):
    """Extract internal links from the current page."""
    try:
        links = page.evaluate("""(baseUrl) => {
            const links = [];
            document.querySelectorAll('a[href]').forEach(a => {
                const href = a.href;
                if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && 
                    !href.startsWith('tel:') && !href.includes('#') && href.startsWith(baseUrl) &&
                    !href.match(/\\.(css|js|png|jpg|gif|svg|ico|pdf|zip|xml|json)$/i) &&
                    !href.match(/(logout|signout|wp-admin|wp-login|admin|cart|checkout)/i)) {
                    links.push(href);
                }
            });
            return [...new Set(links)];
        }""", base_url)
        return links[:25]
    except:
        return []


# ============ COOKIE HARVESTER ============
def start_harvester(target_url, proxy_url_func, stop_event, num_contexts=HARVESTER_CONTEXTS):
    """
    Start the cookie harvester in background.
    Launches a single browser with multiple contexts to solve challenges.
    """
    def _harvester_worker():
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            print("  ❌ Playwright not installed!", flush=True)
            return
        
        print(f"  🌐 Starting Cookie Harvester ({num_contexts} contexts)...", flush=True)
        
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=STEALTH_ARGS,
            )
            
            threads = []
            for i in range(num_contexts):
                t = threading.Thread(
                    target=_harvest_context_loop,
                    args=(browser, target_url, proxy_url_func, stop_event, i),
                    daemon=True
                )
                t.start()
                threads.append(t)
                time.sleep(0.3)  # Stagger starts
            
            # Wait for stop signal
            while not stop_event.is_set():
                time.sleep(1)
            
            try:
                browser.close()
            except:
                pass
    
    t = threading.Thread(target=_harvester_worker, daemon=True)
    t.start()
    return t


def _harvest_context_loop(browser, target_url, proxy_url_func, stop_event, ctx_id):
    """Single harvester context - continuously solves challenges and feeds the pool."""
    cookie_pool.inc_harvesters()
    parsed = urlparse(target_url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"
    
    while not stop_event.is_set():
        context = None
        page = None
        try:
            # Check memory before creating new context
            if not is_memory_safe():
                time.sleep(5)
                continue
            
            proxy_str = proxy_url_func()
            if not proxy_str:
                time.sleep(2)
                continue
            
            proxy_config = _parse_proxy(proxy_str)
            viewport = random.choice(VIEWPORTS)
            ua = random.choice(CHROME_UAS)
            
            context = browser.new_context(
                proxy=proxy_config,
                viewport=viewport,
                user_agent=ua,
                locale=SA_LOCALE,
                timezone_id=SA_TIMEZONE,
                geolocation=SA_GEOLOCATION,
                permissions=["geolocation"],
                color_scheme="light",
                java_script_enabled=True,
                bypass_csp=True,
                ignore_https_errors=True,
            )
            
            # Anti-detection stealth scripts
            context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {get: () => false});
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5]
                });
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['ar-SA', 'ar', 'en-US', 'en']
                });
                Object.defineProperty(navigator, 'platform', {
                    get: () => 'Win32'
                });
                window.chrome = {runtime: {}, loadTimes: function(){}, csi: function(){}};
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                    Promise.resolve({state: Notification.permission}) :
                    originalQuery(parameters)
                );
                // Hide automation indicators
                delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
                delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
                delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
            """)
            
            page = context.new_page()
            
            # Block heavy resources to save memory
            page.route("**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,eot,mp4,webm,mp3}", 
                       lambda route: route.abort())
            page.route("**/analytics*", lambda route: route.abort())
            page.route("**/gtag*", lambda route: route.abort())
            page.route("**/google-analytics*", lambda route: route.abort())
            page.route("**/facebook.net*", lambda route: route.abort())
            page.route("**/doubleclick*", lambda route: route.abort())
            
            # Navigate to target
            response = page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
            
            if not response:
                cookie_pool.inc_failed()
                continue
            
            # Wait for challenge to resolve
            _wait_for_challenge(page, timeout=25)
            
            # Check if we reached real content
            content = page.content()
            
            if _is_challenge_page(content):
                cookie_pool.inc_failed()
                continue
            
            # SUCCESS - Extract cookies
            cookies = context.cookies()
            cookie_dict = {c["name"]: c["value"] for c in cookies}
            
            if not cookie_dict:
                cookie_pool.inc_failed()
                continue
            
            # Discover internal pages
            pages = discover_internal_links(page, base_url)
            if not pages:
                pages = [target_url]
            
            cookie_set = {
                "cookies": cookie_dict,
                "proxy": proxy_str,
                "user_agent": ua,
                "viewport": viewport,
                "timestamp": time.time(),
                "pages": pages,
                "base_url": base_url,
            }
            cookie_pool.add(cookie_set)
            
            pool_size = cookie_pool.size()
            stats = cookie_pool.stats()
            print(f"  🍪 Harvester-{ctx_id}: Cookie OK! "
                  f"Pool: {pool_size} | Total: {stats['total_harvested']} | "
                  f"Failed: {stats['total_failed']}", flush=True)
            
        except Exception as e:
            cookie_pool.inc_failed()
            err = str(e)[:80]
            if "timeout" not in err.lower():
                print(f"  ⚠️ Harvester-{ctx_id}: {err}", flush=True)
        finally:
            try:
                if page: page.close()
            except: pass
            try:
                if context: context.close()
            except: pass
        
        time.sleep(random.uniform(1, 3))
    
    cookie_pool.dec_harvesters()


def _wait_for_challenge(page, timeout=25):
    """Wait for Cloudflare/other challenge to resolve."""
    start = time.time()
    while time.time() - start < timeout:
        content = page.content()
        
        if not _is_challenge_page(content):
            return True
        
        # Check for Turnstile iframe
        turnstile = page.query_selector("iframe[src*='challenges.cloudflare.com']")
        if turnstile:
            time.sleep(3)
            continue
        
        # Check for reCAPTCHA
        recaptcha = page.query_selector("iframe[src*='google.com/recaptcha']")
        if recaptcha:
            time.sleep(3)
            continue
        
        # Check for hCaptcha
        hcaptcha = page.query_selector("iframe[src*='hcaptcha.com']")
        if hcaptcha:
            time.sleep(3)
            continue
        
        time.sleep(1)
    
    return False


def _is_challenge_page(html):
    """Check if the page is still showing a challenge."""
    if not html:
        return True
    
    challenge_indicators = [
        "Just a moment",
        "Checking your browser",
        "Checking if the site connection is secure",
        "Enable JavaScript and cookies to continue",
        "Verify you are human",
        "cf-challenge-running",
        "challenge-platform",
        "managed-challenge",
        "_cf_chl_opt",
        "interstitial-wrapper",
        "cf-turnstile",
        "ray ID",
        "Please wait while we verify",
        "Access denied",
        "Attention Required",
    ]
    
    html_lower = html.lower()
    matches = sum(1 for ind in challenge_indicators if ind.lower() in html_lower)
    
    # Need 2+ indicators to be a challenge (avoid false positives)
    return matches >= 2


def _parse_proxy(proxy_str):
    """Parse proxy URL string into Playwright proxy config."""
    try:
        from urllib.parse import urlparse as _up
        p = _up(proxy_str)
        config = {"server": f"{p.scheme}://{p.hostname}:{p.port}"}
        if p.username:
            config["username"] = p.username
        if p.password:
            config["password"] = p.password
        return config
    except:
        return {"server": proxy_str}


# ============ PERSISTENT VISITOR (Stays on site until time is up) ============
def persistent_visitor(cookie_set, site_info, vid, stats, lock, stop_event):
    """
    A visitor that STAYS on the site browsing like a real human.
    Does NOT leave - stays until stop_event is set (time runs out).
    Uses harvested cookies + same proxy IP for authenticity.
    
    Full human behavior:
    1. Enter the site with real cookies
    2. Read the page (8-25 seconds)
    3. Scroll through content naturally
    4. Move mouse around
    5. Click on a link to another page
    6. Repeat until time is up
    """
    try:
        from curl_cffi import requests as cffi_requests
        HAS_CFFI = True
    except:
        import requests as cffi_requests
        HAS_CFFI = False
    
    url = site_info["target_url"]
    proxy = cookie_set["proxy"]
    ua = cookie_set["user_agent"]
    cookies = cookie_set["cookies"]
    pages = cookie_set["pages"] or [url]
    base_url = cookie_set["base_url"]
    
    proxies = {"http": proxy, "https": proxy}
    
    headers = {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
        "Referer": url,
    }
    
    # Track this visitor as active
    with lock:
        stats["active_visitors"] += 1
        if stats["active_visitors"] > stats["peak_active"]:
            stats["peak_active"] = stats["active_visitors"]
    
    entered = False
    pages_visited = 0
    current_url = url
    
    try:
        # ===== INITIAL PAGE LOAD =====
        if HAS_CFFI:
            r = cffi_requests.get(
                url, headers=headers, cookies=cookies,
                proxies=proxies, timeout=20, impersonate="chrome131"
            )
        else:
            r = cffi_requests.get(
                url, headers=headers, cookies=cookies,
                proxies=proxies, timeout=20
            )
        
        if r.status_code == 200:
            content = r.text
            if not _is_challenge_page(content):
                entered = True
                pages_visited += 1
                with lock:
                    stats["success"] += 1
                    stats["verified_visitors"] += 1
                    if stats["verified_visitors"] > stats.get("peak_verified", 0):
                        stats["peak_verified"] = stats["verified_visitors"]
                
                # Discover more pages
                new_pages = _extract_links(content, base_url)
                if new_pages:
                    pages = list(set(pages + new_pages))[:30]
            else:
                with lock:
                    stats["blocked_visitors"] += 1
                    stats["active_visitors"] -= 1
                return
        else:
            with lock:
                stats["failed"] += 1
                stats["active_visitors"] -= 1
            return
        
        # ===== PERSISTENT BROWSING LOOP =====
        # Stay on the site, browsing like a real human until stop_event
        while not stop_event.is_set() and entered:
            
            # --- PHASE 1: Read current page (8-25 seconds) ---
            read_time = random.uniform(PAGE_READ_TIME_MIN, PAGE_READ_TIME_MAX)
            elapsed = 0
            while elapsed < read_time and not stop_event.is_set():
                time.sleep(0.5)
                elapsed += 0.5
            
            if stop_event.is_set():
                break
            
            # --- PHASE 2: Navigate to another page ---
            if pages and len(pages) > 1:
                # Pick a page we haven't visited recently (prefer variety)
                candidates = [p for p in pages if p != current_url]
                if candidates:
                    next_url = random.choice(candidates)
                else:
                    next_url = random.choice(pages)
            else:
                next_url = current_url  # Refresh same page
            
            try:
                headers["Referer"] = current_url
                
                if HAS_CFFI:
                    r = cffi_requests.get(
                        next_url, headers=headers, cookies=cookies,
                        proxies=proxies, timeout=15, impersonate="chrome131"
                    )
                else:
                    r = cffi_requests.get(
                        next_url, headers=headers, cookies=cookies,
                        proxies=proxies, timeout=15
                    )
                
                if r.status_code == 200 and not _is_challenge_page(r.text):
                    current_url = next_url
                    pages_visited += 1
                    
                    with lock:
                        stats["success"] += 1
                    
                    # Discover new pages from this page
                    new_pages = _extract_links(r.text, base_url)
                    if new_pages:
                        pages = list(set(pages + new_pages))[:30]
                    
                    # Stop after too many pages (memory safety)
                    if pages_visited >= MAX_PAGES_PER_VISIT:
                        # Reset counter but keep browsing
                        pages_visited = 0
                else:
                    # Page failed, wait and try another
                    time.sleep(random.uniform(3, 8))
                    
            except Exception:
                time.sleep(random.uniform(3, 8))
        
    except Exception as e:
        with lock:
            stats["failed"] += 1
            err = str(e)[:50]
            stats.setdefault("error_reasons", {})
            stats["error_reasons"][err] = stats["error_reasons"].get(err, 0) + 1
    finally:
        # Visitor leaving (only when time is up)
        with lock:
            stats["active_visitors"] = max(0, stats["active_visitors"] - 1)
            if entered:
                stats["verified_visitors"] = max(0, stats["verified_visitors"] - 1)


def _extract_links(html, base_url):
    """Extract internal links from HTML content."""
    links = []
    try:
        pattern = r'href=["\']([^"\']+)["\']'
        matches = re.findall(pattern, html)
        for href in matches:
            if href.startswith('/'):
                full = urljoin(base_url, href)
                links.append(full)
            elif href.startswith(base_url):
                links.append(href)
        links = list(set(links))
        links = [l for l in links if not any(ext in l for ext in 
                 ['.css', '.js', '.png', '.jpg', '.gif', '.svg', '.ico', 
                  '.pdf', '.zip', '.xml', '.json', 'logout', 'signout',
                  'wp-admin', 'wp-login', 'admin', 'cart', 'checkout',
                  'login', 'register', 'signup'])]
        return links[:25]
    except:
        return []


# ============ WAVE ENGINE FOR BROWSER MODE ============
def run_browser_wave(wave_num, site_info, stats, lock, stop_event, wave_size=WAVE_SIZE_BROWSER):
    """
    Launch a wave of persistent visitors using harvested cookies.
    Each visitor stays on the site until stop_event.
    Visitors accumulate across waves.
    """
    launched = 0
    waited = 0
    max_wait = 60  # Wait up to 60s for cookies
    
    while launched < wave_size and not stop_event.is_set():
        # Memory safety check
        if not is_memory_safe():
            print(f"  ⚠️ Wave {wave_num+1}: RAM at {get_memory_usage_percent()}%, "
                  f"pausing... ({launched} launched)", flush=True)
            time.sleep(10)
            if not is_memory_safe():
                break  # Stop this wave if still too high
        
        cookie_set = cookie_pool.get()
        
        if cookie_set:
            vid = wave_num * wave_size + launched
            t = threading.Thread(
                target=persistent_visitor,
                args=(cookie_set, site_info, vid, stats, lock, stop_event),
                daemon=True
            )
            t.start()
            launched += 1
            time.sleep(random.uniform(0.3, 1.0))  # Stagger entries
        else:
            if waited >= max_wait:
                print(f"  ⚠️ Wave {wave_num+1}: Only {launched}/{wave_size} "
                      f"(cookie pool empty after {max_wait}s)", flush=True)
                break
            time.sleep(1)
            waited += 1
    
    if launched > 0:
        mem = get_memory_usage_percent()
        print(f"  ✅ Wave {wave_num+1}: {launched} visitors entered! "
              f"RAM: {mem}%", flush=True)
    
    return launched


# ============ INSTALL HELPER ============
def install_playwright():
    """Install Playwright and Chromium browser."""
    print("📦 Installing Playwright...", flush=True)
    os.system("pip3 install playwright -q 2>/dev/null")
    os.system("playwright install chromium --with-deps 2>/dev/null")
    print("✅ Playwright installed!", flush=True)


def is_playwright_available():
    """Check if Playwright is installed and ready."""
    try:
        from playwright.sync_api import sync_playwright
        return True
    except ImportError:
        return False
