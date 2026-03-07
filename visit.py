#!/usr/bin/env python3
"""
TURBO v9 - WAVE MODE
=================================
New in v9:
  - Wave system: 60 visitors enter, stay 30 seconds, then next wave
  - Input: duration in minutes (not visit count)
  - 120 visits per minute (60 visitors × 2 waves per minute)
  - Always 60 active visitors on site
  - Visitors stay 30 seconds (appear as real active users)
  - Auto-calculates total visits from duration
"""
import requests as req_lib
import threading
import time
import random
import string
import sys
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

# ============ CONFIG ============
FLARE_PORTS = [8191, 8192, 8193, 8194, 8195, 8196, 8197]
PROXY_USER = os.environ.get("PROXY_USER", "fanar")
PROXY_PASS = os.environ.get("PROXY_PASS", "j7HGTQiRnys66RIM")
PROXY_HOST = os.environ.get("PROXY_HOST", "proxy.packetstream.io")
PROXY_PORT = os.environ.get("PROXY_PORT", "31112")
PROXY_COUNTRY = "SaudiArabia"

WAVE_SIZE = 150             # visitors per wave
WAVE_INTERVAL = 30          # seconds between waves (= stay time)
VISITS_PER_MINUTE = 300     # 150 visitors × 2 waves/min
STAY_TIME = 30              # seconds each visitor stays on page

HARVEST_TIMEOUT = 95
HARVEST_MAX_TIMEOUT = 90000
HARVEST_RETRIES = 3
PAGE_TIMEOUT = 12
STATUS_FILE = "/root/visit_status.json"

PAGES = ["/", "/about", "/contact", "/menu", "/gallery",
         "/", "/?ref=g", "/?ref=ig", "/?ref=tw", "/?ref=fb",
         "/about", "/contact", "/", "/menu", "/gallery",
         "/?ref=tt", "/?ref=sc", "/", "/about", "/",
         "/gallery", "/menu", "/contact", "/?ref=d", "/",
         "/?utm_source=google", "/?utm_source=social", "/?utm_medium=cpc",
         "/about", "/", "/contact", "/gallery", "/menu",
         "/?ref=email", "/", "/about", "/", "/gallery",
         "/menu", "/contact", "/"]

REFERRERS = [
    "https://www.google.com/", "https://www.google.com.sa/",
    "https://www.google.com/search?q=%D9%85%D9%83%D8%A7%D9%86+%D8%B3%D9%84%D8%A7%D9%85%D8%A9",
    "https://www.instagram.com/", "https://twitter.com/",
    "https://www.facebook.com/", "https://www.tiktok.com/",
    "https://www.snapchat.com/", "", "",
]

# ============ STATS ============
stats = {"success": 0, "failed": 0, "start_time": 0, "target": 0,
         "ips": set(), "cookies_ok": 0, "cookies_fail": 0, "mode": "",
         "active_visitors": 0, "waves_done": 0, "total_waves": 0,
         "duration_min": 0}
lock = threading.Lock()
stop_event = threading.Event()

def write_status():
    try:
        e = time.time() - stats["start_time"] if stats["start_time"] else 0
        r = stats["success"] / e * 60 if e > 0 else 0
        p = min((stats["success"] / stats["target"] * 100) if stats["target"] > 0 else 0, 100)
        with open(STATUS_FILE, "w") as f:
            json.dump({
                "status": "finished" if stats["waves_done"] >= stats["total_waves"] else "running",
                "visits": stats["success"], "errors": stats["failed"],
                "target": stats["target"], "progress": round(p, 1),
                "elapsed": round(e, 1), "rate": round(r, 1),
                "remaining": max(0, stats["target"] - stats["success"]),
                "timestamp": int(time.time()), "mode": stats["mode"],
                "unique_ips": len(stats["ips"]),
                "cookies": f"{stats['cookies_ok']}/{stats['cookies_ok']+stats['cookies_fail']}",
                "active_visitors": stats["active_visitors"],
                "waves_done": stats["waves_done"],
                "total_waves": stats["total_waves"],
                "duration_min": stats["duration_min"],
            }, f)
    except:
        pass

def log_progress():
    with lock:
        total = stats["success"] + stats["failed"]
        if total % 20 == 0 or total <= 10 or stats["waves_done"] >= stats["total_waves"]:
            e = time.time() - stats["start_time"]
            r = stats["success"] / e * 60 if e > 0 else 0
            write_status()
            print(f"  [Wave {stats['waves_done']}/{stats['total_waves']}] ✅{stats['success']} ❌{stats['failed']} | "
                  f"{r:.0f}/min | 👥{stats['active_visitors']} active | 🌍{len(stats['ips'])}", flush=True)

