// index.js
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const acceptHeader = request.headers.get("accept") || "";
    const workerOrigin = url.origin;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      if (pathname === "/api/search") {
        const query = url.searchParams.get("q") || url.searchParams.get("keyword") || "";
        const targetUrl = query.trim() !== "" ? `https://www.alpha-hen.com/?s=${encodeURIComponent(query)}` : "https://www.alpha-hen.com/";
        const res = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
          }
        });
        if (!res.ok) {
          return new Response(JSON.stringify([]), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const html = await res.text();
        const results = [];
        const cardRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
        let match;
        while ((match = cardRegex.exec(html)) !== null) {
          const content = match[1];
          const linkMatch = content.match(/href="(https:\/\/www\.alpha-hen\.com\/[a-z0-9\-]+\/)"/i);
          if (!linkMatch) continue;
          const href = linkMatch[1];
          if (href.includes("/page/") || href.includes("/category/") || href.includes("/watch/")) continue;
          const titleMatch = content.match(/<h2[^>]*class="[^"]*ez-card-title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i) || content.match(/<h\d[^>]*>([\s\S]*?)<\/h\d>/i);
          let title = "Untitled";
          if (titleMatch) {
            title = titleMatch[1].replace(/<[^>]+>/g, "").replace(/^Hentai/i, "").trim();
          }
          const imgMatch = content.match(/src="(https:\/\/www\.alpha-hen\.com\/wp-content\/uploads\/[^"]+)"/i) || content.match(/srcset="([^"]+)"/i);
          let image = "";
          if (imgMatch) {
            const rawImg = imgMatch[1].split(",")[0].split(" ")[0];
            image = rawImg.trim();
          }
          results.push({ title, image, href });
        }
        return new Response(JSON.stringify(results), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (pathname === "/api/episodes") {
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) return new Response(JSON.stringify([]), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const baseUrl = targetUrl.split("?")[0];
        const res = await fetch(baseUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        if (!res.ok) {
          return new Response(JSON.stringify([{ href: baseUrl, number: 1, title: "Episode 1" }]), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const html = await res.text();
        const episodes = [];
        const seenHrefs = /* @__PURE__ */ new Set();
        const epRegex = /href="(https:\/\/www\.alpha-hen\.com\/watch\/[^"]+)"/gi;
        let match;
        while ((match = epRegex.exec(html)) !== null) {
          const epHref = match[1];
          if (seenHrefs.has(epHref)) continue;
          seenHrefs.add(epHref);
          const decoded = decodeURIComponent(epHref);
          const numMatch = decoded.match(/ตอนที่\s*(\d+)/i) || decoded.match(/ep\s*(\d+)/i) || decoded.match(/-(\d+)\/?$/);
          const number = numMatch ? parseInt(numMatch[1], 10) : episodes.length + 1;
          episodes.push({
            href: epHref,
            number: isNaN(number) ? episodes.length + 1 : number,
            title: `Episode ${isNaN(number) ? episodes.length + 1 : number}`
          });
        }
        if (episodes.length === 0) {
          episodes.push({ href: baseUrl, number: 1, title: "Episode 1" });
        }
        return new Response(JSON.stringify(episodes), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (pathname === "/api/details") {
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) return new Response(JSON.stringify(null), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const res = await fetch(targetUrl.split("?")[0], {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        if (!res.ok) return new Response(JSON.stringify(null), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const html = await res.text();
        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || html.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/Alpha-Hen/gi, "").replace(/[|-]/g, "").trim() : "Alpha-Hen";
        const descMatch = html.match(/<div class="[^"]*entry-content[^"]*">([\s\S]*?)<\/div>/i) || html.match(/<meta name="description" content="([^"]+)"/i);
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "No description available.";
        const yearMatch = html.match(/\b(202\d|201\d)\b/);
        const airdate = yearMatch ? yearMatch[1] : "N/A";
        return new Response(JSON.stringify([{
          title,
          description,
          aliases: "Alpha-Hen",
          airdate
        }]), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (pathname === "/api/m3u8") {
        const targetM3u8Url = url.searchParams.get("url");
        const referer = url.searchParams.get("referer") || "https://qqstream.stream-aph.xyz/";
        if (!targetM3u8Url) {
          return new Response("Missing m3u8 url", { status: 400, headers: corsHeaders });
        }
        const m3u8Res = await fetch(targetM3u8Url, {
          headers: {
            "Referer": referer,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        if (!m3u8Res.ok) {
          return new Response(`Failed to fetch M3U8: ${m3u8Res.status}`, { status: m3u8Res.status, headers: corsHeaders });
        }
        const m3u8Text = await m3u8Res.text();
        const baseUrl = targetM3u8Url.substring(0, targetM3u8Url.lastIndexOf("/") + 1);
        if (m3u8Text.includes(".m3u8")) {
          const rewrittenMaster = m3u8Text.replace(/^([^#\s\r\n]+\.m3u8[^\s\r\n]*)/gm, (match) => {
            const fullChildUrl = match.startsWith("http") ? match : baseUrl + match;
            return `${workerOrigin}/api/m3u8?url=${encodeURIComponent(fullChildUrl)}&referer=${encodeURIComponent(referer)}`;
          });
          return new Response(rewrittenMaster, {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
              "Cache-Control": "public, max-age=3600"
            }
          });
        }
        const rewrittenChild = m3u8Text.replace(/^([^#\s\r\n]+)/gm, (line) => {
          if (!line.trim() || line.startsWith("#")) return line;
          const fullSegUrl = line.startsWith("http") ? line : baseUrl + line;
          return `${workerOrigin}/api/proxy?url=${encodeURIComponent(fullSegUrl)}&referer=${encodeURIComponent(referer)}`;
        });
        return new Response(rewrittenChild, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
            "Cache-Control": "public, max-age=3600"
          }
        });
      }
      if (pathname === "/api/proxy" || pathname === "/proxy") {
        const targetUrl = url.searchParams.get("url");
        const referer = url.searchParams.get("referer") || "https://qqstream.stream-aph.xyz/";
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
            "Content-Type": res.headers.get("content-type") || "video/mp2t",
            "Cache-Control": "public, max-age=86400"
          }
        });
      }
      if (pathname === "/api/stream") {
        const pageUrl = url.searchParams.get("url");
        if (!pageUrl) {
          return new Response(JSON.stringify({ streams: [], subtitle: "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const resPage = await fetch(pageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.alpha-hen.com/"
          }
        });
        if (!resPage.ok) {
          return new Response(JSON.stringify({ streams: [], subtitle: "" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const pageHtml = await resPage.text();
        const iframeMatch = pageHtml.match(/<iframe[^>]+src="(https:\/\/www\.alpha-hen\.com\/watch_video\/[^"]+)"/i);
        const embedWatchUrl = iframeMatch ? iframeMatch[1] : null;
        const streams = [];
        if (embedWatchUrl) {
          const resEmbed = await fetch(embedWatchUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Referer": "https://www.alpha-hen.com/"
            }
          });
          if (resEmbed.ok) {
            const embedHtml = await resEmbed.text();
            const redirectMatch = embedHtml.match(/location\.replace\s*\(\s*["']([^"']+)["']\s*\)/i) || embedHtml.match(/src=["'](https:\/\/[^"']*qqstream[^"']+)["']/i);
            const qqstreamUrl = redirectMatch ? redirectMatch[1] : null;
            if (qqstreamUrl) {
              const resQq = await fetch(qqstreamUrl, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                  "Referer": "https://www.alpha-hen.com/"
                }
              });
              if (resQq.ok) {
                const qqHtml = await resQq.text();
                const flowerMatch = qqHtml.match(/https?:\/\/[^\s'"<>]+\/flower\.txt/i) || qqHtml.match(/file['"]\s*:\s*['"](https?:\/\/[^'"]+)['"]/i);
                if (flowerMatch) {
                  const flowerUrl = flowerMatch[1] || flowerMatch[0];
                  const masterHlsUrl = `${workerOrigin}/api/m3u8?url=${encodeURIComponent(flowerUrl)}&referer=${encodeURIComponent("https://qqstream.stream-aph.xyz/")}`;
                  streams.push({
                    title: "Alpha-Hen \u2022 Server 1 (1080p HD)",
                    streamUrl: masterHlsUrl,
                    url: masterHlsUrl,
                    headers: {
                      "Referer": "https://qqstream.stream-aph.xyz/",
                      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    }
                  });
                }
              }
            }
          }
        }
        if (acceptHeader.includes("text/html") && !url.searchParams.has("raw")) {
          const primaryStream = streams.length > 0 ? streams[0].streamUrl : "";
          const htmlPlayer = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Alpha-Hen Stream Player</title>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"><\/script>
    <style>
        body { margin: 0; padding: 0; background-color: #0b0f19; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; color: #fff; }
        .player-container { width: 100%; max-width: 1100px; padding: 1rem; box-sizing: border-box; }
        video { width: 100%; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.8); background: #000; }
        .title { margin-bottom: 0.75rem; font-size: 1.1rem; font-weight: 600; color: #ec4899; text-align: center; }
    </style>
</head>
<body>
    <div class="player-container">
        <div class="title">\u{1F51E} Alpha-Hen High-Performance HLS Player</div>
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
    <\/script>
</body>
</html>`;
          return new Response(htmlPlayer, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
        return new Response(JSON.stringify({ streams, subtitle: "" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const docsHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Alpha-Hen Worker API Documentation</title>
    <script src="https://cdn.tailwindcss.com"><\/script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        body { background-color: #0b0f19; color: #f3f4f6; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
        .glass { background: rgba(17, 24, 39, 0.7); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); }
        .glow { box-shadow: 0 0 50px -10px rgba(236, 72, 153, 0.25); }
        code { font-family: 'JetBrains Mono', monospace; }
    </style>
</head>
<body class="min-h-screen pb-16">
    <div class="max-w-6xl mx-auto px-4 py-10">
        <!-- Header -->
        <div class="glass rounded-2xl p-8 mb-10 text-center relative overflow-hidden glow">
            <div class="absolute -right-10 -top-10 w-40 h-40 bg-pink-600/20 rounded-full blur-3xl"></div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/10 text-pink-400 text-xs font-semibold uppercase tracking-wider mb-4 border border-pink-500/20">
                <i class="fa-solid fa-bolt"></i> Live API Docs & Playground
            </div>
            <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-3">
                Alpha-Hen <span class="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-rose-400 to-purple-400">Worker API</span>
            </h1>
            <p class="text-gray-400 text-sm md:text-base max-w-2xl mx-auto mb-6">
                High-performance Cloudflare Worker API for Alpha-Hen stream resolution, search, and CORS proxying. Powering Luna, Sora, and Dartotsu.
            </p>
            <div class="flex flex-wrap items-center justify-center gap-3 text-sm">
                <a href="${workerOrigin}/api/search?q=isekai" target="_blank" class="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-medium transition flex items-center gap-2">
                    <i class="fa-solid fa-play"></i> Try Test Endpoint
                </a>
                <button onclick="copyManifestUrl()" class="px-4 py-2 rounded-xl glass hover:bg-white/10 text-gray-300 font-medium transition flex items-center gap-2">
                    <i class="fa-solid fa-copy"></i> Copy Luna Module URL
                </button>
            </div>
        </div>

        <!-- Luna Module URL Box -->
        <div class="glass rounded-xl p-5 mb-10 flex flex-col md:flex-row items-center justify-between gap-4 border-l-4 border-pink-500">
            <div>
                <h3 class="text-white font-semibold flex items-center gap-2 text-sm">
                    <i class="fa-solid fa-cube text-pink-400"></i> Luna Extension Manifest
                </h3>
                <p class="text-gray-400 text-xs mt-1">Import this URL into Luna / Sora / Dartotsu extensions settings</p>
            </div>
            <div class="flex items-center gap-2 w-full md:w-auto">
                <input type="text" id="manifestUrl" readonly value="https://raw.githubusercontent.com/Varomine/luna-service/main/alpha-hen/alpha-hen.json" class="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-pink-300 font-mono w-full md:w-96 select-all focus:outline-none">
                <button onclick="copyManifestUrl()" class="px-3 py-2 bg-pink-600/80 hover:bg-pink-500 text-white text-xs font-semibold rounded-lg transition whitespace-nowrap">
                    Copy
                </button>
            </div>
        </div>

        <!-- Endpoints Grid -->
        <div class="space-y-6">
            <h2 class="text-xl font-bold text-white flex items-center gap-2">
                <i class="fa-solid fa-list-check text-pink-400"></i> API Endpoints
            </h2>

            <!-- Endpoint 1: Search -->
            <div class="glass rounded-xl p-6 transition hover:border-pink-500/40">
                <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div class="flex items-center gap-3">
                        <span class="px-2.5 py-1 rounded-md bg-green-500/20 text-green-400 font-bold text-xs">GET</span>
                        <code class="text-white font-semibold text-sm">/api/search?q={query}</code>
                    </div>
                    <a href="${workerOrigin}/api/search?q=isekai" target="_blank" class="text-xs text-pink-400 hover:underline flex items-center gap-1">
                        Test in Browser <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    </a>
                </div>
                <p class="text-gray-400 text-xs mb-3">Searches Alpha-Hen for titles matching the query string.</p>
                <div class="bg-black/50 rounded-lg p-3 text-xs text-gray-300 font-mono">
                    <span class="text-gray-500">// Example:</span> ${workerOrigin}/api/search?q=isekai
                </div>
            </div>

            <!-- Endpoint 2: Episodes -->
            <div class="glass rounded-xl p-6 transition hover:border-pink-500/40">
                <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div class="flex items-center gap-3">
                        <span class="px-2.5 py-1 rounded-md bg-green-500/20 text-green-400 font-bold text-xs">GET</span>
                        <code class="text-white font-semibold text-sm">/api/episodes?url={postUrl}</code>
                    </div>
                    <a href="${workerOrigin}/api/episodes?url=https://www.alpha-hen.com/boku-no-risou-no-isekai-seikatsu/" target="_blank" class="text-xs text-pink-400 hover:underline flex items-center gap-1">
                        Test in Browser <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    </a>
                </div>
                <p class="text-gray-400 text-xs mb-3">Fetches episode watch links for an anime post URL.</p>
                <div class="bg-black/50 rounded-lg p-3 text-xs text-gray-300 font-mono">
                    <span class="text-gray-500">// Example:</span> ${workerOrigin}/api/episodes?url=https://www.alpha-hen.com/boku-no-risou-no-isekai-seikatsu/
                </div>
            </div>

            <!-- Endpoint 3: Details -->
            <div class="glass rounded-xl p-6 transition hover:border-pink-500/40">
                <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div class="flex items-center gap-3">
                        <span class="px-2.5 py-1 rounded-md bg-green-500/20 text-green-400 font-bold text-xs">GET</span>
                        <code class="text-white font-semibold text-sm">/api/details?url={postUrl}</code>
                    </div>
                    <a href="${workerOrigin}/api/details?url=https://www.alpha-hen.com/boku-no-risou-no-isekai-seikatsu/" target="_blank" class="text-xs text-pink-400 hover:underline flex items-center gap-1">
                        Test in Browser <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    </a>
                </div>
                <p class="text-gray-400 text-xs mb-3">Scrapes anime title, description, and airdate.</p>
                <div class="bg-black/50 rounded-lg p-3 text-xs text-gray-300 font-mono">
                    <span class="text-gray-500">// Example:</span> ${workerOrigin}/api/details?url=https://www.alpha-hen.com/boku-no-risou-no-isekai-seikatsu/
                </div>
            </div>

            <!-- Endpoint 4: Stream -->
            <div class="glass rounded-xl p-6 transition hover:border-pink-500/40">
                <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div class="flex items-center gap-3">
                        <span class="px-2.5 py-1 rounded-md bg-green-500/20 text-green-400 font-bold text-xs">GET</span>
                        <code class="text-white font-semibold text-sm">/api/stream?url={watchUrl}</code>
                    </div>
                    <a href="${workerOrigin}/api/stream?url=https://www.alpha-hen.com/watch/boku-no-risou-no-isekai-seikatsu-th-%25e0%25b8%2595%25e0%25b8%25ad%25e0%25b8%2599%25e0%25b8%2595%25e0%25b8%25b5%25e0%25b9%2588-01/" target="_blank" class="text-xs text-pink-400 hover:underline flex items-center gap-1">
                        Test in Browser <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    </a>
                </div>
                <p class="text-gray-400 text-xs mb-3">Extracts qqstream embed & proxies direct HLS Master Stream URLs.</p>
            </div>
        </div>

        <!-- Footer -->
        <div class="mt-12 text-center text-xs text-gray-500 border-t border-white/5 pt-6">
            Alpha-Hen Service API &copy; 2026 Varomine &bull; Powered by Cloudflare Workers
        </div>
    </div>

    <script>
        function copyManifestUrl() {
            const input = document.getElementById('manifestUrl');
            input.select();
            document.execCommand('copy');
            alert('Luna Manifest URL copied to clipboard!');
        }
    <\/script>
</body>
</html>`;
      return new Response(docsHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
