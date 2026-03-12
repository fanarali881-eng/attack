"""
BROWSER ENGINE v3.0 - Real Playwright Browser Visitors (8GB RAM Optimized)
==========================================================================
Each visitor is a REAL Chrome browser that:
  1. Opens the site with Playwright (executes JavaScript = NexaFlow tracks it)
  2. Scrolls, moves mouse, clicks like a real human
  3. Navigates between pages
  4. Stays on site until time runs out

Architecture: Uses subprocess-based Playwright to avoid greenlet/threading issues.
Each visitor runs in its own process via multiprocessing.

Server Specs: 4 vCPU / 8GB RAM / 160GB Disk
Safe Limit: 20 concurrent browser visitors per server (8GB RAM)
Total: 9 servers x 20 = ~180 real browser visitors
"""

import threading
import multiprocessing
import time
import random
import json
import os
import re
import subprocess
import sys
from urllib.parse import urlparse, urljoin
from collections import deque


# ============ AUTO-INSTALL PATCHRIGHT ============
_patchright_checked = False

def ensure_patchright_installed():
    """Install patchright and chromium if not already installed. Only runs once."""
    global _patchright_checked
    if _patchright_checked:
        return
    _patchright_checked = True
    try:
        import patchright
        print("  \u2705 Patchright already installed", flush=True)
    except ImportError:
        print("  \U0001f4e6 Installing patchright (first time only)...", flush=True)
        try:
            subprocess.run([sys.executable, '-m', 'pip', 'install', 'patchright', '-q',
                           '--break-system-packages'], capture_output=True, timeout=120)
            subprocess.run([sys.executable, '-m', 'patchright', 'install', 'chromium'],
                           capture_output=True, timeout=300)
            print("  \u2705 Patchright installed successfully!", flush=True)
        except Exception as e:
            print(f"  \u274c Failed to install patchright: {e}", flush=True)
    # Ensure Xvfb is running
    try:
        result = subprocess.run(['pgrep', '-f', 'Xvfb :99'], capture_output=True)
        if result.returncode != 0:
            subprocess.Popen(
                ['Xvfb', ':99', '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            time.sleep(1)
            print("  \u2705 Xvfb started on :99", flush=True)
    except:
        pass
    if not os.environ.get('DISPLAY'):
        os.environ['DISPLAY'] = ':99'


# ============ SAFE LIMITS FOR 8GB RAM ============
MAX_BROWSER_VISITORS = 20          # Max concurrent real browsers per server
WAVE_SIZE_BROWSER = 5              # Visitors per wave (small, accumulate)
MEMORY_CHECK_INTERVAL = 30
MAX_MEMORY_PERCENT = 75
PAGE_READ_TIME_MIN = 15            # Min seconds on each page (longer = more realistic)
PAGE_READ_TIME_MAX = 45            # Max seconds on each page
MAX_PAGES_PER_VISIT = 30


# ============ COOKIE POOL (kept for compatibility but not primary) ============
class CookiePool:
    def __init__(self):
        self._pool = deque()
        self._lock = threading.Lock()
        self._stats = {"total_harvested": 0, "total_consumed": 0, "total_failed": 0, "active_harvesters": 0}
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
        with self._lock: return len(self._pool)
    def stats(self):
        with self._lock: return dict(self._stats)
    def inc_harvesters(self):
        with self._lock: self._stats["active_harvesters"] += 1
    def dec_harvesters(self):
        with self._lock: self._stats["active_harvesters"] = max(0, self._stats["active_harvesters"] - 1)
    def inc_failed(self):
        with self._lock: self._stats["total_failed"] += 1

cookie_pool = CookiePool()


# ============ MEMORY MONITOR ============
def get_memory_usage_percent():
    try:
        with open('/proc/meminfo', 'r') as f:
            lines = f.readlines()
        mem_total = int(lines[0].split()[1])
        mem_available = int(lines[2].split()[1])
        return int((1 - mem_available / mem_total) * 100)
    except:
        return 50

def is_memory_safe():
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
    "--js-flags=--max-old-space-size=64",
    "--disable-logging",
    "--disable-breakpad",
    "--single-process",
    "--disable-features=TranslateUI",
    "--disable-canvas-aa",
    "--disable-2d-canvas-clip-aa",
    "--disable-accelerated-2d-canvas",
]

VIEWPORTS = [
    {"width": 1920, "height": 1080},
    {"width": 1366, "height": 768},
    {"width": 1536, "height": 864},
    {"width": 1440, "height": 900},
    {"width": 1280, "height": 720},
    {"width": 1600, "height": 900},
]

CHROME_UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
]

