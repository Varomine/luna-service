/**
 * Anime-Hit Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://anime-hit.com/
 * Stream Type: Master HLS 1080p
 * Version: 1.0.0
 */

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Referer": "https://anime-hit.com/"
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
        console.error("[Anime-Hit] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

// ─── Search Results ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        let targetUrl = "https://anime-hit.com/";

        if (query !== "") {
            const formattedQuery = encodeURIComponent(query).replace(/%20/g, "+");
            targetUrl = `https://anime-hit.com/?s=${formattedQuery}`;
        }

        const html = await httpGet(targetUrl);
        if (!html || html === "undefined") {
            return JSON.stringify([]);
        }

        const results = [];
        const seenHrefs = new Set();
        const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
        let match;

        while ((match = articleRegex.exec(html)) !== null) {
            const articleHtml = match[0];
            const inner = match[1];

            // Extract anime detail URL
            const linkMatch = articleHtml.match(/<a[^>]+class=["'][^"']*indy-post-link[^"']*["'][^>]+href=["'](https:\/\/anime-hit\.com\/[^"']+)["']/i) ||
                              articleHtml.match(/<h2 class=["']entry-title[^"']*["']>[\s\S]*?<a[^>]+href=["'](https:\/\/anime-hit\.com\/[^"']+)["']/i) ||
                              articleHtml.match(/<a[^>]+href=["'](https:\/\/anime-hit\.com\/(?!category|lang|air|contact|page)[^"']+)["']/i);
            if (!linkMatch) continue;

            const href = linkMatch[1];
            if (seenHrefs.has(href)) continue;

            // Extract Title
            const titleMatch = articleHtml.match(/<h2 class=["']entry-title[^"']*["']>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
                               articleHtml.match(/<a[^>]+title=["']([^"']+)["']/i) ||
                               inner.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
            let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
            if (!title) continue;

            // Extract Image
            const imgMatch = articleHtml.match(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/i);
            let image = "";
            if (imgMatch) {
                image = imgMatch[1];
                if (image.startsWith("//")) image = "https:" + image;
            }

            if (image) {
                seenHrefs.add(href);
                results.push({
                    title: title,
                    image: image,
                    href: href
                });
            }
        }

        return JSON.stringify(results);
    } catch (error) {
        console.error("[Anime-Hit] searchResults error: " + error.message);
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
                aliases: "Anime-Hit",
                airdate: "N/A"
            }]);
        }

        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Anime-Hit";

        const descMatch = html.match(/<div class="entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                          html.match(/<meta name="description" content="([^"]+)"/i);
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "รับชมอนิเมะออนไลน์ฟรี ซับไทย พากย์ไทย ที่ Anime-Hit";

        const yearMatch = html.match(/\b(202\d|201\d)\b/);
        const airdate = yearMatch ? yearMatch[1] : "N/A";

        return JSON.stringify([{
            description: description,
            aliases: title,
            airdate: airdate
        }]);
    } catch (error) {
        console.error("[Anime-Hit] extractDetails error: " + error.message);
        return JSON.stringify([{
            description: "Error loading details",
            aliases: "Anime-Hit",
            airdate: "N/A"
        }]);
    }
}

