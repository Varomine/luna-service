# Hanime Module for Luna / Sora / Dartotsu

This directory contains the source code for the **Hanime** module for the **Luna** application.

## Files Included

- `hanime.json` - Module manifest containing source metadata, supported platforms, icon, and script URL.
- `hanime.js` - Module script implementing `searchResults`, `extractDetails`, `extractEpisodes`, and `extractStreamUrl`.

## How to Deploy to GitHub (`https://github.com/Varomine/luna-service`)

1. Copy or push `hanime.json` and `hanime.js` into your repository:
   ```bash
   git add hanime.json hanime.js
   git commit -m "Add Hanime module for Luna"
   git push origin main
   ```

2. Make sure the raw URL in `hanime.json` matches your repository location:
   - `scriptUrl`: `https://raw.githubusercontent.com/Varomine/luna-service/main/hanime/hanime.js` (or `https://raw.githubusercontent.com/Varomine/luna-service/main/hanime.js`)

3. In the Luna app, import the module using your raw manifest URL:
   - `https://raw.githubusercontent.com/Varomine/luna-service/main/hanime/hanime.json` (or `https://raw.githubusercontent.com/Varomine/luna-service/main/hanime.json`)
