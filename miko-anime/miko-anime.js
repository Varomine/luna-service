/**
 * Miko-Anime Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://miko-anime.com/
 * Version: 1.0.1
 */

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
    "Referer": "https://miko-anime.com/"
};

async function httpGet(url, customHeaders = DEFAULT_HEADERS) {
    try {
        let headersObj = DEFAULT_HEADERS;
        if (typeof customHeaders === "string") {
            headersObj = {
                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                "Referer": customHeaders
            };
        } else if (customHeaders && typeof customHeaders === "object") {
            headersObj = Object.assign({}, DEFAULT_HEADERS, customHeaders);
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
        console.error("[Miko-Anime] httpGet error for " + url + ": " + err.message);
        return null;
    }
}

async function httpPost(url, payload, customHeaders = DEFAULT_HEADERS) {
    try {
        const postHeaders = Object.assign({}, DEFAULT_HEADERS, customHeaders, {
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
        console.error("[Miko-Anime] httpPost error for " + url + ": " + err.message);
        return null;
    }
}

// ─── Search Results ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        let html = null;

        if (query !== "") {
            const body = "name=" + encodeURIComponent(query);
            html = await httpPost("https://miko-anime.com/library/search.php", body, {
                "Referer": "https://miko-anime.com/search/"
            });
        }

        if (!html || html.trim() === "" || html.includes("ไม่พบข้อมูล")) {
            html = await httpGet("https://miko-anime.com/archives/");
        }

        if (!html) return JSON.stringify([]);

        const results = [];
        const seenHrefs = new Set();

        const cardRegex = /<a[^>]+href=["'](https?:\/\/miko-anime\.com\/[^"']+|\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = cardRegex.exec(html)) !== null) {
            let href = match[1];
            if (!href.startsWith("http")) href = "https://miko-anime.com" + href;
            if (href.endsWith("/")) href = href.slice(0, -1);

            if (href.includes("/archives") || href.includes("/search") || href.includes("/bookmark") || href === "https://miko-anime.com" || href.includes("/watch/")) {
                continue;
            }

            if (seenHrefs.has(href)) continue;

            const content = match[2];
            const imgMatch = content.match(/src=["']([^"']+)["']/i) || content.match(/data-src=["']([^"']+)["']/i);
            const titleMatch = content.match(/alt=["']([^"']+)["']/i) || content.match(/title=["']([^"']+)["']/i) || content.match(/<span[^>]*class=["']title["'][^>]*>([^<]+)<\/span>/i);

            let title = titleMatch ? titleMatch[1].trim() : "";
            let image = imgMatch ? imgMatch[1] : "";

            if (!title) {
                const plainText = content.replace(/<[^>]+>/g, "").trim();
                if (plainText.length > 2) title = plainText;
            }

            if (title && image) {
                const finalHref = href.endsWith("/") ? href : href + "/";
                seenHrefs.add(href);
                results.push({
                    title: title,
                    image: image,
                    href: finalHref
                });
            }
        }

        return JSON.stringify(results);
    } catch (error) {
        console.error("[Miko-Anime] searchResults error: " + error.message);
        return JSON.stringify([]);
    }
}

// ─── Extract Details ───
async function extractDetails(url) {
    try {
        const targetUrl = url.split("?")[0];
        const html = await httpGet(targetUrl);
        if (!html) {
            return JSON.stringify([{ description: "No details available.", aliases: "Miko-Anime", airdate: "N/A" }]);
        }

        const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<meta property="og:title" content="([^"]+)"/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").replace(/Miko Anime/gi, "").replace(/[|-]/g, "").trim() : "Miko-Anime";

        const descMatch = html.match(/<div[^>]*class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
                          html.match(/<meta property="og:description" content="([^"]+)"/i);
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "No description available.";

        const yearMatch = html.match(/\b(202\d|201\d)\b/);
        const airdate = yearMatch ? yearMatch[1] : "N/A";

        return JSON.stringify([{ title, description, aliases: "Miko-Anime", airdate }]);
    } catch (error) {
        console.error("[Miko-Anime] extractDetails error: " + error.message);
        return JSON.stringify([{ description: "Error loading description", aliases: "Miko-Anime", airdate: "N/A" }]);
    }
}

