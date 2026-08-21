/**
 * 037AM High-Performance HLS Proxy & Scraper Worker for Cloudflare Workers
 * Resolves 037am.com anime streams & proxies HLS TS segments with proper video/mp2t MIME type for iOS AVPlayer.
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

      // 3. Stream Route: /api/stream?url={pageUrl} OR /api/m3u8?post={postId}&group_idx={groupIdx}&ep={epIdx}
      if (pathname === "/api/stream" || pathname === "/api/m3u8" || pathname.endsWith(".m3u8")) {
        let postId = url.searchParams.get("post");
        let groupIdx = url.searchParams.get("group_idx") || "0";
        let epIdx = url.searchParams.get("ep") || "0";
        const pageUrl = url.searchParams.get("url");

        if (pageUrl && !postId) {
          const qMatch = pageUrl.match(/[?&]post=(\d+)[&]group_idx=(\d+)[&]ep=(\d+)/);
          if (qMatch) {
            postId = qMatch[1];
            groupIdx = qMatch[2];
            epIdx = qMatch[3];
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

        const embedRes = await fetch(embedUrl, {
          headers: {
            "Referer": "https://037am.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        const embedHtml = await embedRes.text();
        const cleanHtml = embedHtml.replace(/\\\//g, '/');
        const match = cleanHtml.match(/\/cdn\/hls\/([a-f0-9]+)\/master\.txt/);

        if (!match) {
          return new Response("HLS master hash not found", { status: 404, headers: corsHeaders });
        }

        const hash = match[1];
        const masterUrl = `https://mycdn-hd.xyz/cdn/hls/${hash}/master.txt?s=1&d=`;
        const masterRes = await fetch(masterUrl, {
          headers: {
            "Referer": embedUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        const m3u8Text = await masterRes.text();

        const streamRegex = /https:\/\/mycdn-hd\.xyz\/hls\/[^\s\r\n]+/gi;
        const sMatch = streamRegex.exec(m3u8Text);

        if (sMatch) {
          const variantUrl = sMatch[0];
          const variantRes = await fetch(variantUrl, {
            headers: {
              "Referer": "https://mycdn-hd.xyz/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
          });
          const variantM3u8 = await variantRes.text();

          // Rewrite all .html segment links to proxy through /api/segment with video/mp2t MIME type
          const workerHost = url.origin;
          const rewrittenM3u8 = variantM3u8.replace(/(https:\/\/cdnj[^\s\r\n]+)/g, (segUrl) => {
            return `${workerHost}/api/segment?url=${encodeURIComponent(segUrl)}&ext=.ts`;
          });

          return new Response(rewrittenM3u8, {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/vnd.apple.mpegurl",
              "Cache-Control": "no-cache"
            }
          });
        }

        return new Response(m3u8Text, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/vnd.apple.mpegurl"
          }
        });
      }

      // 4. Segment Proxy Route: /api/segment?url={segUrl}
      if (pathname === "/api/segment") {
        const segUrl = url.searchParams.get("url");
        if (!segUrl) return new Response("Missing segUrl", { status: 400, headers: corsHeaders });

        const segRes = await fetch(segUrl, {
          headers: {
            "Referer": "https://mycdn-hd.xyz/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });

        return new Response(segRes.body, {
          status: segRes.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "video/mp2t",
            "Cache-Control": "public, max-age=86400"
          }
        });
      }

      return new Response("037AM Cloudflare Worker API is active", { headers: corsHeaders });
    } catch (err) {
      return new Response(`Worker Internal Error: ${err.message}`, { status: 500, headers: corsHeaders });
    }
  }
};
