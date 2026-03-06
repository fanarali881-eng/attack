#!/usr/bin/env python3
"""
High-speed CF bypass visitor using FlareSolverr + Saudi rotating proxies
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

# ============ STATS ============
stats = {
    "success": 0,
    "failed": 0,
    "total_time": 0,
    "start_time": 0,
    "ips_used": set(),
}
stats_lock = threading.Lock()

def get_proxy_url():
    """Generate proxy URL with unique session for unique IP"""
    sid = "".join(random.choices(string.ascii_lowercase + string.digits, k=10))
    return f"http://{PROXY_USER}:{PROXY_PASS}_country-{PROXY_COUNTRY}_session-{sid}@{PROXY_HOST}:{PROXY_PORT}"

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

def visit_worker(target_url, visit_id):
    """Single visit with unique IP"""
    proxy = get_proxy_url()
    page = random.choice(PAGES)
    full_url = target_url.rstrip("/") + page
    referrer = random.choice(REFERRERS)
    
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
        
        # Check success
        is_success = (
            status == "ok" and 
            html_len > 5000 and 
            "just a moment" not in html.lower()[:500]
        )
        
        with stats_lock:
            if is_success:
                stats["success"] += 1
                stats["total_time"] += elapsed
                # Try to extract IP from proxy session
                stats["ips_used"].add(proxy.split("session-")[1].split("@")[0] if "session-" in proxy else "unknown")
            else:
                stats["failed"] += 1
            
            total = stats["success"] + stats["failed"]
            rate = stats["success"] / (time.time() - stats["start_time"]) * 60 if stats["start_time"] else 0
            
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
        return False

def run_visits(target_url, total_visits, num_threads):
    """Run visits with thread pool"""
    print(f"\n{'='*60}", flush=True)
    print(f"Target: {target_url}", flush=True)
    print(f"Total visits: {total_visits}", flush=True)
    print(f"Threads: {num_threads}", flush=True)
    print(f"{'='*60}\n", flush=True)
    
    # Ensure FlareSolverr is running
    if not ensure_flaresolverr():
        print("ERROR: FlareSolverr not available!", flush=True)
        return
    
    stats["start_time"] = time.time()
    stats["success"] = 0
    stats["failed"] = 0
    stats["total_time"] = 0
    stats["ips_used"] = set()
    
    # Use semaphore to limit concurrent threads
    semaphore = threading.Semaphore(num_threads)
    threads = []
    
    def worker(vid):
        semaphore.acquire()
        try:
            visit_worker(target_url, vid)
        finally:
            semaphore.release()
    
    # Launch all visits
    for i in range(total_visits):
        t = threading.Thread(target=worker, args=(i,))
        t.start()
        threads.append(t)
        # Small delay to avoid overwhelming
        if i % num_threads == 0 and i > 0:
            time.sleep(0.1)
    
    # Wait for all to complete
    for t in threads:
        t.join()
    
    # Final stats
    total_time = time.time() - stats["start_time"]
    print(f"\n{'='*60}", flush=True)
    print(f"COMPLETED!", flush=True)
    print(f"Success: {stats['success']}/{total_visits}", flush=True)
    print(f"Failed: {stats['failed']}", flush=True)
    print(f"Total time: {total_time:.1f}s", flush=True)
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