def add_ok(sid=None):
    with lock:
        stats["success"] += 1
        if sid: stats["ips"].add(sid)
    log_progress()

def add_fail():
    with lock:
        stats["failed"] += 1
    log_progress()

# ============ DETECTION ============
def detect(url):
    print("🔍 Detecting...", flush=True)
    import urllib3; urllib3.disable_warnings()
    try:
        r = req_lib.get(url, headers={"User-Agent": "Mozilla/5.0 Chrome/122"}, timeout=8, verify=False)
        h = {k.lower(): v.lower() for k, v in r.headers.items()}
        b = r.text[:3000].lower()
        cf = "cf-ray" in h or "cloudflare" in h.get("server", "")
        ch = any(x in b for x in ["just a moment", "challenge-platform", "turnstile"]) or r.status_code in [403, 503]
        if cf and ch:
            print(f"🔴 CF+Challenge ({r.status_code})", flush=True)
            return True
        print(f"✅ No challenge ({r.status_code})", flush=True)
        return False
    except:
        print("⚠️ Assuming CF", flush=True)
        return True

# ============ FLARESOLVERR ============
def ensure_flare():
    print(f"🔧 Checking {len(FLARE_PORTS)} instances...", flush=True)
    ok = 0
    for port in FLARE_PORTS:
        try:
            r = req_lib.get(f"http://localhost:{port}/", timeout=4)
            if "FlareSolverr" in r.text: ok += 1; continue
        except: pass
        name = "flaresolverr" if port == 8191 else f"flaresolverr{port-8190}"
        os.system(f"docker start {name} 2>/dev/null || docker run -d --name {name} -p {port}:8191 "
                  f"-e LOG_LEVEL=info --memory=512m --restart unless-stopped "
                  f"ghcr.io/flaresolverr/flaresolverr:latest 2>/dev/null")
        for _ in range(12):
            time.sleep(2)
            try:
                r = req_lib.get(f"http://localhost:{port}/", timeout=3)
                if "FlareSolverr" in r.text: ok += 1; break
            except: pass
    print(f"  ✅ {ok}/{len(FLARE_PORTS)} ready", flush=True)
    return ok > 0

def harvest(url, port):
    """Harvest one CF cookie with retries."""
    for attempt in range(HARVEST_RETRIES):
        if stop_event.is_set(): return None
        sid = "".join(random.choices(string.ascii_lowercase + string.digits, k=10))
        data = {
            "cmd": "request.get", "url": url, "maxTimeout": HARVEST_MAX_TIMEOUT,
            "proxy": {
                "url": f"http://{PROXY_HOST}:{PROXY_PORT}",
                "username": PROXY_USER,
                "password": f"{PROXY_PASS}_country-{PROXY_COUNTRY}_session-{sid}"
            },
        }
        try:
            r = req_lib.post(f"http://localhost:{port}/v1", json=data, timeout=HARVEST_TIMEOUT)
            d = r.json()
            sol = d.get("solution", {})
            html = sol.get("response", "")
            cl = sol.get("cookies", [])
            ua = sol.get("userAgent", "")
            if d.get("status") == "ok" and len(html) > 1000 and "ERR_" not in html[:500]:
                return {"cookies": {c["name"]: c["value"] for c in cl}, "ua": ua, "sid": sid}
        except:
            pass
    return None

# ============ VISITOR (stays on page) ============
def visitor_session(url, ck, visitor_id):
    """Single visitor: opens page, stays STAY_TIME seconds, then leaves."""
    page = PAGES[visitor_id % len(PAGES)]
    full = url.rstrip("/") + page
    ref = random.choice(REFERRERS)
    proxy = f"http://{PROXY_USER}:{PROXY_PASS}_country-{PROXY_COUNTRY}_session-{ck['sid']}@{PROXY_HOST}:{PROXY_PORT}"
    hdrs = {
        "User-Agent": ck["ua"],
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site" if ref else "none",
        "Sec-Fetch-User": "?1",
        "Cookie": "; ".join([f"{k}={v}" for k, v in ck["cookies"].items()]),
    }
    if ref: hdrs["Referer"] = ref
    
    try:
        from curl_cffi import requests as cr
        # Open the page
        r = cr.get(full, headers=hdrs, proxy=proxy, timeout=PAGE_TIMEOUT,
                  allow_redirects=True, verify=False, impersonate="chrome120")
        if r.status_code == 200 and len(r.text) > 1000 and "just a moment" not in r.text[:500].lower():
            add_ok(ck["sid"])
            with lock:
                stats["active_visitors"] += 1
            
            # Stay on page for STAY_TIME seconds (simulate real browsing)
            stay = STAY_TIME + random.randint(-5, 5)  # 25-35 seconds randomly
            time.sleep(max(stay, 10))
            
            with lock:
                stats["active_visitors"] -= 1
            return True
        else:
            add_fail()
            return False
    except:
        add_fail()
        return False

