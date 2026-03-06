#!/usr/bin/env python3
"""
Smart visitor with auto-detection of site protection.
- No protection → FAST mode (HTTP direct, ~500/min)
- CF without Turnstile → FAST mode (curl_cffi TLS impersonate, ~300/min)
- CF + Turnstile/Under Attack → FLARE mode (FlareSolverr, ~70/min)
Each visit = unique Saudi IP + unique User-Agent = unique visitor
"""
import requests
import threading
import time
import random
import string
import sys
import json
import os
import subprocess

# ============ CONFIG ============
FLARE_URL = "http://localhost:8191/v1"
PROXY_USER = "fanar"
PROXY_PASS = "j7HGTQiRnys66RIM"
PROXY_HOST = "proxy.packetstream.io"
PROXY_PORT = "31112"
PROXY_COUNTRY = "SaudiArabia"

DEFAULT_THREADS = 15
DEFAULT_TOTAL = 500
MAX_TIMEOUT = 60000
STATUS_FILE = "/root/visit_status.json"

# Pages to visit (looks like real browsing)
PAGES = [
    "/",
    "/about",
    "/contact",
    "/menu",
    "/gallery",
]

# Referrers (looks like real traffic sources)
REFERRERS = [
    "https://www.google.com/",
    "https://www.google.com.sa/",
    "https://www.google.com/search?q=مكان+سلامة",
    "https://www.google.com/search?q=makansalameh",
    "https://www.instagram.com/",
    "https://twitter.com/",
    "https://www.facebook.com/",
    "https://www.snapchat.com/",
    "https://www.tiktok.com/",
    "",  # direct visit
    "",  # direct visit
]

# User-Agents for FAST mode
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPad; CPU OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
]

# ============ STATS ============
stats = {
    "success": 0,
    "failed": 0,
    "total_time": 0,
    "start_time": 0,
    "target": 0,
    "ips_used": set(),
    "mode": "detecting",
}
stats_lock = threading.Lock()

def write_status():
    """Write current status to JSON file for the dashboard to read"""
    try:
        elapsed = time.time() - stats["start_time"] if stats["start_time"] else 0
        total_done = stats["success"] + stats["failed"]
        target = stats["target"]
        progress = (stats["success"] / target * 100) if target > 0 else 0
        rate = stats["success"] / elapsed * 60 if elapsed > 0 else 0
        
        is_finished = total_done >= target
        
        status_data = {
            "status": "finished" if is_finished else "running",
            "visits": stats["success"],
            "errors": stats["failed"],
            "target": target,
            "progress": round(progress, 1),
            "elapsed": round(elapsed, 1),
            "rate": round(rate, 1),
            "remaining": max(0, target - stats["success"]),
            "timestamp": int(time.time()),
            "mode": stats["mode"],
            "unique_ips": len(stats["ips_used"]),
        }
        
        with open(STATUS_FILE, "w") as f:
            json.dump(status_data, f)
    except:
        pass

def get_proxy_url():
    """Generate proxy URL with unique session for unique IP"""
    sid = "".join(random.choices(string.ascii_lowercase + string.digits, k=10))
    return f"http://{PROXY_USER}:{PROXY_PASS}_country-{PROXY_COUNTRY}_session-{sid}@{PROXY_HOST}:{PROXY_PORT}"

def get_proxy_dict():
    """Generate proxy dict for requests library"""
    proxy = get_proxy_url()
    return {"http": proxy, "https": proxy}, proxy