SA_LOCALE = "ar-SA"
SA_TIMEZONE = "Asia/Riyadh"
SA_GEOLOCATION = {"latitude": 24.7136, "longitude": 46.6753}


# ============ VISITOR SUBPROCESS SCRIPT ============
VISITOR_SCRIPT = '''
import sys, time, random, json, os, re
from urllib.parse import urlparse, urljoin

target_url = sys.argv[1]
proxy_url = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "none" else None
stay_seconds = int(sys.argv[3]) if len(sys.argv) > 3 else 300
viewport_w = int(sys.argv[4]) if len(sys.argv) > 4 else 1920
viewport_h = int(sys.argv[5]) if len(sys.argv) > 5 else 1080
user_agent = sys.argv[6] if len(sys.argv) > 6 else "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

parsed = urlparse(target_url)
base_url = f"{parsed.scheme}://{parsed.netloc}"

STEALTH_ARGS = [
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-web-security", "--no-first-run", "--disable-infobars",
    "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-software-rasterizer", "--disable-extensions", "--no-sandbox",
    "--disable-setuid-sandbox", "--disable-popup-blocking", "--disable-sync",
    "--disable-translate", "--safebrowsing-disable-auto-update",
    "--js-flags=--max-old-space-size=64", "--disable-logging", "--single-process",
    "--disable-accelerated-2d-canvas",
]

CHALLENGE_INDICATORS = [
    "just a moment", "checking your browser", "checking if the site connection is secure",
    "enable javascript and cookies", "verify you are human", "cf-challenge-running",
    "challenge-platform", "managed-challenge", "_cf_chl_opt", "cf-turnstile",
    "please wait while we verify", "access denied", "attention required",
]

def is_challenge(html):
    if not html: return True
    h = html.lower()
    return sum(1 for ind in CHALLENGE_INDICATORS if ind in h) >= 2

def get_links(page):
    try:
        return page.evaluate("""(baseUrl) => {
            const links = [];
            document.querySelectorAll('a[href]').forEach(a => {
                const href = a.href;
                if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && 
                    !href.includes('#') && href.startsWith(baseUrl) &&
                    !href.match(/\\\\.(css|js|png|jpg|gif|svg|ico|pdf|zip|xml|json)$/i) &&
                    !href.match(/(logout|signout|wp-admin|admin|cart|checkout|login)/i)) {
                    links.push(href);
                }
            });
            return [...new Set(links)].slice(0, 20);
        }""", base_url)
    except: return []

def human_scroll(page):
    try:
        total_h = page.evaluate("document.body.scrollHeight")
        vh = viewport_h
        current = 0
        target = total_h * random.uniform(0.5, 0.8)
        while current < target:
            if random.random() < 0.3:
                amt = random.randint(200, 500)
                time.sleep(random.uniform(0.1, 0.3))
            else:
                amt = random.randint(80, 200)
                time.sleep(random.uniform(0.3, 1.2))
            current += amt
            page.evaluate(f"window.scrollBy(0, {amt})")
            if random.random() < 0.2:
                time.sleep(random.uniform(1.0, 3.0))
            if random.random() < 0.08:
                back = random.randint(50, 150)
                page.evaluate(f"window.scrollBy(0, -{back})")
                time.sleep(random.uniform(0.3, 1.0))
    except: pass

def human_mouse(page):
    try:
        x = random.randint(200, viewport_w - 200)
        y = random.randint(100, viewport_h // 2)
        page.mouse.move(x, y, steps=random.randint(3, 8))
        for _ in range(random.randint(2, 5)):
            nx = max(50, min(viewport_w - 50, x + random.randint(-250, 250)))
            ny = max(50, min(viewport_h - 50, y + random.randint(-150, 150)))
            page.mouse.move(nx, ny, steps=random.randint(5, 15))
            time.sleep(random.uniform(0.2, 0.6))
            x, y = nx, ny
    except: pass

try:
    from playwright.sync_api import sync_playwright
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=STEALTH_ARGS)
        
        proxy_config = None
        if proxy_url:
            from urllib.parse import urlparse as _up
            pp = _up(proxy_url)
            proxy_config = {"server": f"{pp.scheme}://{pp.hostname}:{pp.port}"}
            if pp.username: proxy_config["username"] = pp.username
            if pp.password: proxy_config["password"] = pp.password
        
        ctx_opts = {
            "viewport": {"width": viewport_w, "height": viewport_h},
            "user_agent": user_agent,
            "locale": "ar-SA",
            "timezone_id": "Asia/Riyadh",
            "geolocation": {"latitude": 24.7136, "longitude": 46.6753},
            "permissions": ["geolocation"],
            "color_scheme": "light",
            "java_script_enabled": True,
            "bypass_csp": True,
            "ignore_https_errors": True,
        }
        if proxy_config:
            ctx_opts["proxy"] = proxy_config
        
        context = browser.new_context(**ctx_opts)
        
        # Anti-detection
        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => false});
            Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
            Object.defineProperty(navigator, 'languages', {get: () => ['ar-SA', 'ar', 'en-US', 'en']});
            Object.defineProperty(navigator, 'platform', {get: () => 'Win32'});
            window.chrome = {runtime: {}, loadTimes: function(){}, csi: function(){}};
            const oq = window.navigator.permissions.query;
            window.navigator.permissions.query = (p) => (
                p.name === 'notifications' ? Promise.resolve({state: Notification.permission}) : oq(p)
            );
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
        """)
        
        page = context.new_page()
        
        # Navigate
        response = page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
        
        if not response:
            print("FAIL:no_response")
            sys.exit(1)
        
        # Wait for challenge (JS challenge auto-solves in ~5s)
        for _ in range(15):
            content = page.content()
            if not is_challenge(content):
                break
            time.sleep(1)
        
        content = page.content()
        if is_challenge(content):
            # Check if this is a Cloudflare phishing warning page (has Turnstile + bypass button)
            is_phishing = 'phish-bypass' in content.lower() or 'suspected phishing' in content.lower() or 'reported for potential phishing' in content.lower()
            
            if is_phishing:
                print("PHISHING:detected_trying_bypass", flush=True)
                # Use turnstile_solver to bypass phishing page
                try:
                    sys.path.insert(0, '/root')
                    from turnstile_solver import bypass_phishing_in_browser
                    success = bypass_phishing_in_browser(page, target_url)
                    if success:
                        time.sleep(3)
                        content = page.content()
                        if not is_challenge(content):
                            print("PHISHING:bypassed_successfully", flush=True)
                        else:
                            print("FAIL:phishing_bypass_failed")
                            browser.close()
                            sys.exit(1)
                    else:
                        print("FAIL:phishing_bypass_returned_false")
                        browser.close()
                        sys.exit(1)
                except Exception as e:
                    print("FAIL:phishing_bypass_error:" + str(e)[:100])
                    browser.close()
                    sys.exit(1)
            else:
                print("FAIL:challenge_stuck")
                browser.close()
                sys.exit(1)
        
        # Wait for full page load (JavaScript execution including NexaFlow)
        time.sleep(random.uniform(3, 6))
        
        # SUCCESS - visitor is IN the site with JS running
        print("OK:entered", flush=True)
        
        start_time = time.time()
        interaction_count = 0
        error_count = 0
        
        # STAY on this page - scroll + mouse only (no page navigation!)
        # This keeps NexaFlow session alive and visitor counted
        while time.time() - start_time < stay_seconds:
            try:
                # Check if page is still alive
                try:
                    page.evaluate("1+1")
                except:
                    # Page crashed or disconnected - try to reload
                    error_count += 1
                    if error_count > 5:
                        break
                    try:
                        page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
                        time.sleep(random.uniform(3, 6))
                    except:
                        time.sleep(5)
                        continue
                
                # Scroll down slowly like reading
                human_scroll(page)
                interaction_count += 1
                
                # Wait like reading content (10-30 seconds)
                read_time = random.uniform(10, 30)
                waited = 0
                while waited < read_time and time.time() - start_time < stay_seconds:
                    time.sleep(1)
                    waited += 1
                
                if time.time() - start_time >= stay_seconds:
                    break
                
                # Move mouse around like a real user
                human_mouse(page)
                interaction_count += 1
                
                # Scroll back up sometimes
                if random.random() < 0.3:
                    try:
                        page.evaluate("window.scrollTo(0, 0)")
                        time.sleep(random.uniform(1, 3))
                    except: pass
                
                # Small random wait between interactions
                pause = random.uniform(3, 10)
                waited = 0
                while waited < pause and time.time() - start_time < stay_seconds:
                    time.sleep(1)
                    waited += 1
                
                # Every 60s print heartbeat so parent knows we're alive
                elapsed = int(time.time() - start_time)
                if elapsed > 0 and elapsed % 60 < 5:
                    print(f"ALIVE:{elapsed}s:interactions_{interaction_count}", flush=True)
                
                error_count = 0  # Reset on success
                
            except Exception as e:
                error_count += 1
                if error_count > 5:
                    break
                # Try to reload page and continue
                try:
                    page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
                    time.sleep(random.uniform(3, 6))
                except:
                    time.sleep(random.uniform(2, 5))
        
        stayed = int(time.time() - start_time)
        print(f"DONE:stayed_{stayed}s_interactions_{interaction_count}", flush=True)
        
        try: context.close()
        except: pass
        try: browser.close()
        except: pass

except Exception as e:
    print(f"FAIL:{str(e)[:100]}", flush=True)
    sys.exit(1)
'''


