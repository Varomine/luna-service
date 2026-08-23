/**
 * AniKoto Cloudflare Worker API & Resolver
 * Adapted from AniKoto Luna Service Script (https://animepahetv.to/)
 * Author: Varomine / Ibro
 * Deployable on Cloudflare Workers
 */

class DdosGuardInterceptor {
    constructor() {
        this.errorCodes = [403];
        this.serverCheck = ["ddos-guard"];
        this.cookieStore = {};
    }

    async fetchWithBypass(url, options = {}) {
        let response = await this.fetchWithCookies(url, options);
        if (this.errorCodes.includes(response.status)) {
            const newCookie = await this.getNewCookie(url);
            if (newCookie || this.cookieStore["__ddg2_"]) {
                return this.fetchWithCookies(url, options);
            }
            return response;
        }

        let responseText;
        try { responseText = await response.text(); } catch (e) { return response; }

        const isBlocked = responseText.includes('ddos-guard/js-challenge') ||
                         responseText.includes('DDoS-Guard') ||
                         responseText.includes('data-ddg-origin');
        if (!isBlocked) {
            response.text = async () => responseText;
            return response;
        }

        if (this.cookieStore["__ddg2_"]) {
            return this.fetchWithCookies(url, options);
        }

        const newCookie = await this.getNewCookie(url);
        if (!newCookie) {
            response.text = async () => responseText;
            return response;
        }
        return this.fetchWithCookies(url, options);
    }

    async fetchWithCookies(url, options = {}) {
        const cookieHeader = this.getCookieHeader();
        const headers = options.headers || {};
        if (cookieHeader) headers.Cookie = cookieHeader;
        const response = await fetch(url, { headers });
        try {
            const setCookie = response.headers ? (response.headers.get("Set-Cookie") || response.headers.get("set-cookie")) : null;
            if (setCookie) this.storeCookies(setCookie);
        } catch (e) {}
        return response;
    }

    storeCookies(setCookieString) {
        const cookies = Array.isArray(setCookieString) ? setCookieString : [setCookieString];
        cookies.forEach(cookieHeader => {
            const parts = cookieHeader.split(";");
            if (parts.length > 0) {
                const [key, value] = parts[0].split("=");
                if (key) this.cookieStore[key.trim()] = value?.trim() || "";
            }
        });
    }

    getCookieHeader() {
        return Object.entries(this.cookieStore).map(([k, v]) => `${k}=${v}`).join("; ");
    }

    async getNewCookie(targetUrl) {
        try {
            const wellKnownResponse = await fetch("https://check.ddos-guard.net/check.js");
            const wellKnownText = await wellKnownResponse.text();
            const paths = wellKnownText.match(/['"](\/\.well-known\/ddos-guard\/[^'"]+)['"]/g);
            if (!paths || paths.length === 0) return null;
            const localPath = paths[0].replace(/['"]/g, '');
            const match = targetUrl.match(/^(https?:\/\/[^\/]+)/);
            if (!match) return null;
            const baseUrl = match[1];
            const localUrl = baseUrl + localPath;

            await fetch(localUrl, { headers: { 'Referer': targetUrl } });
            const checkPaths = wellKnownText.match(/['"]https:\/\/check\.ddos-guard\.net\/[^'"]+['"]/g);
            if (checkPaths && checkPaths.length > 0) {
                const checkUrl = checkPaths[0].replace(/['"]/g, '');
                await fetch(checkUrl, { headers: { 'Referer': targetUrl } });
            }
            return this.cookieStore["__ddg2_"] || null;
        } catch (e) {
            return null;
        }
    }
}

function unpack(source) {
    function _filterargs(source) {
        const juicers = [
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\), *(\d+), *(.*)\)\)/,
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/,
        ];
        for (const juicer of juicers) {
            const args = juicer.exec(source);
            if (args) {
                return {
                    payload: args[1],
                    symtab: args[4].split("|"),
                    radix: parseInt(args[2]),
                    count: parseInt(args[3])
                };
            }
        }
        throw Error("Could not make sense of p.a.c.k.e.r data");
    }

    let { payload, symtab, radix, count } = _filterargs(source);
    if (count != symtab.length) throw Error("Malformed symtab.");

    let unbase;
    const ALPHABET = {
        62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
        95: "' !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
    };
    if (radix <= 36) unbase = (value) => parseInt(value, radix);
    else {
        const dict = {};
        [...ALPHABET[radix] || ALPHABET[62]].forEach((c, i) => { dict[c] = i; });
        unbase = (value) => {
            let ret = 0;
            [...value].reverse().forEach((c, i) => { ret += Math.pow(radix, i) * dict[c]; });
            return ret;
        };
    }

    function lookup(word) {
        if (radix == 1) return symtab[parseInt(word)];
        return symtab[unbase(word)] || word;
    }

    return payload.replace(/\b\w+\b/g, lookup);
}

class AnikotoEngine {
    static async search(keyword) {
        const base = "https://animepahetv.to/search?q=" + encodeURIComponent(keyword).replace(/%20/g, "+");
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Referer": "https://animepahetv.to/"
        };
    
