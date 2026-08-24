/**
 * MioAnime Cloudflare Worker Proxy
 * CORS & Header Proxying for M3U8 Playlists and Video Chunks
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // CORS Preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "*"
                }
            });
        }

        // 1. M3U8 Playlist Proxy
        if (url.pathname === "/api/m3u8") {
            const targetUrl = url.searchParams.get("url");
            if (!targetUrl) {
                return new Response("Missing url parameter", { status: 400 });
            }

            try {
                const res = await fetch(targetUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                        "Referer": "https://www.mioanime.net/",
                        "Origin": "https://www.mioanime.net"
                    }
                });

                if (!res.ok) {
                    return new Response(`Upstream playlist error: ${res.status}`, { status: res.status });
                }

                const playlistText = await res.text();
                const workerOrigin = url.origin;
                const targetOrigin = new URL(targetUrl).origin;
                const baseDir = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

                // Rewrite lines inside M3U8
                const lines = playlistText.split('\n');
                const rewrittenLines = lines.map(line => {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) {
                        return line;
                    }

                    let absoluteUrl = "";
                    if (trimmed.startsWith('http')) {
                        absoluteUrl = trimmed;
                    } else if (trimmed.startsWith('/')) {
                        absoluteUrl = targetOrigin + trimmed;
                    } else {
                        absoluteUrl = baseDir + trimmed;
                    }

                    // Check if line is a sub-playlist or segment chunk
                    if (trimmed.endsWith('.m3u8') || trimmed.includes('/hls/playlist/')) {
                        return `${workerOrigin}/api/m3u8?url=${encodeURIComponent(absoluteUrl)}`;
                    } else {
                        return `${workerOrigin}/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
                    }
                });

                return new Response(rewrittenLines.join('\n'), {
                    headers: {
                        "Content-Type": "application/vnd.apple.mpegurl",
                        "Access-Control-Allow-Origin": "*",
                        "Cache-Control": "no-cache"
                    }
                });
            } catch (err) {
                return new Response(`Proxy M3U8 Exception: ${err.message}`, { status: 500 });
            }
        }

        // 2. Video Chunk Proxy (.webp / .ts / .mp4)
        if (url.pathname === "/api/proxy") {
            const targetUrl = url.searchParams.get("url");
            if (!targetUrl) {
                return new Response("Missing url parameter", { status: 400 });
            }

            try {
                const res = await fetch(targetUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                        "Referer": "https://www.mioanime.net/",
                        "Origin": "https://www.mioanime.net"
                    }
                });

                if (!res.ok) {
                    return new Response(`Upstream chunk error: ${res.status}`, { status: res.status });
                }

                const responseHeaders = new Headers(res.headers);
                responseHeaders.set("Access-Control-Allow-Origin", "*");
                responseHeaders.set("Content-Type", "video/mp2t");

                return new Response(res.body, {
                    status: res.status,
                    headers: responseHeaders
                });
            } catch (err) {
                return new Response(`Proxy Segment Exception: ${err.message}`, { status: 500 });
            }
        }

        // Base URL Documentation
        return new Response(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>MioAnime Proxy API</title>
                <script src="https://cdn.tailwindcss.com"></script>
            </head>
            <body class="bg-slate-950 text-slate-100 p-8">
                <div class="max-w-3xl mx-auto bg-slate-900 p-6 rounded-2xl border border-slate-800">
                    <h1 class="text-2xl font-bold text-indigo-400 mb-2">MioAnime HLS Stream Proxy API</h1>
                    <p class="text-sm text-slate-400 mb-4">CORS & Referer Proxy Service for MioAnime Luna Module.</p>
                    <div class="bg-slate-950 p-4 rounded-xl font-mono text-xs text-emerald-400">
                        GET /api/m3u8?url={encodedUrl}
                        <br>
                        GET /api/proxy?url={encodedUrl}
                    </div>
                </div>
            </body>
            </html>
        `, {
            headers: { "Content-Type": "text/html; charset=utf-8" }
        });
    }
};
