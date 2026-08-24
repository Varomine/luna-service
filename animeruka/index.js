/**
 * AnimeRuka Cloudflare Worker Proxy
 * Direct HLS Master Playlist Resolver for Server 1 (AnimeMami)
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // CORS Preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "*"
                }
            });
        }

        // HLS Endpoint: /hls?url=https://animemami.xyz/v/... OR /hls?slug=...
        if (url.pathname === "/hls" || url.pathname === "/m3u8") {
            let mamiUrl = url.searchParams.get("url");
            const slug = url.searchParams.get("slug");

            if (!mamiUrl && slug) {
                mamiUrl = `https://animemami.xyz/v/${slug}`;
            }

            if (!mamiUrl) {
                return new Response("Missing url or slug parameter", { status: 400 });
            }

            try {
                // 1. Fetch AnimeMami HTML page
                const mamiRes = await fetch(mamiUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                        "Referer": "https://animeruka.com/"
                    }
                });

                if (!mamiRes.ok) {
                    return new Response("Failed to fetch AnimeMami embed page", { status: mamiRes.status });
                }

                const html = await mamiRes.text();
                const match = html.match(/data-page="([^"]+)"/i);
                if (!match) {
                    return new Response("Could not locate video data payload", { status: 404 });
                }

                const decodedAttr = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
                const pageData = JSON.parse(decodedAttr);

                const txtUrl = pageData?.props?.video?.url;
                if (!txtUrl) {
                    return new Response("No direct video stream URL found in metadata", { status: 404 });
                }

                // 2. Fetch CDN .txt HLS payload
                const txtRes = await fetch(txtUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        "Referer": "https://animemami.xyz/"
                    }
                });

                if (!txtRes.ok) {
                    return new Response("CDN video playlist request failed", { status: txtRes.status });
                }

                const jsonText = await txtRes.text();
                const json = JSON.parse(jsonText);
                if (!json || !json.p) {
                    return new Response("Invalid CDN playlist payload", { status: 500 });
                }

                // 3. Decode base64 #EXTM3U playlist
                const rawM3u8 = atob(json.p);
                const baseUrlPrefix = txtUrl.substring(0, txtUrl.lastIndexOf("/") + 1);

                // Rewrite relative segment links to absolute CDN links
                const rewrittenM3u8 = rawM3u8.split("\n").map(line => {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("http")) {
                        return baseUrlPrefix + trimmed;
                    }
                    return line;
                }).join("\n");

                return new Response(rewrittenM3u8, {
                    status: 200,
                    headers: {
                        "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, OPTIONS",
                        "Cache-Control": "public, max-age=3600"
                    }
                });
            } catch (err) {
                return new Response("Worker HLS Error: " + err.message, { status: 500 });
            }
        }

        // Generic Proxy fallback endpoint
        if (url.pathname === "/proxy") {
            const targetUrl = url.searchParams.get("url");
            if (!targetUrl) return new Response("Missing target url", { status: 400 });

            try {
                let referer = "https://animeruka.com/";
                if (targetUrl.includes("mycdn-hd")) referer = "https://mycdn-hd.xyz/";

                const res = await fetch(targetUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        "Referer": referer
                    }
                });

                const responseHeaders = new Headers(res.headers);
                responseHeaders.set("Access-Control-Allow-Origin", "*");
                responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

                return new Response(res.body, {
                    status: res.status,
                    statusText: res.statusText,
                    headers: responseHeaders
                });
            } catch (err) {
                return new Response("Proxy error: " + err.message, { status: 500 });
            }
        }

        return new Response("AnimeRuka HLS Master Proxy Operational", { status: 200 });
    }
};