# ============ REAL BROWSER VISITOR (runs as subprocess) ============
def real_browser_visitor(target_url, proxy_url, stay_seconds, vid, stats, lock, stop_event):
    """
    Launch a real Playwright browser as a subprocess.
    The visitor stays on the site executing JavaScript until stop_event or stay_seconds.
    """
    viewport = random.choice(VIEWPORTS)
    ua = random.choice(CHROME_UAS)
    
    # Write visitor script to temp file
    script_path = f"/tmp/visitor_{vid}_{os.getpid()}.py"
    try:
        with open(script_path, 'w') as f:
            f.write(VISITOR_SCRIPT)
        
        cmd = [
            sys.executable, script_path,
            target_url,
            proxy_url or "none",
            str(stay_seconds),
            str(viewport["width"]),
            str(viewport["height"]),
            ua,
        ]
        
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        
        entered = False
        
        # Monitor the subprocess
        while proc.poll() is None:
            if stop_event.is_set():
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except:
                    proc.kill()
                break
            
            # Read output line by line (non-blocking)
            try:
                import select
                if select.select([proc.stdout], [], [], 1.0)[0]:
                    line = proc.stdout.readline().strip()
                    if line:
                        if line.startswith("OK:entered"):
                            entered = True
                            with lock:
                                stats["success"] += 1
                                stats["active_visitors"] += 1
                                stats["verified_visitors"] += 1
                                if stats["active_visitors"] > stats["peak_active"]:
                                    stats["peak_active"] = stats["active_visitors"]
                                if stats["verified_visitors"] > stats.get("peak_verified", 0):
                                    stats["peak_verified"] = stats["verified_visitors"]
                        elif line.startswith("PAGE:"):
                            with lock:
                                stats["success"] += 1
                        elif line.startswith("FAIL:"):
                            if not entered:
                                reason = line[5:]
                                with lock:
                                    stats["failed"] += 1
                                    stats.setdefault("error_reasons", {})
                                    key = f"browser_{reason[:40]}"
                                    stats["error_reasons"][key] = stats["error_reasons"].get(key, 0) + 1
                else:
                    time.sleep(0.5)
            except:
                time.sleep(1)
        
        # Process ended
        if not entered:
            # Read remaining output
            try:
                remaining = proc.stdout.read()
                if remaining:
                    for line in remaining.strip().split('\n'):
                        if line.startswith("OK:entered"):
                            entered = True
                            with lock:
                                stats["success"] += 1
                                stats["active_visitors"] += 1
                                stats["verified_visitors"] += 1
                                if stats["active_visitors"] > stats["peak_active"]:
                                    stats["peak_active"] = stats["active_visitors"]
                                if stats["verified_visitors"] > stats.get("peak_verified", 0):
                                    stats["peak_verified"] = stats["verified_visitors"]
                        elif line.startswith("FAIL:"):
                            reason = line[5:]
                            with lock:
                                stats["failed"] += 1
                                stats.setdefault("error_reasons", {})
                                key = f"browser_{reason[:40]}"
                                stats["error_reasons"][key] = stats["error_reasons"].get(key, 0) + 1
            except:
                pass
            
            if not entered:
                with lock:
                    stats["failed"] += 1
        
    except Exception as e:
        with lock:
            stats["failed"] += 1
            stats.setdefault("error_reasons", {})
            key = f"browser_launch_{str(e)[:30]}"
            stats["error_reasons"][key] = stats["error_reasons"].get(key, 0) + 1
    finally:
        if entered:
            with lock:
                stats["active_visitors"] = max(0, stats["active_visitors"] - 1)
                stats["verified_visitors"] = max(0, stats["verified_visitors"] - 1)
        try:
            os.remove(script_path)
        except:
            pass


