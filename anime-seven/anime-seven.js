/**
 * Anime-Seven Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://www.anime-seven.com/
 * Stream Type: Direct Native HLS Master Stream & All-Seasons Engine
 * Version: 1.0.4
 */

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
    "Referer": "https://www.anime-seven.com/"
};

async function httpGet(url, customHeaders = DEFAULT_HEADERS) {
    try {
        let headersObj = DEFAULT_HEADERS;
        if (typeof customHeaders === "string") {
            headersObj = {
                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                "Referer": customHeaders
            };
        } else if (customHeaders && typeof customHeaders === "object") {
            headersObj = Object.assign({}, DEFAULT_HEADERS, customHeaders);
        }

        let res;
        if (typeof fetchv2 !== "undefined") {
            res = await fetchv2(url, headersObj);
        } else if (typeof fetch !== "undefined") {
            res = await fetch(url, { headers: headersObj });
        }
        if (!res) return null;

        if (typeof res.text === "function") {
            return await res.text();
        } else if (typeof res === "string") {
            return res;
        }
        return null;
    } catch (err) {
        console.error("[Anime-Seven] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

// ─── Search Results (Tag Search + Title Filtering) ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        let html;

        if (query !== "") {
            const targetUrl = `https://www.anime-seven.com/tag/${encodeURIComponent(query)}`;
            html = await httpGet(targetUrl);
        } else {
            html = await httpGet("https://www.anime-seven.com/");
        }

        if (!html || html === "undefined") {
            return JSON.stringify([]);
        }

        const results = [];
        const seen = new Set();
        const lowerQuery = query.toLowerCase();

        const cardMatches = [...html.matchAll(/<a[^>]+href=["'](https:\/\/www\.anime-seven\.com\/[0-9]+\/?)["'][^>]*>([\s\S]*?)<\/a>/gi)];

        for (const match of cardMatches) {
            const href = match[1];
            const inner = match[2];

            if (seen.has(href)) continue;

            const titleMatch = inner.match(/title=["']([^"']+)["']/i) ||
                               inner.match(/alt=["']([^"']+)["']/i) ||
                               inner.match(/class=["'][^"']*caption[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|h3|h2|p)>/i);

            let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

            const imgMatch = inner.match(/data-src=["']([^"']+)["']/i) ||
                             inner.match(/src=["']([^"']+)["']/i);
            let image = imgMatch ? imgMatch[1] : '';
            if (image.startsWith('//')) image = 'https:' + image;

            if (!title || title === "Anime-Seven" || title.toLowerCase().includes("filter")) continue;

            // Strict title filtering when query is provided
            if (lowerQuery !== "" && !title.toLowerCase().includes(lowerQuery)) {
                continue;
            }

            seen.add(href);
            results.push({ title, image, href });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.error("[Anime-Seven] searchResults error: " + error.message);
        return JSON.stringify([]);
    }
}

// ─── Extract Details ───
async function extractDetails(url) {
    try {
        const baseUrl = url.split("?")[0];
        const html = await httpGet(baseUrl);
        if (!html || html === "undefined") {
            return JSON.stringify([{
                description: "No details available.",
                aliases: "Anime-Seven",
                airdate: "N/A"
            }]);
        }

        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
                           html.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Anime-Seven";

        const descMatch = html.match(/<div[^>]+class=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                          html.match(/<meta name="description" content="([^"]+)"/i);
        let description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "Anime Subthai & Dubbed on Anime-Seven";

        const yearMatch = html.match(/\b(202\d|201\d)\b/);
        const airdate = yearMatch ? yearMatch[1] : "N/A";

        return JSON.stringify([{
            description: description,
            aliases: title,
            airdate: airdate
        }]);
    } catch (error) {
        console.error("[Anime-Seven] extractDetails error: " + error.message);
        return JSON.stringify([{
            description: "Error loading details",
            aliases: "Anime-Seven",
            airdate: "N/A"
        }]);
    }
}

// ─── Extract Episodes (All-Seasons Extractor & Backup Link Removal) ───
async function extractEpisodes(url) {
    try {
        const baseUrl = url.split("?")[0];
        const html = await httpGet(baseUrl);
        if (!html || html === "undefined") {
            return JSON.stringify([{ href: baseUrl, number: 1 }]);
        }

        const matches = [...html.matchAll(/<a[^>]+href=["'](https:\/\/www\.anime-seven\.com\/play\/[0-9]+\/([^"']+)\.html)["'][^>]*>([\s\S]*?)<\/a>/gi)];
        
        const episodes = [];
        const seenHrefs = new Set();
        let currentNumber = 1;

        for (const m of matches) {
            const href = m[1];
            const slug = m[2];
            const text = m[3].replace(/<[^>]+>/g, '').trim();

            if (seenHrefs.has(href)) continue;
            seenHrefs.add(href);

            // Skip backup episode links ("สำรองตอนที่ ...")
            if (text.includes('สำรอง') || slug.match(/^\d+$/)) {
                continue;
            }

            episodes.push({ href, number: currentNumber++ });
        }

        if (episodes.length === 0) {
            episodes.push({ href: baseUrl, number: 1 });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[Anime-Seven] extractEpisodes error: " + error.message);
        return JSON.stringify([{ href: url, number: 1 }]);
    }
}

// ─── Extract Stream URL (Direct Native HLS Master Stream Extraction) ───
async function extractStreamUrl(url) {
    try {
        let playervyUrl = null;
        const playIdMatch = url.match(/\/play\/([0-9]+)\//);

        if (playIdMatch) {
            playervyUrl = `https://www.anime-seven.com/playervy/${playIdMatch[1]}`;
        } else {
            const html = await httpGet(url);
            if (html) {
                const playerUrlMatch = html.match(/PLAYER_URL\s*=\s*["']([^"']+)["']/i) ||
                                       html.match(/playery\/([0-9]+)/i) ||
                                       html.match(/playervy\/([0-9]+)/i);
                if (playerUrlMatch) {
                    const id = playerUrlMatch[1].replace(/.*playery\//, '').replace(/.*playervy\//, '');
                    playervyUrl = `https://www.anime-seven.com/playervy/${id}`;
                }
            }
        }

        if (!playervyUrl) return JSON.stringify({ streams: [], subtitle: "" });

        const pyHtml = await httpGet(playervyUrl, url);
        if (!pyHtml) return JSON.stringify({ streams: [], subtitle: "" });

        // Extract DocID from Nya Stream embed URL
        const nyaEmbedMatch = pyHtml.match(/https:\/\/nya\.animenani\.com\/embed\/([a-zA-Z0-9_-]+)/i);
        if (nyaEmbedMatch) {
            const docId = nyaEmbedMatch[1];
            const embedUrl = nyaEmbedMatch[0];
            const statusApiUrl = `https://nya.animenani.com/api/v1/public/embed/${docId}/status`;
            
            const statusJsonStr = await httpGet(statusApiUrl, embedUrl);
            if (statusJsonStr) {
                try {
                    const statusData = JSON.parse(statusJsonStr);
                    if (statusData && statusData.manifestUrl) {
                        const directHlsUrl = statusData.manifestUrl;

                        return JSON.stringify({
                            streams: [
                                {
                                    title: "Anime-Seven • Direct HLS Master Stream (m3u8)",
                                    streamUrl: directHlsUrl,
                                    url: directHlsUrl,
                                    headers: {
                                        "User-Agent": DEFAULT_HEADERS["User-Agent"],
                                        "Referer": "https://nya.animenani.com/"
                                    }
                                }
                            ],
                            url: directHlsUrl,
                            streamUrl: directHlsUrl,
                            subtitle: ""
                        });
                    }
                } catch(e) {
                    console.error("[Anime-Seven] Failed to parse status API JSON: " + e.message);
                }
            }
        }

        return JSON.stringify({ streams: [], subtitle: "" });
    } catch (error) {
        console.error("[Anime-Seven] extractStreamUrl error: " + error.message);
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}