        const resp1 = await fetch(base, { headers });
        if (!resp1 || resp1.status !== 200) return [];
        const html1 = await resp1.text();
    
        let totalPages = 1;
        const lastLinkMatch = html1.match(/<a\s+title="Last"\s+class="page-link"\s+href="[^"]*&?page=(\d+)"/i);
        if (lastLinkMatch) {
            totalPages = parseInt(lastLinkMatch[1], 10);
        } else {
            const pageMatches = [...html1.matchAll(/<a[^>]*href="[^"]*&?page=(\d+)"[^>]*>/ig)];
            if (pageMatches.length > 0) {
                const nums = pageMatches.map(m => parseInt(m[1], 10)).filter(n => !isNaN(n));
                if (nums.length > 0) totalPages = Math.max(...nums);
            }
        }
    
        const parsePage = (html) => {
            const items = [];
            const blocks = html.split('<div class="anime-item">');
            for (let i = 1; i < blocks.length; i++) {
                const block = blocks[i];
                const posterLinkMatch = block.match(/<a\s+[^>]*href="https:\/\/animepahetv\.to\/anime\/([^"]+)"[^>]*class="anime-poster"/);
                if (!posterLinkMatch) continue;
                const session = posterLinkMatch[1];
                const titleMatch = block.match(/<div\s+class="anime-name">\s*<a[^>]*>([^<]+)<\/a>/);
                const title = titleMatch ? titleMatch[1].trim() : "Untitled";
                const imgMatch = block.match(/<img\s+[^>]*src="([^"]+)"[^>]*class="lazyload"/);
                const poster = imgMatch ? imgMatch[1] : "";
                items.push({ title, poster, session, href: "anime/" + session });
            }
            return items;
        };
    
        let allItems = parsePage(html1);
    
        if (totalPages > 1) {
            const pagePromises = [];
            for (let p = 2; p <= Math.min(totalPages, 5); p++) {
                const url = base + "&page=" + p;
                pagePromises.push(fetch(url, { headers }).then(resp => {
                    if (!resp || resp.status !== 200) return "";
                    return resp.text();
                }));
            }
            const pageHTMLs = await Promise.allSettled(pagePromises);
            for (const result of pageHTMLs) {
                if (result.status === "fulfilled" && result.value) {
                    const items = parsePage(result.value);
                    allItems = allItems.concat(items);
                }
            }
        }
    
