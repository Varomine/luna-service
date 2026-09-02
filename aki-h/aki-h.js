/**
 * Aki-H Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://aki-h.com/
 * Stream Type: Direct HLS (.m3u8) Stream from Aki Stream Engine
 * Version: 1.0.0
 */

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
    "Referer": "https://aki-h.com/"
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
        console.error("[Aki-H] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

// ─── Search Results ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        const targetUrl = query !== "" ? `https://aki-h.com/?s=${encodeURIComponent(query)}` : "https://aki-h.com/";

        const html = await httpGet(targetUrl);
        if (!html || html === "undefined") {
            return JSON.stringify([]);
        }

        const results = [];
        const seen = new Set();
        
        // Regex to parse content links on Aki-H
        const cardRegex = /<a[^>]+href=["'](https:\/\/aki-h\.com\/(?!genre|random|popular|tag|category|page|filter|az-list|terms|dmca|contact|latest|solow-sub|episode|videos)[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = cardRegex.exec(html)) !== null) {
            const href = match[1];
            const inner = match[2];

            if (seen.has(href)) continue;

            // Extract title
            const titleMatch = inner.match(/class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|h2|h3|span)>/i) ||
                               inner.match(/alt=["']([^"']+)["']/i) ||
                               inner.match(/title=["']([^"']+)["']/i);

            let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
            
            // Fallback title from slug if title element is empty
            if (!title) {
                const slugMatch = href.match(/https:\/\/aki-h\.com\/([^/]+)\/?/);
                if (slugMatch && slugMatch[1]) {
                    title = slugMatch[1].replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase());
                }
            }

            if (!title || title === "Watch Now" || title === "Random" || title === "Popular") continue;

            // Extract thumbnail
            const imgMatch = inner.match(/data-src=["']([^"']+)["']/i) ||
                             inner.match(/src=["']([^"']+)["']/i);
            let image = imgMatch ? imgMatch[1] : "";
            if (image.startsWith("//")) image = "https:" + image;

            seen.add(href);
            results.push({ title, image, href });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.error("[Aki-H] searchResults error: " + error.message);
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
                aliases: "Aki-H",
                airdate: "N/A"
            }]);
        }

        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
                           html.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Aki-H";

        const descMatch = html.match(/<div[^>]+class=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                          html.match(/<meta name="description" content="([^"]+)"/i);
        let description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "Uncensored Hentai Subthai on Aki-H";

        const yearMatch = html.match(/\b(202\d|201\d)\b/);
        const airdate = yearMatch ? yearMatch[1] : "N/A";

        return JSON.stringify([{
            description: description,
            aliases: title,
            airdate: airdate
        }]);
    } catch (error) {
        console.error("[Aki-H] extractDetails error: " + error.message);
        return JSON.stringify([{
            description: "Error loading details",
            aliases: "Aki-H",
            airdate: "N/A"
        }]);
    }
}

