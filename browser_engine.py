"""
BROWSER ENGINE v1.0 - Real Browser Cookie Harvester + Persistent Visitors
==========================================================================
Uses Playwright (real Chrome) to:
  1. Solve ANY protection challenge (Cloudflare, Akamai, DataDome, etc.)
  2. Harvest valid cookies bound to specific proxy IPs
  3. Feed cookies to curl_cffi workers for persistent browsing
  4. Keep visitors INSIDE the site, browsing like real humans
  5. Accumulate visitors over time (no one leaves until time is up)

Architecture:
  - Cookie Harvester: 5-10 browser contexts solving challenges in background
  - Cookie Pool: Thread-safe pool of {cookies, proxy_ip, user_agent, timestamp}
  - Persistent Workers: Each worker grabs a cookie set and STAYS on the site
  - Human Behavior: Random scrolling, clicking links, reading pages
"""

import threading
import time
import random
import json
import os
import re
from urllib.parse import urlparse, urljoin
from collections import deque

# ============ COOKIE POOL (Thread-Safe) ============
class CookiePool:
    """Thread-safe pool of harvested cookies with their bound proxy IPs."""
    
    def __init__(self):
        self._pool = deque()  # deque of {cookies, proxy, user_agent, timestamp, pages}
        self._lock = threading.Lock()
        self._stats = {
            "total_harvested": 0,
            "total_consumed": 0,
            "total_failed": 0,
            "active_harvesters": 0,
        }
    
    def add(self, cookie_set):
        """Add a harvested cookie set to the pool."""
        with self._lock:
            self._pool.append(cookie_set)
            self._stats["total_harvested"] += 1
    
    def get(self):
        """Get a cookie set from the pool (FIFO). Returns None if empty."""
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
            self._stats["active_harvesters"] -= 1
    
    def inc_failed(self):
        with self._lock:
            self._stats["total_failed"] += 1


# Global cookie pool
cookie_pool = CookiePool()


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
    # Memory optimization
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
    # Reduce memory further
    "--js-flags=--max-old-space-size=128",
    "--disable-logging",
    "--disable-breakpad",
]

# Realistic viewport sizes
VIEWPORTS = [
    {"width": 1920, "height": 1080},
    {"width": 1366, "height": 768},
    {"width": 1536, "height": 864},
    {"width": 1440, "height": 900},
    {"width": 1280, "height": 720},
    {"width": 1600, "height": 900},
]

# Realistic user agents (must match Playwright's browser)
CHROME_UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
]

# Saudi Arabia locale/timezone
SA_LOCALE = "ar-SA"
SA_TIMEZONE = "Asia/Riyadh"
SA_GEOLOCATION = {"latitude": 24.7136, "longitude": 46.6753}  # Riyadh


# ============ HUMAN BEHAVIOR SIMULATOR ============
def human_scroll(page):
    """Simulate human-like scrolling behavior."""
    try:
        total_height = page.evaluate("document.body.scrollHeight")
        viewport_height = page.viewport_size["height"]
        current = 0
        
        while current < total_height * 0.7:  # Scroll through 70% of page
            scroll_amount = random.randint(100, 400)
            current += scroll_amount
            page.evaluate(f"window.scrollBy(0, {scroll_amount})")
            time.sleep(random.uniform(0.3, 1.2))
            
            # Sometimes pause to "read"
            if random.random() < 0.3:
                time.sleep(random.uniform(1.0, 3.0))
    except:
        pass


def human_mouse_move(page):
    """Simulate random mouse movements."""
    try:
        vw = page.viewport_size["width"]
        vh = page.viewport_size["height"]
        for _ in range(random.randint(2, 5)):
            x = random.randint(100, vw - 100)
            y = random.randint(100, vh - 100)
            page.mouse.move(x, y, steps=random.randint(5, 15))
            time.sleep(random.uniform(0.1, 0.5))
    except:
        pass


def discover_internal_links(page, base_url):
    """Extract internal links from the current page."""
    try:
        links = page.evaluate("""() => {
            const links = [];
            document.querySelectorAll('a[href]').forEach(a => {
                const href = a.href;
                if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && 
                    !href.startsWith('tel:') && !href.includes('#') && href.startsWith(arguments[0])) {
                    links.push(href);
                }
            });
            return [...new Set(links)];
        }""", base_url)
        return links[:20]  # Max 20 links
    except:
        return []


