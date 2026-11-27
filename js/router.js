/**
 * js/router.js
 * Lightweight zero-dependency Hash Router supporting browser Back/Forward,
 * direct deep-linking, and route parameters
 * (e.g. #/map/@31.2,29.9,12z, #/entry/site-rlyeh, #/category/scp, #/search?q=SCP-2317, #/novel/<book>/<ch>).
 * An empty hash and any unknown head both resolve to the archive lobby (`home`).
 */
const VALID_VIEWS = new Set([
  "home",
  "prologus",
  "map",
  "pantheon",
  "scp",
  "architectura",
  "oraculum",
  "gallery",
  "colophon",
  "entry",
  "category",
  "search",
  "novel",
  "play",
]);

export function parseHashRoute(hashStr = window.location.hash) {
  const raw = String(hashStr || "").replace(/^#\/?/, "").trim();
  if (!raw) return { view: "home", rest: "" };
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
  // The pantheon and the timeline are rooms of the visual exhibition hall.
  if (head === "pantheon") return { view: "gallery", rest: rest ? `pantheon/${rest}` : "pantheon" };
  if (head === "timeline") return { view: "gallery", rest: rest ? `timeline/${rest}` : "timeline" };
  if (VALID_VIEWS.has(head)) return { view: head, rest };
  return { view: "home", rest: "" };
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
