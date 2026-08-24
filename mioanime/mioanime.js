/**
 * MioAnime Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://www.mioanime.com/ (https://www.mioanime.net/)
 * Pure Client-Side Implementation (No Cloudflare Worker Required)
 */

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Referer": "https://www.mioanime.net/"
};

async function httpGet(url, headers = DEFAULT_HEADERS) {
    try {
        let res;
        if (typeof fetchv2 !== "undefined") {
            res = await fetchv2(url, headers);
        } else if (typeof fetch !== "undefined") {
            res = await fetch(url, { headers: headers });
        }
        if (!res) return null;

        if (typeof res.text === "function") {
            return await res.text();
        } else if (typeof res === "string") {
            return res;
        }
        return null;
    } catch (err) {
        console.error("[MioAnime] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

// Helper function to unpack Dean Edwards packed JS
function unpackDeanEdwards(packedCode) {
    try {
        if (!packedCode.includes('eval(')) return packedCode;
        const unpacked = new Function('return ' + packedCode.replace(/^[\s\S]*?eval\(/, '(').replace(/\);?$/, ')'))();
        return unpacked || packedCode;
    } catch (e) {
        return packedCode;
    }
}

// ─── Search Results ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        const targetUrl = query !== "" ? `https://www.mioanime.net/?s=${encodeURIComponent(query)}` : "https://www.mioanime.net/";
        const html = await httpGet(targetUrl);
        if (!html) return JSON.stringify([]);

        const results = [];
        const seenHrefs = new Set();
        const cardRegex = /<a[^>]+href=["'](\/(?:[0-9]+)\/|https:\/\/www\.mioanime\.net\/(?:[0-9]+)\/)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = cardRegex.exec(html)) !== null) {
            let href = match[1];
            if (href.startsWith('/')) href = 'https://www.mioanime.net' + href;
            if (seenHrefs.has(href)) continue;
            seenHrefs.add(href);

            const content = match[2];

            const dataSrcMatch = content.match(/data-src=["']([^"']+)["']/i);
            const srcMatch = content.match(/src=["']([^"']+)["']/i);

            let image = "";
            if (dataSrcMatch && !dataSrcMatch[1].startsWith('data:')) {
                image = dataSrcMatch[1];
            } else if (srcMatch && !srcMatch[1].startsWith('data:')) {
                image = srcMatch[1];
            }

            if (image && image.startsWith('/')) {
                image = 'https://www.mioanime.net' + image;
            }

            const titleMatch = content.match(/alt=["']([^"']+)["']/i) || content.match(/title=["']([^"']+)["']/i);
            let title = titleMatch ? titleMatch[1].trim() : content.replace(/<[^>]+>/g, '').trim();
            if (!title) title = "MioAnime Title";

            results.push({ title, image, href });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.error("[MioAnime] searchResults error: " + error.message);
        return JSON.stringify([]);
    }
}

// ─── Extract Details ───
async function extractDetails(url) {
    try {
        const targetUrl = url.split("?")[0];
        const html = await httpGet(targetUrl);
        if (!html) {
            return JSON.stringify([{ description: "No details available.", aliases: "MioAnime", airdate: "N/A" }]);
        }

        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/MioAnime/gi, '').replace(/[|-]/g, '').trim() : "MioAnime";

        const descMatch = html.match(/<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                          html.match(/<meta name="description" content="([^"]+)"/i);
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : "No description available.";

        const yearMatch = html.match(/\b(202\d|201\d)\b/);
        const airdate = yearMatch ? yearMatch[1] : "N/A";

        return JSON.stringify([{ title, description, aliases: "MioAnime", airdate }]);
    } catch (error) {
        console.error("[MioAnime] extractDetails error: " + error.message);
        return JSON.stringify([{ description: "Error loading description", aliases: "MioAnime", airdate: "N/A" }]);
    }
}

// ─── Extract Episodes ───
async function extractEpisodes(url) {
    try {
        const baseUrl = url.split("?")[0];
        const html = await httpGet(baseUrl);
        if (!html) return JSON.stringify([{ href: baseUrl, number: 1, title: "Episode 1" }]);

        const episodes = [];
        const seenHrefs = new Set();
        const epRegex = /href=["'](https:\/\/www\.mioanime\.net\/play\/[^"']+)["']/gi;
        let match;

        while ((match = epRegex.exec(html)) !== null) {
            const epHref = match[1];
            if (seenHrefs.has(epHref)) continue;
            seenHrefs.add(epHref);

            const decoded = decodeURIComponent(epHref);
            const numMatch = decoded.match(/ตอนที่\s*(\d+)/i) || decoded.match(/ep\s*(\d+)/i) || decoded.match(/-(\d+)\.html/i);
            const number = numMatch ? parseInt(numMatch[1], 10) : (episodes.length + 1);

            episodes.push({
                href: epHref,
                number: isNaN(number) ? (episodes.length + 1) : number,
                title: `Episode ${isNaN(number) ? (episodes.length + 1) : number}`
            });
        }

        if (episodes.length === 0) {
            episodes.push({ href: baseUrl, number: 1, title: "Episode 1" });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[MioAnime] extractEpisodes error: " + error.message);
        return JSON.stringify([{ href: url, number: 1, title: "Episode 1" }]);
    }
}

// ─── Extract Stream URL (JuicyCodes & Master/Sub Playlist Resolution) ───
async function extractStreamUrl(url) {
    try {
        const pageHtml = await httpGet(url, DEFAULT_HEADERS);
        if (!pageHtml) return JSON.stringify({ streams: [], subtitle: "" });

        const iframeMatches = [...pageHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
        if (iframeMatches.length === 0) return JSON.stringify({ streams: [], subtitle: "" });

        let playerHtml = null;

        // Check each iframe until we find core player with JuicyCodes
        for (const frameSrc of iframeMatches) {
            let targetFrame = frameSrc.startsWith('/') ? ('https://www.mioanime.net' + frameSrc) : frameSrc;
            const html = await httpGet(targetFrame, DEFAULT_HEADERS);
            if (html && (html.includes('JuicyCodes') || html.includes('/player/'))) {
                playerHtml = html;

                // Check if inner iframe exists
                const innerFrameMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (innerFrameMatch) {
                    let innerUrl = innerFrameMatch[1].startsWith('/') ? ('https://www.mioanime.net' + innerFrameMatch[1]) : innerFrameMatch[1];
                    const innerHtml = await httpGet(innerUrl, DEFAULT_HEADERS);
                    if (innerHtml && innerHtml.includes('JuicyCodes')) {
                        playerHtml = innerHtml;
                    }
                }
                break;
            }
        }

        if (!playerHtml) return JSON.stringify({ streams: [], subtitle: "" });

        const juicyMatch = playerHtml.match(/JuicyCodes\.Run\(([\s\S]*?)\);/);
        if (!juicyMatch) return JSON.stringify({ streams: [], subtitle: "" });

        const rawArg = juicyMatch[1];
        let b64 = "";
        try {
            b64 = new Function(`return ${rawArg}`)();
        } catch (e) {
            b64 = rawArg.replace(/["'\s+]/g, '');
        }

        if (!b64) return JSON.stringify({ streams: [], subtitle: "" });

        const decoded = (typeof Buffer !== "undefined")
            ? Buffer.from(b64, 'base64').toString('utf-8')
            : atob(b64);

        const unpacked = unpackDeanEdwards(decoded);
        const streams = [];

        // Extract master playlist URL
        const playlistMatches = [...unpacked.matchAll(/https?:\/\/[^\s'"<>\)\};]+\/hls\/playlist\/[^\s'"<>\)\};]+/gi)].map(m => m[0]);
        const m3u8Matches = [...unpacked.matchAll(/https?:\/\/[^\s'"<>\)\};]+\.m3u8[^\s'"<>\)\};]*/gi)].map(m => m[0]);

        const masterUrls = [...new Set([...playlistMatches, ...m3u8Matches])];

        for (const masterUrl of masterUrls) {
            // Fetch master playlist to parse direct sub-playlist URLs (e.g. 1080p)
            const masterText = await httpGet(masterUrl, DEFAULT_HEADERS);

            if (masterText && masterText.includes('#EXTM3U')) {
                try {
                    const origin = new URL(masterUrl).origin;
                    const lines = masterText.split('\n');
                    let currentRes = "1080p";

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (line.startsWith('#EXT-X-STREAM-INF:')) {
                            const resMatch = line.match(/RESOLUTION=\d+x(\d+)/i);
                            if (resMatch) currentRes = `${resMatch[1]}p`;
                        } else if (line.startsWith('/hls/') || line.endsWith('.m3u8')) {
                            const subUrl = line.startsWith('http') ? line : (origin + line);
                            streams.push({
                                title: `MioAnime (${currentRes})`,
                                streamUrl: subUrl,
                                url: subUrl,
                                headers: {
                                    "Referer": "https://www.mioanime.net/",
                                    "User-Agent": DEFAULT_HEADERS["User-Agent"]
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.error("[MioAnime] Error parsing sub-playlist: " + e.message);
                }
            }

            // Always add master playlist URL as fallback
            streams.push({
                title: `MioAnime (Master HLS)`,
                streamUrl: masterUrl,
                url: masterUrl,
                headers: {
                    "Referer": "https://www.mioanime.net/",
                    "User-Agent": DEFAULT_HEADERS["User-Agent"]
                }
            });
        }

        return JSON.stringify({ streams, subtitle: "" });
    } catch (error) {
        console.error("[MioAnime] extractStreamUrl error: " + error.message);
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}