// ─── Extract Episodes ───
async function extractEpisodes(url) {
    try {
        let baseUrl = url.split("?")[0];
        let html = await httpGet(baseUrl);
        if (!html || html === "undefined") {
            return JSON.stringify([{
                href: baseUrl,
                number: 1
            }]);
        }

        // If this is a video episode page (/video/...), check if there is a series link back to the anime page
        if (baseUrl.includes("/video/")) {
            const seriesLinkMatch = html.match(/<a[^>]+href=["'](https:\/\/anime-hit\.com\/(?!video|category|lang|air|contact|page)[a-zA-Z0-9_-]+\/?)["'][^>]*>[\s\S]*?ตอนทั้งหมด/i) ||
                                    html.match(/<ol class="breadcrumb[^"]*"[\s\S]*?<a href=["'](https:\/\/anime-hit\.com\/[^"']+)["']/i);
            if (seriesLinkMatch) {
                const seriesUrl = seriesLinkMatch[1];
                const seriesHtml = await httpGet(seriesUrl);
                if (seriesHtml && seriesHtml !== "undefined") {
                    html = seriesHtml;
                    baseUrl = seriesUrl;
                }
            }
        }

        const episodes = [];
        const seenHrefs = new Set();
        const epRegex = /<a[^>]+href=["'](https:\/\/anime-hit\.com\/video\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = epRegex.exec(html)) !== null) {
            const href = match[1];
            const epText = match[2].replace(/<[^>]+>/g, "").trim();

            if (seenHrefs.has(href)) continue;
            seenHrefs.add(href);

            // Extract episode number
            const numMatch = epText.match(/ตอนที่\s*([0-9.]+)/i) ||
                             epText.match(/EP\s*([0-9.]+)/i) ||
                             epText.match(/Episode\s*([0-9.]+)/i) ||
                             href.match(/-ep-([0-9.]+)/i) ||
                             href.match(/-episode-([0-9.]+)/i) ||
                             epText.match(/([0-9.]+)/);
            const number = numMatch ? parseFloat(numMatch[1]) : (episodes.length + 1);

            episodes.push({
                href: href,
                number: number
            });
        }

        if (episodes.length === 0) {
            episodes.push({
                href: baseUrl,
                number: 1
            });
        }

        // Sort ascending by episode number
        episodes.sort((a, b) => a.number - b.number);
        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[Anime-Hit] extractEpisodes error: " + error.message);
        return JSON.stringify([{
            href: url,
            number: 1
        }]);
    }
}

// ─── Extract Stream URL ───
async function extractStreamUrl(url) {
    try {
        const baseUrl = url.split("?")[0];
        const html = await httpGet(baseUrl);
        if (!html || html === "undefined") {
            return JSON.stringify({ streams: [], subtitle: "" });
        }

        let embedUrl = "";
        const iframeMatch = html.match(/<iframe[^>]+(?:data-src|src)=["']([^"']+)["']/i);
        if (iframeMatch) {
            embedUrl = iframeMatch[1];
        }

        let streamUrl = "";

        if (embedUrl) {
            if (embedUrl.startsWith("//")) embedUrl = "https:" + embedUrl;
            const embedHtml = await httpGet(embedUrl, {
                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                "Referer": baseUrl
            });

            if (embedHtml && embedHtml !== "undefined") {
                const streamMatch = embedHtml.match(/var\s+playerlink\s*=\s*["']([^"']+)["']/i) ||
                                    embedHtml.match(/player\.src\(\{\s*src:\s*["']([^"']+)["']/i) ||
                                    embedHtml.match(/["'](https?:[^\s"'<>]+\.m3u8[^\s"'<>]*)["']/i);
                if (streamMatch) {
                    streamUrl = streamMatch[1];
                }
            }
        }

        if (!streamUrl) {
            // Direct m3u8 in page fallback
            const directMatch = html.match(/["'](https?:[^\s"'<>]+\.m3u8[^\s"'<>]*)["']/i);
            if (directMatch) streamUrl = directMatch[1];
        }

        if (!streamUrl) {
            return JSON.stringify({ streams: [], subtitle: "" });
        }

        const streams = [
            {
                title: "Anime-Hit • 1080p HD (HLS)",
                streamUrl: streamUrl,
                url: streamUrl,
                headers: {
                    "User-Agent": DEFAULT_HEADERS["User-Agent"],
                    "Referer": embedUrl ? embedUrl : "https://hit.team-indy.net/"
                }
            }
        ];

        return JSON.stringify({
            streams: streams,
            url: streamUrl,
            streamUrl: streamUrl,
            subtitle: ""
        });
    } catch (error) {
        console.error("[Anime-Hit] extractStreamUrl error: " + error.message);
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}
