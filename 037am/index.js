/**
 * 037AM Cloudflare Worker - HLS Stream Resolver & Redirector
 * Author: Varomine
 * Resolves 037AM episodes & redirects (302) to direct HLS Master Stream URLs for Luna, Sora, and browser video players.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

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

      // 3. Direct Combined HLS Stream Route (Redirects 302 to Master HLS URL)
      if (pathname === "/api/stream" || pathname === "/api/m3u8" || pathname === "/m3u8" || pathname.endsWith(".m3u8")) {
        let postId = url.searchParams.get("post");
        let groupIdx = url.searchParams.get("group_idx") || "0";
        let epIdx = url.searchParams.get("ep") || "0";
        const pageUrl = url.searchParams.get("url");

        if (pageUrl && (!postId || postId === "null")) {
          const qMatch = pageUrl.match(/[?&]post=(\d+)[&]group_idx=(\d+)[&]ep=(\d+)/);
          if (qMatch) {
            postId = qMatch[1];
            groupIdx = qMatch[2];
            epIdx = qMatch[3];
          } else {
            const resPage = await fetch(pageUrl.split("?")[0], {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
            });
            const pageHtml = await resPage.text();
            const pidMatch = pageHtml.match(/window\.ton2025_post_id\s*=\s*(\d+)/i) || pageHtml.match(/postid-(\d+)/i);
            if (pidMatch) postId = pidMatch[1];
          }
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

        // Redirect directly (302) to Master HLS URL for direct client playback
        return Response.redirect(masterUrl, 302);
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
