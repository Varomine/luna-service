/**
 * Hanime Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 */

function getSlug(url) {
    if (!url) return "";
    let cleaned = url.trim();
    cleaned = cleaned.split('?')[0].split('#')[0];
    if (cleaned.includes('/')) {
        const parts = cleaned.split('/').filter(Boolean);
        return parts[parts.length - 1];
    }
    return cleaned;
}

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Origin": "https://hanime.tv",
    "Referer": "https://hanime.tv/"
};

async function searchResults(keyword) {
    try {
        const searchUrl = "https://search.htv-services.com/";
        const payload = {
            search_text: keyword || "",
            tags: [],
            tags_mode: "AND",
            brands: [],
            blacklists: [],
            order_by: "created_at_unix",
            ordering: "desc",
            page: 0
        };

        const headers = {
            "Content-Type": "application/json",
            ...DEFAULT_HEADERS
        };

        let response;
        if (typeof fetchv2 !== "undefined") {
            response = await fetchv2(searchUrl, headers, "POST", JSON.stringify(payload));
        } else {
            response = await fetch(searchUrl, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(payload)
            });
        }

        const text = await response.text();
        const data = JSON.parse(text);

        let hits = [];
        if (data.hits) {
            if (typeof data.hits === "string") {
                hits = JSON.parse(data.hits);
            } else if (Array.isArray(data.hits)) {
                hits = data.hits;
            }
        }

        const results = hits.map(hit => {
            return {
                title: hit.name || hit.title || "Untitled",
                image: hit.cover_url || hit.poster_url || "",
                href: `https://hanime.tv/videos/hentai/${hit.slug || hit.id}`
            };
        });

        return JSON.stringify(results);
    } catch (error) {
        console.error("[Hanime] searchResults error: " + error.message);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const slug = getSlug(url);
        const apiUrl = `https://hanime.tv/api/v8/video?id=${encodeURIComponent(slug)}`;

        let response;
        if (typeof fetchv2 !== "undefined") {
            response = await fetchv2(apiUrl, DEFAULT_HEADERS);
        } else {
            response = await fetch(apiUrl, { headers: DEFAULT_HEADERS });
        }

        const text = await response.text();
        const data = JSON.parse(text);

        const video = data.hentai_video || {};

        let description = video.description || "No description available.";
        description = description.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

        const brand = video.brand || "";
        const tags = (video.hentai_tags || []).map(t => t.name || t.text).filter(Boolean);
        const aliases = [brand, ...tags].filter(Boolean).join(", ") || "N/A";

        let airdate = "N/A";
        if (video.created_at) {
            airdate = video.created_at.split('T')[0];
        } else if (video.released_at_unix) {
            airdate = new Date(video.released_at_unix * 1000).toISOString().split('T')[0];
        }

        return JSON.stringify([{
            description: description,
            aliases: aliases,
            airdate: airdate
        }]);
    } catch (error) {
        console.error("[Hanime] extractDetails error: " + error.message);
        return JSON.stringify([{
            description: "Error loading details",
            aliases: "N/A",
            airdate: "N/A"
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const slug = getSlug(url);
        const apiUrl = `https://hanime.tv/api/v8/video?id=${encodeURIComponent(slug)}`;

        let response;
        if (typeof fetchv2 !== "undefined") {
            response = await fetchv2(apiUrl, DEFAULT_HEADERS);
        } else {
            response = await fetch(apiUrl, { headers: DEFAULT_HEADERS });
        }

        const text = await response.text();
        const data = JSON.parse(text);

        const franchiseVideos = data.hentai_franchise_hentai_videos;
        const episodes = [];

        if (Array.isArray(franchiseVideos) && franchiseVideos.length > 0) {
            franchiseVideos.forEach((item, index) => {
                const numMatch = (item.name || "").match(/(?:episode\s*|ep\s*|\s+)(\d+)$/i);
                const epNum = numMatch ? parseInt(numMatch[1]) : (index + 1);

                episodes.push({
                    href: `https://hanime.tv/videos/hentai/${item.slug}`,
                    number: epNum
                });
            });
        } else {
            episodes.push({
                href: `https://hanime.tv/videos/hentai/${slug}`,
                number: 1
            });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[Hanime] extractEpisodes error: " + error.message);
        return JSON.stringify([{
            href: url,
            number: 1
        }]);
    }
}

async function extractStreamUrl(url) {
    try {
        const slug = getSlug(url);
        const apiUrl = `https://hanime.tv/api/v8/video?id=${encodeURIComponent(slug)}`;

        let response;
        if (typeof fetchv2 !== "undefined") {
            response = await fetchv2(apiUrl, DEFAULT_HEADERS);
        } else {
            response = await fetch(apiUrl, { headers: DEFAULT_HEADERS });
        }

        const text = await response.text();
        const data = JSON.parse(text);

        const streams = [];
        const servers = (data.videos_manifest && data.videos_manifest.servers) || [];

        servers.forEach(server => {
            if (Array.isArray(server.streams)) {
                server.streams.forEach(stream => {
                    if (stream.url && stream.url.trim() !== "") {
                        const quality = stream.height ? `${stream.height}p` : "Auto";
                        streams.push({
                            title: `${quality} • ${server.name || 'HTV'}`,
                            streamUrl: stream.url,
                            headers: {
                                "Referer": "https://hanime.tv/",
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                            }
                        });
                    }
                });
            }
        });

        streams.sort((a, b) => {
            const resA = parseInt(a.title.match(/(\d+)p/)?.[1] || "0");
            const resB = parseInt(b.title.match(/(\d+)p/)?.[1] || "0");
            return resB - resA;
        });

        return JSON.stringify({
            streams: streams,
            subtitle: ""
        });
    } catch (error) {
        console.error("[Hanime] extractStreamUrl error: " + error.message);
        return JSON.stringify({
            streams: [],
            subtitle: ""
        });
    }
}
