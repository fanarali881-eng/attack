#!/usr/bin/env python3
"""
Turnstile Solver - Solves Cloudflare Turnstile CAPTCHA using Patchright
Works by creating a local page with the Turnstile widget and solving it automatically.
Used by both visit.py and smart_bot.py to bypass Cloudflare phishing warnings.

Two approaches:
1. solve_turnstile() - Solves Turnstile and returns token (standalone)
2. solve_turnstile_subprocess() - Runs solver in subprocess (avoids Playwright sync conflict)
3. bypass_cloudflare_phishing() - Full bypass via curl_cffi (for visit.py headless mode)
4. bypass_cloudflare_browser() - Full bypass via Patchright browser (for smart_bot.py browser mode)
"""
import os
import re
import sys
import time
import subprocess


def _ensure_patchright():
    """Auto-install patchright and its chromium browser if not present."""
    try:
        import patchright
        return True
    except ImportError:
        print("  📦 Installing patchright...", flush=True)
        try:
            subprocess.run([sys.executable, '-m', 'pip', 'install', 'patchright', '-q',
                           '--break-system-packages'], capture_output=True, timeout=120)
            subprocess.run([sys.executable, '-m', 'patchright', 'install', 'chromium'],
                           capture_output=True, timeout=120)
            print("  ✅ Patchright installed!", flush=True)
            return True
        except Exception as e:
            print(f"  ❌ Failed to install patchright: {e}", flush=True)
            return False


def _ensure_xvfb():
    """Auto-install xvfb if not present."""
    try:
        result = subprocess.run(['which', 'Xvfb'], capture_output=True)
        if result.returncode != 0:
            print("  📦 Installing Xvfb...", flush=True)
            subprocess.run(['apt-get', 'install', '-y', '-qq', 'xvfb'],
                           capture_output=True, timeout=60)
    except:
        pass