// ─── Extract Episodes ───
async function extractEpisodes(url) {
    try {
        const baseUrl = url.split("?")[0];
        const html = await httpGet(baseUrl);
        if (!html) return JSON.stringify([{ href: baseUrl, number: 1, title: "Episode 1" }]);

        const episodes = [];
        const seenHrefs = new Set();
        const epRegex = /<a[^>]+href=["'](https?:\/\/miko-anime\.com\/watch\/[^"']+|\/watch\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = epRegex.exec(html)) !== null) {
            let epHref = match[1];
            if (!epHref.startsWith("http")) epHref = "https://miko-anime.com" + epHref;
            if (!epHref.endsWith("/")) epHref = epHref + "/";

            if (seenHrefs.has(epHref)) continue;
            seenHrefs.add(epHref);

            const rawText = match[2].replace(/<[^>]+>/g, "").trim();
            const numMatch = rawText.match(/ตอนที่\s*(\d+)/i) || rawText.match(/ep\s*(\d+)/i) || rawText.match(/\b(\d+)\b/);
            const number = numMatch ? parseInt(numMatch[1], 10) : (episodes.length + 1);

            episodes.push({
                href: epHref,
                number: isNaN(number) ? (episodes.length + 1) : number,
                title: rawText ? `ตอนที่ ${rawText}` : `Episode ${episodes.length + 1}`
            });
        }

        if (episodes.length === 0) {
            episodes.push({ href: baseUrl, number: 1, title: "Episode 1" });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[Miko-Anime] extractEpisodes error: " + error.message);
        return JSON.stringify([{ href: url, number: 1, title: "Episode 1" }]);
    }
}

// ─── Extract Stream URL ───
async function extractStreamUrl(url) {
    try {
        let epUrl = url ? url.trim() : "";
        if (!epUrl.startsWith("http")) {
            epUrl = "https://miko-anime.com" + (epUrl.startsWith("/") ? "" : "/") + epUrl;
        }

        const epHtml = await httpGet(epUrl, { "Referer": "https://miko-anime.com/" });
        if (!epHtml) return JSON.stringify({ streams: [], url: "", streamUrl: "", subtitle: "" });

        const iframeMatch = epHtml.match(/<iframe[^>]+src=["'](https?:\/\/miko-anime\.com\/play\/[^"']+|\/play\/[^"']+)["']/i);
        let playerUrl = iframeMatch ? iframeMatch[1] : null;

        if (!playerUrl) {
            const idMatch = epUrl.match(/\/watch\/([^\/]+)/);
            if (idMatch) playerUrl = `https://miko-anime.com/play/${idMatch[1]}`;
        }

        if (!playerUrl) return JSON.stringify({ streams: [], url: "", streamUrl: "", subtitle: "" });
        if (!playerUrl.startsWith("http")) playerUrl = "https://miko-anime.com" + playerUrl;

        const playerHtml = await httpGet(playerUrl, { "Referer": epUrl });
        if (!playerHtml) return JSON.stringify({ streams: [], url: "", streamUrl: "", subtitle: "" });

        const videoDataMatch = playerHtml.match(/const\s+video_data\s*=\s*(\{[\s\S]*?\});/);
        if (!videoDataMatch) return JSON.stringify({ streams: [], url: "", streamUrl: "", subtitle: "" });

        let videoData;
        try { videoData = JSON.parse(videoDataMatch[1]); } catch(e) { return JSON.stringify({ streams: [], url: "", streamUrl: "", subtitle: "" }); }

        let fileUrl = videoData.files?.url;
        if (!fileUrl) return JSON.stringify({ streams: [], url: "", streamUrl: "", subtitle: "" });

        let finalStreamUrl = fileUrl;
        let streamHeaders = {
            "User-Agent": DEFAULT_HEADERS["User-Agent"],
            "Referer": "https://miko-anime.com/"
        };

        if (fileUrl.includes("overlay.stream-s.sbs/v/")) {
            const vidMatch = fileUrl.match(/\/v\/([^\/]+)/);
            if (vidMatch) {
                const vid = vidMatch[1];
                const masterM3u8Url = `https://overlay.stream-s.sbs/file/${vid}/`;
                const masterText = await httpGet(masterM3u8Url, {
                    "User-Agent": DEFAULT_HEADERS["User-Agent"],
                    "Referer": fileUrl
                });

                if (masterText) {
                    const lines = masterText.split("\n");
                    let highestRes = 0;
                    let bestUrl = null;

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (line.startsWith("#EXT-X-STREAM-INF:")) {
                            const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
                            const height = resMatch ? parseInt(resMatch[2], 10) : 0;
                            const nextLine = (lines[i + 1] || "").trim();
                            if (nextLine && !nextLine.startsWith("#")) {
                                if (height >= highestRes) {
                                    highestRes = height;
                                    bestUrl = nextLine;
                                }
                            }
                        }
                    }

                    if (bestUrl) {
                        finalStreamUrl = bestUrl;
                    } else {
                        finalStreamUrl = masterM3u8Url;
                    }
                }

                streamHeaders = {
                    "User-Agent": DEFAULT_HEADERS["User-Agent"],
                    "Referer": "https://overlay.stream-s.sbs/"
                };
            }
        }

        const streams = [{
            title: "Miko-Anime 1080p (HLS)",
            streamUrl: finalStreamUrl,
            url: finalStreamUrl,
            file: finalStreamUrl,
            link: finalStreamUrl,
            headers: streamHeaders
        }];

        return JSON.stringify({
            streams: streams,
            url: finalStreamUrl,
            streamUrl: finalStreamUrl,
            subtitle: ""
        });
    } catch (error) {
        console.error("[Miko-Anime] extractStreamUrl error: " + error.message);
        return JSON.stringify({ streams: [], url: "", streamUrl: "", subtitle: "" });
    }
}
