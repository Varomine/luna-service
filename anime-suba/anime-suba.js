/**
 * Anime-Suba Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://suba-anime.com/ (Redirected from http://anime-suba.com/)
 * Stream Type: Direct MP4 / 720p HD / 360p
 * Version: 1.0.0
 */

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
    "Referer": "https://suba-anime.com/"
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
        console.error("[Anime-Suba] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

// ─── Search Results ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        const results = [];
        const seenHrefs = new Set();

        if (query !== "") {
            const formattedQuery = encodeURIComponent(query).replace(/%20/g, "+");
            const ajaxUrl = `https://suba-anime.com/action?query=${formattedQuery}`;
            const html = await httpGet(ajaxUrl);

            if (html && html !== "undefined") {
                const itemRegex = /<a[^>]+href=["']?(https:\/\/suba-anime\.com\/[a-zA-Z0-9_-]+\/?)["']?[^>]*>([\s\S]*?)<\/a>/gi;
                let match;
                while ((match = itemRegex.exec(html)) !== null) {
                    const href = match[1];
                    const content = match[2];

                    if (seenHrefs.has(href)) continue;

                    const imgMatch = content.match(/<img[^>]+src=["']?(https:\/\/suba-anime\.com\/img\/[^"'\s>]+)["']?/i);
                    const image = imgMatch ? imgMatch[1] : "";

                    let title = content.replace(/<[^>]+>/g, "").trim();
                    if (!title) continue;

                    seenHrefs.add(href);
                    results.push({
                        title: title,
                        image: image,
                        href: href
                    });
                }
            }
        }

        // Fallback to homepage / catalog cards if query is empty or ajax returns nothing
        if (results.length === 0) {
            const homeHtml = await httpGet("https://suba-anime.com/");
            if (homeHtml && homeHtml !== "undefined") {
                const cardRegex = /<div class="pic">([\s\S]*?)<\/div>\s*<\/div>/gi;
                let match;
                while ((match = cardRegex.exec(homeHtml)) !== null) {
                    const cardHtml = match[0];
                    const linkMatch = cardHtml.match(/<a[^>]+class=["']pagelink["'][^>]+href=["'](https:\/\/suba-anime\.com\/[a-zA-Z0-9_-]+\/?)["']/i) ||
                                      cardHtml.match(/<a[^>]+href=["'](https:\/\/suba-anime\.com\/[a-zA-Z0-9_-]+\/?)["']/i);
                    if (!linkMatch) continue;

                    const href = linkMatch[1];
                    if (seenHrefs.has(href)) continue;

                    const titleMatch = cardHtml.match(/<div class="post_title">([\s\S]*?)<\/div>/i) ||
                                       cardHtml.match(/title=["']([^"']+)["']/i);
                    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
                    if (!title) continue;

                    const imgMatch = cardHtml.match(/<img[^>]+(?:data-src|src)=["'](https:\/\/suba-anime\.com\/img\/[^"']+)["']/i);
                    const image = imgMatch ? imgMatch[1] : "";

                    seenHrefs.add(href);
                    results.push({
                        title: title,
                        image: image,
                        href: href
                    });
                }
            }
        }

        return JSON.stringify(results);
    } catch (error) {
        console.error("[Anime-Suba] searchResults error: " + error.message);
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
                aliases: "Anime-Suba",
                airdate: "N/A"
            }]);
        }

        const titleMatch = html.match(/<div class="post_title">([\s\S]*?)<\/div>/i) ||
                           html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
                           html.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Anime-Suba";

        const descMatch = html.match(/<meta name="description" content="([^"]+)"/i) ||
                          html.match(/<p[^>]*>เรื่องย่อ[\s\S]*?<\/p>/i);
        let description = "รับชมอนิเมะออนไลน์ฟรี ซับไทย พากย์ไทย ที่ Anime-Suba";
        if (descMatch) {
            description = descMatch[1] ? descMatch[1].trim() : descMatch[0].replace(/<[^>]+>/g, "").trim();
        }

        const yearMatch = html.match(/\b(202\d|201\d)\b/);
        const airdate = yearMatch ? yearMatch[1] : "N/A";

        return JSON.stringify([{
            description: description,
            aliases: title,
            airdate: airdate
        }]);
    } catch (error) {
        console.error("[Anime-Suba] extractDetails error: " + error.message);
        return JSON.stringify([{
            description: "Error loading details",
            aliases: "Anime-Suba",
            airdate: "N/A"
        }]);
    }
}