# ============ PROTECTION DETECTION ============
def detect_protection(target_url):
    """
    Detect what kind of protection the target has.
    Returns: 'none', 'cf_basic', 'cf_turnstile'
    """
    print("🔍 Detecting site protection...", flush=True)
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    detect_headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar,en;q=0.9",
    }
    
    # Try without proxy first (just to detect protection type)
    r = None
    for attempt in range(3):
        try:
            if attempt == 0:
                # First try: no proxy (faster detection)
                r = requests.get(target_url, headers=detect_headers, timeout=10, allow_redirects=True, verify=False)
            else:
                # Retry with proxy
                proxies, _ = get_proxy_dict()
                r = requests.get(target_url, headers=detect_headers, proxies=proxies, timeout=15, allow_redirects=True, verify=False)
            break
        except Exception as e:
            if attempt < 2:
                print(f"   Retry {attempt+1}...", flush=True)
                time.sleep(2)
                continue
            else:
                print(f"⚠️ All detection attempts failed: {e}", flush=True)
                print(f"   → Using 🔥 FLARE mode (FlareSolverr) as fallback", flush=True)
                return "cf_turnstile"
    
    try:
        
        headers_lower = {k.lower(): v.lower() for k, v in r.headers.items()}
        body_lower = r.text[:5000].lower()
        status = r.status_code
        html_len = len(r.text)
        
        # Check for Cloudflare
        is_cf = "cf-ray" in headers_lower or "cloudflare" in headers_lower.get("server", "")
        
        # Check for CF challenge/block
        has_challenge = (
            "just a moment" in body_lower or
            "challenge-platform" in body_lower or
            "turnstile" in body_lower or
            "_cf_chl" in body_lower or
            status == 403 or
            status == 503
        )
        
        has_turnstile = "turnstile" in body_lower or "challenge-platform" in body_lower
        
        if not is_cf and status == 200 and html_len > 200:
            print(f"✅ No protection detected! Status={status}, HTML={html_len} bytes", flush=True)
            print(f"   → Using ⚡ FAST mode (HTTP direct)", flush=True)
            return "none"
        
        if is_cf and not has_challenge and status == 200 and html_len > 200:
            print(f"🔶 Cloudflare detected but NO challenge. Status={status}, HTML={html_len} bytes", flush=True)
            print(f"   → Using ⚡ FAST mode (HTTP direct)", flush=True)
            return "none"
        
        if is_cf and has_challenge and has_turnstile:
            print(f"🔴 Cloudflare + Turnstile/Under Attack detected! Status={status}", flush=True)
            print(f"   → Using 🔥 FLARE mode (FlareSolverr)", flush=True)
            return "cf_turnstile"
        
        if is_cf and has_challenge:
            print(f"🟠 Cloudflare challenge detected! Status={status}", flush=True)
            print(f"   → Using 🔥 FLARE mode (FlareSolverr)", flush=True)
            return "cf_turnstile"
        
        # If we got here with low HTML, probably blocked
        if html_len < 200:
            print(f"⚠️ Small response ({html_len} bytes), Status={status}. Assuming CF protection.", flush=True)
            print(f"   → Using 🔥 FLARE mode (FlareSolverr)", flush=True)
            return "cf_turnstile"
        
        # Default: got good response, use fast mode
        print(f"✅ Site accessible! Status={status}, HTML={html_len} bytes", flush=True)
        print(f"   → Using ⚡ FAST mode (HTTP direct)", flush=True)
        return "none"
        
    except requests.exceptions.Timeout:
        print(f"⚠️ Request timed out. Assuming CF protection.", flush=True)
        print(f"   → Using 🔥 FLARE mode (FlareSolverr)", flush=True)
        return "cf_turnstile"
    except Exception as e:
        print(f"⚠️ Detection error: {e}. Assuming CF protection.", flush=True)
        print(f"   → Using 🔥 FLARE mode (FlareSolverr)", flush=True)
        return "cf_turnstile"

# ============ FAST MODE (HTTP Direct) ============
def fast_visit_worker(target_url, visit_id):
    """Fast HTTP visit - for sites without CF protection"""
    proxies, proxy_url = get_proxy_dict()
    page = random.choice(PAGES)
    full_url = target_url.rstrip("/") + page
    referrer = random.choice(REFERRERS)
    ua = random.choice(USER_AGENTS)
    
    headers = {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site" if referrer else "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
    }
    if referrer:
        headers["Referer"] = referrer
    
    t_start = time.time()
    try:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        r = requests.get(
            full_url,
            headers=headers,
            proxies=proxies,
            timeout=20,
            allow_redirects=True,
            verify=False,
        )
        elapsed = time.time() - t_start
        html_len = len(r.text)
        
        is_success = r.status_code == 200 and html_len > 500
        
        with stats_lock:
            if is_success:
                stats["success"] += 1
                stats["total_time"] += elapsed
                sid = proxy_url.split("session-")[1].split("@")[0] if "session-" in proxy_url else str(visit_id)
                stats["ips_used"].add(sid)
            else:
                stats["failed"] += 1
            
            total = stats["success"] + stats["failed"]
            rate = stats["success"] / (time.time() - stats["start_time"]) * 60 if stats["start_time"] else 0
            
            write_status()
            
            if total % 50 == 0 or total <= 5:
                print(f"[{total}] ✅{stats['success']} ❌{stats['failed']} | "
                      f"Rate: {rate:.0f}/min | "
                      f"Last: {elapsed:.1f}s | "
                      f"Status: {r.status_code} | "
                      f"HTML: {html_len}", flush=True)
        
        return is_success
        
    except Exception as e:
        with stats_lock:
            stats["failed"] += 1
            write_status()
        return False

# ============ FLARE MODE (FlareSolverr) ============
def ensure_flaresolverr():
    """Make sure FlareSolverr is running"""
    for attempt in range(3):
        try:
            r = requests.get(FLARE_URL.replace("/v1", "/"), timeout=5)
            if "FlareSolverr" in r.text:
                return True
        except:
            pass
        print(f"Starting FlareSolverr (attempt {attempt+1})...", flush=True)
        os.system("docker start flaresolverr 2>/dev/null || docker run -d --name flaresolverr -p 8191:8191 -e LOG_LEVEL=info ghcr.io/flaresolverr/flaresolverr:latest 2>/dev/null")
        time.sleep(10)
    return False

