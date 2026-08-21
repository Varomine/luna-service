/**
 * 037AM Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://037am.com/
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
        let postId = null;
        let groupIdx = 0;
        let epIdx = 0;

        const queryMatch = url.match(/[?&]post=(\d+)[&]group_idx=(\d+)[&]ep=(\d+)/);
        if (queryMatch) {
            postId = queryMatch[1];
            groupIdx = queryMatch[2];
            epIdx = queryMatch[3];
        }

        let embedUrl = null;
        if (postId) {
            const epApiUrl = `https://037am.com/wp-json/ton2025/v1/ep?post=${postId}&group_idx=${groupIdx}&ep=${epIdx}`;
            const apiText = await httpGet(epApiUrl);
            if (apiText) {
                try {
                    const apiData = JSON.parse(apiText);
                    embedUrl = apiData.embed || apiData.backup || null;
                } catch (e) {}
            }
        }

        if (!embedUrl) {
            const html = await httpGet(url.split('?')[0]);
            if (html) {
                const iframeMatch = html.match(/src="(https:\/\/mycdn-hd\.xyz\/video\/[^"]+)"/i);
                if (iframeMatch) embedUrl = iframeMatch[1];
            }
        }

        if (!embedUrl) {
            return JSON.stringify({ streams: [], subtitle: "" });
        }

        const embedHtml = await httpGet(embedUrl, {
            "Referer": "https://037am.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        });

        if (!embedHtml) {
            return JSON.stringify({ streams: [], subtitle: "" });
        }

        const cleanHtml = embedHtml.replace(/\\\//g, '/');
        const match = cleanHtml.match(/\/cdn\/hls\/([a-f0-9]+)\/master\.txt/);
        
        const streams = [];

        if (match) {
            const hash = match[1];
            const masterUrl = `https://mycdn-hd.xyz/cdn/hls/${hash}/master.txt?s=1&d=&ext=.m3u8`;

            // Master HLS Stream (Native pre-buffering for smooth continuous 24-min playback)
            streams.push({
                title: "037AM • 720p HD (Master Stream)",
                streamUrl: masterUrl,
                url: masterUrl,
                headers: {
                    "Referer": "https://mycdn-hd.xyz/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                }
            });
        }

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
