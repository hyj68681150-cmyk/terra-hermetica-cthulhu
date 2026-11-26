/**
 * js/sanitize.js
 * Escapes all raw HTML characters first, then parses ONLY whitelisted archival syntax:
 *  - {{redact:N:hidden text}} -> interactive clearance redaction span
 *  - [[entryId|display text]] or [[entryId]] -> internal archive link
 */
export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

export function renderSafeMarkup(rawText, currentClearance = 1) {
  const escaped = escapeHtml(rawText);
  // 1. Whitelist {{redact:level:content}}
  const withRedactions = escaped.replace(
    /\{\{redact:(\d+):([\s\S]*?)\}\}/g,
    (_, lvlStr, inner) => {
      const reqLv = parseInt(lvlStr, 10) || 1;
      const locked = currentClearance < reqLv;
      const lockTitle = locked ? `需 Lv.${reqLv} 权限显影（点击临时解密）` : "点击显影机密记录";
      return `<span class="scp-redact" data-req-lv="${reqLv}" title="${lockTitle}" onclick="this.classList.toggle('revealed')">${inner}</span>`;
    }
  );
  // 2. Whitelist [[entryId|label]] or [[entryId]]
  return withRedactions.replace(
    /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/gi,
    (_, id, label) => {
      const safeId = escapeHtml(id);
      const safeLabel = label || safeId;
      return `<a href="#/entry/${safeId}" class="wiki-link">${safeLabel}</a>`;
    }
  );
}