// ─── Extract Episodes ───
async function extractEpisodes(url) {
    try {
        let baseUrl = url.split("?")[0];
        if (baseUrl.includes("/ep-")) {
            baseUrl = baseUrl.replace(/\/ep-[0-9.]+.*$/, "/");
        }

        let html = await httpGet(baseUrl);
        if (!html || html === "undefined") {
            return JSON.stringify([{
                href: baseUrl,
                number: 1
            }]);
        }

        const episodes = [];
        const seenHrefs = new Set();
        const epRegex = /<a[^>]+href=["'](https:\/\/suba-anime\.com\/[a-zA-Z0-9_-]+\/ep-[0-9.]+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = epRegex.exec(html)) !== null) {
            const href = match[1];
            const epText = match[2].replace(/<[^>]+>/g, "").trim();

            if (seenHrefs.has(href)) continue;
            seenHrefs.add(href);

            const numMatch = epText.match(/ตอนที่\s*([0-9.]+)/i) ||
                             epText.match(/EP\.?\s*([0-9.]+)/i) ||
                             href.match(/\/ep-([0-9.]+)/i) ||
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
        console.error("[Anime-Suba] extractEpisodes error: " + error.message);
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

        // Find playerId from episode page: player/512084 or player2/512084
        const playerMatch = html.match(/player2?\/(\d+)/i) || html.match(/\/(\d{5,})/);
        const playerId = playerMatch ? playerMatch[1] : null;

        const streams = [];

        if (playerId) {
            // Main player endpoint
            const mainPlayerUrl = `https://anim-esun.com/st1/player/${playerId}.php`;
            const mainHtml = await httpGet(mainPlayerUrl, {
                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                "Referer": "https://anim-esun.com/"
            });

            if (mainHtml && mainHtml !== "undefined") {
                const sourceMatches = [...mainHtml.matchAll(/file:\s*["']([^"']+)["'][^,\n}]*(?:,\s*label:\s*["']([^"']+)["'])?/gi)];
                for (const sm of sourceMatches) {
                    let fileUrl = sm[1];
                    const label = sm[2] || "720p HD";

                    if (fileUrl.startsWith("../")) {
                        fileUrl = fileUrl.replace(/^\.\.\//, "https://anim-esun.com/st1/");
                    } else if (fileUrl.startsWith("/")) {
                        fileUrl = "https://anim-esun.com" + fileUrl;
                    }

                    streams.push({
                        title: `Anime-Suba • Main Server (${label})`,
                        streamUrl: fileUrl,
                        url: fileUrl,
                        headers: {
                            "User-Agent": DEFAULT_HEADERS["User-Agent"],
                            "Referer": "https://anim-esun.com/"
                        }
                    });
                }
            }

            // Backup player endpoint if main player returned empty
            if (streams.length === 0) {
                const backupPlayerUrl = `https://anim-esun.com/st2/player2/${playerId}.php`;
                const backupHtml = await httpGet(backupPlayerUrl, {
                    "User-Agent": DEFAULT_HEADERS["User-Agent"],
                    "Referer": "https://anim-esun.com/"
                });

                if (backupHtml && backupHtml !== "undefined") {
                    const sourceMatches = [...backupHtml.matchAll(/file:\s*["']([^"']+)["'][^,\n}]*(?:,\s*label:\s*["']([^"']+)["'])?/gi)];
                    for (const sm of sourceMatches) {
                        let fileUrl = sm[1];
                        const label = sm[2] || "720p HD";

                        if (fileUrl.startsWith("../../")) {
                            fileUrl = fileUrl.replace(/^\.\.\/\.\.\//, "https://anim-esun.com/");
                        } else if (fileUrl.startsWith("/")) {
                            fileUrl = "https://anim-esun.com" + fileUrl;
                        }

                        streams.push({
                            title: `Anime-Suba • Backup Server (${label})`,
                            streamUrl: fileUrl,
                            url: fileUrl,
                            headers: {
                                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                                "Referer": "https://anim-esun.com/"
                            }
                        });
                    }
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
        console.error("[Anime-Suba] extractStreamUrl error: " + error.message);
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}
