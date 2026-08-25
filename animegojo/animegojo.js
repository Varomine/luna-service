/**
 * AnimeGoJo Extension Module for Luna / Sora / Dartotsu / Mojuru / Anymex
 * Author: Varomine
 * Site: https://animegojoo.com/
 * Stream Type: Master HLS 1080p
 */

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://animegojoo.com/"
};

// ─── Search ───
async function search(query) {
    try {
        const cleanQuery = (query || "").trim();
        const searchUrl = `https://animegojoo.com/search/${encodeURIComponent(cleanQuery)}/`;
        console.log("[AnimeGoJo] Searching:", searchUrl);

        const res = await fetch(searchUrl, { headers: DEFAULT_HEADERS });
        if (!res.ok) return JSON.stringify([]);

        const html = await res.text();
        const results = [];
        const cardRegex = /<a\s+class="anime-card"\s+href="([^"]+)"[\s\S]*?<\/a>/gi;
        const matches = [...html.matchAll(cardRegex)];

        for (const match of matches) {
            const cardHtml = match[0];
            const relHref = match[1];
            const fullUrl = relHref.startsWith("http") ? relHref : `https://animegojoo.com${relHref.startsWith("/") ? "" : "/"}${relHref}`;

            // Title
            const titleMatch = cardHtml.match(/<div class="card-info">\s*<h3>([\s\S]*?)<\/h3>/i) || cardHtml.match(/title="([^"]+)"/i);
            const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "Unknown";

            // Image
            const imgMatch = cardHtml.match(/style=["'][^"']*url\(([^)]+)\)["']/i) || cardHtml.match(/data-bg=["']([^"']+)["']/i) || cardHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
            let image = "";
            if (imgMatch) {
                const imgPath = imgMatch[1].replace(/['"]/g, "").trim();
                image = imgPath.startsWith("http") ? imgPath : `https://animegojoo.com${imgPath.startsWith("/") ? "" : "/"}${imgPath}`;
            }

            // Extract ID
            const idMatch = relHref.match(/\/(?:list|ep)\/(\d+)\/?/i);
            const id = idMatch ? idMatch[1] : fullUrl;

            results.push({
                id: id,
                title: title,
                image: image,
                url: fullUrl
            });
        }

        return JSON.stringify(results);
    } catch (e) {
        console.error("[AnimeGoJo] Search error: " + e.message);
        return JSON.stringify([]);
    }
}

// ─── Extract Episodes ───
async function extractEpisodes(url) {
    try {
        let animeUrl = (url || "").trim();
        if (!animeUrl.startsWith("http")) {
            animeUrl = `https://animegojoo.com/list/${animeUrl}/`;
        }

        console.log("[AnimeGoJo] Extracting episodes for:", animeUrl);
        const res = await fetch(animeUrl, { headers: DEFAULT_HEADERS });
        if (!res.ok) return JSON.stringify([]);

        const html = await res.text();
        const episodes = [];
        const epRegex = /<a\s+class="ep-item"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        const matches = [...html.matchAll(epRegex)];

        for (let i = 0; i < matches.length; i++) {
            const relHref = matches[i][1];
            const epText = matches[i][2].replace(/<[^>]+>/g, "").trim();
            const fullUrl = relHref.startsWith("http") ? relHref : `https://animegojoo.com${relHref.startsWith("/") ? "" : "/"}${relHref}`;

            // Extract numeric episode number
            const numMatch = epText.match(/ตอนที่\s*([0-9.]+)/i) || epText.match(/EP\s*([0-9.]+)/i) || epText.match(/([0-9.]+)/);
            const epNum = numMatch ? parseFloat(numMatch[1]) : (i + 1);

            const idMatch = relHref.match(/\/ep\/(\d+)\/?/i);
            const id = idMatch ? idMatch[1] : fullUrl;

            episodes.push({
                id: id,
                title: epText || `ตอนที่ ${i + 1}`,
                episodeNumber: epNum,
                number: epNum,
                url: fullUrl
            });
        }

        // Sort ascending by episode number
        episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
        return JSON.stringify(episodes);
    } catch (e) {
        console.error("[AnimeGoJo] Extract episodes error: " + e.message);
        return JSON.stringify([]);
    }
}

// ─── Extract Stream URL ───
async function extractStreamUrl(url) {
    try {
        let epUrl = (url || "").trim();
        if (!epUrl.startsWith("http")) {
            epUrl = `https://animegojoo.com/ep/${epUrl}/`;
        }

        console.log("[AnimeGoJo] Extracting stream for:", epUrl);
        const res = await fetch(epUrl, { headers: DEFAULT_HEADERS });
        if (!res.ok) return JSON.stringify({ streams: [], url: "", streamUrl: "", subtitle: "" });

        const html = await res.text();

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
            return JSON.stringify({ streams: [], url: "", streamUrl: "", subtitle: "" });
        }

        const streams = [
            {
                title: "1080p",
                quality: "1080p",
                streamUrl: streamUrl,
                url: streamUrl,
                file: streamUrl,
                link: streamUrl,
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

    } catch (e) {
        console.error("[AnimeGoJo] Extract stream error: " + e.message);
        return JSON.stringify({ streams: [], url: "", streamUrl: "", subtitle: "" });
    }
}