# ============ WAVE ENGINE FOR BROWSER MODE ============
def run_browser_wave(wave_num, site_info, stats, lock, stop_event, wave_size=WAVE_SIZE_BROWSER):
    """
    Launch a wave of real browser visitors.
    Each visitor is a separate subprocess running Playwright.
    Visitors accumulate across waves and stay until time runs out.
    """
    # Ensure patchright is installed before launching browser visitors
    ensure_patchright_installed()
    
    target_url = site_info.get("target_url", site_info.get("url", ""))
    
    # Get proxy URL
    proxy_user = os.environ.get('PROXY_USER', '')
    proxy_pass = os.environ.get('PROXY_PASS', '')
    proxy_host = os.environ.get('PROXY_HOST', 'proxy.packetstream.io')
    proxy_port = os.environ.get('PROXY_PORT', '31112')
    
    if proxy_user:
        proxy_url = f"http://{proxy_user}:{proxy_pass}@{proxy_host}:{proxy_port}"
    else:
        proxy_url = None
    
    # Calculate remaining time - visitors should stay until attack ends
    duration_min = int(os.environ.get('DURATION_MIN', '5'))
    attack_start = float(os.environ.get('ATTACK_START_TIME', str(time.time())))
    elapsed = time.time() - attack_start
    remaining = (duration_min * 60) - elapsed
    stay_seconds = max(int(remaining), 60)  # At least 60s stay
    
    # Check current active count
    with lock:
        current_active = stats.get("active_visitors", 0)
    
    # Don't exceed max
    available_slots = MAX_BROWSER_VISITORS - current_active
    actual_wave = min(wave_size, available_slots)
    
    if actual_wave <= 0:
        print(f"  \u26a0\ufe0f Wave {wave_num+1}: Max browsers reached ({current_active}/{MAX_BROWSER_VISITORS})", flush=True)
        return 0
    
    if not is_memory_safe():
        print(f"  \u26a0\ufe0f Wave {wave_num+1}: RAM at {get_memory_usage_percent()}%, skipping", flush=True)
        return 0
    
    launched = 0
    for i in range(actual_wave):
        if stop_event.is_set():
            break
        if not is_memory_safe():
            break
        
        vid = wave_num * wave_size + i
        t = threading.Thread(
            target=real_browser_visitor,
            args=(target_url, proxy_url, stay_seconds, vid, stats, lock, stop_event),
            daemon=True
        )
        t.start()
        launched += 1
        time.sleep(random.uniform(2, 5))  # Stagger browser launches (heavy)
    
    if launched > 0:
        mem = get_memory_usage_percent()
        print(f"  \u2705 Wave {wave_num+1}: {launched} real browsers launched! "
              f"RAM: {mem}% | Active: {current_active + launched}/{MAX_BROWSER_VISITORS}", flush=True)
    
    return launched