// ─── Extract Episodes ───
async function extractEpisodes(url) {
    try {
        const baseUrl = url.split("?")[0];
        let html = await httpGet(baseUrl);
        if (!html || html === "undefined") {
            return JSON.stringify([{ href: baseUrl, number: 1 }]);
        }

        // Check if there is an episode list page link
        const epPageMatch = html.match(/<a[^>]+href=["'](https:\/\/aki-h\.com\/episode\/[^"']+)["']/i);
        if (epPageMatch) {
            const epPageHtml = await httpGet(epPageMatch[1], baseUrl);
            if (epPageHtml && epPageHtml !== "undefined") {
                html = epPageHtml;
            }
        }

        const episodes = [];
        const seenHrefs = new Set();

        const videoLinkRegex = /<a[^>]+href=["'](https:\/\/aki-h\.com\/videos\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = videoLinkRegex.exec(html)) !== null) {
            const href = match[1];
            const inner = match[2];

            if (seenHrefs.has(href)) continue;

            const epTitleMatch = inner.match(/title=["']([^"']+)["']/i) ||
                                 inner.match(/class=["'][^"']*live-name[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|h3)>/i);
            const text = epTitleMatch ? epTitleMatch[1].replace(/<[^>]+>/g, "").trim() : inner.replace(/<[^>]+>/g, "").trim();

            const numMatch = text.match(/Vol\s*(\d+)/i) ||
                             text.match(/ตอนที่\s*(\d+)/i) ||
                             text.match(/EP\.?\s*(\d+)/i) ||
                             text.match(/(\d+)/);
            const number = numMatch ? parseInt(numMatch[1], 10) : (episodes.length + 1);

            seenHrefs.add(href);
            episodes.push({ href, number });
        }

        if (episodes.length === 0) {
            episodes.push({ href: baseUrl, number: 1 });
        }

        episodes.sort((a, b) => a.number - b.number);
        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[Aki-H] extractEpisodes error: " + error.message);
        return JSON.stringify([{ href: url, number: 1 }]);
    }
}

// ─── Extract Stream URL (Direct HLS Stream Extraction) ───
async function extractStreamUrl(url) {
    try {
        let targetUrl = url.split("?")[0];
        
        // 1. Resolve to /videos/ page if given anime or episode page
        if (!targetUrl.includes("/videos/")) {
            const html = await httpGet(targetUrl);
            if (html) {
                const epLinkMatch = html.match(/<a[^>]+href=["'](https:\/\/aki-h\.com\/episode\/[^"']+)["']/i);
                if (epLinkMatch) {
                    const epHtml = await httpGet(epLinkMatch[1], targetUrl);
                    if (epHtml) {
                        const vMatch = epHtml.match(/<a[^>]+href=["'](https:\/\/aki-h\.com\/videos\/[^"']+)["']/i);
                        if (vMatch) targetUrl = vMatch[1];
                    }
                } else {
                    const vMatch = html.match(/<a[^>]+href=["'](https:\/\/aki-h\.com\/videos\/[^"']+)["']/i);
                    if (vMatch) targetUrl = vMatch[1];
                }
            }
        }

        const vHtml = await httpGet(targetUrl);
        if (!vHtml) return JSON.stringify({ streams: [], subtitle: "" });

        // 2. Match player_container ID
        const playerMatch = vHtml.match(/player_container\(\s*\d+\s*,\s*(\d+)\s*\)/i) ||
                            vHtml.match(/\/video2\/(\d+)/i);
        if (!playerMatch) return JSON.stringify({ streams: [], subtitle: "" });

        const videoId = playerMatch[1];
        const v2Url = `https://aki-h.com/video2/${videoId}/`;
        const v2Html = await httpGet(v2Url, targetUrl);
        if (!v2Html) return JSON.stringify({ streams: [], subtitle: "" });

        // 3. Match v.aki-h.com URL
        const vEmbedMatch = v2Html.match(/['"]url['"]\s*:\s*['"](https:\/\/[^'"]+)['"]/i) ||
                            v2Html.match(/src=["'](https:\/\/[^"']+)["']/i);
        if (!vEmbedMatch) return JSON.stringify({ streams: [], subtitle: "" });

        const vEmbedUrl = vEmbedMatch[1];
        const vEmbedHtml = await httpGet(vEmbedUrl, v2Url);
        if (!vEmbedHtml) return JSON.stringify({ streams: [], subtitle: "" });

        // 4. Match vid for /f/vid
        const vidMatch = vEmbedHtml.match(/var\s+vid\s*=\s*['"]([^'"]+)['"]/i) ||
                         vEmbedHtml.match(/\/f\/([a-zA-Z0-9_-]+)/i);
        if (!vidMatch) return JSON.stringify({ streams: [], subtitle: "" });

        const vid = vidMatch[1];
        const fUrl = `https://v.aki-h.com/f/${vid}`;
        const fHtml = await httpGet(fUrl, vEmbedUrl);
        if (!fHtml) return JSON.stringify({ streams: [], subtitle: "" });

        // 5. Match streaming.aki.today playback URL
        const pbMatch = fHtml.match(/<iframe[^>]+src=["'](https:\/\/streaming\.aki\.today\/playback\/[a-z]\/[a-zA-Z0-9_-]+\/)["']/i) ||
                        fHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (!pbMatch) return JSON.stringify({ streams: [], subtitle: "" });

        const pbUrl = pbMatch[1];
        const pbHtml = await httpGet(pbUrl, fUrl);
        if (!pbHtml) return JSON.stringify({ streams: [], subtitle: "" });

        // 6. Match aki-h.stream code
        const streamCodeMatch = pbHtml.match(/https:\/\/aki-h\.stream\/v\/([a-zA-Z0-9_-]+)/i) ||
                                pbHtml.match(/<iframe[^>]+src=["'](https:\/\/aki-h\.stream\/v\/[a-zA-Z0-9_-]+)["']/i);
        if (!streamCodeMatch) return JSON.stringify({ streams: [], subtitle: "" });

        const code = streamCodeMatch[1];
        const directHlsUrl = `https://aki-h.stream/file2/${code}/`;

        const streams = [{
            title: "Aki-H • Main Server (1080p HD Direct)",
            streamUrl: directHlsUrl,
            url: directHlsUrl,
            headers: {
                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                "Referer": "https://aki-h.stream/"
            }
        }];

        return JSON.stringify({
            streams: streams,
            url: directHlsUrl,
            streamUrl: directHlsUrl,
            subtitle: ""
        });
    } catch (error) {
        console.error("[Aki-H] extractStreamUrl error: " + error.message);
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}
