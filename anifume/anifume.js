/**
 * Anifume Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://anifume.com/
 * Pure Client-Side Implementation (Multi-Server Direct MP4 Stream Extraction)
 */

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Referer": "https://anifume.com/"
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
        console.error("[Anifume] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

// ─── Search Results ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        const targetUrl = query !== "" ? `https://anifume.com/?s=${encodeURIComponent(query)}` : "https://anifume.com/";
        const html = await httpGet(targetUrl);
        if (!html) return JSON.stringify([]);

        const results = [];
        const seenHrefs = new Set();
        const cardRegex = /<a[^>]+href=["'](https:\/\/anifume\.com\/\d+\/?|[^"']*\/\d+\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = cardRegex.exec(html)) !== null) {
            let href = match[1];
            if (!href.startsWith('http')) href = 'https://anifume.com' + href;
            if (href.endsWith('/')) href = href.slice(0, -1);

            // Filter out notice pages like 41126
            if (href.includes('/41126')) continue;
            if (seenHrefs.has(href)) continue;

            const content = match[2];
            const imgMatch = content.match(/src=["']([^"']+)["']/i) || content.match(/data-src=["']([^"']+)["']/i);
            const titleMatch = content.match(/alt=["']([^"']+)["']/i) || content.match(/title=["']([^"']+)["']/i);

            let title = titleMatch ? titleMatch[1].trim() : content.replace(/<[^>]+>/g, '').trim();
            if (!title) continue;

            let image = imgMatch ? imgMatch[1] : "";
            if (image && !image.startsWith('http')) image = 'https://anifume.com' + image;

            if (image) {
                seenHrefs.add(href);
                results.push({ title, image, href });
            }
        }

        return JSON.stringify(results);
    } catch (error) {
        console.error("[Anifume] searchResults error: " + error.message);
        return JSON.stringify([]);
    }
}

// ─── Extract Details ───
async function extractDetails(url) {
    try {
        const targetUrl = url.split("?")[0];
        const html = await httpGet(targetUrl);
        if (!html) {
            return JSON.stringify([{ description: "No details available.", aliases: "Anifume", airdate: "N/A" }]);
        }

        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/Anifume/gi, '').replace(/[|-]/g, '').trim() : "Anifume";

        const descMatch = html.match(/<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                          html.match(/<div[^>]*class=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                          html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : "No description available.";

        const yearMatch = html.match(/\b(202\d|201\d)\b/);
        const airdate = yearMatch ? yearMatch[1] : "N/A";

        return JSON.stringify([{ title, description, aliases: "Anifume", airdate }]);
    } catch (error) {
        console.error("[Anifume] extractDetails error: " + error.message);
        return JSON.stringify([{ description: "Error loading description", aliases: "Anifume", airdate: "N/A" }]);
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
        const epRegex = /href=["'](https:\/\/anifume\.com\/\d+\/[A-Za-z0-9_\-]+)["']/gi;
        let match;

        while ((match = epRegex.exec(html)) !== null) {
            const epHref = match[1];
            if (seenHrefs.has(epHref)) continue;
            seenHrefs.add(epHref);

            episodes.push({
                href: epHref,
                number: episodes.length + 1,
                title: `Episode ${episodes.length + 1}`
            });
        }

        if (episodes.length === 0) {
            episodes.push({ href: baseUrl, number: 1, title: "Episode 1" });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[Anifume] extractEpisodes error: " + error.message);
        return JSON.stringify([{ href: url, number: 1, title: "Episode 1" }]);
    }
}

// ─── Extract Stream URL (Multi-Server Direct MP4 Extraction) ───
async function extractStreamUrl(url) {
    try {
        const epHtml = await httpGet(url, {
            "User-Agent": DEFAULT_HEADERS["User-Agent"],
            "Referer": "https://anifume.com/"
        });
        if (!epHtml) return JSON.stringify({ streams: [], subtitle: "" });

        // Find all AJAX endpoints for player servers (Server 1 Main, Server 2 Backup)
        const ajaxMatches = [...epHtml.matchAll(/url:\s*["']([^"']+)["']/gi)].map(m => m[1]);
        if (ajaxMatches.length === 0) return JSON.stringify({ streams: [], subtitle: "" });

        const streams = [];

        for (let sIdx = 0; sIdx < ajaxMatches.length; sIdx++) {
            const ajaxRel = ajaxMatches[sIdx];
            const serverName = `Server ${sIdx + 1}`;
            const ajaxUrl = ajaxRel.startsWith('http') ? ajaxRel : ('https://anifume.com' + ajaxRel);

            const ajaxHtml = await httpGet(ajaxUrl, {
                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                "Referer": url,
                "X-Requested-With": "XMLHttpRequest"
            });

            if (!ajaxHtml) continue;

            const iframeMatch = ajaxHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (!iframeMatch) continue;

            const playerUrl = iframeMatch[1].startsWith('http') ? iframeMatch[1] : ('https://anifume.com' + iframeMatch[1]);
            const playerHtml = await httpGet(playerUrl, {
                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                "Referer": "https://anifume.com/"
            });

            if (!playerHtml) continue;

            // Parse sources from JWPlayer setup JSON inside playerHtml
            const sourcesMatch = playerHtml.match(/"sources"\s*:\s*(\[[\s\S]*?\])/i);
            let parsedAny = false;

            if (sourcesMatch) {
                try {
                    const sourcesArr = JSON.parse(sourcesMatch[1]);
                    sourcesArr.forEach(src => {
                        if (src.file) {
                            parsedAny = true;
                            const label = src.label || "720p";
                            streams.push({
                                title: `Anifume (${serverName} ${label})`,
                                streamUrl: src.file,
                                url: src.file,
                                headers: {
                                    "User-Agent": DEFAULT_HEADERS["User-Agent"],
                                    "Referer": "https://anifume.com/"
                                }
                            });
                        }
                    });
                } catch (e) {
                    console.error("[Anifume] Error parsing sources JSON: " + e.message);
                }
            }

            // Direct regex fallback for MP4 URLs if JSON parsing missed any
            if (!parsedAny) {
                const mp4Matches = [...playerHtml.matchAll(/https?:\/\/[^\s'"<>]+\.mp4[^\s'"<>]*/gi)].map(m => m[0]);
                mp4Matches.forEach((mp4Url, idx) => {
                    const label = (idx === 0) ? "720p" : "360p";
                    streams.push({
                        title: `Anifume (${serverName} ${label})`,
                        streamUrl: mp4Url,
                        url: mp4Url,
                        headers: {
                            "User-Agent": DEFAULT_HEADERS["User-Agent"],
                            "Referer": "https://anifume.com/"
                        }
                    });
                });
            }
        }

        return JSON.stringify({ streams, subtitle: "" });
    } catch (error) {
        console.error("[Anifume] extractStreamUrl error: " + error.message);
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}
