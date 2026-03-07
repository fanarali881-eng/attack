import { NextResponse } from 'next/server';

function validateApiKey(req) {
  const authHeader = req.headers.get('x-api-key') || '';
  const validKey = process.env.PANEL_API_KEY;
  if (!validKey || authHeader !== validKey) return false;
  return true;
}

// Fetch a URL through the Saudi proxy
async function fetchViaProxy(targetUrl, proxyConfig, timeout = 15000) {
  // Use the VPS to make the request through proxy (Vercel can't use HTTP proxies directly)
  // Instead, we'll fetch directly and also try common backends
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    return res;
  } catch(e) {
    clearTimeout(timer);
    return null;
  }
}

// Test if a URL has a Socket.IO server
async function testSocketIO(url) {
  try {
    const sioUrl = `${url.replace(/\/$/, '')}/socket.io/?EIO=4&transport=polling`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(sioUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    clearTimeout(timer);
    const text = await res.text();
    // Must be real Socket.IO handshake (JSON with "sid"), not HTML that happens to contain 'sid'
    if (res.status === 200 && text.includes('"sid"') && !text.toLowerCase().startsWith('<!doctype') && !text.toLowerCase().startsWith('<html')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Extract Socket.IO URLs from HTML/JS content
function extractSocketUrls(content) {
  const urls = new Set();
  
  // Common patterns for Socket.IO server URLs
  const patterns = [
    /(?:const|let|var)\s+\w*(?:SOCKET|socket|server|api|SERVER|API)\w*\s*=\s*['"]([^"']+)['"]/gi,
    /io\(['"]([^"']+)['"]/gi,
    /connect\(['"]([^"']+)['"]/gi,
    /socketUrl\s*[:=]\s*['"]([^"']+)['"]/gi,
    /SOCKET_URL\s*[:=]\s*['"]([^"']+)['"]/gi,
    /serverUrl\s*[:=]\s*['"]([^"']+)['"]/gi,
    /NEXT_PUBLIC_\w*(?:SOCKET|API|SERVER)\w*\s*[:=]\s*['"]([^"']+)['"]/gi,
    /REACT_APP_\w*(?:SOCKET|API|SERVER)\w*\s*[:=]\s*['"]([^"']+)['"]/gi,
    /VITE_\w*(?:SOCKET|API|SERVER)\w*\s*[:=]\s*['"]([^"']+)['"]/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const url = match[1];
      if (url.startsWith('http') && !url.includes('socket.io') && !url.includes('cdn')) {
        urls.add(url);
      }
    }
  }
  
  // Also find backend hosting URLs
  const backendPatterns = [
    /https?:\/\/[\w.-]+\.onrender\.com/gi,
    /https?:\/\/[\w.-]+\.railway\.app/gi,
    /https?:\/\/[\w.-]+\.herokuapp\.com/gi,
    /https?:\/\/[\w.-]+\.fly\.dev/gi,
    /https?:\/\/[\w.-]+\.up\.railway\.app/gi,
    /https?:\/\/[\w.-]+\.vercel\.app/gi,
    /https?:\/\/[\w.-]+\.netlify\.app/gi,
  ];
  
  for (const pattern of backendPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      urls.add(match[0]);
    }
  }
  
  return [...urls];
}

// Extract JS bundle URLs from HTML
function extractJsUrls(html, baseUrl) {
  const jsUrls = new Set();
  
  // Script src tags
  const srcPattern = /src=["']([^"']*\.js[^"']*?)["']/gi;
  let match;
  while ((match = srcPattern.exec(html)) !== null) {
    let jsUrl = match[1];
    if (jsUrl.startsWith('//')) jsUrl = 'https:' + jsUrl;
    else if (jsUrl.startsWith('/')) jsUrl = baseUrl + jsUrl;
    else if (!jsUrl.startsWith('http')) jsUrl = baseUrl + '/' + jsUrl;
    jsUrls.add(jsUrl);
  }
  
  return [...jsUrls];
}

export async function POST(req) {
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { url, proxies } = await req.json();
    
    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const parsed = new URL(url);
    const base = `${parsed.protocol}//${parsed.host}`;
    const domainName = parsed.hostname.replace('www.', '').split('.')[0];
    
    const result = {
      mode: 'http',
      socket_url: null,
      has_cloudflare: false,
      has_socketio: false,
      protection: 'none',
      pages: ['/'],
      register_event: 'visitor:register',
      page_change_event: 'visitor:pageEnter',
      connected_event: 'successfully-connected',
      base_url: base,
      target_url: url,
      scan_method: 'vercel-direct',
    };

    console.log(`[SCAN] Starting scan for ${url}`);

    // Step 1: Try to fetch the site directly from Vercel
    let htmlContent = '';
    let isBlocked = false;
    
    const directRes = await fetchViaProxy(url, null);
    if (directRes) {
      const status = directRes.status;
      const headers = Object.fromEntries(directRes.headers.entries());
      const server = (headers['server'] || '').toLowerCase();
      
      // Detect Cloudflare
      if (headers['cf-ray'] || headers['cf-cache-status'] || headers['cf-mitigated'] || server.includes('cloudflare')) {
        result.has_cloudflare = true;
        result.protection = 'cloudflare';
      }
      
      if (status === 403 || status === 503) {
        isBlocked = true;
        if (!result.has_cloudflare) {
          result.has_cloudflare = true;
          result.protection = 'cloudflare';
        }
      }
      
      htmlContent = await directRes.text();
      
      // Check if we got real HTML (not a challenge page)
      if (htmlContent.includes('challenge-platform') || htmlContent.includes('cf-browser-verification') || htmlContent.includes('Just a moment')) {
        isBlocked = true;
      }
      
      // If we got real HTML, look for Socket.IO references
      if (!isBlocked && htmlContent.length > 500) {
        if (htmlContent.toLowerCase().includes('socket.io') || htmlContent.includes('io(')) {
          // HTML mentions socket.io, but we need to VERIFY a real server exists
          const socketUrls = extractSocketUrls(htmlContent);
          for (const su of socketUrls) {
            if (await testSocketIO(su)) {
              result.has_socketio = true;
              result.socket_url = su.replace(/\/$/, '');
              break;
            }
          }
        }
        
        // Even if no socket.io in HTML, check JS bundles
        if (!result.socket_url) {
          const jsUrls = extractJsUrls(htmlContent, base);
          for (const jsUrl of jsUrls.slice(0, 15)) {
            try {
              const jsRes = await fetchViaProxy(jsUrl, null, 10000);
              if (jsRes && jsRes.ok) {
                const jsContent = await jsRes.text();
                const backendUrls = extractSocketUrls(jsContent);
                for (const bu of backendUrls) {
                  if (await testSocketIO(bu)) {
                    result.has_socketio = true;
                    result.socket_url = bu.replace(/\/$/, '');
                    break;
                  }
                }
                if (result.socket_url) break;
              }
            } catch { continue; }
          }
        }
      }
    }

    // Step 2: If blocked or no socket found, check same-origin Socket.IO
    if (!result.has_socketio) {
      if (await testSocketIO(base)) {
        result.has_socketio = true;
        result.socket_url = base;
      }
    }

    // Step 3: If still no socket found, try common backend URL patterns
    if (!result.has_socketio) {
      const prefixes = [
        `${domainName}-server`,
        `${domainName}-api`,
        `${domainName}-backend`,
        `${domainName}`,
        `api-${domainName}`,
        `server-${domainName}`,
      ];
      const hosts = ['.onrender.com', '.railway.app', '.herokuapp.com', '.fly.dev'];
      
      // Build candidates list
      const candidates = [];
      
      // Also extract from partial HTML (even if blocked, Cloudflare might show some content)
      if (htmlContent) {
        const htmlBackends = extractSocketUrls(htmlContent);
        candidates.push(...htmlBackends);
      }
      
      for (const prefix of prefixes) {
        for (const host of hosts) {
          candidates.push(`https://${prefix}${host}`);
        }
      }
      
      // Test candidates in parallel (batches of 5)
      for (let i = 0; i < candidates.length && !result.has_socketio; i += 5) {
        const batch = candidates.slice(i, i + 5);
        const results = await Promise.all(batch.map(c => testSocketIO(c).then(ok => ({ url: c, ok }))));
        for (const r of results) {
          if (r.ok) {
            result.has_socketio = true;
            result.socket_url = r.url.replace(/\/$/, '');
            break;
          }
        }
      }
    }

    // Step 4: If site is on Vercel/Netlify, try to find the frontend and scan its JS
    if (!result.has_socketio && isBlocked) {
      // Try to find the site's Vercel/Netlify/Render frontend deployment
      const frontendCandidates = [
        `https://${domainName}.vercel.app`,
        `https://${domainName}.netlify.app`,
        `https://${domainName}.onrender.com`,
        `https://${domainName}-0cjc.onrender.com`,  // Common Render pattern
      ];
      
      // Also try with common suffixes for Render
      const renderSuffixes = ['0cjc', '0abc', '1abc', 'app', 'web', 'site', 'frontend'];
      for (const suffix of renderSuffixes) {
        frontendCandidates.push(`https://${domainName}-${suffix}.onrender.com`);
      }
      
      for (const frontendUrl of frontendCandidates) {
        if (result.has_socketio) break;
        try {
          const fRes = await fetchViaProxy(frontendUrl, null, 10000);
          if (fRes && fRes.ok) {
            const fHtml = await fRes.text();
            if (fHtml.length > 200 && !fHtml.includes('Not Found')) {
              // Found a frontend! Scan its JS bundles
              const fBase = new URL(frontendUrl).origin;
              const jsUrls = extractJsUrls(fHtml, fBase);
              
              for (const jsUrl of jsUrls.slice(0, 10)) {
                try {
                  const jsRes = await fetchViaProxy(jsUrl, null, 10000);
                  if (jsRes && jsRes.ok) {
                    const jsContent = await jsRes.text();
                    const backendUrls = extractSocketUrls(jsContent);
                    for (const bu of backendUrls) {
                      if (await testSocketIO(bu)) {
                        result.has_socketio = true;
                        result.socket_url = bu.replace(/\/$/, '');
                        result.scan_method = `vercel-frontend-${frontendUrl}`;
                        break;
                      }
                    }
                    if (result.socket_url) break;
                  }
                } catch { continue; }
              }
            }
          }
        } catch { continue; }
      }
    }

    // Step 5: Determine mode
    // ONLY set socketio mode if we found a REAL verified socket_url
    if (result.has_socketio && result.socket_url) {
      result.mode = 'socketio';
    } else if (result.has_cloudflare) {
      result.mode = 'cloudflare';
    } else {
      result.mode = 'http';
    }

    console.log(`[SCAN] Result: mode=${result.mode}, socket=${result.socket_url}, protection=${result.protection}`);

    return NextResponse.json({ scanResult: result });

  } catch (error) {
    console.error('[SCAN] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
