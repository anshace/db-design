// icons.mjs — one hand-drawn stroke set, 16px grid, stroke-width 1.6, currentColor.
// Icons are semantic (domain/kind), not decorative; every surface that lists a thing
// shows its glyph so the eye can navigate without reading.
const P = (d) => `<path d="${d}"/>`;
const C = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;

const PATHS = {
  overview: C(8, 8.6, 5.2) + P("M8 8.6 10.6 6") + P("M2.4 3.6 4 5.2M13.6 3.6 12 5.2"),
  facets: P("M8 1.8 14 5 8 8.2 2 5Z") + P("M2.6 8.2 8 11l5.4-2.8") + P("M2.6 11.2 8 14l5.4-2.8"),
  pools: C(3.4, 3.6, 1.6) + C(12.6, 3.6, 1.6) + C(8, 12.6, 1.6) + P("M4.6 4.8 7 11.2M11.4 4.8 9 11.2M5 3.6h6"),
  flows: P("M3 3.4v9.2") + C(3, 2.2, 1.2) + C(3, 13.8, 1.2) + P("M13 6.6v2.8") + C(13, 5.4, 1.2) + C(13, 10.6, 1.2) + P("M4.2 5.4H13M4.2 10.6H13"),
  notes: P("M3.2 1.8h9.6v12.4H3.2Z") + P("M5.4 5h5.2M5.4 7.6h5.2M5.4 10.2h3.4"),
  database: P("M8 1.8c3.2 0 5.8.9 5.8 2s-2.6 2-5.8 2S2.2 4.9 2.2 3.8s2.6-2 5.8-2Z")
    + P("M2.2 3.8v8.4c0 1.1 2.6 2 5.8 2s5.8-.9 5.8-2V3.8") + P("M2.2 8c0 1.1 2.6 2 5.8 2s5.8-.9 5.8-2"),
  shield: P("M8 1.8 13.4 4v4c0 3-2.3 5.2-5.4 6-3.1-.8-5.4-3-5.4-6V4Z") + P("M5.8 8 7.4 9.6l3-3.4"),
  building: P("M2.6 14.2V3.6L8 1.8v12.4ZM8 5.4l5.4 1.8v7H8Z") + P("M4.6 5.6h1.2M4.6 8h1.2M4.6 10.4h1.2M10.6 9h1.2M10.6 11.4h1.2"),
  book: P("M2.4 2.6c2-.9 3.6-.9 5.6 0v11c-2-.9-3.6-.9-5.6 0Z") + P("M8 2.6c2-.9 3.6-.9 5.6 0v11c-2-.9-3.6-.9-5.6 0"),
  chat: P("M2.6 3.4h10.8v7.2H8l-3.4 2.8v-2.8H2.6Z") + P("M5.4 6h5.2"),
  file: P("M3.6 1.8h5.6L12.4 5v9.2H3.6Z") + P("M9.2 1.8V5h3.2") + P("M5.6 8h4.8M5.6 10.4h4.8"),
  gear: C(8, 8, 2.4) + P("M8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4"),
  spark: P("M8 1.8 9.4 6l4.2 1.4L9.4 8.8 8 13l-1.4-4.2L2.4 7.4 6.6 6Z") + P("M12.8 11.4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z"),
  tray: P("M2 8.4 4.2 2.6h7.6L14 8.4") + P("M2 8.4h4l.8 1.6h2.4l.8-1.6h4v4.4c0 .9-.7 1.6-1.6 1.6H3.6C2.7 14.4 2 13.7 2 12.8Z"),
  receipt: P("M3.4 1.8h9.2v12.6l-1.5-1-1.5 1-1.6-1-1.5 1-1.6-1-1.5 1Z") + P("M5.8 5h4.4M5.8 7.6h4.4"),
  bolt: P("M9 1.6 4 8.8h3.2L6.6 14.4 12 7.2H8.6Z"),
  clock: C(8, 8, 5.8) + P("M8 4.8V8l2.4 1.6"),
  radio: C(8, 8, 1.4) + P("M5.2 5.2a4 4 0 0 0 0 5.6M10.8 10.8a4 4 0 0 0 0-5.6") + P("M3.2 3.2a6.8 6.8 0 0 0 0 9.6M12.8 12.8a6.8 6.8 0 0 0 0-9.6"),
  target: C(8, 8, 5.8) + C(8, 8, 2.6) + P("M8 1v2.4M8 12.6V15M1 8h2.4M12.6 8H15"),
  network: C(8, 2.6, 1.5) + C(3, 12.6, 1.5) + C(13, 12.6, 1.5) + P("M8 4.1 4.2 11.4M8 4.1l3.8 7.3M4.4 12.6h7.2"),
  chart: P("M2.4 13.6h11.2") + P("M4.8 13.6V8M8 13.6V3.6M11.2 13.6V6.4"),
  folder: P("M1.8 3.6c0-.9.7-1.6 1.6-1.6h2.8l1.6 2h4.8c.9 0 1.6.7 1.6 1.6v6.8c0 .9-.7 1.6-1.6 1.6H3.4c-.9 0-1.6-.7-1.6-1.6Z"),
  box: P("M8 1.8 13.6 4.6v6.8L8 14.2 2.4 11.4V4.6Z") + P("M2.4 4.6 8 7.4l5.6-2.8M8 7.4v6.8"),
  table: P("M2.2 3h11.6v10H2.2Z") + P("M2.2 6.2h11.6M6.4 6.2V13"),
};

export function icon(name, size = 14) {
  const body = PATHS[name] ?? PATHS.database;
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" `
    + `stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" `
    + `aria-hidden="true">${body}</svg>`;
}

const DOMAIN_ICON = {
  auth: "shield", business: "building", registry: "book", chat: "chat", documents: "file",
  automation: "gear", v2: "spark", workflow: "tray", billing: "receipt", queue: "bolt",
  cache: "clock", brownfield: "network",
};
const KIND_ICON = {
  queue: "tray", cache: "clock", ttl: "clock", scheduler: "clock", journal: "book",
  pubsub: "radio", vector: "target", graph: "network", analytics: "chart",
  documents: "file", filesystem: "folder", external: "box", custom: "spark",
};

export const domainIcon = (id) => DOMAIN_ICON[id] ?? "database";
export const kindIcon = (k) => KIND_ICON[k] ?? "spark";
