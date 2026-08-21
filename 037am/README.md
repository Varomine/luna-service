# 037AM Extension Module for Luna / Sora

This directory contains the complete source code and Cloudflare Worker proxy for **037AM** (`https://037am.com/`).

---

## 🛠️ Why a Cloudflare Worker is Required for 037AM

`037am.com` hosts video streams via `mycdn-hd.xyz`, which returns video segments formatted as `.html` URLs (`0000.html`, `0001.html`). Native iOS `AVPlayer` in Luna & Sora rejects `.html` extensions after segment #0, causing playback to stop after 5 seconds.

The `037am-worker.js` Cloudflare Worker proxies and rewrites segment links to send explicit `Content-Type: video/mp2t` (MPEG-TS binary stream) header to iOS `AVPlayer`, enabling full 24+ minute episode playback seamlessly!

---

## 🚀 How to Deploy the Cloudflare Worker (1-Minute Setup)

1. Log into your [Cloudflare Dashboard](https://dash.cloudflare.com/) and go to **Workers & Pages**.
2. Click **Create Application** $\rightarrow$ **Create Worker**.
3. Name it (e.g. `037am-proxy`) and click **Deploy**.
4. Click **Edit Code** and paste the contents of [`037am-worker.js`](./037am-worker.js).
5. Click **Save and Deploy**.
6. Copy your Worker URL (e.g. `https://037am-proxy.YOUR-SUBDOMAIN.workers.dev`).

---

## 📲 Luna Manifest Link

```
https://raw.githubusercontent.com/Varomine/luna-service/main/037am/037am.json
```