# Ensure Xvfb is running for headed mode (Turnstile needs it)
def ensure_display():
    """Start Xvfb if no display is available."""
    if os.environ.get('DISPLAY'):
        return
    try:
        result = subprocess.run(['pgrep', '-f', 'Xvfb :99'], capture_output=True)
        if result.returncode != 0:
            subprocess.Popen(
                ['Xvfb', ':99', '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            time.sleep(1)
        os.environ['DISPLAY'] = ':99'
    except:
        os.environ['DISPLAY'] = ':99'


def solve_turnstile(site_url, sitekey, timeout=30):
    """
    Solve Cloudflare Turnstile CAPTCHA and return the token.
    Uses Patchright to render a local page with the Turnstile widget.
    
    WARNING: Cannot be called from within another Patchright sync context.
    Use solve_turnstile_subprocess() instead if already inside Patchright.
    """
    _ensure_patchright()
    _ensure_xvfb()
    ensure_display()
    
    try:
        from patchright.sync_api import sync_playwright
    except ImportError:
        print("  ⚠️ Patchright not installed, cannot solve Turnstile", flush=True)
        return None
    
    url_with_slash = site_url if site_url.endswith('/') else site_url + '/'
    html_template = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Solver</title>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async></script>
    </head>
    <body>
        <div class="cf-turnstile" style="width:70px" data-sitekey="{sitekey}"></div>
    </body>
    </html>
    """
    
    token = None
    start = time.time()
    
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False,
                args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            )
            
            context = browser.new_context(viewport={'width': 800, 'height': 600})
            page = context.new_page()
            
            page.route(url_with_slash, lambda route: route.fulfill(body=html_template, status=200))
            page.goto(url_with_slash, timeout=30000)
            
            time.sleep(2)
            
            for attempt in range(timeout // 2):
                try:
                    val = page.input_value("[name=cf-turnstile-response]", timeout=2000)
                    if val:
                        token = val
                        elapsed = round(time.time() - start, 1)
                        print(f"  ✅ Turnstile solved in {elapsed}s", flush=True)
                        break
                    else:
                        if attempt < 5:
                            try:
                                page.locator("//div[@class='cf-turnstile']").click(timeout=1000)
                            except:
                                pass
                        time.sleep(1)
                except:
                    time.sleep(1)
            
            browser.close()
    except Exception as e:
        print(f"  ⚠️ Turnstile solver error: {e}", flush=True)
    
    return token


def solve_turnstile_subprocess(site_url, sitekey, timeout=30):
    """
    Solve Turnstile CAPTCHA by running the solver in a subprocess.
    This avoids the "Playwright Sync API inside asyncio loop" error
    when called from within another Patchright/Playwright context.
    
    Returns:
        str: The Turnstile token, or None if failed
    """
    ensure_display()
    
    solver_script = f"""
import sys, os
os.environ['DISPLAY'] = os.environ.get('DISPLAY', ':99')
sys.path.insert(0, '{os.path.dirname(os.path.abspath(__file__))}')
from turnstile_solver import solve_turnstile
token = solve_turnstile('{site_url}', '{sitekey}', timeout={timeout})
if token:
    print('TURNSTILE_TOKEN:' + token)
else:
    print('TURNSTILE_TOKEN:FAILED')
"""
    
    try:
        env = dict(os.environ)
        if 'DISPLAY' not in env:
            env['DISPLAY'] = ':99'
        
        result = subprocess.run(
            ['python3', '-c', solver_script],
            capture_output=True, text=True, timeout=timeout + 15,
            env=env
        )
        
        for line in result.stdout.split('\n'):
            if line.startswith('TURNSTILE_TOKEN:'):
                t = line[16:]
                if t != 'FAILED':
                    return t
    except subprocess.TimeoutExpired:
        print("  ⚠️ Turnstile subprocess timed out", flush=True)
    except Exception as e:
        print(f"  ⚠️ Turnstile subprocess error: {e}", flush=True)
    
    return None


def bypass_cloudflare_phishing(site_url, proxy_url=None, timeout=30):
    """
    Full bypass of Cloudflare phishing warning page using curl_cffi.
    For headless/non-browser mode (visit.py).
    
    Returns:
        dict: {"cookies": {...}, "success": True/False}
    """
    try:
        from curl_cffi import requests as cffi_requests
    except ImportError:
        print("  ⚠️ curl_cffi not installed", flush=True)
        return {"cookies": {}, "success": False}
    
    proxies = {'http': proxy_url, 'https': proxy_url} if proxy_url else None
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7',
    }
    
    # Step 1: Get the phishing page
    print("  📄 Fetching phishing page...", flush=True)
    try:
        r = cffi_requests.get(site_url, impersonate='chrome131', headers=headers,
                              proxies=proxies, timeout=20, verify=False)
    except Exception as e:
        print(f"  ⚠️ Failed to fetch page: {e}", flush=True)
        return {"cookies": {}, "success": False}
    
    if r.status_code == 200 and 'phishing' not in r.text.lower():
        print("  ✅ No phishing page - site is accessible!", flush=True)
        return {"cookies": dict(r.cookies), "success": True, "html": r.text}
    
    # Extract atok and sitekey
    atok_match = re.search(r'name="atok"\s+value="([^"]+)"', r.text)
    sitekey_match = re.search(r'data-sitekey=["\']([^"\']+)["\']', r.text)
    
    if not atok_match or not sitekey_match:
        print("  ⚠️ No atok/sitekey found in phishing page", flush=True)
        return {"cookies": {}, "success": False}
    
    atok = atok_match.group(1)
    sitekey = sitekey_match.group(1)
    print(f"  🔑 atok: {atok[:30]}... | sitekey: {sitekey}", flush=True)
    
    # Step 2: Solve Turnstile
    print("  🧩 Solving Turnstile CAPTCHA...", flush=True)
    token = solve_turnstile(site_url, sitekey, timeout=timeout)
    
    if not token:
        print("  ❌ Failed to solve Turnstile", flush=True)
        return {"cookies": {}, "success": False}
    
    # Step 3: Submit bypass form (GET, no redirect - get cookie)
    print("  📤 Submitting bypass form...", flush=True)
    bypass_url = site_url.rstrip('/') + '/cdn-cgi/phish-bypass'
    params = {
        'atok': atok,
        'original_path': '/',
        'cf-turnstile-response': token
    }
    
    try:
        r2 = cffi_requests.get(bypass_url, params=params, impersonate='chrome131',
                               headers={**headers, 'Referer': site_url},
                               proxies=proxies, timeout=20, verify=False, allow_redirects=False)
        
        cookies = dict(r2.cookies)
        
        if '__cf_mw_byp' in cookies:
            print(f"  ✅ Phishing bypass successful! Cookie: __cf_mw_byp", flush=True)
            return {"cookies": cookies, "success": True}
        else:
            print(f"  ⚠️ No bypass cookie received (status {r2.status_code})", flush=True)
            return {"cookies": cookies, "success": False}
    except Exception as e:
        print(f"  ⚠️ Bypass submission error: {e}", flush=True)
        return {"cookies": {}, "success": False}


def bypass_phishing_in_browser(page, site_url, sitekey=None):
    """
    Bypass Cloudflare phishing warning inside an existing Patchright browser page.
    For browser mode (smart_bot.py).
    
    This function:
    1. Extracts atok and sitekey from the current page
    2. Solves Turnstile in a subprocess (to avoid Playwright sync conflict)
    3. Injects the token into the page
    4. Force-enables and clicks the bypass button
    
    Args:
        page: Patchright page object (already on the phishing page)
        site_url: The URL of the site
        sitekey: Optional sitekey (will extract from page if not provided)
    
    Returns:
        bool: True if bypass succeeded
    """
    try:
        # Extract atok from the page
        atok = page.evaluate("document.querySelector('input[name=\"atok\"]')?.value || ''")
        if not atok:
            print("  ⚠️ No atok found on page", flush=True)
            return False
        
        # Extract sitekey if not provided
        if not sitekey:
            sitekey = page.evaluate("document.querySelector('[data-sitekey]')?.getAttribute('data-sitekey') || ''")
        if not sitekey:
            print("  ⚠️ No sitekey found on page", flush=True)
            return False
        
        print(f"  🔑 atok: {atok[:30]}... | sitekey: {sitekey}", flush=True)
        
        # Solve Turnstile in subprocess (avoids Playwright sync conflict)
        print("  🧩 Solving Turnstile in subprocess...", flush=True)
        token = solve_turnstile_subprocess(site_url, sitekey, timeout=30)
        
        if not token:
            print("  ❌ Failed to solve Turnstile", flush=True)
            return False
        
        print(f"  ✅ Token obtained: {token[:50]}...", flush=True)
        
        # Inject token into the page
        safe_token = token.replace("'", "\\'").replace("\\", "\\\\")
        
        page.evaluate(f"""
            (() => {{
                // Set turnstile response input
                let input = document.querySelector('input[name="cf-turnstile-response"]');
                if (!input) {{
                    input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = 'cf-turnstile-response';
                    let form = document.querySelector('form');
                    if (form) form.appendChild(input);
                }}
                input.value = '{safe_token}';
                
                // Try calling the success callback
                if (typeof onTurnstileSuccess === 'function') {{
                    onTurnstileSuccess('{safe_token}');
                }}
                
                // Force enable and click the bypass button
                let btn = document.getElementById('bypass-button');
                if (btn) {{
                    btn.disabled = false;
                    btn.click();
                }}
            }})()
        """)
        
        # Wait for navigation
        time.sleep(5)
        
        # Check if we're past the phishing page
        new_content = page.content()
        new_title = page.title()
        
        if 'phishing' not in new_content.lower() and 'Suspected phishing' not in new_title:
            print(f"  🎉 Phishing bypass successful! Title: {new_title}", flush=True)
            return True
        else:
            # Try form submit as fallback
            print("  🔄 Button click didn't work, trying form submit...", flush=True)
            page.evaluate(f"""
                let form = document.querySelector('form[action*="phish-bypass"]');
                if (form) {{
                    let input = form.querySelector('input[name="cf-turnstile-response"]');
                    if (!input) {{
                        input = document.createElement('input');
                        input.type = 'hidden';
                        input.name = 'cf-turnstile-response';
                        form.appendChild(input);
                    }}
                    input.value = '{safe_token}';
                    form.submit();
                }}
            """)
            
            time.sleep(5)
            new_content = page.content()
            new_title = page.title()
            
            if 'phishing' not in new_content.lower() and 'Suspected phishing' not in new_title:
                print(f"  🎉 Phishing bypass successful (form submit)! Title: {new_title}", flush=True)
                return True
            else:
                print(f"  ❌ Phishing bypass failed. Title: {new_title}", flush=True)
                return False
    
    except Exception as e:
        print(f"  ⚠️ Browser bypass error: {e}", flush=True)
        return False


if __name__ == "__main__":
    import sys
    url = sys.argv[1] if len(sys.argv) > 1 else "https://sesallameh.com/"
    proxy = sys.argv[2] if len(sys.argv) > 2 else None
    
    result = bypass_cloudflare_phishing(url, proxy_url=proxy)
    print(f"\nResult: {result}")