# ============ COOKIE HARVESTER ============
def start_harvester(target_url, proxy_url_func, stop_event, num_contexts=8):
    """
    Start the cookie harvester in background.
    Launches a single browser with multiple contexts to solve challenges.
    Each context uses a different proxy IP.
    
    Args:
        target_url: The target website URL
        proxy_url_func: Function that returns a proxy URL string
        stop_event: Threading event to signal stop
        num_contexts: Number of parallel harvester contexts
    """
    def _harvester_worker():
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            print("  ❌ Playwright not installed. Run: pip3 install playwright && playwright install chromium", flush=True)
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
                time.sleep(0.5)  # Stagger starts
            
            # Wait for stop signal
            while not stop_event.is_set():
                time.sleep(1)
            
            # Cleanup
            try:
                browser.close()
            except:
                pass
    
    t = threading.Thread(target=_harvester_worker, daemon=True)
    t.start()
    return t


def _harvest_context_loop(browser, target_url, proxy_url_func, stop_event, ctx_id):
    """Single harvester context loop - continuously solves challenges and feeds the pool."""
    cookie_pool.inc_harvesters()
    parsed = urlparse(target_url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"
    
    while not stop_event.is_set():
        context = None
        page = None
        try:
            # Get a fresh proxy for this harvest cycle
            proxy_str = proxy_url_func()
            if not proxy_str:
                time.sleep(2)
                continue
            
            # Parse proxy URL
            proxy_config = _parse_proxy(proxy_str)
            viewport = random.choice(VIEWPORTS)
            ua = random.choice(CHROME_UAS)
            
            # Create isolated context with proxy
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
            
            # Anti-detection: Override navigator properties
            context.add_init_script("""
                // Remove webdriver flag
                Object.defineProperty(navigator, 'webdriver', {get: () => false});
                
                // Override plugins
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5]
                });
                
                // Override languages
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['ar-SA', 'ar', 'en-US', 'en']
                });
                
                // Override platform
                Object.defineProperty(navigator, 'platform', {
                    get: () => 'Win32'
                });
                
                // Chrome runtime
                window.chrome = {runtime: {}, loadTimes: function(){}, csi: function(){}};
                
                // Permissions
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                    Promise.resolve({state: Notification.permission}) :
                    originalQuery(parameters)
                );
            """)
            
            page = context.new_page()
            
            # Block heavy resources to save memory
            page.route("**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,eot}", 
                       lambda route: route.abort())
            page.route("**/analytics*", lambda route: route.abort())
            page.route("**/gtag*", lambda route: route.abort())
            page.route("**/google-analytics*", lambda route: route.abort())
            
            # Navigate to target
            response = page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
            
            if not response:
                cookie_pool.inc_failed()
                continue
            
            # Wait for any challenge to resolve
            # Cloudflare typically redirects after solving
            _wait_for_challenge(page, timeout=20)
            
            # Check if we actually reached the real content
            final_url = page.url
            page_title = page.title()
            content = page.content()
            
            if _is_challenge_page(content):
                # Still on challenge page - failed
                cookie_pool.inc_failed()
                continue
            
            # SUCCESS - Extract cookies
            cookies = context.cookies()
            cookie_dict = {}
            for c in cookies:
                cookie_dict[c["name"]] = c["value"]
            
            if not cookie_dict:
                cookie_pool.inc_failed()
                continue
            
            # Discover internal pages for browsing
            pages = discover_internal_links(page, base_url)
            if not pages:
                pages = [target_url]
            
            # Add to pool
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
            print(f"  🍪 Harvester-{ctx_id}: Cookie harvested! "
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
        
        # Small delay before next harvest
        time.sleep(random.uniform(1, 3))
    
    cookie_pool.dec_harvesters()


def _wait_for_challenge(page, timeout=20):
    """Wait for Cloudflare/other challenge to resolve."""
    start = time.time()
    while time.time() - start < timeout:
        content = page.content()
        
        # Check if challenge is gone
        if not _is_challenge_page(content):
            return True
        
        # Check for Turnstile iframe and wait
        turnstile = page.query_selector("iframe[src*='challenges.cloudflare.com']")
        if turnstile:
            # Wait for Turnstile to auto-solve (managed challenge)
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
    ]
    
    html_lower = html.lower()
    matches = sum(1 for ind in challenge_indicators if ind.lower() in html_lower)
    
    # If 2+ indicators found, it's likely a challenge page
    return matches >= 2


def _parse_proxy(proxy_str):
    """Parse proxy URL string into Playwright proxy config."""
    # Format: http://user:pass@host:port
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
    Does NOT leave after 35 seconds - stays until stop_event is set.
    Uses harvested cookies + same proxy IP for authenticity.
    
    Behavior:
    1. Enter the site with real cookies
    2. Browse page, scroll, move mouse
    3. Click a link to another page
    4. Repeat until time is up
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
    
    # Build session
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
        stats["success"] += 1
        if stats["active_visitors"] > stats["peak_active"]:
            stats["peak_active"] = stats["active_visitors"]
    
    entered = False
    pages_visited = 0
    current_url = url
    
    try:
        # Initial page load with cookies
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
            # Verify we actually reached real content
            content = r.text
            if not _is_challenge_page(content):
                entered = True
                pages_visited += 1
                with lock:
                    stats["verified_visitors"] += 1
                    if stats["verified_visitors"] > stats.get("peak_verified", 0):
                        stats["peak_verified"] = stats["verified_visitors"]
                
                # Discover more pages from response
                new_pages = _extract_links(content, base_url)
                if new_pages:
                    pages = list(set(pages + new_pages))[:30]
            else:
                with lock:
                    stats["blocked_visitors"] += 1
                return
        else:
            with lock:
                stats["failed"] += 1
                stats["active_visitors"] -= 1
            return
        
        # ===== PERSISTENT BROWSING LOOP =====
        # Stay on the site, browsing like a real human until stop_event
        while not stop_event.is_set() and entered:
            # Simulate reading the current page (5-15 seconds)
            read_time = random.uniform(5, 15)
            for _ in range(int(read_time * 2)):
                if stop_event.is_set():
                    break
                time.sleep(0.5)
            
            if stop_event.is_set():
                break
            
            # Navigate to a random internal page
            if pages and len(pages) > 1:
                next_url = random.choice([p for p in pages if p != current_url] or pages)
            else:
                next_url = current_url
            
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
                    
                    # Discover new pages
                    new_pages = _extract_links(r.text, base_url)
                    if new_pages:
                        pages = list(set(pages + new_pages))[:30]
                    
                    with lock:
                        stats["success"] += 1
                else:
                    # Page failed, try another one next time
                    time.sleep(random.uniform(2, 5))
                    
            except Exception:
                time.sleep(random.uniform(3, 8))
        
    except Exception as e:
        with lock:
            stats["failed"] += 1
            err = str(e)[:50]
            stats.setdefault("error_reasons", {})
            stats["error_reasons"][err] = stats["error_reasons"].get(err, 0) + 1
    finally:
        # Visitor leaving
        with lock:
            stats["active_visitors"] -= 1
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
        # Deduplicate and filter
        links = list(set(links))
        links = [l for l in links if not any(ext in l for ext in 
                 ['.css', '.js', '.png', '.jpg', '.gif', '.svg', '.ico', 
                  '.pdf', '.zip', '.xml', '.json', 'logout', 'signout',
                  'wp-admin', 'wp-login', 'admin'])]
        return links[:20]
    except:
        return []


# ============ WAVE ENGINE FOR BROWSER MODE ============
def run_browser_wave(wave_num, site_info, stats, lock, stop_event, wave_size=20):
    """
    Launch a wave of persistent visitors using harvested cookies.
    Each visitor stays on the site until stop_event.
    Visitors accumulate across waves.
    """
    launched = 0
    waited = 0
    max_wait = 30  # Max seconds to wait for cookies
    
    while launched < wave_size and not stop_event.is_set():
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
            time.sleep(random.uniform(0.2, 0.8))  # Stagger entries
        else:
            # No cookies available, wait for harvester
            if waited >= max_wait:
                print(f"  ⚠️ Wave {wave_num+1}: Only launched {launched}/{wave_size} "
                      f"(cookie pool empty)", flush=True)
                break
            time.sleep(1)
            waited += 1
    
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