        return allItems;
    }

    static async getEpisodes(session) {
        const baseUrl = "https://animepahetv.to/viewApi?m=release&id=" + session + "&sort=episode_desc";
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "application/json, text/javascript, */*; q=0.01"
        };
    
        const fetchPage = async (url) => {
            const resp = await fetch(url, { headers });
            if (!resp || resp.status !== 200) return null;
            try {
                return await resp.json();
            } catch (e) {
                try { return JSON.parse(await resp.text()); } catch (err) { return null; }
            }
        };
    
        const url1 = baseUrl + "&page=1";
        const json1 = await fetchPage(url1);
        if (!json1 || !json1.data) return [];
    
        const allEpisodes = json1.data || [];
        const totalPages = json1.last_page || 1;
    
        if (totalPages > 1) {
            const pagePromises = [];
            for (let p = 2; p <= totalPages; p++) {
                const url = baseUrl + "&page=" + p;
                pagePromises.push(
                    fetchPage(url).then(json => {
                        if (json && json.data) {
                            allEpisodes.push(...json.data);
                        }
                    }).catch(() => {})
                );
            }
            await Promise.allSettled(pagePromises);
        }
    
        allEpisodes.sort((a, b) => a.episode - b.episode);
        return allEpisodes.map(ep => ({
            href: "anime/" + session + "/" + ep.session + "?num=" + ep.episode,
            number: ep.episode,
            title: ep.title || "Episode " + ep.episode,
            session: ep.session,
            snapshot: ep.snapshot || ""
        }));
    }

    static async getDetails(session) {
        const url = "https://animepahetv.to/anime/" + session;
        const resp = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });
        if (!resp || resp.status !== 200) return null;
        const html = await resp.text();

        const between = (str, a, b) => {
            const p = str.indexOf(a);
            if (p === -1) return "";
            const start = p + a.length;
            const end = str.indexOf(b, start);
            return end === -1 ? str.slice(start) : str.slice(start, end);
        };

        const title = between(html, '<h1 class="user-select-none"><span style="user-select:text">', '</span>').trim();
        const japanese = between(html, '<h2 class="japanese" style="font-weight:600">', '</h2>').trim();
        const synopsis = between(html, '<div class="anime-synopsis">', '</div>')
            .replace(/<br\s*\/?>/g, '\n')
            .replace(/<\/?[^>]+(>|$)/g, '')
            .trim();

        const infoBlock = between(html, '<div class="col-sm-4 anime-info">', '</div>');
        const getInfo = (label) => {
            const regex = new RegExp("<strong>" + label + "[\\s\\S]*?<\\/p>", "i");
            const match = infoBlock.match(regex);
            if (!match) return "";
            return match[0].replace(/<[^>]+>/g, "").replace(label, "").trim();
        };

        const type = getInfo("Type:");
        const episodes = getInfo("Episode:");
        const status = getInfo("Status:");
        const duration = getInfo("Duration:");
        const aired = getInfo("Aired:");
        const season = getInfo("Season:");
        const studio = getInfo("Studio:");
        const genres = [...infoBlock.matchAll(/<a\s+href="[^"]*\/genre\/[^"]*"[^>]*>([^<]+)<\/a>/g)]
            .map(m => m[1].trim());

        const posterMatch = html.match(/<img\s+[^>]*data-src="([^"]+)"[^>]*class="lazyload"/);
        const poster = posterMatch ? posterMatch[1] : "";

        const malMatch = html.match(/\/\/myanimelist\.net\/anime\/(\d+)/);
        const malId = malMatch ? parseInt(malMatch[1], 10) : null;

        return { title, japanese, synopsis, type, episodes, status, duration, aired, season, studio, genres, poster, malId };
    }

    static async getServers(episodeSession) {
        const url = "https://animepahetv.to/anime/get-servers/" + episodeSession;
        const resp = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });
        if (!resp || resp.status !== 200) return [];
        let json;
        try { json = await resp.json(); } catch (e) { return []; }
        return json?.servers || [];
    }

    static async extractMegaplayStream(serverUrl) {
        const resp = await fetch(serverUrl, {
            headers: {
                "Referer": "https://megaplay.buzz/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });
        if (!resp || resp.status !== 200) return null;
        const html = await resp.text();
    
        const dataIdMatch = html.match(/data-id="(\d+)"/);
        if (!dataIdMatch) return null;
        const dataId = dataIdMatch[1];
    
        const sourcesUrl = "https://megaplay.buzz/stream/getSources?id=" + dataId + "&id=" + dataId;
        const srcResp = await fetch(sourcesUrl, {
            headers: {
                "Referer": "https://megaplay.buzz/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });
        if (!srcResp || srcResp.status !== 200) return null;
        let data;
        try { data = await srcResp.json(); } catch (e) { return null; }
        if (!data?.sources?.file) return null;
    
        const tracks = data.tracks || [];
        let englishSub = "";
        const engTrack = tracks.find(t => t.kind === "captions" && t.label && t.label.toLowerCase().includes("english"));
        if (engTrack && engTrack.file) englishSub = engTrack.file;
        else {
            const firstCaption = tracks.find(t => t.kind === "captions" && t.file);
            if (firstCaption) englishSub = firstCaption.file;
        }
    
        const allSubtitles = tracks
            .filter(t => t.file)
            .map(t => ({
                url: t.file,
                label: t.label || t.kind,
                kind: t.kind,
                headers: { Referer: "https://megaplay.buzz/" }
            }));
    
        return {
            streamUrl: data.sources.file,
            subtitles: englishSub,
            subtitlesHeaders: { Referer: "https://megaplay.buzz/" },
            allSubtitles: allSubtitles,
            headers: { Referer: "https://megaplay.buzz/" }
        };
    }

    static async extractVidplayStream(serverUrl) {
        const resp = await fetch(serverUrl, {
            headers: {
                "Referer": "https://vidwish.live/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });
        if (!resp || resp.status !== 200) return null;
        const html = await resp.text();
    
        const dataIdMatch = html.match(/data-id="(\d+)"/);
        if (!dataIdMatch) return null;
        const dataId = dataIdMatch[1];
    
        const sourcesUrl = "https://vidwish.live/stream/getSources?id=" + dataId + "&id=" + dataId;
        const srcResp = await fetch(sourcesUrl, {
            headers: {
                "Referer": "https://vidwish.live/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });
        if (!srcResp || srcResp.status !== 200) return null;
        let data;
        try { data = await srcResp.json(); } catch (e) { return null; }
        if (!data?.sources?.file) return null;
    
        const tracks = data.tracks || [];
        let englishSub = "";
        const engTrack = tracks.find(t => t.kind === "captions" && t.label && t.label.toLowerCase().includes("english"));
        if (engTrack && engTrack.file) englishSub = engTrack.file;
        else {
            const firstCaption = tracks.find(t => t.kind === "captions" && t.file);
            if (firstCaption) englishSub = firstCaption.file;
        }
    
        const allSubtitles = tracks
            .filter(t => t.file)
            .map(t => ({
                url: t.file,
                label: t.label || t.kind,
                kind: t.kind,
                headers: { Referer: "https://vidwish.live/" }
            }));
    
        return {
            streamUrl: data.sources.file,
            subtitles: englishSub,
            subtitlesHeaders: { Referer: "https://vidwish.live/" },
            allSubtitles: allSubtitles,
            headers: { Referer: "https://vidwish.live/" }
        };
    }

    static async extractKwikStream(url) {
        try {
            const match = url.match(/anime\/([^\/]+)\/([^?]+)\?num=(\d+)/);
            if (!match) return null;
            const [, animeSession, episodeSession, epNum] = match;
    
            const playUrl = "https://animepahetv.to/play/" + animeSession + "/" + episodeSession;
            const playResp = await fetch(playUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
            });
            if (!playResp || playResp.status !== 200) return null;
            const playHtml = await playResp.text();
            const malMatch = playHtml.match(/malId":"(\d+)"/);
            const tsMatch = playHtml.match(/chapterUpdatedAt":(\d+)/);
            if (!malMatch || !tsMatch) return null;
            const malId = malMatch[1];
            const chapterUpdatedAt = tsMatch[1];
    
            const mapperUrl = `https://mapper.mewcdn.online/api/mal/${malId}/${epNum}/${chapterUpdatedAt}`;
            const mapperResp = await fetch(mapperUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
            });
            if (!mapperResp || mapperResp.status !== 200) return null;
            let mapperJson;
            try { mapperJson = await mapperResp.json(); } catch (e) { return null; }
            if (!mapperJson) return null;
    
            const qualityOrder = ["Kiwi-Stream-360p", "Kiwi-Stream-720p", "Kiwi-Stream-800p", "Kiwi-Stream-1080p"];
            const streams = [];
    
            for (const quality of qualityOrder) {
                if (mapperJson[quality]?.sub?.url) {
                    const encoded = mapperJson[quality].sub.url;
                    const ajaxUrl = "https://anikototv.to/ajax/server?get=" + encoded;
                    const ajaxResp = await fetch(ajaxUrl, {
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                            "X-Requested-With": "XMLHttpRequest"
                        }
                    });
                    if (!ajaxResp || ajaxResp.status !== 200) continue;
                    let ajaxJson;
                    try { ajaxJson = await ajaxResp.json(); } catch (e) { continue; }
                    if (!ajaxJson?.result?.url) continue;
                    const kwikUrl = ajaxJson.result.url;
    
                    const interceptor = new DdosGuardInterceptor();
                    const kwikResp = await interceptor.fetchWithBypass(kwikUrl);
                    if (!kwikResp) continue;
                    const html = await kwikResp.text();
    
                    let scriptContent = null;
                    const scriptMatch = html.match(/<script>(.*?)<\/script>/s);
                    if (scriptMatch) scriptContent = scriptMatch[1];
                    else {
                        const evalMatch = html.match(/eval\s*\(function\(p,a,c,k,e,d\)[\s\S]*?\)\)/);
                        if (evalMatch) scriptContent = evalMatch[0];
                    }
                    if (!scriptContent) continue;
    
                    let unpacked = scriptContent;
                    try { unpacked = unpack(scriptContent); } catch (e) {}
                    const hlsMatch = unpacked.match(/(?:const\s+source\s*=\s*['"]([^'"]+)['"])|(https?:\/\/[^\s'"<>]+\.m3u8[^\s'"<>]*)/i);
                    if (!hlsMatch) continue;
                    let hlsUrl = hlsMatch[1] || hlsMatch[0];
                    hlsUrl = hlsUrl.replace("/stream/", "/hls/").replace("uwu.m3u8", "owo.m3u8").replace(/\\+$/, '');
    
                    const resolution = quality.replace("Kiwi-Stream-", "");
                    streams.push({
                        title: "Kiwi Hardsub (" + resolution + ")",
                        streamUrl: hlsUrl,
                        headers: { Referer: "https://kwik.cx/", Origin: "https://kwik.cx" }
                    });
                }
            }
    
            return streams.length > 0 ? streams : null;
        } catch (e) {
            return null;
        }
    }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const acceptHeader = request.headers.get("accept") || "";

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. Search Route: /api/search?q={query}
      if (pathname === "/api/search") {
        const query = url.searchParams.get("q") || url.searchParams.get("keyword") || "";
        const results = await AnikotoEngine.search(query);
        return new Response(JSON.stringify(results), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 2. Episodes Route: /api/episodes?session={session} OR ?url={url}
      if (pathname === "/api/episodes") {
        let session = url.searchParams.get("session") || url.searchParams.get("id");
        const pageUrl = url.searchParams.get("url");

        if (!session && pageUrl) {
          const match = pageUrl.match(/anime\/([^\/?]+)/);
          if (match) session = match[1];
        }

        if (!session) return new Response(JSON.stringify([]), { headers: corsHeaders });

        const episodes = await AnikotoEngine.getEpisodes(session);
        return new Response(JSON.stringify(episodes), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 3. Details Route: /api/details?session={session} OR ?url={url}
      if (pathname === "/api/details") {
        let session = url.searchParams.get("session") || url.searchParams.get("id");
        const pageUrl = url.searchParams.get("url");

        if (!session && pageUrl) {
          const match = pageUrl.match(/anime\/([^\/?]+)/);
          if (match) session = match[1];
        }

        if (!session) return new Response(JSON.stringify(null), { headers: corsHeaders });

        const details = await AnikotoEngine.getDetails(session);
        return new Response(JSON.stringify(details), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 4. Stream Route: /api/stream?url={url} OR ?session={epSession}
      if (pathname === "/api/stream") {
        const targetUrl = url.searchParams.get("url");
        const epSession = url.searchParams.get("session") || url.searchParams.get("id");

        let resolvedUrl = targetUrl;
        if (!resolvedUrl && epSession) {
          resolvedUrl = "anime/unknown/" + epSession + "?num=1";
        }

        if (!resolvedUrl) {
          return new Response(JSON.stringify({ streams: [], subtitles: "", allSubtitles: [] }), { headers: corsHeaders });
        }

        const match = resolvedUrl.match(/anime\/([^\/]+)\/([^?]+)\?num=(\d+)/) || resolvedUrl.match(/([a-f0-9]{32})/i);
        const episodeSession = match ? (match[2] || match[1]) : null;

        const streams = [];
        let subtitles = "";
        let subtitlesHeaders = {};
        let allSubtitles = [];

        if (episodeSession) {
          const servers = await AnikotoEngine.getServers(episodeSession);
          
          const megaSub = servers.find(s => s.name === "Sub-Megaplay");
          const megaDub = servers.find(s => s.name === "Dub-Megaplay");
          const vidplaySub = servers.find(s => s.name.includes("Vidplay") && s.name.includes("Sub"));
          const vidplayDub = servers.find(s => s.name.includes("Vidplay") && s.name.includes("Dub"));

          const [megaSubRes, megaDubRes, vidSubRes, vidDubRes, kiwiRes] = await Promise.allSettled([
            megaSub ? AnikotoEngine.extractMegaplayStream(megaSub.url) : null,
            megaDub ? AnikotoEngine.extractMegaplayStream(megaDub.url) : null,
            vidplaySub ? AnikotoEngine.extractVidplayStream(vidplaySub.url) : null,
            vidplayDub ? AnikotoEngine.extractVidplayStream(vidplayDub.url) : null,
            AnikotoEngine.extractKwikStream(resolvedUrl)
          ]);

          if (megaSubRes.status === "fulfilled" && megaSubRes.value) {
            const s = megaSubRes.value;
            streams.push({ title: "Megaplay SUB (1080p HD)", streamUrl: s.streamUrl, headers: s.headers });
            if (!subtitles && s.subtitles) { subtitles = s.subtitles; subtitlesHeaders = s.subtitlesHeaders; }
            if (s.allSubtitles?.length) allSubtitles.push(...s.allSubtitles);
          }
          if (megaDubRes.status === "fulfilled" && megaDubRes.value) {
            const s = megaDubRes.value;
            streams.push({ title: "Megaplay DUB (1080p HD)", streamUrl: s.streamUrl, headers: s.headers });
            if (!subtitles && s.subtitles) { subtitles = s.subtitles; subtitlesHeaders = s.subtitlesHeaders; }
            if (s.allSubtitles?.length) allSubtitles.push(...s.allSubtitles);
          }

          if (vidSubRes.status === "fulfilled" && vidSubRes.value) {
            const s = vidSubRes.value;
            streams.push({ title: "Vidplay SUB (1080p HD)", streamUrl: s.streamUrl, headers: s.headers });
            if (!subtitles && s.subtitles) { subtitles = s.subtitles; subtitlesHeaders = s.subtitlesHeaders; }
            if (s.allSubtitles?.length) allSubtitles.push(...s.allSubtitles);
          }
          if (vidDubRes.status === "fulfilled" && vidDubRes.value) {
            const s = vidDubRes.value;
            streams.push({ title: "Vidplay DUB (1080p HD)", streamUrl: s.streamUrl, headers: s.headers });
            if (!subtitles && s.subtitles) { subtitles = s.subtitles; subtitlesHeaders = s.subtitlesHeaders; }
            if (s.allSubtitles?.length) allSubtitles.push(...s.allSubtitles);
          }

          if (kiwiRes.status === "fulfilled" && kiwiRes.value) {
            streams.push(...kiwiRes.value);
          }
        }

        // HTML Browser player fallback if requested directly in web browser
        if (acceptHeader.includes("text/html") && !url.searchParams.has("raw")) {
          const primaryStream = streams.length > 0 ? streams[0].streamUrl : "";
          const htmlPlayer = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AniKoto Stream Player</title>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <style>
        body { margin: 0; padding: 0; background-color: #0b0f19; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; color: #fff; }
        .player-container { width: 100%; max-width: 1100px; padding: 1rem; box-sizing: border-box; }
        video { width: 100%; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.8); background: #000; }
        .title { margin-bottom: 0.75rem; font-size: 1.1rem; font-weight: 600; color: #818cf8; text-align: center; }
    </style>
</head>
<body>
    <div class="player-container">
        <div class="title">⚡ AniKoto High-Performance HLS Player</div>
        <video id="video" controls autoplay crossorigin></video>
    </div>
    <script>
        const video = document.getElementById('video');
        const sourceUrl = "${primaryStream}";
        if (Hls.isSupported()) {
            const hls = new Hls({ maxBufferLength: 60, maxMaxBufferLength: 120 });
            hls.loadSource(sourceUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() { video.play().catch(() => {}); });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = sourceUrl;
            video.play();
        }
    </script>
</body>
</html>`;
          return new Response(htmlPlayer, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }

        return new Response(JSON.stringify({ streams, subtitles, subtitlesHeaders, allSubtitles }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 5. Proxy Fallback Route: /api/proxy?url={targetUrl}
      if (pathname === "/api/proxy" || pathname === "/proxy") {
        const targetUrl = url.searchParams.get("url");
        const referer = url.searchParams.get("referer") || "https://megaplay.buzz/";
        if (!targetUrl) return new Response("Missing target url", { status: 400, headers: corsHeaders });

        const res = await fetch(targetUrl, {
          headers: {
            "Referer": referer,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });

        return new Response(res.body, {
          status: res.status,
          headers: {
            ...corsHeaders,
            "Content-Type": res.headers.get("content-type") || "application/octet-stream",
            "Cache-Control": "public, max-age=86400"
          }
        });
      }

      // Root Status Page
      return new Response("⚡ AniKoto Cloudflare Worker API is active!", { headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
};
