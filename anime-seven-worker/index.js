/**
 * Anime-Seven High-Performance Stream Deobfuscator Worker
 * Bypasses PNG (.webp) segment obfuscation and serves pure video/mp2t to Luna
 */

import { nyaDeobfuscate } from './secret_core.js';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const pathname = url.pathname;

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*"
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // 1. M3U8 Playlist Proxy: /m3u8?url=...
        if (pathname === "/m3u8") {
            const targetUrl = url.searchParams.get("url");
            if (!targetUrl) {
                return new Response("Missing url parameter", { status: 400, headers: corsHeaders });
            }

            const res = await fetch(targetUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)",
                    "Referer": "https://nya.animenani.com/"
                }
            });

            if (!res.ok) {
                return new Response("Failed to fetch playlist", { status: res.status, headers: corsHeaders });
            }

            const rawContent = await res.text();
            const targetBase = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

            const lines = rawContent.split("\n");
            const rewrittenLines = lines.map(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) return line;

                let fullSegUrl;
                if (trimmed.startsWith("http")) {
                    fullSegUrl = trimmed;
                } else if (trimmed.startsWith("/")) {
                    const uObj = new URL(targetUrl);
                    fullSegUrl = `${uObj.protocol}//${uObj.host}${trimmed}`;
                } else {
                    fullSegUrl = `${targetBase}${trimmed}`;
                }

                if (trimmed.endsWith(".webp") || trimmed.includes("/s/")) {
                    return `${url.origin}/seg?url=${encodeURIComponent(fullSegUrl)}`;
                } else {
                    return `${url.origin}/m3u8?url=${encodeURIComponent(fullSegUrl)}`;
                }
            });

            return new Response(rewrittenLines.join("\n"), {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/vnd.apple.mpegurl",
                    "Cache-Control": "no-cache"
                }
            });
        }

        // 2. Segment Deobfuscation Proxy: /seg?url=...
        if (pathname === "/seg") {
            const segUrl = url.searchParams.get("url");
            if (!segUrl) {
                return new Response("Missing url parameter", { status: 400, headers: corsHeaders });
            }

            const res = await fetch(segUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X)",
                    "Referer": "https://nya.animenani.com/"
                }
            });

            if (!res.ok) {
                return new Response("Failed to fetch segment", { status: res.status, headers: corsHeaders });
            }

            const obfArrayBuffer = await res.arrayBuffer();
            const obfBytes = new Uint8Array(obfArrayBuffer);

            let finalBuffer = obfArrayBuffer;

            // Check if PNG header (89 50 4E 47) and deobfuscate
            if (obfBytes[0] === 0x89 && obfBytes[1] === 0x50 && typeof nyaDeobfuscate === 'function') {
                try {
                    const deobfArr = nyaDeobfuscate(obfArrayBuffer);
                    finalBuffer = deobfArr.buffer ? deobfArr.buffer.slice(deobfArr.byteOffset, deobfArr.byteOffset + deobfArr.byteLength) : deobfArr;
                } catch(err) {
                    console.error("Deobfuscation exec error:", err.message);
                }
            }

            return new Response(finalBuffer, {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "video/mp2t",
                    "Content-Length": finalBuffer.byteLength.toString(),
                    "Cache-Control": "public, max-age=31536000"
                }
            });
        }

        return new Response("Anime-Seven Cloudflare Worker Proxy Active", { headers: corsHeaders });
    }
};
