/**
 * AnimeRuka Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://animeruka.com/
 * Cloudflare Proxy: https://animeruka-worker.sapis.workers.dev
 */

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
        console.error("[AnimeRuka] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        const targetUrl = query !== "" ? `https://animeruka.com/?s=${encodeURIComponent(query)}` : "https://animeruka.com/";

        const html = await httpGet(targetUrl);
        if (!html || html === "undefined") {
            return JSON.stringify([]);
        }

        const results = [];
        const seen = new Set();
        const cardRegex = /<a\s+href="(https:\/\/animeruka\.com\/anime\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = cardRegex.exec(html)) !== null) {
            const href = match[1];
            const inner = match[2];

            if (seen.has(href)) continue;

            let title = inner.replace(/<[^>]+>/g, '').trim();
            if (!title || title === "TV" || title === "Movie" || title === "อนิเมะทั้งหมด") continue;

            let imgMatch = inner.match(/src="([^"]+)"/i);
            if (!imgMatch) {
                const idx = match.index;
                const context = html.substring(Math.max(0, idx - 300), Math.min(html.length, idx + 500));
                imgMatch = context.match(/<img[^>]+src="([^"]+)"/i);
            }

            const image = imgMatch ? imgMatch[1] : "";
            seen.add(href);
            results.push({ title, image, href });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.error("[AnimeRuka] searchResults error: " + error.message);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const html = await httpGet(url);
        if (!html || html === "undefined") {
            return JSON.stringify([{
                description: "No details available.",
                aliases: "AnimeRuka",
                airdate: "N/A"
            }]);
        }

        const descMatch = html.match(/<div class="wp-content">([\s\S]*?)<\/div>/i) ||
                          html.match(/<div class="entry-content">([\s\S]*?)<\/div>/i) ||
                          html.match(/<meta name="description" content="([^"]+)"/i);
        let description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : "No description available.";

        const yearMatch = html.match(/>(\d{4})<\/a>/i) || html.match(/\b(202\d|201\d)\b/i);
        const airdate = yearMatch ? yearMatch[1] : "N/A";

        return JSON.stringify([{
            description: description,
            aliases: "AnimeRuka",
            airdate: airdate
        }]);
    } catch (error) {
        console.error("[AnimeRuka] extractDetails error: " + error.message);
        return JSON.stringify([{
            description: "Error loading details",
            aliases: "AnimeRuka",
            airdate: "N/A"
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const baseUrl = url.split('?')[0];
        const html = await httpGet(baseUrl);
        if (!html || html === "undefined") {
            return JSON.stringify([{
                href: baseUrl,
                number: 1
            }]);
        }

        const episodes = [];
        const seenHrefs = new Set();
        const epRegex = /<div class=['"]episodiotitle['"]>\s*<a\s+href=['"]([^'"]+)['"]>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = epRegex.exec(html)) !== null) {
            const href = match[1];
            const text = match[2].replace(/<[^>]+>/g, '').trim();

            if (seenHrefs.has(href)) continue;
            seenHrefs.add(href);

            const numMatch = text.match(/ตอนที่\s*(\d+)/i) || text.match(/ep\s*(\d+)/i) || text.match(/(\d+)/);
            const number = numMatch ? parseInt(numMatch[1], 10) : (episodes.length + 1);

            episodes.push({ href, number });
        }

        if (episodes.length === 0) {
            episodes.push({
                href: baseUrl,
                number: 1
            });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[AnimeRuka] extractEpisodes error: " + error.message);
        return JSON.stringify([{
            href: url,
            number: 1
        }]);
    }
}

async function extractStreamUrl(url) {
    try {
        const baseUrl = url.split('?')[0];
        const html = await httpGet(baseUrl);
        if (!html || html === "undefined") {
            return JSON.stringify({ streams: [], subtitle: "" });
        }

        const postIdMatch = html.match(/postid-(\d+)/i) || html.match(/data-post="(\d+)"/i);
        const postId = postIdMatch ? postIdMatch[1] : null;

        const streams = [];

        if (postId) {
            const types = [
                { type: 'tv/1', name: 'Server 1 (AnimeMami)' },
                { type: 'tv/2', name: 'Server 2 (Abyss)' },
                { type: 'tv/3', name: 'Server 3 (OK.ru)' },
                { type: 'movie/1', name: 'Backup 1 (AnimeMami)' },
                { type: 'movie/2', name: 'Backup 2 (Abyss)' }
            ];

            for (const t of types) {
                const apiResult = await httpGet(`https://animeruka.com/wp-json/dooplayer/v2/${postId}/${t.type}`);
                if (apiResult) {
                    try {
                        const data = JSON.parse(apiResult);
                        if (data && data.embed_url) {
                            const embedUrl = data.embed_url;
                            const proxiedUrl = `https://animeruka-worker.sapis.workers.dev/proxy?url=${encodeURIComponent(embedUrl)}`;

                            // Proxied Stream (Worker bypasses 403 Forbidden Referer checks & CORS blocks)
                            streams.push({
                                title: `AnimeRuka • ${t.name}`,
                                streamUrl: proxiedUrl,
                                url: proxiedUrl,
                                isIframe: true,
                                type: "iframe",
                                format: "embed",
                                headers: {
                                    "Referer": "https://animeruka.com/",
                                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                                }
                            });
                        }
                    } catch (e) {}
                }
            }
        }

        if (streams.length === 0) {
            const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"/i);
            if (iframeMatch) {
                const embedUrl = iframeMatch[1];
                const proxiedUrl = `https://animeruka-worker.sapis.workers.dev/proxy?url=${encodeURIComponent(embedUrl)}`;

                streams.push({
                    title: "AnimeRuka • Main Stream",
                    streamUrl: proxiedUrl,
                    url: proxiedUrl,
                    isIframe: true,
                    type: "iframe",
                    format: "embed",
                    headers: {
                        "Referer": "https://animeruka.com/",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                    }
                });
            }
        }

        return JSON.stringify({
            streams: streams,
            subtitle: ""
        });
    } catch (error) {
        console.error("[AnimeRuka] extractStreamUrl error: " + error.message);
        return JSON.stringify({
            streams: [],
            subtitle: ""
        });
    }
}
