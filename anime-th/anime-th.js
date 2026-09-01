/**
 * Anime-TH Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://anime-th.com/
 * Stream Type: Cloudflare SAPIS Proxy + Multi-Server Support
 * Version: 1.0.6
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

// ─── Extract Stream URL (Cloudflare Worker Proxy + Multi-Server) ───
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

        const mainAppMatch = baseHtml.match(/var\s+webmainapp\s*=\s*["']([^"']+)["']/i);
        const webmainapp = mainAppMatch ? mainAppMatch[1] : "https://streaming.tonytonychopper.com/";
        const pbMatch = baseHtml.match(/playback\/[a-z]\/([a-zA-Z0-9_-]+)/);

        const streams = [];

        if (pbMatch) {
            const pbId = pbMatch[1];

            // 1. SAPIS Cloudflare Worker Proxy Stream (Compatible with Luna / Sora / MPV)
            const pbUrl = `${webmainapp}${pbMatch[0]}/`;
            const pbHtml = await httpGet(pbUrl, playerBaseUrl);
            const iframeMatch = pbHtml ? pbHtml.match(/<iframe[^>]+src=["'](https:\/\/[^"']+)["']/i) : null;

            if (iframeMatch) {
                let frameUrl = iframeMatch[1];
                let frameRef = pbUrl;
                if (frameUrl.includes('tonytonychopper.net')) {
                    frameRef = 'https://streaming.tonytonychopper.com/';
                }
                let frameHtml = await httpGet(frameUrl, frameRef);

                let marimoIframe = frameHtml ? (frameHtml.match(/<iframe[^>]+src=["'](https:\/\/player\.marimo\.me\/[^"']+)["']/i) ||
                                     frameHtml.match(/https:\/\/player\.marimo\.me\/demo\/[^"'\s\)]+/i)) : null;

                let marimoUrl = marimoIframe ? (marimoIframe[1] || marimoIframe[0]).replace(/["'\\]+$/, '') : '';
                if (marimoUrl) {
                    let marimoHtml = await httpGet(marimoUrl, 'https://anime-th.com/');
                    if (!marimoHtml || !marimoHtml.includes('abysscdn.com')) {
                        marimoHtml = await httpGet(marimoUrl, 'https://anime.tonytonychopper.net/');
                    }
                    let abyssInsideMarimo = marimoHtml ? marimoHtml.match(/<iframe[^>]+src=["'](https:\/\/abysscdn\.com\/[^"']+)["']/i) : null;
                    if (abyssInsideMarimo) {
                        const abyssUrl = abyssInsideMarimo[1];
                        const workerProxyUrl = `https://animeruka-worker.sapis.workers.dev/proxy?url=${encodeURIComponent(abyssUrl)}`;

                        streams.push({
                            title: "Anime-TH • SAPIS Cloudflare Proxy (Luna Stream)",
                            streamUrl: workerProxyUrl,
                            url: workerProxyUrl,
                            headers: {
                                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                                "Referer": "https://player.marimo.me/"
                            }
                        });

                        streams.push({
                            title: "Anime-TH • Abyss CDN Player",
                            streamUrl: abyssUrl,
                            url: abyssUrl,
                            headers: {
                                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                                "Referer": "https://player.marimo.me/"
                            }
                        });
                    }
                }
            }

            // 2. Ad-Free Main Player
            const serverFUrl = `${webmainapp}playback/f/${pbId}/`;
            streams.push({
                title: "Anime-TH • Main Player (Ad-Free)",
                streamUrl: serverFUrl,
                url: serverFUrl,
                headers: {
                    "User-Agent": DEFAULT_HEADERS["User-Agent"],
                    "Referer": playerBaseUrl
                }
            });
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
