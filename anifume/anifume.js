/**
 * Anifume Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://anifume.com/
 */

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Referer": "https://anifume.com/"
};

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    const headers = { ...DEFAULT_HEADERS, ...(options.headers || {}) };
    try {
        return await fetchv2(url, headers, options.method || 'GET', options.body || null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}

// ─── Search Results ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        let targetUrl = "https://anifume.com/";

        if (query !== "") {
            const formattedQuery = query.replace(/ /g, '+');
            targetUrl = `https://anifume.com/search/${encodeURIComponent(formattedQuery)}`;
        }

        const response = await soraFetch(targetUrl);
        if (!response) return JSON.stringify([]);
        const html = await response.text();
        if (!html) return JSON.stringify([]);

        const results = [];
        const seenHrefs = new Set();
        const cardRegex = /<a[^>]+href=["'](https:\/\/anifume\.com\/\d+\/?|\/\d+\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = cardRegex.exec(html)) !== null) {
            let href = match[1];
            if (!href.startsWith('http')) href = 'https://anifume.com' + href;
            if (href.endsWith('/')) href = href.slice(0, -1);

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
        const response = await soraFetch(targetUrl);
        if (!response) {
            return JSON.stringify([{ description: "No details available.", aliases: "Anifume", airdate: "N/A" }]);
        }
        const html = await response.text();
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
        const response = await soraFetch(baseUrl);
        if (!response) return JSON.stringify([{ href: baseUrl, number: 1 }]);
        const html = await response.text();
        if (!html) return JSON.stringify([{ href: baseUrl, number: 1 }]);

        const postIdMatch = baseUrl.match(/\/(\d+)\/?/);
        const postId = postIdMatch ? postIdMatch[1] : "";

        const episodes = [];
        const seenHrefs = new Set();
        const epRegex = /href=["'](https:\/\/anifume\.com\/\d+\/[A-Za-z0-9_\-]+|\/\d+\/[A-Za-z0-9_\-]+)["']/gi;
        let match;

        while ((match = epRegex.exec(html)) !== null) {
            let epHref = match[1];
            if (!epHref.startsWith('http')) epHref = 'https://anifume.com' + epHref;
            if (postId && !epHref.includes(`/${postId}/`)) continue;
            if (seenHrefs.has(epHref)) continue;
            seenHrefs.add(epHref);

            episodes.push({
                href: epHref,
                number: episodes.length + 1
            });
        }

        if (episodes.length === 0) {
            episodes.push({ href: baseUrl, number: 1 });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[Anifume] extractEpisodes error: " + error.message);
        return JSON.stringify([{ href: url, number: 1 }]);
    }
}

// ─── Extract Stream URL ───
async function extractStreamUrl(url) {
    try {
        let epUrl = url ? url.trim() : "";
        if (!epUrl.startsWith('http')) {
            epUrl = 'https://anifume.com' + (epUrl.startsWith('/') ? '' : '/') + epUrl;
        }

        const response = await soraFetch(epUrl, {
            headers: { "Referer": "https://anifume.com/" }
        });
        if (!response) return JSON.stringify({ streams: [], url: "", streamUrl: "", subtitle: "" });
        const epHtml = await response.text();
        if (!epHtml) return JSON.stringify({ streams: [], url: "", streamUrl: "", subtitle: "" });

        const ajaxMatches = [...epHtml.matchAll(/url:\s*["']([^"']+)["']/gi)].map(m => m[1]);
        if (ajaxMatches.length === 0) return JSON.stringify({ streams: [], url: "", streamUrl: "", subtitle: "" });

        const streams = [];

        for (let sIdx = 0; sIdx < ajaxMatches.length; sIdx++) {
            const ajaxRel = ajaxMatches[sIdx];
            const serverName = `Server ${sIdx + 1}`;
            let ajaxUrl = ajaxRel.startsWith('http') ? ajaxRel : ('https://anifume.com' + (ajaxRel.startsWith('/') ? '' : '/') + ajaxRel);
            ajaxUrl = ajaxUrl.replace(/&amp;/g, '&');

            const ajaxRes = await soraFetch(ajaxUrl, {
                headers: {
                    "Referer": epUrl,
                    "X-Requested-With": "XMLHttpRequest"
                }
            });

            if (!ajaxRes) continue;
            const ajaxHtml = await ajaxRes.text();
            if (!ajaxHtml) continue;

            const iframeMatch = ajaxHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (!iframeMatch) continue;

            let playerUrl = iframeMatch[1].replace(/&amp;/g, '&');
            if (!playerUrl.startsWith('http')) {
                playerUrl = 'https://anifume.com' + (playerUrl.startsWith('/') ? '' : '/') + playerUrl;
            }

            const playerRes = await soraFetch(playerUrl, {
                headers: { "Referer": "https://anifume.com/" }
            });

            if (!playerRes) continue;
            const playerHtml = await playerRes.text();
            if (!playerHtml) continue;

            const sourcesMatch = playerHtml.match(/"sources"\s*:\s*(\[[\s\S]*?\])/i);
            let parsedAny = false;

            if (sourcesMatch) {
                try {
                    const sourcesArr = JSON.parse(sourcesMatch[1]);
                    sourcesArr.forEach(src => {
                        if (src.file) {
                            parsedAny = true;
                            const label = src.label || "720p";
                            const cleanUrl = src.file.replace(/\\/g, '').replace(/&amp;/g, '&');
                            streams.push({
                                title: `[${serverName}] ${label}`,
                                streamUrl: cleanUrl,
                                url: cleanUrl,
                                file: cleanUrl,
                                link: cleanUrl,
                                headers: {
                                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                                    "Referer": "https://anifume.com/"
                                }
                            });
                        }
                    });
                } catch (e) {
                    console.error("[Anifume] Error parsing sources JSON: " + e.message);
                }
            }

            if (!parsedAny) {
                const mp4Matches = [...playerHtml.matchAll(/https?:\/\/[^\s'"<>]+\.mp4[^\s'"<>]*/gi)].map(m => m[0]);
                mp4Matches.forEach((mp4Url, idx) => {
                    const label = (idx === 0) ? "720p" : "360p";
                    const cleanUrl = mp4Url.replace(/\\/g, '').replace(/&amp;/g, '&');
                    streams.push({
                        title: `[${serverName}] ${label}`,
                        streamUrl: cleanUrl,
                        url: cleanUrl,
                        file: cleanUrl,
                        link: cleanUrl,
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                            "Referer": "https://anifume.com/"
                        }
                    });
                });
            }
        }

        const primaryUrl = streams.length > 0 ? streams[0].streamUrl : "";

        return JSON.stringify({
            streams: streams,
            url: primaryUrl,
            streamUrl: primaryUrl,
            subtitle: ""
        });
    } catch (error) {
        console.error("[Anifume] extractStreamUrl error: " + error.message);
        return JSON.stringify({ streams: [], url: "", streamUrl: "", subtitle: "" });
    }
}