def visitor_session_direct(url, visitor_id):
    """Direct visitor (no CF): opens page, stays STAY_TIME seconds."""
    sid = "".join(random.choices(string.ascii_lowercase + string.digits, k=10))
    px = f"http://{PROXY_USER}:{PROXY_PASS}_country-{PROXY_COUNTRY}_session-{sid}@{PROXY_HOST}:{PROXY_PORT}"
    page = PAGES[visitor_id % len(PAGES)]
    ref = random.choice(REFERRERS)
    hdrs = {
        "User-Agent": f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/{random.randint(118,124)}.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
    }
    if ref: hdrs["Referer"] = ref
    
    try:
        import urllib3; urllib3.disable_warnings()
        r = req_lib.get(url.rstrip("/")+page, headers=hdrs,
                       proxies={"http": px, "https": px}, timeout=12, verify=False)
        if r.status_code == 200 and len(r.text) > 500:
            add_ok(sid)
            with lock:
                stats["active_visitors"] += 1
            
            stay = STAY_TIME + random.randint(-5, 5)
            time.sleep(max(stay, 10))
            
            with lock:
                stats["active_visitors"] -= 1
            return True
        else:
            add_fail()
            return False
    except:
        add_fail()
        return False

# ============ WAVE SYSTEM ============
def run_wave_cf(url, wave_num, cookies_pool):
    """Run one wave of WAVE_SIZE visitors using CF cookies."""
    print(f"\n🌊 Wave {wave_num + 1}/{stats['total_waves']} - Sending {WAVE_SIZE} visitors...", flush=True)
    
    threads = []
    for i in range(WAVE_SIZE):
        if stop_event.is_set(): break
        # Pick a cookie from pool (round-robin)
        ck = cookies_pool[i % len(cookies_pool)] if cookies_pool else None
        if not ck: continue
        
        vid = wave_num * WAVE_SIZE + i
        t = threading.Thread(target=visitor_session, args=(url, ck, vid))
        t.start()
        threads.append(t)
        # Small stagger to avoid all hitting at exact same time
        time.sleep(0.1)
    
    # Don't wait for threads to finish - they'll stay for STAY_TIME
    # Return immediately so next wave can be scheduled
    with lock:
        stats["waves_done"] += 1
    write_status()
    return threads

def run_wave_direct(url, wave_num):
    """Run one wave of WAVE_SIZE visitors without CF."""
    print(f"\n🌊 Wave {wave_num + 1}/{stats['total_waves']} - Sending {WAVE_SIZE} visitors...", flush=True)
    
    threads = []
    for i in range(WAVE_SIZE):
        if stop_event.is_set(): break
        vid = wave_num * WAVE_SIZE + i
        t = threading.Thread(target=visitor_session_direct, args=(url, vid))
        t.start()
        threads.append(t)
        time.sleep(0.05)
    
    with lock:
        stats["waves_done"] += 1
    write_status()
    return threads

# ============ COOKIE HARVESTER ============
def harvest_cookies(url, count):
    """Pre-harvest cookies for wave system."""
    print(f"\n🍪 Harvesting {count} cookies...", flush=True)
    cookies = []
    n_inst = len(FLARE_PORTS)
    
    with ThreadPoolExecutor(max_workers=n_inst) as ex:
        futs = []
        for i in range(count + 5):  # extra buffer
            port = FLARE_PORTS[i % n_inst]
            futs.append(ex.submit(harvest, url, port))
            time.sleep(0.2)
        
        for f in as_completed(futs):
            try:
                ck = f.result(timeout=120)
                if ck:
                    cookies.append(ck)
                    with lock:
                        stats["cookies_ok"] += 1
                    print(f"  🍪 {len(cookies)}/{count} cookies harvested", flush=True)
                else:
                    with lock:
                        stats["cookies_fail"] += 1
            except:
                with lock:
                    stats["cookies_fail"] += 1
            
            if len(cookies) >= count:
                break
    
    print(f"  ✅ {len(cookies)} cookies ready", flush=True)
    return cookies

