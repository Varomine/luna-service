export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "*"
                }
            });
        }

        if (url.pathname === "/proxy") {
            const targetUrl = url.searchParams.get("url");
            if (!targetUrl) {
                return new Response("Missing target url", { status: 400 });
            }

            try {
                let referer = "https://animeruka.com/";
                if (targetUrl.includes("mycdn-hd")) {
                    referer = "https://mycdn-hd.xyz/";
                }

                const res = await fetch(targetUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                        "Referer": referer,
                        "Origin": referer.replace(/\/$/, '')
                    }
                });

                const responseHeaders = new Headers(res.headers);
                responseHeaders.set("Access-Control-Allow-Origin", "*");
                responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

                return new Response(res.body, {
                    status: res.status,
                    statusText: res.statusText,
                    headers: responseHeaders
                });
            } catch (err) {
                return new Response("Proxy error: " + err.message, { status: 500 });
            }
        }

        return new Response("AnimeRuka Worker Proxy Operational", { status: 200 });
    }
};
