/**
 * AniKoto Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine / Ibro
 * Site: https://animepahetv.to/
 * Cloudflare Worker API: https://anikoto-worker.premmiz-real.workers.dev
 */

const WORKER_BASE = "https://anikoto-worker.premmiz-real.workers.dev";

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
        console.error("[AniKoto] httpGet error for " + url + ": " + err.message);
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
                if (Array.isArray(items)) {
                    const transformed = items.map(item => ({
                        title: item.title || "Untitled",
                        image: item.poster || item.image || "",
                        href: item.href || ("anime/" + item.session)
                    }));
                    return JSON.stringify(transformed);
                }
            } catch (e) {}
        }

        // Direct Fallback Search
        const base = "https://animepahetv.to/search?q=" + encodeURIComponent(query).replace(/%20/g, "+");
        const html = await httpGet(base, { ...DEFAULT_HEADERS, "Referer": "https://animepahetv.to/" });
        if (!html) return JSON.stringify([]);

        const items = [];
        const blocks = html.split('<div class="anime-item">');
        for (let i = 1; i < blocks.length; i++) {
            const block = blocks[i];
            const posterLinkMatch = block.match(/<a\s+[^>]*href="https:\/\/animepahetv\.to\/anime\/([^"]+)"[^>]*class="anime-poster"/);
            if (!posterLinkMatch) continue;
            const session = posterLinkMatch[1];
            const titleMatch = block.match(/<div\s+class="anime-name">\s*<a[^>]*>([^<]+)<\/a>/);
            const title = titleMatch ? titleMatch[1].trim() : "Untitled";
            const imgMatch = block.match(/<img\s+[^>]*src="([^"]+)"[^>]*class="lazyload"/);
            const poster = imgMatch ? imgMatch[1] : "";
            items.push({ title, image: poster, href: "anime/" + session });
        }

        return JSON.stringify(items);
    } catch (error) {
        console.error("[AniKoto] searchResults error: " + error.message);
        return JSON.stringify([]);
    }
}

// ─── Extract Details ───
async function extractDetails(url) {
    try {
        const match = url.match(/anime\/([^\/]+)/);
        const session = match ? match[1] : null;
        
        if (session) {
            const apiUrl = `${WORKER_BASE}/api/details?session=${session}`;
            const jsonText = await httpGet(apiUrl);
            if (jsonText) {
                try {
                    const details = JSON.parse(jsonText);
                    if (details && details.title) {
                        return JSON.stringify([{
                            description: details.synopsis || "No description available.",
                            aliases: "Duration: " + (details.duration || "Unknown"),
                            airdate: "Aired: " + (details.aired || "Unknown")
                        }]);
                    }
                } catch (e) {}
            }
        }

        return JSON.stringify([{
            description: "No details available.",
            aliases: "AniKoto",
            airdate: "N/A"
        }]);
    } catch (error) {
        console.error("[AniKoto] extractDetails error: " + error.message);
        return JSON.stringify([{
            description: "Error loading description",
            aliases: "AniKoto",
            airdate: "N/A"
        }]);
    }
}

// ─── Extract Episodes ───
async function extractEpisodes(url) {
    try {
        const match = url.match(/anime\/([^\/]+)/);
        if (!match) return JSON.stringify([]);
        const session = match[1];

        const apiUrl = `${WORKER_BASE}/api/episodes?session=${session}`;
        const jsonText = await httpGet(apiUrl);

        if (jsonText) {
            try {
                const epList = JSON.parse(jsonText);
                if (Array.isArray(epList) && epList.length > 0) {
                    const transformed = epList.map(ep => ({
                        href: ep.href || ("anime/" + session + "/" + ep.session + "?num=" + ep.number),
                        number: ep.number,
                        title: ep.title || ("Episode " + ep.number)
                    }));
                    return JSON.stringify(transformed);
                }
            } catch (e) {}
        }

        // Direct Fallback Episodes
        const baseUrl = "https://animepahetv.to/viewApi?m=release&id=" + session + "&sort=episode_desc&page=1";
        const resText = await httpGet(baseUrl);
        if (!resText) return JSON.stringify([]);

        const json = JSON.parse(resText);
        const data = json.data || [];
        data.sort((a, b) => a.episode - b.episode);

        const episodes = data.map(ep => ({
            href: "anime/" + session + "/" + ep.session + "?num=" + ep.episode,
            number: ep.episode,
            title: "Episode " + ep.episode
        }));

        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[AniKoto] extractEpisodes error: " + error.message);
        return JSON.stringify([]);
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
            subtitles: "",
            subtitlesHeaders: {},
            allSubtitles: []
        });
    } catch (error) {
        console.error("[AniKoto] extractStreamUrl error: " + error.message);
        return JSON.stringify({
            streams: [],
            subtitles: "",
            subtitlesHeaders: {},
            allSubtitles: []
        });
    }
}
