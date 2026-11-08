/**
 * AnimeGoJo Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://animegojoo.com/
 * Stream Type: Master HLS 1080p
 * Version: 1.0.3
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

// Helper: Decode Caesar cipher encoded scripts from animegojoo HTML
function extractPvepsFromHtml(html) {
    if (!html) return null;
    const obfScripts = [...html.matchAll(/var\s+([_a-zA-Z0-9]+a)\s*=\s*(\[[0-9,\s]+\])[\s\S]*?([_a-zA-Z0-9]+k)\s*=\s*(\d+)[\s\S]*?String\.fromCharCode/gi)];
    for (const script of obfScripts) {
        try {
            const arr = JSON.parse(script[2]);
            const key = parseInt(script[4]);
            let decoded = "";
            for (let j = 0; j < arr.length; j++) {
                decoded += String.fromCharCode(arr[j] - key);
            }
            if (decoded.includes("PVEPS")) {
                const pvepsMatch = decoded.match(/var\s+PVEPS\s*=\s*(\{[\s\S]*?\});/);
                if (pvepsMatch) {
                    return JSON.parse(pvepsMatch[1]);
                }
            }
        } catch (e) {}
    }
    return null;
}

// ─── Search Results ───
async function searchResults(keyword) {
    try {
        const query = keyword ? keyword.trim() : "";
        let targetUrl = "https://animegojoo.com/";

        if (query !== "") {
            // animegojoo.com server WAF rejects '%20' with HTTP 403 in the search path.
            // Using '+' for spaces ensures HTTP 200 and matches multi-word queries accurately.
            const formattedQuery = encodeURIComponent(query).replace(/%20/g, "+");
            targetUrl = `https://animegojoo.com/search/${formattedQuery}/`;
        }

        let html = await httpGet(targetUrl);

        // Fallback: If 403 or empty, try query parameter search `/?s=`
        if (!html || html === "undefined" || html.includes("<title>403") || html.includes("403 Forbidden")) {
            const fallbackUrl = `https://animegojoo.com/?s=${encodeURIComponent(query).replace(/%20/g, "+")}`;
            const fallbackHtml = await httpGet(fallbackUrl);
            if (fallbackHtml && fallbackHtml !== "undefined") {
                html = fallbackHtml;
            }
        }

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
        const baseUrl = url.split("?")[0].split("#")[0];
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
        let baseUrl = url.split("?")[0].split("#")[0];
        let html = await httpGet(baseUrl);
        if (!html || html === "undefined") {
            return JSON.stringify([{
                href: baseUrl,
                number: 1,
                title: "Episode 1"
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

        // Parse PVEPS object from the page if available
        const pveps = extractPvepsFromHtml(html);

        const episodes = [];
        const seenNumbers = new Set();
        const epRegex = /<a\s+[^>]*class=["'][^"']*ep-item[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;

        while ((match = epRegex.exec(html)) !== null) {
            const aTag = match[0];
            const epText = match[1].replace(/<[^>]+>/g, "").trim();

            const dataNoMatch = aTag.match(/data-no=["'](\d+)["']/i);
            const dataNo = dataNoMatch ? dataNoMatch[1] : "";

            const numMatch = epText.match(/ตอนที่\s*([0-9.]+)/i) || epText.match(/EP\s*([0-9.]+)/i) || epText.match(/([0-9.]+)/);
            let number = numMatch ? parseFloat(numMatch[1]) : (episodes.length + 1);

            let epUid = "";
            let epType = "playg";

            if (dataNo && pveps && pveps[dataNo]) {
                const pvep = pveps[dataNo];
                if (pvep.l && !isNaN(parseFloat(pvep.l))) {
                    number = parseFloat(pvep.l);
                }
                if (pvep.u) {
                    const l2 = pvep.u.match(/link2=([^&"']*)/i);
                    const l1 = pvep.u.match(/link=([^&"']*)/i);
                    if (l2 && l2[1]) {
                        epUid = l2[1];
                        epType = "playg";
                    } else if (l1 && l1[1]) {
                        epUid = l1[1];
                        epType = "play2";
                    }
                }
            }

            if (seenNumbers.has(number)) continue;
            seenNumbers.add(number);

            let epHref = `${baseUrl}#ep-${number}`;
            if (dataNo) epHref += `&no=${dataNo}`;
            if (epUid) epHref += `&uid=${epUid}&type=${epType}`;

            episodes.push({
                href: epHref,
                number: number,
                title: `ตอนที่ ${number}`
            });
        }

        // If no ep-items matched, check PVEPS directly
        if (episodes.length === 0 && pveps) {
            for (const [no, item] of Object.entries(pveps)) {
                const number = parseFloat(item.l || (episodes.length + 1));
                let epUid = "";
                let epType = "playg";
                if (item.u) {
                    const l2 = item.u.match(/link2=([^&"']*)/i);
                    const l1 = item.u.match(/link=([^&"']*)/i);
                    if (l2 && l2[1]) {
                        epUid = l2[1];
                        epType = "playg";
                    } else if (l1 && l1[1]) {
                        epUid = l1[1];
                        epType = "play2";
                    }
                }

                let epHref = `${baseUrl}#ep-${number}&no=${no}`;
                if (epUid) epHref += `&uid=${epUid}&type=${epType}`;

                episodes.push({
                    href: epHref,
                    number: number,
                    title: `ตอนที่ ${number}`
                });
            }
        }

        if (episodes.length === 0) {
            episodes.push({
                href: baseUrl,
                number: 1,
                title: "ตอนที่ 1"
            });
        }

        // Sort ascending by episode number
        episodes.sort((a, b) => a.number - b.number);
        return JSON.stringify(episodes);
    } catch (error) {
        console.error("[AnimeGoJo] extractEpisodes error: " + error.message);
        return JSON.stringify([{
            href: url,
            number: 1,
            title: "ตอนที่ 1"
        }]);
    }
}

// ─── Extract Stream URL ───
async function extractStreamUrl(url) {
    try {
        let streamUrl = "";

        // 1. Direct uid & type embedded in the episode href
        const uidMatch = url.match(/[?&#]uid=([^&#]+)/i);
        const typeMatch = url.match(/[?&#]type=([^&#]+)/i);
        if (uidMatch && uidMatch[1]) {
            const uid = uidMatch[1];
            const type = (typeMatch && typeMatch[1]) ? typeMatch[1] : "playg";
            streamUrl = `https://youtube.anccplayer.cyou/${type}.php?uid=${uid}`;
        }

        // 2. If not embedded, fetch the series page and find the episode in PVEPS
        if (!streamUrl) {
            const baseUrl = url.split("?")[0].split("#")[0];
            const html = await httpGet(baseUrl);
            if (html && html !== "undefined") {
                const pveps = extractPvepsFromHtml(html);
                if (pveps) {
                    const noMatch = url.match(/[?&#]no=(\d+)/i);
                    const epMatch = url.match(/#ep-([0-9.]+)/i);

                    let targetPvep = null;
                    if (noMatch && pveps[noMatch[1]]) {
                        targetPvep = pveps[noMatch[1]];
                    } else if (epMatch) {
                        const targetEpNum = epMatch[1];
                        for (const item of Object.values(pveps)) {
                            if (item.l === targetEpNum) {
                                targetPvep = item;
                                break;
                            }
                        }
                    }

                    if (!targetPvep) {
                        const keys = Object.keys(pveps);
                        if (keys.length > 0) targetPvep = pveps[keys[0]];
                    }

                    if (targetPvep && targetPvep.u) {
                        const l2 = targetPvep.u.match(/link2=([^&"']*)/i);
                        const l1 = targetPvep.u.match(/link=([^&"']*)/i);
                        if (l2 && l2[1]) {
                            streamUrl = `https://youtube.anccplayer.cyou/playg.php?uid=${l2[1]}`;
                        } else if (l1 && l1[1]) {
                            streamUrl = `https://youtube.anccplayer.cyou/play2.php?uid=${l1[1]}`;
                        }
                    }
                }

                // 3. Fallback to raw playeradsg match
                if (!streamUrl) {
                    const rawPlayerMatch = html.match(/playeradsg\.php\?link=([^&"']*)&link2=([^&"']*)/i);
                    if (rawPlayerMatch) {
                        if (rawPlayerMatch[2]) {
                            streamUrl = `https://youtube.anccplayer.cyou/playg.php?uid=${rawPlayerMatch[2]}`;
                        } else if (rawPlayerMatch[1]) {
                            streamUrl = `https://youtube.anccplayer.cyou/play2.php?uid=${rawPlayerMatch[1]}`;
                        }
                    }
                }
            }
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
