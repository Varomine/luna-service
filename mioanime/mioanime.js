/**
 * MioAnime Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Powered by User's MioAnime Scraper API Worker (https://mioanime-scraper-worker.sapis.workers.dev)
 * Version: 1.0.5
 */

const API_BASE = "https://mioanime-scraper-worker.sapis.workers.dev";

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
    "Referer": "https://www.mioz-anime.com/"
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
        console.error("[MioAnime] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

function extractAnimeSlug(url) {
    if (!url) return "";
    const cleanUrl = url.split("?")[0].replace(/\/$/, "");
    const parts = cleanUrl.split("/");
    return parts[parts.length - 1] || "";
}

// ─── Search Results ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        const targetUrl = `${API_BASE}/api/search?q=${encodeURIComponent(query)}`;
        const jsonStr = await httpGet(targetUrl);
        if (!jsonStr) return JSON.stringify([]);

        let data;
        try { data = JSON.parse(jsonStr); } catch (e) { return JSON.stringify([]); }
        if (!data || !Array.isArray(data)) return JSON.stringify([]);

        const results = data.map(item => {
            const itemUrl = item.url || `https://www.mioz-anime.com/${item.id || ''}/`;
            return {
                title: item.title || "MioAnime",
                image: item.image || "https://www.mioanime.net/icon/favicon.png",
                href: itemUrl
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
        const slug = extractAnimeSlug(url);
        let title = "MioAnime";
        let description = "Anime Subthai & Dubbed on MioAnime";

        if (slug) {
            const jsonStr = await httpGet(`${API_BASE}/api/anime/${encodeURIComponent(slug)}`);
            if (jsonStr) {
                try {
                    const data = JSON.parse(jsonStr);
                    if (data && data.title) {
                        title = data.title;
                        description = data.title;
                    }
                } catch(e){}
            }
        }

        const yearMatch = title.match(/\b(202\d|201\d)\b/);
        const airdate = yearMatch ? yearMatch[1] : "N/A";

        return JSON.stringify([{
            title: title,
            description: description,
            aliases: "MioAnime",
            airdate: airdate
        }]);
    } catch (error) {
        console.error("[MioAnime] extractDetails error: " + error.message);
        return JSON.stringify([{ description: "MioAnime", aliases: "MioAnime", airdate: "N/A" }]);
    }
}

// ─── Extract Episodes ───
async function extractEpisodes(url) {
    try {
        const targetUrl = `${API_BASE}/api/season?url=${encodeURIComponent(url)}`;
        const jsonStr = await httpGet(targetUrl);
        if (!jsonStr) return JSON.stringify([{ href: url, number: 1, title: "Episode 1" }]);

        let seasonData;
        try { seasonData = JSON.parse(jsonStr); } catch(e){}

        if (!seasonData || !seasonData.episodes || !Array.isArray(seasonData.episodes) || seasonData.episodes.length === 0) {
            // Fallback to /api/anime/{slug}
            const slug = extractAnimeSlug(url);
            if (slug) {
                const animeJsonStr = await httpGet(`${API_BASE}/api/anime/${encodeURIComponent(slug)}`);
                if (animeJsonStr) {
                    try {
                        const animeData = JSON.parse(animeJsonStr);
                        if (animeData && animeData.seasons && animeData.seasons.length > 0) {
                            const firstSeasonUrl = animeData.seasons[0].url;
                            const s2JsonStr = await httpGet(`${API_BASE}/api/season?url=${encodeURIComponent(firstSeasonUrl)}`);
                            if (s2JsonStr) {
                                seasonData = JSON.parse(s2JsonStr);
                            }
                        }
                    } catch(e){}
                }
            }
        }

        if (!seasonData || !seasonData.episodes || !Array.isArray(seasonData.episodes) || seasonData.episodes.length === 0) {
            return JSON.stringify([{ href: url, number: 1, title: "Episode 1" }]);
        }

        const episodes = [];
        seasonData.episodes.forEach((ep, idx) => {
            const epTitle = ep.title || "";
            const numMatch = epTitle.match(/ตอนที่\s*(\d+)/i) || epTitle.match(/ep\s*(\d+)/i) || epTitle.match(/\b(\d+)\b/);
            const number = numMatch ? parseInt(numMatch[1], 10) : (idx + 1);

            episodes.push({
                href: ep.url,
                number: isNaN(number) ? (idx + 1) : number,
                title: epTitle || `Episode ${idx + 1}`
            });
        });

        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[MioAnime] extractEpisodes error: " + error.message);
        return JSON.stringify([{ href: url, number: 1, title: "Episode 1" }]);
    }
}

// ─── Extract Stream URL ───
async function extractStreamUrl(url) {
    try {
        const targetUrl = `${API_BASE}/api/episode?url=${encodeURIComponent(url)}`;
        const jsonStr = await httpGet(targetUrl);
        if (!jsonStr) return JSON.stringify({ streams: [], subtitle: "" });

        let streamData;
        try { streamData = JSON.parse(jsonStr); } catch(e){}
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

        const mainUrl = streams.length > 0 ? streams[0].streamUrl : "";

        return JSON.stringify({
            streams: streams,
            url: mainUrl,
            streamUrl: mainUrl,
            subtitle: ""
        });
    } catch (error) {
        console.error("[MioAnime] extractStreamUrl error: " + error.message);
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}
