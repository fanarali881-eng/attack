#!/usr/bin/env python3
"""
TURBO v8 - Faster + Less Errors
=================================
Fixes from v7:
  - maxTimeout 60s→90s (some proxies need more time to solve challenge)
  - 3 harvest retries (different session each time) instead of 2
  - PAGES_PER_COOKIE 25→40 (less harvesting = faster overall)
  - PARALLEL_PAGES 3→5 (more concurrent pageviews per cookie)
  - Smarter error handling: skip dead cookies faster
  - Better status reporting (elapsed as minutes:seconds)
  - Continuous cookie supply: don't wait, keep feeding instances
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
PROXY_USER = "fanar"
PROXY_PASS = "j7HGTQiRnys66RIM"
PROXY_HOST = "proxy.packetstream.io"
PROXY_PORT = "31112"
PROXY_COUNTRY = "SaudiArabia"

DEFAULT_TOTAL = 556
PAGES_PER_COOKIE = 40       # more pages = less harvesting overhead
PARALLEL_PAGES = 5           # concurrent pageviews per cookie
HARVEST_TIMEOUT = 95         # seconds (90s maxTimeout + 5s buffer)
HARVEST_MAX_TIMEOUT = 90000  # ms for FlareSolverr
HARVEST_RETRIES = 3          # retry harvest with new session
PAGE_TIMEOUT = 12            # seconds per pageview
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
         "ips": set(), "cookies_ok": 0, "cookies_fail": 0, "mode": ""}
lock = threading.Lock()
target_done = threading.Event()

def write_status():
    try:
        e = time.time() - stats["start_time"] if stats["start_time"] else 0
        r = stats["success"] / e * 60 if e > 0 else 0
        p = min((stats["success"] / stats["target"] * 100) if stats["target"] > 0 else 0, 100)
        mins = int(e // 60)
        secs = int(e % 60)
        with open(STATUS_FILE, "w") as f:
            json.dump({
                "status": "finished" if stats["success"] >= stats["target"] else "running",
                "visits": stats["success"], "errors": stats["failed"],
                "target": stats["target"], "progress": round(p, 1),
                "elapsed": round(e, 1), "rate": round(r, 1),
                "remaining": max(0, stats["target"] - stats["success"]),
                "timestamp": int(time.time()), "mode": stats["mode"],
                "unique_ips": len(stats["ips"]),
                "cookies": f"{stats['cookies_ok']}/{stats['cookies_ok']+stats['cookies_fail']}",
            }, f)
    except:
        pass

def log_progress():
    with lock:
        total = stats["success"] + stats["failed"]
        if total % 25 == 0 or total <= 10 or stats["success"] >= stats["target"]:
            e = time.time() - stats["start_time"]
            r = stats["success"] / e * 60 if e > 0 else 0
            write_status()
            print(f"  [{total}] ✅{stats['success']} ❌{stats['failed']} | "
                  f"{r:.0f}/min | 🌍{len(stats['ips'])} | 🍪{stats['cookies_ok']}", flush=True)

def add_ok(sid=None):
    with lock:
        stats["success"] += 1
        if sid: stats["ips"].add(sid)
        if stats["success"] >= stats["target"]:
            target_done.set()
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
    """Harvest one CF cookie with retries. Returns dict or None."""
    for attempt in range(HARVEST_RETRIES):
        if target_done.is_set(): return None
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

# ============ FAST PAGEVIEW ============
def pageview(url, ck, idx):
    """Single fast pageview. Returns True/False."""
    page = PAGES[idx % len(PAGES)]
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
        r = cr.get(full, headers=hdrs, proxy=proxy, timeout=PAGE_TIMEOUT,
                  allow_redirects=True, verify=False, impersonate="chrome120")
        return r.status_code == 200 and len(r.text) > 1000 and "just a moment" not in r.text[:500].lower()
    except:
        return False

# ============ COOKIE CYCLE ============
def cookie_cycle(url, port, cid):
    """Harvest 1 cookie → send parallel pageviews. Stop on consecutive fails."""
    if target_done.is_set(): return
    
    ck = harvest(url, port)
    if not ck:
        with lock: stats["cookies_fail"] += 1
        return
    
    with lock: stats["cookies_ok"] += 1
    add_ok(ck["sid"])  # harvest = 1 visit
    
    # Send pageviews in mini-batches of PARALLEL_PAGES
    consec_fail = 0
    i = 0
    while i < PAGES_PER_COOKIE - 1 and not target_done.is_set():
        batch_size = min(PARALLEL_PAGES, PAGES_PER_COOKIE - 1 - i)
        
        # Run batch in parallel using threads
        results = []
        result_lock = threading.Lock()
        threads = []
        
        for j in range(batch_size):
            def do_pv(idx=i+j):
                ok = pageview(url, ck, idx)
                with result_lock:
                    results.append(ok)
            t = threading.Thread(target=do_pv)
            t.start()
            threads.append(t)
        
        for t in threads:
            t.join(timeout=PAGE_TIMEOUT + 3)
        
        # Process results
        for ok in results:
            if target_done.is_set(): break
            if ok:
                add_ok()
                consec_fail = 0
            else:
                add_fail()
                consec_fail += 1
        
        if consec_fail >= 3:
            break  # cookie dead, move to next
        
        i += batch_size
        # No delay between batches - max speed

# ============ FAST DIRECT (no CF) ============
def fast_direct(url, vid):
    sid = "".join(random.choices(string.ascii_lowercase + string.digits, k=10))
    px = f"http://{PROXY_USER}:{PROXY_PASS}_country-{PROXY_COUNTRY}_session-{sid}@{PROXY_HOST}:{PROXY_PORT}"
    page = PAGES[vid % len(PAGES)]
    try:
        import urllib3; urllib3.disable_warnings()
        r = req_lib.get(url.rstrip("/")+page, headers={"User-Agent": "Mozilla/5.0 Chrome/122"},
                       proxies={"http": px, "https": px}, timeout=12, verify=False)
        if r.status_code == 200 and len(r.text) > 500: add_ok(sid)
        else: add_fail()
    except: add_fail()

# ============ MAIN ============
def run(url, total):
    print(f"\n{'='*60}", flush=True)
    print(f"🚀 TURBO v8", flush=True)
    print(f"Target: {url} | Visits: {total}", flush=True)
    print(f"Pages/cookie: {PAGES_PER_COOKIE} | Parallel: {PARALLEL_PAGES}", flush=True)
    print(f"Harvest retries: {HARVEST_RETRIES} | Timeout: {HARVEST_MAX_TIMEOUT//1000}s", flush=True)
    print(f"{'='*60}\n", flush=True)
    
    is_cf = detect(url)
    
    stats["start_time"] = time.time()
    stats["target"] = total
    stats["success"] = 0; stats["failed"] = 0
    stats["ips"] = set(); stats["cookies_ok"] = 0; stats["cookies_fail"] = 0
    
    if is_cf:
        stats["mode"] = "turbo_v8"
        if not ensure_flare(): print("❌ No FlareSolverr!", flush=True); return
        
        # More buffer for failures
        n_cookies = (total // PAGES_PER_COOKIE) + 15
        n_inst = len(FLARE_PORTS)
        
        print(f"\n📋 ~{n_cookies} cookies × {PAGES_PER_COOKIE} pages | {n_inst} instances", flush=True)
        print(f"   Stop at {total} visits\n", flush=True)
        write_status()
        
        with ThreadPoolExecutor(max_workers=n_inst) as ex:
            futs = []
            for i in range(n_cookies):
                if target_done.is_set(): break
                port = FLARE_PORTS[i % n_inst]
                f = ex.submit(cookie_cycle, url, port, i)
                futs.append(f)
                time.sleep(0.15)  # faster stagger
            
            for f in as_completed(futs):
                try: f.result(timeout=300)  # 5 min max per cycle (3 retries × 95s)
                except: pass
    else:
        stats["mode"] = "fast"
        print(f"\n⚡ FAST MODE\n", flush=True)
        write_status()
        with ThreadPoolExecutor(max_workers=30) as ex:
            list(ex.map(lambda v: fast_direct(url, v), range(total)))
    
    write_status()
    t = time.time() - stats["start_time"]
    print(f"\n{'='*60}", flush=True)
    print(f"🏁 DONE! ✅{stats['success']}/{total} ❌{stats['failed']}", flush=True)
    if t > 0:
        print(f"⏱️ {t:.0f}s ({int(t//60)}m{int(t%60)}s) | 🚀{stats['success']/t*60:.0f}/min", flush=True)
    print(f"🌍 {len(stats['ips'])} IPs | 🍪 {stats['cookies_ok']}/{stats['cookies_ok']+stats['cookies_fail']}", flush=True)
    print(f"{'='*60}", flush=True)

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "https://makansalameh.com/"
    total = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_TOTAL
    run(url, total)
