/**
 * 037AM Cloudflare Worker - HLS Stream Resolver & Player
 * Author: Varomine
 * Resolves 037AM episodes, streams full combined M3U8 playlists for Luna/Sora apps,
 * and renders an HTML5 HLS.js video player when opened directly in desktop browsers.
 */

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
        const query = url.searchParams.get("q") || "";
        const targetUrl = query.trim() !== "" ? `https://037am.com/?s=${encodeURIComponent(query)}` : "https://037am.com/";
        const res = await fetch(targetUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        });
        const html = await res.text();
        const results = [];
        const cardRegex = /<a\s+href="([^"]+)"\s+class="card[^"]*"[\s\S]*?<img\s+src="([^"]+)"[^>]*alt="([^"]*)"/gi;
        let match;
        while ((match = cardRegex.exec(html)) !== null) {
          results.push({
            title: match[3] ? match[3].trim() : "Untitled",
            image: match[2] || "",
            href: match[1]
          });
        }
        return new Response(JSON.stringify(results), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 2. Episodes Route: /api/episodes?url={url}
      if (pathname === "/api/episodes") {
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) return new Response(JSON.stringify([]), { headers: corsHeaders });
        
        const baseUrl = targetUrl.split("?")[0];
        const res = await fetch(baseUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        });
        const html = await res.text();

        const postIdMatch = html.match(/window\.ton2025_post_id\s*=\s*(\d+)/i) || html.match(/postid-(\d+)/i);
        const postId = postIdMatch ? postIdMatch[1] : null;

        const episodes = [];
        const epMatch = html.match(/window\.seriesEpisodes\s*=\s*(\[[\s\S]*?\]);/i);

        if (epMatch && postId) {
          try {
            const list = JSON.parse(epMatch[1]);
            list.forEach((item, index) => {
              const epNum = item.ep ? parseInt(item.ep, 10) : (index + 1);
              episodes.push({
                href: `${baseUrl}?post=${postId}&group_idx=0&ep=${index}`,
                number: isNaN(epNum) ? (index + 1) : epNum
              });
            });
          } catch (e) {}
        }

        if (episodes.length === 0) {
          episodes.push({ href: baseUrl, number: 1 });
        }

        return new Response(JSON.stringify(episodes), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 3. HLS Stream Route: /api/stream?url={pageUrl} OR /api/m3u8...
      if (pathname === "/api/stream" || pathname === "/api/m3u8" || pathname === "/m3u8" || pathname.endsWith(".m3u8")) {
        // If opened directly in desktop browser (HTML request), render built-in HLS.js video player!
        if (acceptHeader.includes("text/html") && !url.searchParams.has("raw")) {
          const rawStreamUrl = `${url.pathname}${url.search}${url.search ? '&' : '?'}raw=1`;
          const htmlPlayer = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>037AM Stream Player</title>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <style>
        body { margin: 0; padding: 0; background-color: #0b0f19; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; font-family: sans-serif; color: #fff; }
        .player-container { width: 100%; max-width: 1100px; padding: 1rem; box-sizing: border-box; }
        video { width: 100%; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.8); background: #000; }
        .title { margin-bottom: 0.75rem; font-size: 1.1rem; font-weight: 600; color: #818cf8; text-align: center; }
    </style>
</head>
<body>
    <div class="player-container">
        <div class="title">⚡ 037AM High-Performance HLS Player</div>
        <video id="video" controls autoplay crossorigin></video>
    </div>
    <script>
        const video = document.getElementById('video');
        const sourceUrl = "${rawStreamUrl}";
        if (Hls.isSupported()) {
            const hls = new Hls({
                maxBufferLength: 60,
                maxMaxBufferLength: 120
            });
            hls.loadSource(sourceUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                video.play().catch(e => console.log('Autoplay blocked:', e));
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = sourceUrl;
            video.play();
        }
    </script>
</body>
</html>`;
          return new Response(htmlPlayer, {
            headers: { "Content-Type": "text/html; charset=utf-8" }
          });
        }

        let postId = url.searchParams.get("post");
        let groupIdx = url.searchParams.get("group_idx") || "0";
        let epIdx = url.searchParams.get("ep") || "0";
        const pageUrl = url.searchParams.get("url");

        if (pageUrl) {
          const pMatch = pageUrl.match(/[?&]post=(\d+)/);
          const gMatch = pageUrl.match(/[?&]group_idx=(\d+)/);
          const eMatch = pageUrl.match(/[?&]ep=(\d+)/);

          if (pMatch && (!postId || postId === "null")) postId = pMatch[1];
          if (gMatch && (!url.searchParams.has("group_idx") || groupIdx === "0")) groupIdx = gMatch[1];
          if (eMatch && (!url.searchParams.has("ep") || epIdx === "0")) epIdx = eMatch[1];
        }

        if (!postId && pageUrl) {
          const resPage = await fetch(pageUrl.split("?")[0], {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
          });
          const pageHtml = await resPage.text();
          const pidMatch = pageHtml.match(/window\.ton2025_post_id\s*=\s*(\d+)/i) || pageHtml.match(/postid-(\d+)/i);
          if (pidMatch) postId = pidMatch[1];
        }

        let embedUrl = null;
        if (postId) {
          const epApiUrl = `https://037am.com/wp-json/ton2025/v1/ep?post=${postId}&group_idx=${groupIdx}&ep=${epIdx}`;
          const apiRes = await fetch(epApiUrl);
          if (apiRes.ok) {
            const apiData = await apiRes.json();
            embedUrl = apiData.embed || apiData.backup || null;
          }
        }

        if (!embedUrl && pageUrl) {
          const resPage = await fetch(pageUrl.split("?")[0], {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
          });
          const pageHtml = await resPage.text();
          const iframeMatch = pageHtml.match(/src="(https:\/\/mycdn-hd\.xyz\/video\/[^"]+)"/i);
          if (iframeMatch) embedUrl = iframeMatch[1];
        }

        if (!embedUrl) {
          return new Response("Embed URL not found", { status: 404, headers: corsHeaders });
        }

        // Fetch embed HTML to extract master hash
        const embedRes = await fetch(embedUrl, {
          headers: {
            "Referer": "https://037am.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        const embedHtml = await embedRes.text();
        const cleanHtml = embedHtml.replace(/\\\//g, '/');
        const hashMatch = cleanHtml.match(/\/cdn\/hls\/([a-f0-9]+)\/master\.txt/);

        if (!hashMatch) {
          return new Response("HLS master hash not found", { status: 404, headers: corsHeaders });
        }

        const hash = hashMatch[1];
        const masterUrl = `https://mycdn-hd.xyz/cdn/hls/${hash}/master.txt?s=1&d=&ext=.m3u8`;
        const masterRes = await fetch(masterUrl, {
          headers: {
            "Referer": "https://mycdn-hd.xyz/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        const masterText = await masterRes.text();

        // Extract variant stream URL
        const streamRegex = /https:\/\/mycdn-hd\.xyz\/hls\/[^\s\r\n]+/gi;
        const sMatch = streamRegex.exec(masterText);

        if (sMatch) {
          const variantUrl = sMatch[0];
          const variantRes = await fetch(variantUrl, {
            headers: {
              "Referer": "https://mycdn-hd.xyz/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
          });
          const variantM3u8 = await variantRes.text();

          // Return full combined M3U8 playlist with direct CDN segment links
          return new Response(variantM3u8, {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
              "Cache-Control": "public, max-age=3600"
            }
          });
        }

        return new Response(masterText, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8"
          }
        });
      }

      // 4. Proxy Fallback Route: /api/proxy?url={targetUrl}
      if (pathname === "/api/proxy" || pathname === "/proxy") {
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) return new Response("Missing target url", { status: 400, headers: corsHeaders });

        const res = await fetch(targetUrl, {
          headers: {
            "Referer": "https://mycdn-hd.xyz/",
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

      return new Response("037AM Combined M3U8 Worker is active", { headers: corsHeaders });
    } catch (err) {
      return new Response(`Worker Internal Error: ${err.message}`, { status: 500, headers: corsHeaders });
    }
  }
};