def flare_visit_worker(target_url, visit_id):
    """FlareSolverr visit - for CF protected sites"""
    proxy = get_proxy_url()
    page = random.choice(PAGES)
    full_url = target_url.rstrip("/") + page
    
    data = {
        "cmd": "request.get",
        "url": full_url,
        "maxTimeout": MAX_TIMEOUT,
        "proxy": {"url": proxy},
    }
    
    t_start = time.time()
    try:
        r = requests.post(FLARE_URL, json=data, timeout=90)
        d = r.json()
        elapsed = time.time() - t_start
        
        sol = d.get("solution", {})
        status = d.get("status", "error")
        html = sol.get("response", "")
        html_len = len(html)
        sol_url = sol.get("url", "")
        
        is_success = (
            status == "ok" and 
            html_len > 5000 and 
            "just a moment" not in html.lower()[:500]
        )
        
        with stats_lock:
            if is_success:
                stats["success"] += 1
                stats["total_time"] += elapsed
                stats["ips_used"].add(proxy.split("session-")[1].split("@")[0] if "session-" in proxy else "unknown")
            else:
                stats["failed"] += 1
            
            total = stats["success"] + stats["failed"]
            rate = stats["success"] / (time.time() - stats["start_time"]) * 60 if stats["start_time"] else 0
            
            write_status()
            
            if total % 10 == 0 or total <= 5:
                print(f"[{total}] ✅{stats['success']} ❌{stats['failed']} | "
                      f"Rate: {rate:.0f}/min | "
                      f"Last: {elapsed:.1f}s | "
                      f"HTML: {html_len} | "
                      f"URL: {sol_url[:50]}", flush=True)
        
        return is_success
        
    except Exception as e:
        with stats_lock:
            stats["failed"] += 1
            write_status()
        return False

# ============ MAIN RUNNER ============
def run_visits(target_url, total_visits, num_threads):
    """Run visits with auto-detected mode"""
    print(f"\n{'='*60}", flush=True)
    print(f"Target: {target_url}", flush=True)
    print(f"Total visits: {total_visits}", flush=True)
    print(f"Threads: {num_threads}", flush=True)
    print(f"{'='*60}\n", flush=True)
    
    # Auto-detect protection
    protection = detect_protection(target_url)
    
    if protection == "none":
        mode = "fast"
        worker_func = fast_visit_worker
        # For fast mode, we can use more threads
        effective_threads = min(num_threads * 3, 50)
        print(f"\n⚡ FAST MODE - {effective_threads} threads", flush=True)
    else:
        mode = "flaresolverr"
        worker_func = flare_visit_worker
        effective_threads = num_threads
        # Ensure FlareSolverr is running
        if not ensure_flaresolverr():
            print("ERROR: FlareSolverr not available!", flush=True)
            return
        print(f"\n🔥 FLARE MODE - {effective_threads} threads", flush=True)
    
    stats["start_time"] = time.time()
    stats["success"] = 0
    stats["failed"] = 0
    stats["total_time"] = 0
    stats["target"] = total_visits
    stats["ips_used"] = set()
    stats["mode"] = mode
    
    # Write initial status
    write_status()
    
    # Use semaphore to limit concurrent threads
    semaphore = threading.Semaphore(effective_threads)
    threads = []
    
    def worker(vid):
        semaphore.acquire()
        try:
            worker_func(target_url, vid)
        finally:
            semaphore.release()
    
    # Launch all visits
    for i in range(total_visits):
        t = threading.Thread(target=worker, args=(i,))
        t.start()
        threads.append(t)
        # Small delay to avoid overwhelming
        if i % effective_threads == 0 and i > 0:
            time.sleep(0.1)
    
    # Wait for all to complete
    for t in threads:
        t.join()
    
    # Final status
    write_status()
    
    # Final stats
    total_time = time.time() - stats["start_time"]
    print(f"\n{'='*60}", flush=True)
    print(f"COMPLETED! Mode: {mode.upper()}", flush=True)
    print(f"Success: {stats['success']}/{total_visits}", flush=True)
    print(f"Failed: {stats['failed']}", flush=True)
    print(f"Total time: {total_time:.1f}s", flush=True)
    if total_time > 0:
        print(f"Rate: {stats['success']/total_time*60:.0f} visits/min", flush=True)
    print(f"Unique sessions: {len(stats['ips_used'])}", flush=True)
    if stats['success'] > 0:
        print(f"Avg per visit: {stats['total_time']/stats['success']:.1f}s", flush=True)
    print(f"{'='*60}", flush=True)

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "https://makansalameh.com/"
    total = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_TOTAL
    threads = int(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_THREADS
    
    run_visits(target, total, threads)
