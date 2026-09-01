/**
 * AnimeRuka Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://animeruka.com/
 * Stream Type: Direct HLS (.m3u8/.txt) Stream (100% Native, NO Cloudflare Workers needed!)
 * Version: 1.0.8
 */

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
    "Referer": "https://animeruka.com/"
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

// ─── Search Results ───
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

// ─── Extract Details ───
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

// ─── Extract Episodes ───
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

// ─── Extract Stream URL (100% Native Direct HLS Extraction - NO Workers) ───
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
            let apiResult = await httpGet(`https://animeruka.com/wp-json/dooplayer/v2/${postId}/tv/1`, baseUrl);
            if (!apiResult || !apiResult.includes("embed_url")) {
                apiResult = await httpGet(`https://animeruka.com/wp-json/dooplayer/v2/${postId}/movie/1`, baseUrl);
            }

            if (apiResult) {
                try {
                    const data = JSON.parse(apiResult);
                    if (data && data.embed_url) {
                        const embedUrl = data.embed_url;
                        const embedHtml = await httpGet(embedUrl, baseUrl);

                        if (embedHtml) {
                            const dataPageMatch = embedHtml.match(/data-page="([^"]+)"/);
                            if (dataPageMatch) {
                                const decoded = dataPageMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                                const pageObj = JSON.parse(decoded);

                                if (pageObj && pageObj.props && pageObj.props.video && pageObj.props.video.url) {
                                    const directHlsUrl = pageObj.props.video.url;
                                    streams.push({
                                        title: "AnimeRuka • Main Server (1080p HD Direct)",
                                        streamUrl: directHlsUrl,
                                        url: directHlsUrl,
                                        headers: {
                                            "User-Agent": DEFAULT_HEADERS["User-Agent"],
                                            "Referer": "https://animemami.xyz/"
                                        }
                                    });
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error("[AnimeRuka] parse error: " + e.message);
                }
            }
        }

        const primaryStream = streams.length > 0 ? streams[0].streamUrl : "";

        return JSON.stringify({
            streams: streams,
            url: primaryStream,
            streamUrl: primaryStream,
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
