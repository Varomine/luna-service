/**
 * AnimeGoJo Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://animegojoo.com/
 * Stream Type: Master HLS 1080p
 */

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Referer": "https://animegojoo.com/"
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
        console.error("[AnimeGoJo] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

// ─── Search Results ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        let targetUrl = "https://animegojoo.com/";

        if (query !== "") {
            targetUrl = `https://animegojoo.com/search/${encodeURIComponent(query)}/`;
        }

        const html = await httpGet(targetUrl);
        if (!html || html === "undefined") {
            return JSON.stringify([]);
        }

        const results = [];
        const seenHrefs = new Set();
        const cardRegex = /<a[^>]+href=["'](\/(?:list|ep)\/\d+\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = cardRegex.exec(html)) !== null) {
            const cardHtml = match[0];
            let relHref = match[1];
            let href = relHref.startsWith("http") ? relHref : `https://animegojoo.com${relHref.startsWith("/") ? "" : "/"}${relHref}`;
            const inner = match[2];

            if (seenHrefs.has(href)) continue;

            // Title
            const titleMatch = cardHtml.match(/title=["']([^"']+)["']/i) ||
                               inner.match(/<div class="card-info">\s*<h3>([\s\S]*?)<\/h3>/i) ||
                               inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
            let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
            if (!title) continue;

            // Image
            const imgMatch = inner.match(/data-bg=["']([^"']+)["']/i) ||
                             inner.match(/style=["'][^"']*url\(([^)]+)\)["']/i) ||
                             inner.match(/<img[^>]+src=["']([^"']+)["']/i);
            let image = "";
            if (imgMatch) {
                const imgPath = imgMatch[1].replace(/['"]/g, "").trim();
                image = imgPath.startsWith("http") ? imgPath : `https://animegojoo.com${imgPath.startsWith("/") ? "" : "/"}${imgPath}`;
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
        console.error("[AnimeGoJo] searchResults error: " + error.message);
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
                aliases: "AnimeGoJo",
                airdate: "N/A"
            }]);
        }

        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "AnimeGoJo";

        const descMatch = html.match(/<div class="anime-synopsis"[^>]*>([\s\S]*?)<\/div>/i) ||
                          html.match(/<div class="card-info">\s*<p[^>]*>([\s\S]*?)<\/p>/i) ||
                          html.match(/<p class="desc[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "รับชมอนิเมะออนไลน์ฟรี ซับไทย พากย์ไทย ที่ AnimeGoJo";

        const yearMatch = html.match(/\b(202\d|201\d)\b/);
        const airdate = yearMatch ? yearMatch[1] : "N/A";

        return JSON.stringify([{
            description: description,
            aliases: title,
            airdate: airdate
        }]);
    } catch (error) {
        console.error("[AnimeGoJo] extractDetails error: " + error.message);
        return JSON.stringify([{
            description: "Error loading details",
            aliases: "AnimeGoJo",
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

        // If this is an episode page (/ep/...), check if there is a series link (/list/...)
        if (baseUrl.includes("/ep/")) {
            const listLinkMatch = html.match(/href=["'](\/list\/\d+\/?)["']/i);
            if (listLinkMatch) {
                const listUrl = `https://animegojoo.com${listLinkMatch[1]}`;
                const listHtml = await httpGet(listUrl);
                if (listHtml && listHtml !== "undefined") {
                    html = listHtml;
                    baseUrl = listUrl;
                }
            }
        }

        const episodes = [];
        const seenHrefs = new Set();
        const epRegex = /<a\s+class="ep-item"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = epRegex.exec(html)) !== null) {
            const relHref = match[1];
            const epText = match[2].replace(/<[^>]+>/g, "").trim();
            const href = relHref.startsWith("http") ? relHref : `https://animegojoo.com${relHref.startsWith("/") ? "" : "/"}${relHref}`;

            if (seenHrefs.has(href)) continue;
            seenHrefs.add(href);

            const numMatch = epText.match(/ตอนที่\s*([0-9.]+)/i) || epText.match(/EP\s*([0-9.]+)/i) || epText.match(/([0-9.]+)/);
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
        console.error("[AnimeGoJo] extractEpisodes error: " + error.message);
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

        let link1 = "";
        let link2 = "";

        // Check raw HTML
        const rawPlayerMatch = html.match(/playeradsg\.php\?link=([^&"']*)&link2=([^&"']*)/i);
        if (rawPlayerMatch) {
            link1 = rawPlayerMatch[1];
            link2 = rawPlayerMatch[2];
        }

        // If not found, check Caesar cipher obfuscated scripts
        if (!link1 && !link2) {
            const obfScripts = [...html.matchAll(/var\s+([_a-zA-Z0-9]+a)\s*=\s*(\[[0-9,\s]+\])[\s\S]*?([_a-zA-Z0-9]+k)\s*=\s*(\d+)[\s\S]*?String\.fromCharCode/gi)];
            for (const script of obfScripts) {
                try {
                    const arr = JSON.parse(script[2]);
                    const key = parseInt(script[4]);
                    let decoded = "";
                    for (let j = 0; j < arr.length; j++) {
                        decoded += String.fromCharCode(arr[j] - key);
                    }
                    const decMatch = decoded.match(/playeradsg\.php\?link=([^&"']*)&link2=([^&"']*)/i);
                    if (decMatch) {
                        link1 = decMatch[1];
                        link2 = decMatch[2];
                        break;
                    }
                } catch (err) {}
            }
        }

        let streamUrl = "";

        if (link2) {
            streamUrl = `https://youtube.anccplayer.cyou/playg.php?uid=${link2}`;
        } else if (link1) {
            streamUrl = `https://youtube.anccplayer.cyou/play2.php?uid=${link1}`;
        }

        if (!streamUrl) {
            return JSON.stringify({ streams: [], subtitle: "" });
        }

        const streams = [
            {
                title: "AnimeGoJo • 1080p HD (HLS)",
                streamUrl: streamUrl,
                url: streamUrl,
                headers: {
                    "User-Agent": DEFAULT_HEADERS["User-Agent"],
                    "Referer": "https://anccplayer.cyou/"
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
        console.error("[AnimeGoJo] extractStreamUrl error: " + error.message);
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}
