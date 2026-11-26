/**
 * js/router.js
 * Lightweight zero-dependency Hash Router supporting browser Back/Forward,
 * direct deep-linking, and route parameters (e.g. #/map/@31.2,29.9,12z, #/entry/scp-2000).
 */
const VALID_CHAPTERS = new Set([
  "prologus",
  "terra",
  "map",
  "pantheon",
  "scp",
  "architectura",
  "oraculum",
  "colophon",
  "gallery",
]);

export function parseHashRoute(hashStr = window.location.hash) {
  const raw = String(hashStr || "").replace(/^#\/?/, "").trim();
  if (!raw) return { view: "terra", rest: "" };
  const slashIdx = raw.indexOf("/");
  const head = (slashIdx < 0 ? raw : raw.slice(0, slashIdx)).split("?")[0].toLowerCase();
  const rest = slashIdx < 0 ? "" : raw.slice(slashIdx + 1);
  if (head === "map") return { view: "map", rest };
  if (VALID_CHAPTERS.has(head)) return { view: head, rest };
  return { view: "terra", rest: "" };
}

export function initRouter(onRoute) {
  const handle = () => {
    const parsed = parseHashRoute(window.location.hash);
    onRoute(parsed);
  };
  window.addEventListener("hashchange", handle);
  handle();
}

export function pushChapterHash(view, subPath = "") {
  const target = subPath ? `#/${view}/${subPath}` : `#/${view}`;
  if (window.location.hash !== target) {
    history.pushState(null, "", target);
  }
}
