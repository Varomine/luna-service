/**
 * Anime-TH Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://anime-th.com/
 * Stream Type: Multi-Server Master HLS 1080p
 * Version: 1.0.1
 */

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
    "Referer": "https://anime-th.com/"
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
        console.error("[Anime-TH] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

async function httpPost(url, payload, headers = DEFAULT_HEADERS) {
    try {
        const postHeaders = Object.assign({}, headers, {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest"
        });

        let res;
        if (typeof fetchv2 !== "undefined") {
            res = await fetchv2(url, postHeaders, "POST", payload);
        } else if (typeof fetch !== "undefined") {
            res = await fetch(url, {
                method: "POST",
                headers: postHeaders,
                body: payload
            });
        }
        if (!res) return null;

        if (typeof res.text === "function") {
            return await res.text();
        } else if (typeof res === "string") {
            return res;
        }
        return null;
    } catch (err) {
        console.error("[Anime-TH] httpPost error for " + url + ": " + err.message);
        return null;
    }
}

// ─── Search Results (AJAX POST query endpoint) ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        const results = [];
        const seenHrefs = new Set();

        if (query !== "") {
            const payload = `query=${encodeURIComponent(query)}`;
            const html = await httpPost("https://anime-th.com/query/", payload);

            if (html && html !== "undefined") {
                const itemRegex = /<a[^>]+href=["'](https:\/\/anime-th\.com\/anime\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
                let match;

                while ((match = itemRegex.exec(html)) !== null) {
                    const href = match[1];
                    const itemHtml = match[0];
                    const inner = match[2];

                    if (seenHrefs.has(href)) continue;

                    const imgMatch = itemHtml.match(/<img[^>]+(?:data-src|src)=["'](https:\/\/anime-th\.com\/uploads\/[^"']+)["']/i) ||
                                     itemHtml.match(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/i);
                    let image = "";
                    if (imgMatch) {
                        image = imgMatch[1];
                        if (image.startsWith("//")) image = "https:" + image;
                    }

                    const titleMatch = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) ||
                                       itemHtml.match(/alt=["']([^"']+)["']/i);
                    let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
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

        // Fallback for empty query or no search results: load catalog from subthai category
        if (results.length === 0) {
            const html = await httpGet("https://anime-th.com/category/ซับไทย/");
            if (html && html !== "undefined") {
                const itemRegex = /<a[^>]+href=["'](https:\/\/anime-th\.com\/anime\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
                let match;

                while ((match = itemRegex.exec(html)) !== null) {
                    const href = match[1];
                    const itemHtml = match[0];
                    const inner = match[2];

                    if (seenHrefs.has(href)) continue;

                    const imgMatch = itemHtml.match(/<img[^>]+(?:data-src|src)=["'](https:\/\/anime-th\.com\/uploads\/[^"']+)["']/i) ||
                                     itemHtml.match(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/i);
                    let image = "";
                    if (imgMatch) {
                        image = imgMatch[1];
                        if (image.startsWith("//")) image = "https:" + image;
                    }

                    const titleMatch = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) ||
                                       itemHtml.match(/alt=["']([^"']+)["']/i);
                    let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
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

        return JSON.stringify(results);
    } catch (error) {
        console.error("[Anime-TH] searchResults error: " + error.message);
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
                aliases: "Anime-TH",
                airdate: "N/A"
            }]);
        }

        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
                           html.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Anime-TH";

        const descMatch = html.match(/<p[^>]*class=["'][^"']*text-sm[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) ||
                          html.match(/<meta name="description" content="([^"]+)"/i);
        let description = "รับชมอนิเมะออนไลน์ฟรี ซับไทย พากย์ไทย ที่ Anime-TH";
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
        console.error("[Anime-TH] extractDetails error: " + error.message);
        return JSON.stringify([{
            description: "Error loading details",
            aliases: "Anime-TH",
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

        const episodes = [];
        const seenHrefs = new Set();
        const epRegex = /<a[^>]+href=["'](https:\/\/anime-th\.com\/watch\/([^"']+)\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = epRegex.exec(html)) !== null) {
            const href = match[1];
            const epText = match[3].replace(/<[^>]+>/g, "").trim();

            if (seenHrefs.has(href)) continue;

            const numMatch = epText.match(/ตอนที่\s*([0-9.]+)/i) ||
                             epText.match(/EP\.?\s*([0-9.]+)/i) ||
                             epText.match(/([0-9.]+)/);
            const number = numMatch ? parseFloat(numMatch[1]) : (episodes.length + 1);

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
        console.error("[Anime-TH] extractEpisodes error: " + error.message);
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
        const watchIdMatch = baseUrl.match(/\/watch\/([^"']+)\.html/);
        if (!watchIdMatch) {
            return JSON.stringify({ streams: [], subtitle: "" });
        }

        const watchId = watchIdMatch[1];
        const playerBaseUrl = `https://anime-th.com/base/${watchId}/`;
        const baseHtml = await httpGet(playerBaseUrl, baseUrl);

        if (!baseHtml || baseHtml === "undefined") {
            return JSON.stringify({ streams: [], subtitle: "" });
        }

        const streams = [];
        const seenUrls = new Set();

        const mainAppMatch = baseHtml.match(/var\s+webmainapp\s*=\s*["']([^"']+)["']/i);
        const webmainapp = mainAppMatch ? mainAppMatch[1] : "https://streaming.tonytonychopper.com/";

        const playbackMatches = [...baseHtml.matchAll(/playback\/[a-z]\/([a-zA-Z0-9_-]+)/g)];
        const pbPaths = [...new Set(playbackMatches.map(m => m[0]))];

        for (const pbPath of pbPaths) {
            const pbUrl = `${webmainapp}${pbPath}/`;
            const pbHtml = await httpGet(pbUrl, playerBaseUrl);
            if (!pbHtml || pbHtml === "undefined") continue;

            const marimoIframe = pbHtml.match(/<iframe[^>]+src=["'](https:\/\/player\.marimo\.me\/[^"']+)["']/i);
            if (marimoIframe) {
                const marimoUrl = marimoIframe[1];
                const marimoHtml = await httpGet(marimoUrl, pbUrl);

                const abyssIframe = marimoHtml ? marimoHtml.match(/<iframe[^>]+src=["'](https:\/\/abysscdn\.com\/[^"']+)["']/i) : null;
                if (abyssIframe) {
                    const abyssUrl = abyssIframe[1];
                    if (!seenUrls.has(abyssUrl)) {
                        seenUrls.add(abyssUrl);
                        streams.push({
                            title: `Anime-TH • Abyss Server ${streams.length + 1} (HLS 1080p)`,
                            streamUrl: abyssUrl,
                            url: abyssUrl,
                            headers: {
                                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                                "Referer": "https://player.marimo.me/"
                            }
                        });
                    }
                }

                if (!seenUrls.has(marimoUrl)) {
                    seenUrls.add(marimoUrl);
                    streams.push({
                        title: `Anime-TH • Marimo Server ${streams.length + 1}`,
                        streamUrl: marimoUrl,
                        url: marimoUrl,
                        headers: {
                            "User-Agent": DEFAULT_HEADERS["User-Agent"],
                            "Referer": pbUrl
                        }
                    });
                }
            }

            if (!seenUrls.has(pbUrl)) {
                seenUrls.add(pbUrl);
                streams.push({
                    title: `Anime-TH • Chopper Server ${streams.length + 1}`,
                    streamUrl: pbUrl,
                    url: pbUrl,
                    headers: {
                        "User-Agent": DEFAULT_HEADERS["User-Agent"],
                        "Referer": playerBaseUrl
                    }
                });
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
        console.error("[Anime-TH] extractStreamUrl error: " + error.message);
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}
