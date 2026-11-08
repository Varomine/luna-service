/**
 * HanimeSubTH Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://hanimesubth.com/
 * Stream Type: Direct Master HLS 1080p (Main Server)
 * Version: 1.0.1
 */

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Referer": "https://hanimesubth.com/"
};

function safeReferer(ref) {
    if (!ref) return "https://hanimesubth.com/";
    try {
        return encodeURI(ref);
    } catch (e) {
        return "https://hanimesubth.com/";
    }
}

async function httpGet(url, customHeaders = DEFAULT_HEADERS) {
    try {
        let headersObj = DEFAULT_HEADERS;
        if (typeof customHeaders === "string") {
            headersObj = {
                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                "Referer": safeReferer(customHeaders)
            };
        } else if (customHeaders && typeof customHeaders === "object") {
            headersObj = Object.assign({}, DEFAULT_HEADERS, customHeaders);
            if (headersObj.Referer) {
                headersObj.Referer = safeReferer(headersObj.Referer);
            }
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
        console.error("[HanimeSubTH] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

async function httpPost(url, body, customHeaders = {}) {
    try {
        const headersObj = Object.assign({
            "User-Agent": DEFAULT_HEADERS["User-Agent"],
            "Referer": "https://hanimesubth.com/",
            "Origin": "https://hanimesubth.com",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "*/*"
        }, customHeaders);

        let res;
        if (typeof fetchv2 !== "undefined") {
            res = await fetchv2(url, {
                method: "POST",
                headers: headersObj,
                body: body
            });
        } else if (typeof fetch !== "undefined") {
            res = await fetch(url, {
                method: "POST",
                headers: headersObj,
                body: body
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
        console.error("[HanimeSubTH] httpPost error for " + url + ": " + err.message);
        return null;
    }
}

// ─── Search Results (Live AJAX Search with Home Catalog Fallback) ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        const results = [];
        const seen = new Set();

        if (query !== "") {
            // Live AJAX search query on hanimesubth.com
            const payload = `sValue=${encodeURIComponent(query)}`;
            const searchHtml = await httpPost("https://hanimesubth.com/include/searchquery.php", payload);

            if (searchHtml && searchHtml !== "undefined") {
                const cardRegex = /<a[^>]+class=["'][^"']*iw_col[^"']*["'][^>]+href=["'](https:\/\/hanimesubth\.com\/\d+\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
                let match;
                while ((match = cardRegex.exec(searchHtml)) !== null) {
                    const href = match[1];
                    const inner = match[2];
                    if (seen.has(href)) continue;

                    const titleMatch = inner.match(/<div class=["']iw_title["']>([\s\S]*?)<\/div>/i) ||
                                       inner.match(/alt=["']([^"']+)["']/i);
                    let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Untitled";

                    const imgMatch = inner.match(/<img[^>]+src=["']([^"']+)["']/i);
                    let image = imgMatch ? imgMatch[1].trim() : "";
                    if (image.startsWith("/")) image = "https://hanimesubth.com" + image;

                    seen.add(href);
                    results.push({ title, image, href });
                }
            }
        }

        // Fallback: If empty query or search query returned 0 items, load home catalog
        if (results.length === 0) {
            const html = await httpGet("https://hanimesubth.com/");
            if (html && html !== "undefined") {
                const cardRegex = /<a[^>]+class=["'][^"']*iw_col[^"']*["'][^>]+href=["'](https:\/\/hanimesubth\.com\/\d+\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
                let match;
                while ((match = cardRegex.exec(html)) !== null) {
                    const href = match[1];
                    const inner = match[2];
                    if (seen.has(href)) continue;

                    const titleMatch = inner.match(/<div class=["']iw_title["']>([\s\S]*?)<\/div>/i) ||
                                       inner.match(/alt=["']([^"']+)["']/i);
                    let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "Untitled";

                    const imgMatch = inner.match(/<img[^>]+src=["']([^"']+)["']/i);
                    let image = imgMatch ? imgMatch[1].trim() : "";
                    if (image.startsWith("/")) image = "https://hanimesubth.com" + image;

                    seen.add(href);
                    results.push({ title, image, href });
                }
            }
        }

        // Broad fallback: any anime detail links
        if (results.length === 0) {
            const html = await httpGet("https://hanimesubth.com/");
            if (html && html !== "undefined") {
                const linkRegex = /<a[^>]+href=["'](https:\/\/hanimesubth\.com\/(\d+)\/([^"']+))["'][^>]*>([\s\S]*?)<\/a>/gi;
                let match;
                while ((match = linkRegex.exec(html)) !== null) {
                    const href = match[1];
                    const inner = match[4];
                    if (seen.has(href) || href.includes('/category/') || href.includes('/schedule/')) continue;

                    const titleMatch = inner.match(/<div class=["']iw_title["']>([\s\S]*?)<\/div>/i) ||
                                       inner.match(/<span class=["']media-heading["']>([\s\S]*?)<\/span>/i) ||
                                       inner.match(/alt=["']([^"']+)["']/i);
                    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : "";
                    if (!title) continue;

                    const imgMatch = inner.match(/<img[^>]+src=["']([^"']+)["']/i);
                    let image = imgMatch ? imgMatch[1].trim() : "";
                    if (image.startsWith("/")) image = "https://hanimesubth.com" + image;

                    seen.add(href);
                    results.push({ title, image, href });
                }
            }
        }

        return JSON.stringify(results);
    } catch (error) {
        console.error("[HanimeSubTH] searchResults error: " + error.message);
        return JSON.stringify([]);
    }
}

// ─── Extract Details ───
async function extractDetails(url) {
    try {
        const targetUrl = url.split("?")[0];
        const html = await httpGet(targetUrl);
        if (!html || html === "undefined") {
            return JSON.stringify([{ description: "No details available.", aliases: "HanimeSubTH", airdate: "N/A" }]);
        }

        const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
        const titleMatch = ogTitleMatch ||
                           html.match(/<li class="active">([\s\S]*?)<\/li>/i) ||
                           html.match(/<title>([\s\S]*?)<\/title>/i);
        let title = "HanimeSubTH";
        if (titleMatch) {
            title = titleMatch[1].replace(/<[^>]+>/g, '')
                                .replace(/\s*-\s*H-Anime[\s\S]*$/i, '')
                                .trim();
        }

        const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/i) ||
                          html.match(/<meta name="description" content="([^"]+)"/i);
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : "No description available.";

        const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/i) ||
                         html.match(/<img[^>]+src="(https:\/\/hanimesubth\.com\/uploads\/[^"]+)"/i);
        const image = imgMatch ? imgMatch[1].trim() : "";

        const yearMatch = html.match(/\b(202\d|201\d)\b/);
        const airdate = yearMatch ? yearMatch[1] : "N/A";

        return JSON.stringify([{
            title,
            description,
            image,
            aliases: "HanimeSubTH",
            airdate
        }]);
    } catch (error) {
        console.error("[HanimeSubTH] extractDetails error: " + error.message);
        return JSON.stringify([{ description: "Error loading description", aliases: "HanimeSubTH", airdate: "N/A" }]);
    }
}

// ─── Extract Episodes ───
async function extractEpisodes(url) {
    try {
        const baseUrl = url.split("?")[0];
        const html = await httpGet(baseUrl);
        if (!html || html === "undefined") return JSON.stringify([{ href: baseUrl, number: 1, title: "ตอนที่ 1" }]);

        const episodes = [];
        const seenHrefs = new Set();

        const epRegex = /<a[^>]+href="([^"]*\/play\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = epRegex.exec(html)) !== null) {
            let epHref = match[1].trim();
            if (epHref.startsWith('/')) epHref = 'https://hanimesubth.com' + epHref;
            if (seenHrefs.has(epHref)) continue;
            seenHrefs.add(epHref);

            const rawText = match[2].replace(/<[^>]+>/g, '').trim();
            const decodedHref = decodeURIComponent(epHref);

            const volMatch = rawText.match(/Vol\.?\s*([0-9.]+)/i) || decodedHref.match(/vol-([0-9.]+)/i);
            const numMatch = rawText.match(/ตอนที่\s*([0-9.]+)/i) || rawText.match(/ep\s*([0-9.]+)/i);
            
            let number = episodes.length + 1;
            if (volMatch) {
                number = parseFloat(volMatch[1]);
            } else if (numMatch) {
                number = parseFloat(numMatch[1]);
            }

            const title = rawText || `ตอนที่ ${number}`;

            episodes.push({
                href: epHref,
                number: isNaN(number) ? (episodes.length + 1) : number,
                title
            });
        }

        if (episodes.length === 0) {
            episodes.push({ href: baseUrl, number: 1, title: "ตอนที่ 1" });
        }

        episodes.sort((a, b) => a.number - b.number);
        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[HanimeSubTH] extractEpisodes error: " + error.message);
        return JSON.stringify([{ href: url, number: 1, title: "ตอนที่ 1" }]);
    }
}

// ─── Extract Stream URL (Direct Master HLS from Main Server) ───
async function extractStreamUrl(url) {
    try {
        const baseUrl = url.split("?")[0];
        const html = await httpGet(baseUrl);
        const streams = [];

        // 1. Resolve player ID from URL or page content
        const idMatch = baseUrl.match(/\/play\/([a-zA-Z0-9_-]+)/i) || (html && html.match(/player\/([a-zA-Z0-9_-]+)/i));
        const playId = idMatch ? idMatch[1] : null;

        if (playId) {
            try {
                const p1Url = `https://hanimesubth.com/player/${playId}`;
                const p1Html = await httpGet(p1Url, baseUrl);
                if (p1Html) {
                    const overlayFrameMatch = p1Html.match(/<iframe[^>]+src=["']https:\/\/overlay\.hanimesubth\.com\/v\/([a-zA-Z0-9_-]+)["']/i) ||
                                              p1Html.match(/src=["']https:\/\/overlay\.hanimesubth\.com\/v\/([a-zA-Z0-9_-]+)["']/i);
                    if (overlayFrameMatch) {
                        const overlayVid = overlayFrameMatch[1];
                        const overlayHeaders = {
                            "User-Agent": DEFAULT_HEADERS["User-Agent"],
                            "Referer": "https://overlay.hanimesubth.com/",
                            "Origin": "https://overlay.hanimesubth.com",
                            "Accept": "*/*"
                        };

                        // Quality Variant 1: 1080p Full HD Direct HLS
                        const stream1080 = `https://overlay.hanimesubth.com/quality/${overlayVid}/1080/`;
                        streams.push({
                            title: "HanimeSubTH • Main Server (1080p HLS)",
                            streamUrl: stream1080,
                            url: stream1080,
                            headers: overlayHeaders
                        });

                        // Quality Variant 2: 720p HD Direct HLS
                        const stream720 = `https://overlay.hanimesubth.com/quality/${overlayVid}/720/`;
                        streams.push({
                            title: "HanimeSubTH • Main Server (720p HLS)",
                            streamUrl: stream720,
                            url: stream720,
                            headers: overlayHeaders
                        });

                        // Quality Variant 3: Auto Adaptive Master HLS
                        const streamAuto = `https://overlay.hanimesubth.com/file/${overlayVid}/`;
                        streams.push({
                            title: "HanimeSubTH • Main Server (Auto Master HLS)",
                            streamUrl: streamAuto,
                            url: streamAuto,
                            headers: overlayHeaders
                        });
                    }
                }
            } catch (err1) {
                console.error("[HanimeSubTH] Player 1 error: " + err1.message);
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
        console.error("[HanimeSubTH] extractStreamUrl error: " + error.message);
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        searchResults,
        extractDetails,
        extractEpisodes,
        extractStreamUrl
    };
}
