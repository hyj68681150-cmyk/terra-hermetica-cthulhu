/**
 * js/router.js
 * Lightweight zero-dependency Hash Router supporting browser Back/Forward,
 * direct deep-linking, and route parameters (e.g. #/map/@31.2,29.9,12z, #/entry/site-rlyeh, #/gallery).
 */
const VALID_VIEWS = new Set([
  "prologus",
  "map",
  "pantheon",
  "scp",
  "architectura",
  "oraculum",
  "gallery",
  "colophon",
  "entry",
]);

export function parseHashRoute(hashStr = window.location.hash) {
  const raw = String(hashStr || "").replace(/^#\/?/, "").trim();
  if (!raw) return { view: "map", rest: "" };
  const qIdx = raw.indexOf("?");
  const slashIdx = raw.indexOf("/");
  let splitAt = -1;
  if (slashIdx >= 0 && (qIdx < 0 || slashIdx < qIdx)) splitAt = slashIdx;
  else if (qIdx >= 0) splitAt = qIdx;

  const head = (splitAt < 0 ? raw : raw.slice(0, splitAt)).toLowerCase();
  const rest =
    splitAt < 0
      ? ""
      : raw[splitAt] === "?"
        ? raw.slice(splitAt)
        : raw.slice(splitAt + 1);

  if (head === "terra") return { view: "gallery", rest };
  if (VALID_VIEWS.has(head)) return { view: head, rest };
  return { view: "map", rest: "" };
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