# ============ MAIN ============
def run(url, duration_min):
    total_waves = duration_min * 2  # 2 waves per minute (every 30 sec)
    total_visits = total_waves * WAVE_SIZE  # estimated total
    
    print(f"\n{'='*60}", flush=True)
    print(f"🚀 TURBO v9 - WAVE MODE", flush=True)
    print(f"Target: {url}", flush=True)
    print(f"Duration: {duration_min} minutes", flush=True)
    print(f"Waves: {total_waves} (every {WAVE_INTERVAL}s)", flush=True)
    print(f"Visitors per wave: {WAVE_SIZE}", flush=True)
    print(f"Expected visits: {total_visits}", flush=True)
    print(f"Active visitors: ~{WAVE_SIZE} at all times", flush=True)
    print(f"{'='*60}\n", flush=True)
    
    is_cf = detect(url)
    
    stats["start_time"] = time.time()
    stats["target"] = total_visits
    stats["success"] = 0; stats["failed"] = 0
    stats["ips"] = set(); stats["cookies_ok"] = 0; stats["cookies_fail"] = 0
    stats["active_visitors"] = 0; stats["waves_done"] = 0
    stats["total_waves"] = total_waves; stats["duration_min"] = duration_min
    
    if is_cf:
        stats["mode"] = "wave_cf"
        if not ensure_flare(): print("❌ No FlareSolverr!", flush=True); return
        
        # Pre-harvest cookies (need enough for all waves)
        # Each cookie can be reused across waves
        cookies_needed = min(WAVE_SIZE, 30)  # 30 unique cookies, reused across visitors
        cookies = harvest_cookies(url, cookies_needed)
        
        if not cookies:
            print("❌ No cookies harvested!", flush=True)
            return
        
        write_status()
        
        # Run waves
        all_threads = []
        for wave in range(total_waves):
            if stop_event.is_set(): break
            
            wave_threads = run_wave_cf(url, wave, cookies)
            all_threads.extend(wave_threads)
            
            # Wait WAVE_INTERVAL before next wave
            # (previous wave visitors are still on the page)
            if wave < total_waves - 1:
                print(f"  ⏳ Next wave in {WAVE_INTERVAL}s... (👥 {stats['active_visitors']} active)", flush=True)
                for _ in range(WAVE_INTERVAL):
                    if stop_event.is_set(): break
                    time.sleep(1)
            
            # Refresh cookies periodically (every 5 waves)
            if (wave + 1) % 5 == 0 and wave < total_waves - 1:
                print("  🔄 Refreshing cookies...", flush=True)
                new_cookies = harvest_cookies(url, min(10, cookies_needed))
                if new_cookies:
                    cookies = new_cookies + cookies[:cookies_needed - len(new_cookies)]
        
        # Wait for last wave visitors to finish
        print("\n⏳ Waiting for last visitors to leave...", flush=True)
        for t in all_threads[-WAVE_SIZE:]:
            t.join(timeout=STAY_TIME + 10)
    
    else:
        stats["mode"] = "wave_fast"
        write_status()
        
        all_threads = []
        for wave in range(total_waves):
            if stop_event.is_set(): break
            
            wave_threads = run_wave_direct(url, wave)
            all_threads.extend(wave_threads)
            
            if wave < total_waves - 1:
                print(f"  ⏳ Next wave in {WAVE_INTERVAL}s... (👥 {stats['active_visitors']} active)", flush=True)
                for _ in range(WAVE_INTERVAL):
                    if stop_event.is_set(): break
                    time.sleep(1)
        
        print("\n⏳ Waiting for last visitors to leave...", flush=True)
        for t in all_threads[-WAVE_SIZE:]:
            t.join(timeout=STAY_TIME + 10)
    
    write_status()
    t = time.time() - stats["start_time"]
    print(f"\n{'='*60}", flush=True)
    print(f"🏁 DONE! ✅{stats['success']}/{total_visits} ❌{stats['failed']}", flush=True)
    if t > 0:
        print(f"⏱️ {t:.0f}s ({int(t//60)}m{int(t%60)}s) | 🚀{stats['success']/t*60:.0f}/min", flush=True)
    print(f"🌊 Waves: {stats['waves_done']}/{total_waves}", flush=True)
    print(f"🌍 {len(stats['ips'])} IPs | 🍪 {stats['cookies_ok']}/{stats['cookies_ok']+stats['cookies_fail']}", flush=True)
    print(f"{'='*60}", flush=True)

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "https://makansalameh.com/"
    duration = int(sys.argv[2]) if len(sys.argv) > 2 else 5  # default 5 minutes
    run(url, duration)
