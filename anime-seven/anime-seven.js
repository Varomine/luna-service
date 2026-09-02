/**
 * Anime-Seven Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://www.anime-seven.com/
 * Stream Type: Multi-Server (Nya Stream & DooDee Player Engine)
 * Version: 1.0.0
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

async function httpPost(url, payload, customHeaders = DEFAULT_HEADERS) {
    try {
        let headersObj = Object.assign({}, DEFAULT_HEADERS, {
            "Content-Type": "application/x-www-form-urlencoded"
        });

        if (typeof customHeaders === "string") {
            headersObj["Referer"] = customHeaders;
        } else if (customHeaders && typeof customHeaders === "object") {
            Object.assign(headersObj, customHeaders);
        }

        let res;
        if (typeof fetchv2 !== "undefined") {
            res = await fetchv2(url, headersObj, "POST", payload);
        } else if (typeof fetch !== "undefined") {
            res = await fetch(url, {
                method: "POST",
                headers: headersObj,
                body: payload
            });
        }
        if (!res) return null;

        if (typeof res.text === "function") {
            return await res.text();
        } else if (typeof res === "string") {
            return res;
        }
        return null;
    } catch (err) {
        console.error("[Anime-Seven] httpPost error for " + url + ": " + err.message);
        return null;
    }
}

// ─── Search Results ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        let html;

        if (query !== "") {
            const payload = `search=${encodeURIComponent(query)}`;
            html = await httpPost("https://www.anime-seven.com/index.php", payload);
        } else {
            html = await httpGet("https://www.anime-seven.com/");
        }

        if (!html || html === "undefined") {
            return JSON.stringify([]);
        }

        const results = [];
        const seen = new Set();

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

// ─── Extract Episodes ───
async function extractEpisodes(url) {
    try {
        const baseUrl = url.split("?")[0];
        const html = await httpGet(baseUrl);
        if (!html || html === "undefined") {
            return JSON.stringify([{ href: baseUrl, number: 1 }]);
        }

        const episodes = [];
        const seen = new Set();
        const epRegex = /href=["'](https:\/\/www\.anime-seven\.com\/play\/([0-9]+)\/([^"']+)\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = epRegex.exec(html)) !== null) {
            const href = match[1];
            const slug = match[3];
            const text = match[4].replace(/<[^>]+>/g, '').trim();

            if (seen.has(href)) continue;

            const numMatch = slug.match(/-(\d+)(?:\.html)?$/) ||
                             text.match(/ตอนที่\s*(\d+)/i) ||
                             text.match(/EP\.?\s*(\d+)/i) ||
                             text.match(/(\d+)/);
            const number = numMatch ? parseInt(numMatch[1], 10) : (episodes.length + 1);

            seen.add(href);
            episodes.push({ href, number });
        }

        if (episodes.length === 0) {
            episodes.push({ href: baseUrl, number: 1 });
        }

        episodes.sort((a, b) => a.number - b.number);
        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[Anime-Seven] extractEpisodes error: " + error.message);
        return JSON.stringify([{ href: url, number: 1 }]);
    }
}

// ─── Extract Stream URL (Multi-Server Stream Extraction) ───
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

        const streams = [];
        const serverRegex = /class=["']linkserver["'][^>]*data-video=["']([^"']+)["']/gi;
        let sMatch;
        let serverIndex = 1;

        while ((sMatch = serverRegex.exec(pyHtml)) !== null) {
            const streamUrl = sMatch[1];
            let name = `Anime-Seven • Server ${serverIndex}`;
            if (streamUrl.includes('nya.animenani')) name = `Anime-Seven • Nya Stream (${serverIndex})`;
            else if (streamUrl.includes('doodee-player')) name = `Anime-Seven • DooDee Player (${serverIndex})`;

            streams.push({
                title: name,
                streamUrl: streamUrl,
                url: streamUrl,
                headers: {
                    "User-Agent": DEFAULT_HEADERS["User-Agent"],
                    "Referer": playervyUrl
                }
            });
            serverIndex++;
        }

        if (streams.length === 0) {
            streams.push({
                title: "Anime-Seven • Playervy Embed",
                streamUrl: playervyUrl,
                url: playervyUrl,
                headers: {
                    "User-Agent": DEFAULT_HEADERS["User-Agent"],
                    "Referer": url
                }
            });
        }

        return JSON.stringify({
            streams: streams,
            url: streams[0].streamUrl,
            streamUrl: streams[0].streamUrl,
            subtitle: ""
        });
    } catch (error) {
        console.error("[Anime-Seven] extractStreamUrl error: " + error.message);
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}
