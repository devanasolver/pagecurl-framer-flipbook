# Pagecurl — 3D PDF Flipbook for Framer

Turn any PDF into an interactive 3D flipbook on a Framer site. Realistic page-flip animation, PDF upload or URL, zoom, fullscreen and right-to-left reading — a free Framer plugin.

**Marketplace listing (free install):** https://www.framer.com/marketplace/plugins/flipforge/

## What it does

- Insert a flipbook from any public PDF URL, or upload a PDF straight from the plugin (hosted in your Framer project)
- Realistic 3D page-turn: click, drag, touch or arrow keys
- Cover view centers the first page, spreads show two pages
- Toolbar with page indicator, zoom and fullscreen
- Right-to-left reading mode for RTL documents
- Per-instance styling in the properties panel: colors, size and behavior
- Lazy page rendering keeps large documents fast; loading, empty and error states included
- No tracking, no external account, no watermark. The PDF engine (pdf.js) ships bundled with the plugin and makes zero external requests

Perfect for lookbooks, catalogs, magazines, menus, brochures and reports on Framer.

## Develop

```
npm install
npm run dev -w pagecurl
```

## Package for the Marketplace

```
npm run pack -w pagecurl
```

Creates `plugin.zip`, ready to upload at https://www.framer.com/marketplace/dashboard/plugins/

## More from the author

- **AIRankWP** — write WordPress posts that AI answers quote: https://airankwp.com
- **BookFolio** — WordPress theme and plugin for authors: https://bookfolio-demo.pages.dev
