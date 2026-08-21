/**
 * Hanime Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Powered by https://hanime-scraper.premmiz-real.workers.dev/
 */

function getSlug(url) {
    if (!url) return "";
    let cleaned = url.trim().split('?')[0].split('#')[0];
    if (cleaned.includes('/')) {
        const parts = cleaned.split('/').filter(Boolean);
        return parts[parts.length - 1];
    }
    return cleaned;
}

function getEpisodeNumber(slug) {
    if (!slug) return 1;
    const match = slug.match(/(?:-|\b)(\d+)$/);
    if (match) {
        const parsed = parseInt(match[1], 10);
        return isNaN(parsed) || parsed < 1 ? 1 : parsed;
    }
    return 1;
}

async function httpGet(url) {
    try {
        let res;
        if (typeof fetchv2 !== "undefined") {
            res = await fetchv2(url);
        } else if (typeof fetch !== "undefined") {
            res = await fetch(url);
        }
        if (!res) return null;

        if (typeof res.text === "function") {
            return await res.text();
        } else if (typeof res === "string") {
            return res;
        }
        return null;
    } catch (err) {
        console.error("[Hanime] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

async function searchResults(keyword) {
    try {
        const query = encodeURIComponent(keyword || "");
        const searchUrl = `https://hanime-scraper.sapis.workers.dev/api/search?q=${query}`;

        const responseText = await httpGet(searchUrl);
        if (!responseText || responseText === "undefined" || responseText.trim() === "") {
            return JSON.stringify([]);
        }

        const data = JSON.parse(responseText);
        const results = [];

        if (data && data.success && Array.isArray(data.results)) {
            data.results.forEach(hit => {
                results.push({
                    title: hit.name || "Untitled",
                    image: hit.cover_url || hit.poster_url || "",
                    href: `https://hanime.tv/videos/hentai/${hit.slug || hit.id}`
                });
            });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.error("[Hanime] searchResults error: " + error.message);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const slug = getSlug(url);
        const apiUrl = `https://hanime-scraper.sapis.workers.dev/api/video/${encodeURIComponent(slug)}`;

        const responseText = await httpGet(apiUrl);
        if (!responseText || responseText === "undefined" || responseText.trim() === "") {
            return JSON.stringify([{
                description: "No details available.",
                aliases: "N/A",
                airdate: "N/A"
            }]);
        }

        const data = JSON.parse(responseText);
        const video = (data && data.success && data.video) ? data.video : {};

        let description = video.description || "No description available.";
        description = description.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

        const brand = video.brand || "";
        const tags = Array.isArray(video.tags) ? video.tags : [];
        const aliases = [brand, ...tags].filter(Boolean).join(", ") || "N/A";

        let airdate = "N/A";
        if (video.released_at) {
            airdate = video.released_at.split('T')[0];
        } else if (video.created_at) {
            airdate = video.created_at.split('T')[0];
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
        const epNum = getEpisodeNumber(slug);

        return JSON.stringify([{
            href: `https://hanime.tv/videos/hentai/${slug}`,
            number: epNum
        }]);
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
        const apiUrl = `https://hanime-scraper.sapis.workers.dev/api/video/${encodeURIComponent(slug)}`;

        const responseText = await httpGet(apiUrl);
        const streams = [];

        if (responseText && responseText !== "undefined" && responseText.trim() !== "") {
            const data = JSON.parse(responseText);
            if (data && data.success && Array.isArray(data.streams)) {
                data.streams.forEach(stream => {
                    if (stream.url && stream.url.trim() !== "") {
                        const quality = stream.quality || (stream.height ? `${stream.height}p` : "Auto");
                        streams.push({
                            title: `${quality} • ${stream.server || 'Highwinds'}`,
                            streamUrl: stream.url
                        });
                    }
                });
            }
        }

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
