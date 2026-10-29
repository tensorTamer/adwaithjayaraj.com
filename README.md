# adwaithjayaraj.com

My personal site: plain HTML, CSS and vanilla JavaScript. No framework, no build step, no dependencies.

## Layout

- `public/` is the website. Only this folder is deployed.
  - `index.html`, `css/`, `js/`, `assets/`
  - `js/topology-data.js` holds the Network Maps data (devices, links, flows). `js/topology.js` draws it.
- `tools/` is for development only and is never served.

## Preview locally

```bash
cd public && python3 -m http.server 8080
```

Open http://localhost:8080. (Opening `public/index.html` directly also works.)

## Deploy

Cloudflare Pages from GitHub:

1. Push this repo to GitHub.
2. In Cloudflare Pages, connect the repo. Framework preset: none. Build command: leave empty.
3. **Build output directory: `public`**

Every push to the production branch redeploys. `README.md` and `tools/` sit outside `public/`, so they are never served.

**Bump the version on each deploy.** `public/index.html` loads its CSS and JS as `…?v=2`. The map engine (`topology.js`) and its data (`topology-data.js`) must be the same version in a visitor's browser, so change the number on all five links whenever you change any CSS or JS file:

```bash
sed -i '' 's/?v=2/?v=3/g' public/index.html   # macOS; on Linux drop the '' after -i
```

## Check the network map layouts

After editing `public/js/topology-data.js`, check the maps for overlaps:

1. Preview the site (above) and open it in a browser.
2. Open the browser console (DevTools → Console).
3. Paste the whole of `tools/check-maps.js` and press Enter.

It prints one list per map. `[]` means clean; otherwise each line names the problem (a line crossing a device or label, overlapping labels or zones, cut-off text). It leaves the page on the last map with every layer on, so reload afterwards.
