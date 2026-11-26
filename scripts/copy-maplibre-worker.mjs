// MapLibre runs its map work in a separate file the bundler can't find (components/map/TikkaMap.tsx),
// so it's served from public/maplibre/ instead. Copied before dev and build so it always matches the
// installed version (the page asks for it with ?v=<version>).
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/maplibre", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre/worker.mjs");
