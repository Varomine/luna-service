/**
 * Alpha-Hen Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://www.alpha-hen.com/
 * Cloudflare Worker API: https://alpha-hen-worker.sapis.workers.dev
 */

const WORKER_BASE = "https://alpha-hen-worker.sapis.workers.dev";

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
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
        console.error("[Alpha-Hen] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

// ─── Search Results ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        const apiUrl = `${WORKER_BASE}/api/search?q=${encodeURIComponent(query)}`;
        const jsonText = await httpGet(apiUrl);

        if (jsonText) {
            try {
                const items = JSON.parse(jsonText);
                if (Array.isArray(items) && items.length > 0) {
                    return JSON.stringify(items);
                }
            } catch (e) {}
        }

        // Direct Fallback Search
        const targetUrl = query !== "" ? `https://www.alpha-hen.com/?s=${encodeURIComponent(query)}` : "https://www.alpha-hen.com/";
        const html = await httpGet(targetUrl);
        if (!html) return JSON.stringify([]);

        const results = [];
        const cardRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
        let match;

        while ((match = cardRegex.exec(html)) !== null) {
            const content = match[1];
            const linkMatch = content.match(/href="(https:\/\/www\.alpha-hen\.com\/[a-z0-9\-]+\/)"/i);
            if (!linkMatch) continue;

            const href = linkMatch[1];
            if (href.includes('/page/') || href.includes('/category/') || href.includes('/watch/')) continue;

            const titleMatch = content.match(/<h2[^>]*class="[^"]*ez-card-title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i) ||
                               content.match(/<h\d[^>]*>([\s\S]*?)<\/h\d>/i);
            let title = "Untitled";
            if (titleMatch) {
                title = titleMatch[1].replace(/<[^>]+>/g, '').replace(/^Hentai/i, '').trim();
            }

            const imgMatch = content.match(/src="(https:\/\/www\.alpha-hen\.com\/wp-content\/uploads\/[^"]+)"/i) ||
                             content.match(/srcset="([^"]+)"/i);
            let image = "";
            if (imgMatch) {
                const rawImg = imgMatch[1].split(',')[0].split(' ')[0];
                image = rawImg.trim();
            }

            results.push({ title, image, href });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.error("[Alpha-Hen] searchResults error: " + error.message);
        return JSON.stringify([]);
    }
}

// ─── Extract Details ───
async function extractDetails(url) {
    try {
        const apiUrl = `${WORKER_BASE}/api/details?url=${encodeURIComponent(url)}`;
        const jsonText = await httpGet(apiUrl);

        if (jsonText) {
            try {
                const details = JSON.parse(jsonText);
                if (Array.isArray(details) && details.length > 0) {
                    return JSON.stringify(details);
                }
            } catch (e) {}
        }

        // Direct Fallback Details
        const html = await httpGet(url.split("?")[0]);
        if (!html) {
            return JSON.stringify([{ description: "No details available.", aliases: "Alpha-Hen", airdate: "N/A" }]);
        }

        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || html.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/Alpha-Hen/gi, '').replace(/[|-]/g, '').trim() : "Alpha-Hen";

        const descMatch = html.match(/<div class="[^"]*entry-content[^"]*">([\s\S]*?)<\/div>/i) ||
                          html.match(/<meta name="description" content="([^"]+)"/i);
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : "No description available.";

        const yearMatch = html.match(/\b(202\d|201\d)\b/);
        const airdate = yearMatch ? yearMatch[1] : "N/A";

        return JSON.stringify([{ title, description, aliases: "Alpha-Hen", airdate }]);
    } catch (error) {
        console.error("[Alpha-Hen] extractDetails error: " + error.message);
        return JSON.stringify([{ description: "Error loading description", aliases: "Alpha-Hen", airdate: "N/A" }]);
    }
}

// ─── Extract Episodes ───
async function extractEpisodes(url) {
    try {
        const apiUrl = `${WORKER_BASE}/api/episodes?url=${encodeURIComponent(url)}`;
        const jsonText = await httpGet(apiUrl);

        if (jsonText) {
            try {
                const epList = JSON.parse(jsonText);
                if (Array.isArray(epList) && epList.length > 0) {
                    return JSON.stringify(epList);
                }
            } catch (e) {}
        }

        // Direct Fallback Episodes
        const baseUrl = url.split("?")[0];
        const html = await httpGet(baseUrl);
        if (!html) return JSON.stringify([{ href: baseUrl, number: 1, title: "Episode 1" }]);

        const episodes = [];
        const seenHrefs = new Set();
        const epRegex = /href="(https:\/\/www\.alpha-hen\.com\/watch\/[^"]+)"/gi;
        let match;

        while ((match = epRegex.exec(html)) !== null) {
            const epHref = match[1];
            if (seenHrefs.has(epHref)) continue;
            seenHrefs.add(epHref);

            const decoded = decodeURIComponent(epHref);
            const numMatch = decoded.match(/ตอนที่\s*(\d+)/i) || decoded.match(/ep\s*(\d+)/i) || decoded.match(/-(\d+)\/?$/);
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
        console.error("[Alpha-Hen] extractEpisodes error: " + error.message);
        return JSON.stringify([{ href: url, number: 1, title: "Episode 1" }]);
    }
}

// ─── Extract Stream URL ───
async function extractStreamUrl(url) {
    try {
        const apiUrl = `${WORKER_BASE}/api/stream?url=${encodeURIComponent(url)}`;
        const jsonText = await httpGet(apiUrl);

        if (jsonText) {
            try {
                const streamData = JSON.parse(jsonText);
                if (streamData && streamData.streams && streamData.streams.length > 0) {
                    return JSON.stringify(streamData);
                }
            } catch (e) {}
        }

        return JSON.stringify({
            streams: [],
            subtitle: ""
        });
    } catch (error) {
        console.error("[Alpha-Hen] extractStreamUrl error: " + error.message);
        return JSON.stringify({
            streams: [],
            subtitle: ""
        });
    }
}
