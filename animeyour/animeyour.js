/**
 * Animeyour Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://anime-your.com/
 * Stream Type: Multi-Server Master HLS 1080p (Server 1 & Server 2)
 * Version: 1.0.1
 */

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
    "Referer": "https://anime-your.com/"
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
        console.error("[Animeyour] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

// ─── Search Results ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        let targetUrl = "https://anime-your.com/";

        if (query !== "") {
            const formattedQuery = encodeURIComponent(query).replace(/%20/g, "+");
            targetUrl = `https://anime-your.com/?s=${formattedQuery}`;
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

            const linkMatch = articleHtml.match(/<h3 class=["']film-name["']>[\s\S]*?<a[^>]+href=["'](https:\/\/anime-your\.com\/[a-zA-Z0-9_-]+\/?)["']/i) ||
                              articleHtml.match(/<a[^>]+href=["'](https:\/\/anime-your\.com\/(?!category|lang|air|studio|schedule|tag|page)[a-zA-Z0-9_-]+\/?)["']/i);
            if (!linkMatch) continue;

            const href = linkMatch[1];
            if (seenHrefs.has(href)) continue;

            const titleMatch = articleHtml.match(/title=["']([^"']+)["']/i) ||
                               inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
            let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
            if (!title) continue;

            const imgMatch = articleHtml.match(/<img[^>]+(?:data-src|src)=["'](https:\/\/anime-your\.com\/wp-content\/uploads\/[^"']+)["']/i) ||
                             articleHtml.match(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/i);
            let image = "";
            if (imgMatch) {
                image = imgMatch[1];
                if (image.startsWith("//")) image = "https:" + image;
            }

            seenHrefs.add(href);
            results.push({
                title: title,
                image: image,
                href: href
            });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.error("[Animeyour] searchResults error: " + error.message);
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
                aliases: "Animeyour",
                airdate: "N/A"
            }]);
        }

        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
                           html.match(/<h3 class=["']film-name["']>([\s\S]*?)<\/h3>/i) ||
                           html.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Animeyour";

        const descMatch = html.match(/<div class="entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                          html.match(/<meta name="description" content="([^"]+)"/i);
        let description = "รับชมอนิเมะออนไลน์ฟรี ซับไทย พากย์ไทย ที่ Animeyour";
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
        console.error("[Animeyour] extractDetails error: " + error.message);
        return JSON.stringify([{
            description: "Error loading details",
            aliases: "Animeyour",
            airdate: "N/A"
        }]);
    }
}

// ─── Extract Episodes (Fixed Container & Slug Support) ───
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

        // Scope search to main episode section to avoid sidebar/footer trending widgets
        let searchScope = html;
        const mainSectionMatch = html.match(/<section[^>]*class=["'][^"']*header-episode[^"']*["'][^>]*>([\s\S]*?)<\/section>/i) ||
                                 html.match(/<ul[^>]*id=["']MVP["'][^>]*>([\s\S]*?)<\/ul>/i);

        if (mainSectionMatch) {
            searchScope = mainSectionMatch[0];
        } else {
            const cutIndex = html.search(/<aside|class=['"]block_sidebar|id=['"]sidebar|class=['"]sidebar|<div class=['"]yarpp|id=['"]footer/i);
            if (cutIndex > 0) {
                searchScope = html.substring(0, cutIndex);
            }
        }

        const episodes = [];
        const seenHrefs = new Set();
        const epRegex = /<a[^>]+href=["'](https:\/\/anime-your\.com\/ep\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = epRegex.exec(searchScope)) !== null) {
            const href = match[1];
            const epHtml = match[0];
            const epText = match[2].replace(/<[^>]+>/g, "").trim();

            if (seenHrefs.has(href)) continue;

            // Extract episode number
            const spanNum = epHtml.match(/<span class=["']ep-num["']>([\s\S]*?)<\/span>/i);
            let number = null;
            if (spanNum) {
                const n = parseFloat(spanNum[1].trim());
                if (!isNaN(n)) number = n;
            }

            if (number === null) {
                const numMatch = epText.match(/ตอนที่\s*([0-9.]+)/i) ||
                                 epText.match(/EP\.?\s*([0-9.]+)/i) ||
                                 href.match(/ep-([0-9.]+)/i) ||
                                 epText.match(/([0-9.]+)/);
                if (numMatch) {
                    const n = parseFloat(numMatch[1]);
                    if (!isNaN(n)) number = n;
                }
            }

            if (number === null) number = episodes.length + 1;

            seenHrefs.add(href);
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
        console.error("[Animeyour] extractEpisodes error: " + error.message);
        return JSON.stringify([{
            href: url,
            number: 1
        }]);
    }
}

// ─── Extract Stream URL (Multi-Server Support) ───
async function extractStreamUrl(url) {
    try {
        const baseUrl = url.split("?")[0];
        const html = await httpGet(baseUrl);
        if (!html || html === "undefined") {
            return JSON.stringify({ streams: [], subtitle: "" });
        }

        const streams = [];

        // --- Server 1 Resolution ---
        let server1Embed = "";
        const iframeMatch = html.match(/<iframe[^>]+(?:data-src|src)=["']([^"']+)["']/i);
        if (iframeMatch) {
            server1Embed = iframeMatch[1];
        }

        if (server1Embed) {
            if (server1Embed.startsWith("//")) server1Embed = "https:" + server1Embed;
            const s1Html = await httpGet(server1Embed, {
                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                "Referer": baseUrl
            });

            if (s1Html && s1Html !== "undefined") {
                const streamMatch = s1Html.match(/var\s+playerlink\s*=\s*["']([^"']+)["']/i) ||
                                    s1Html.match(/player\.src\(\{\s*src:\s*["']([^"']+)["']/i) ||
                                    s1Html.match(/["'](https?:[^\s"'<>]+\.m3u8[^\s"'<>]*)["']/i);
                if (streamMatch) {
                    streams.push({
                        title: "Animeyour • Server 1 (HLS 1080p)",
                        streamUrl: streamMatch[1],
                        url: streamMatch[1],
                        headers: {
                            "User-Agent": DEFAULT_HEADERS["User-Agent"],
                            "Referer": server1Embed
                        }
                    });
                }
            }
        }

        // --- Server 2 Resolution ---
        let server2Embed = "";
        const s2Match = html.match(/data-id=["'](https?:[^\s"'<>]+abcdxzy[^\s"'<>]+)["']/i) ||
                        html.match(/data-id=["'](https?:[^\s"'<>]+embed2[^\s"'<>]+)["']/i) ||
                        html.match(/<div id="server-2"[\s\S]*?data-id=["']([^"']+)["']/i);
        if (s2Match) {
            server2Embed = s2Match[1];
        }

        if (!server2Embed && server1Embed) {
            const idMatch = server1Embed.match(/\/embed\/([a-zA-Z0-9_-]+)\/?/);
            if (idMatch) {
                server2Embed = `https://abcdxzy.xyz/embed2/${idMatch[1]}/`;
            }
        }

        if (server2Embed) {
            if (server2Embed.startsWith("//")) server2Embed = "https:" + server2Embed;
            const s2Html = await httpGet(server2Embed, {
                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                "Referer": baseUrl
            });

            if (s2Html && s2Html !== "undefined") {
                const streamMatch = s2Html.match(/var\s+linkplay\s*=\s*["']([^"']+)["']/i) ||
                                    s2Html.match(/var\s+playerlink\s*=\s*["']([^"']+)["']/i) ||
                                    s2Html.match(/player\.src\(\{\s*src:\s*["']([^"']+)["']/i) ||
                                    s2Html.match(/["'](https?:[^\s"'<>]+\.m3u8[^\s"'<>]*)["']/i);
                if (streamMatch) {
                    streams.push({
                        title: "Animeyour • Server 2 (HLS 1080p)",
                        streamUrl: streamMatch[1],
                        url: streamMatch[1],
                        headers: {
                            "User-Agent": DEFAULT_HEADERS["User-Agent"],
                            "Referer": server2Embed
                        }
                    });
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
        console.error("[Animeyour] extractStreamUrl error: " + error.message);
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}
