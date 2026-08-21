/**
 * 037AM Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://037am.com/
 * Cloudflare Worker Proxy: https://037am-worker.sapis.workers.dev
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
        console.error("[037AM] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        const targetUrl = query !== "" ? `https://037am.com/?s=${encodeURIComponent(query)}` : "https://037am.com/";

        const html = await httpGet(targetUrl);
        if (!html || html === "undefined") {
            return JSON.stringify([]);
        }

        const results = [];
        const cardRegex = /<a\s+href="([^"]+)"\s+class="card[^"]*"[\s\S]*?<img\s+src="([^"]+)"[^>]*alt="([^"]*)"/gi;
        let match;

        while ((match = cardRegex.exec(html)) !== null) {
            results.push({
                title: match[3] ? match[3].trim() : "Untitled",
                image: match[2] || "",
                href: match[1]
            });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.error("[037AM] searchResults error: " + error.message);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const html = await httpGet(url);
        if (!html || html === "undefined") {
            return JSON.stringify([{
                description: "No details available.",
                aliases: "037AM",
                airdate: "N/A"
            }]);
        }

        const descMatch = html.match(/<div class="siteorigin-widget-tinymce textwidget">([\s\S]*?)<\/div>/i) ||
                          html.match(/<meta name="description" content="([^"]+)"/i);
        let description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : "No description available.";

        const yearMatch = html.match(/badge bg-danger">\s*<span class="mx-1">(\d{4})<\/span>/i);
        const airdate = yearMatch ? yearMatch[1] : "N/A";

        return JSON.stringify([{
            description: description,
            aliases: "037AM",
            airdate: airdate
        }]);
    } catch (error) {
        console.error("[037AM] extractDetails error: " + error.message);
        return JSON.stringify([{
            description: "Error loading details",
            aliases: "037AM",
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

        const postIdMatch = html.match(/window\.ton2025_post_id\s*=\s*(\d+)/i) || html.match(/postid-(\d+)/i);
        const postId = postIdMatch ? postIdMatch[1] : null;

        const episodes = [];
        const epMatch = html.match(/window\.seriesEpisodes\s*=\s*(\[[\s\S]*?\]);/i);

        if (epMatch && postId) {
            try {
                const list = JSON.parse(epMatch[1]);
                list.forEach((item, index) => {
                    const epNum = item.ep ? parseInt(item.ep, 10) : (index + 1);
                    episodes.push({
                        href: `${baseUrl}?post=${postId}&group_idx=0&ep=${index}`,
                        number: isNaN(epNum) ? (index + 1) : epNum
                    });
                });
            } catch (e) {
                console.warn("[037AM] seriesEpisodes JSON parse error: " + e.message);
            }
        }

        if (episodes.length === 0) {
            episodes.push({
                href: baseUrl,
                number: 1
            });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[037AM] extractEpisodes error: " + error.message);
        return JSON.stringify([{
            href: url,
            number: 1
        }]);
    }
}

async function extractStreamUrl(url) {
    try {
        const workerStreamUrl = `https://037am-worker.sapis.workers.dev/api/stream?url=${encodeURIComponent(url)}`;

        const streams = [
            {
                title: "037AM • 720p HD (Worker Master HLS)",
                streamUrl: workerStreamUrl,
                url: workerStreamUrl,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                }
            }
        ];

        return JSON.stringify({
            streams: streams,
            subtitle: ""
        });
    } catch (error) {
        console.error("[037AM] extractStreamUrl error: " + error.message);
        return JSON.stringify({
            streams: [],
            subtitle: ""
        });
    }
}
