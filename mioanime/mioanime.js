/**
 * MioAnime Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Powered by User's MioAnime Scraper API Worker (https://mioanime-scraper-worker.sapis.workers.dev)
 * Version: 1.0.3
 */

const API_BASE = "https://mioanime-scraper-worker.sapis.workers.dev";

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
};

function extractAnimeId(url) {
    if (!url) return "";
    const cleanUrl = url.split("?")[0].replace(/\/$/, "");
    const parts = cleanUrl.split("/");
    return parts[parts.length - 1] || "";
}

async function httpGet(url, headers = DEFAULT_HEADERS) {
    try {
        let res;
        if (typeof fetchv2 !== "undefined") {
            res = await fetchv2(url, headers);
        } else if (typeof fetch !== "undefined") {
            res = await fetch(url, { headers: headers });
        }
        if (!res) return null;

        if (typeof res.json === "function") {
            return await res.json();
        } else if (typeof res.text === "function") {
            const text = await res.text();
            try { return JSON.parse(text); } catch (e) { return text; }
        }
        return null;
    } catch (err) {
        console.error("[MioAnime] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

// ─── Search Results ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        const targetUrl = `${API_BASE}/api/search?q=${encodeURIComponent(query)}`;
        const data = await httpGet(targetUrl);
        if (!data || !Array.isArray(data)) return JSON.stringify([]);

        const results = data.map(item => {
            const animeId = item.id || extractAnimeId(item.url || "");
            return {
                title: item.title || "MioAnime",
                image: item.image || "https://www.mioanime.net/icon/favicon.png",
                href: `https://www.mioanime.net/${animeId}/`
            };
        });

        return JSON.stringify(results);
    } catch (error) {
        console.error("[MioAnime] searchResults error: " + error.message);
        return JSON.stringify([]);
    }
}

// ─── Extract Details ───
async function extractDetails(url) {
    try {
        const id = extractAnimeId(url);
        if (!id) {
            return JSON.stringify([{ description: "No details available.", aliases: "MioAnime", airdate: "N/A" }]);
        }

        const data = await httpGet(`${API_BASE}/api/anime/${id}`);
        if (!data) {
            return JSON.stringify([{ description: "No details available.", aliases: "MioAnime", airdate: "N/A" }]);
        }

        const title = data.title || "MioAnime";
        const yearMatch = title.match(/\b(202\d|201\d)\b/);
        const airdate = yearMatch ? yearMatch[1] : "N/A";

        return JSON.stringify([{
            title: title,
            description: title,
            aliases: "MioAnime",
            airdate: airdate
        }]);
    } catch (error) {
        console.error("[MioAnime] extractDetails error: " + error.message);
        return JSON.stringify([{ description: "Error loading description", aliases: "MioAnime", airdate: "N/A" }]);
    }
}

// ─── Extract Episodes ───
async function extractEpisodes(url) {
    try {
        const id = extractAnimeId(url);
        if (!id) return JSON.stringify([{ href: url, number: 1, title: "Episode 1" }]);

        const animeData = await httpGet(`${API_BASE}/api/anime/${id}`);
        if (!animeData || !animeData.seasons || animeData.seasons.length === 0) {
            return JSON.stringify([{ href: url, number: 1, title: "Episode 1" }]);
        }

        const episodes = [];
        for (const season of animeData.seasons) {
            const seasonUrl = season.url || `https://www.mioanime.net/${id}/`;
            const seasonData = await httpGet(`${API_BASE}/api/season?url=${encodeURIComponent(seasonUrl)}`);

            if (seasonData && seasonData.episodes && Array.isArray(seasonData.episodes)) {
                seasonData.episodes.forEach(ep => {
                    const epTitle = ep.title || "";
                    const numMatch = epTitle.match(/ตอนที่\s*(\d+)/i) || epTitle.match(/ep\s*(\d+)/i) || epTitle.match(/\b(\d+)\b/);
                    const number = numMatch ? parseInt(numMatch[1], 10) : (episodes.length + 1);

                    episodes.push({
                        href: ep.url,
                        number: isNaN(number) ? (episodes.length + 1) : number,
                        title: epTitle || `Episode ${episodes.length + 1}`
                    });
                });
            }
        }

        if (episodes.length === 0) {
            episodes.push({ href: url, number: 1, title: "Episode 1" });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[MioAnime] extractEpisodes error: " + error.message);
        return JSON.stringify([{ href: url, number: 1, title: "Episode 1" }]);
    }
}

// ─── Extract Stream URL (User API Proxy Resolution) ───
async function extractStreamUrl(url) {
    try {
        const streamData = await httpGet(`${API_BASE}/api/episode?url=${encodeURIComponent(url)}`);
        if (!streamData) return JSON.stringify({ streams: [], subtitle: "" });

        const streams = [];

        if (streamData.servers && Array.isArray(streamData.servers) && streamData.servers.length > 0) {
            streamData.servers.forEach((srv, idx) => {
                const streamUrl = srv.proxied_url || srv.url;
                if (streamUrl) {
                    streams.push({
                        title: srv.name || `Server ${idx + 1}`,
                        streamUrl: streamUrl,
                        url: streamUrl,
                        headers: {
                            "User-Agent": DEFAULT_HEADERS["User-Agent"]
                        }
                    });
                }
            });
        }

        if (streams.length === 0 && streamData.proxied_master_playlist) {
            streams.push({
                title: "MioAnime Master HLS",
                streamUrl: streamData.proxied_master_playlist,
                url: streamData.proxied_master_playlist,
                headers: {
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