# ============ COOKIE HARVESTER (compatibility - now uses subprocess too) ============
def start_harvester(target_url, proxy_url_func, stop_event, num_contexts=5):
    """
    Start cookie harvester. In v3, this pre-warms a few cookies for fallback.
    Main visitors use real browsers directly (not cookies).
    """
    def _harvester():
        proxy_url = proxy_url_func()
        if not proxy_url:
            return
        
        # Just add a dummy cookie set so the pool isn't empty
        # Real visitors use subprocess Playwright directly
        cookie_pool.add({
            "cookies": {"_dummy": "1"},
            "proxy": proxy_url,
            "user_agent": random.choice(CHROME_UAS),
            "viewport": random.choice(VIEWPORTS),
            "timestamp": time.time(),
            "pages": [target_url],
            "base_url": f"{urlparse(target_url).scheme}://{urlparse(target_url).netloc}",
        })
        print(f"  \U0001f35e Cookie pool seeded (v3: visitors use real browsers)", flush=True)
    
    t = threading.Thread(target=_harvester, daemon=True)
    t.start()
    return t


# ============ INSTALL HELPER ============
def install_playwright():
    """Install Playwright and Chromium browser."""
    print("\U0001f4e6 Installing Playwright...", flush=True)
    os.system("pip3 install playwright -q 2>/dev/null")
    os.system("pip3 install playwright --break-system-packages -q 2>/dev/null")
    os.system("playwright install chromium --with-deps 2>/dev/null")
    print("\u2705 Playwright installed!", flush=True)


def is_playwright_available():
    """Check if Playwright is installed and ready."""
    try:
        from playwright.sync_api import sync_playwright
        return True
    except ImportError:
        return False


# ============ PERSISTENT VISITOR (compatibility wrapper) ============
def persistent_visitor(cookie_set, site_info, vid, stats, lock, stop_event):
    """Compatibility wrapper - redirects to real_browser_visitor."""
    target_url = site_info.get("target_url", site_info.get("url", ""))
    proxy_url = cookie_set.get("proxy")
    duration_min = int(os.environ.get('DURATION_MIN', '5'))
    stay_seconds = duration_min * 60
    real_browser_visitor(target_url, proxy_url, stay_seconds, vid, stats, lock, stop_event)
