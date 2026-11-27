/**
 * js/autolink.js
 * Longest-match-first archival term autolinker, graded {{redact:N:...}} parser,
 * explicit [[entryId|label]] linker, and viewport-clamped hover/focus preview card.
 */

import { escapeHtml } from "./sanitize.js";
import {
  getClearanceState,
  tryRevealRedaction,
  showClearanceToast,
} from "./clearance.js";

const VALID_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const ROMAN_ONLY_RE = /^[ivxlcdm]+$/i;
const ASCII_ONLY_RE = /^[\x00-\x7F]+$/;

// Generic terms that should NEVER trigger automatic inline links on their own
const GENERIC_STOP_TERMS = new Set([
  "scp",
  "goi",
  "sra",
  "uiu",
  "dott",
  "hume",
  "codex",
  "codex-topic",
  "site",
  "keter",
  "euclid",
  "safe",
  "thaumiel",
  "apollyon",
  "archon",
  "yesod",
  "neutralized",
  "alexandria",
  "antarctica",
  "arkham",
  "baikal",
  "cairo",
  "penglai",
  "prague",
  "leng",
  "rlyeh",
  "site13",
  "site2000",
  "gate001",
  "基金会",
  "scp基金会",
  "scp 基金会",
  "原典",
  "本站设定",
  "本站原创",
  "本站原创设定",
  "本站原创组织",
  "跨体系对照",
  "克苏鲁原典",
  "scp原典",
  "洛氏原典",
  "同行组织",
  "六大秘教",
  "蓝色神学",
  "原理",
  "谱系",
  "分级对照",
  "群青",
  "休谟",
  "斯克兰顿",
  "旧日",
  "外神",
  "神学",
  "组织",
  "档案",
  "圣座",
  "冷原",
  "蓬莱",
  "开罗",
]);

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hash36(str) {
  let h = 2166136261;
  const s = String(str ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function sanitizeKeySegment(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "r";
}

function extractCandidateTerms(entry) {
  const out = new Set();
  const pushClean = (raw) => {
    const t = String(raw ?? "").trim();
    if (!t) return;
    out.add(t);
  };

  if (entry.title) {
    pushClean(entry.title);
    // Strip parenthetical annotations and leading Roman numeral indices for natural prose matching
    const stripped = String(entry.title)
      .replace(/（[^）]*）/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/^[IVXLCDM]+\s*·\s*/i, "")
      .trim();
    if (stripped) {
      pushClean(stripped);
      for (const seg of stripped.split(/\s*[·&×]\s*/)) {
        const cleanSeg = seg.replace(/^[IVXLCDM]+\s+/i, "").trim();
        if (cleanSeg) pushClean(cleanSeg);
        // Also extract "SCP-XXXX" + name pairs or "X与Y" deity pairs when unambiguous
        const scpPrefixMatch = cleanSeg.match(/^(SCP-\d{3,4})\s+(.{2,})$/i);
        if (scpPrefixMatch) {
          pushClean(scpPrefixMatch[1].toUpperCase());
          pushClean(scpPrefixMatch[2].trim());
        }
      }
    }
  }

  if (entry.code) {
    const codeStr = String(entry.code).trim();
    const scpCode = codeStr.match(/\b(SCP-\d{3,4}(?:-[A-Z0-9]+)?|SITE-CN-\d+|SITE-\d+|GOI-\d+)\b/i);
    if (scpCode) {
      pushClean(scpCode[1]);
    }
  }

  if (Array.isArray(entry.aliases)) {
    for (const alias of entry.aliases) {
      const a = String(alias ?? "").trim();
      if (!a) continue;
      pushClean(a);
      const cleanAlias = a
        .replace(/（[^）]*）/g, "")
        .replace(/\([^)]*\)/g, "")
        .replace(/^[IVXLCDM]+\s*·\s*/i, "")
        .trim();
      if (cleanAlias) pushClean(cleanAlias);
    }
  }

  return [...out];
}

function isEligibleTerm(term) {
  if (!term || term.length < 2) return false;
  const lower = term.toLowerCase();
  if (GENERIC_STOP_TERMS.has(lower)) return false;
  if (ROMAN_ONLY_RE.test(term)) return false;
  if (/^\d+$/.test(term)) return false;
  // Skip strings containing metadata separators or author attribution markers
  if (/[·×/]|等$/.test(term) && term.length > 14) return false;
  if (/原典|本站|提案|设定|对照/.test(term)) return false;

  if (ASCII_ONLY_RE.test(term)) {
    // Allow explicit archival designations like SCP-001, Site-13, GOI-004, R'lyeh, Innsmouth, Necronomicon
    if (/^(?:SCP-\d{3,4}(?:-[A-Z0-9]+)?|SITE-(?:CN-)?\d+|GOI-\d+)$/i.test(term)) {
      return true;
    }
    if (term.length < 5) return false;
    // Reject lowercase slug-like aliases
    if (term === lower && !term.includes("-")) return false;
    return true;
  }

  // CJK / mixed terms: require >= 3 chars to prevent over-linking common 2-char words
  return term.length >= 3;
}

function getCategoryPriority(entry, term) {
  const isScpCode = /^SCP-\d+/i.test(term);
  if (isScpCode) {
    if (entry.category === "scp") return 1;
    if (entry.category === "entities") return 2;
    if (entry.category === "sites") return 3;
    return 4;
  }
  const order = {
    entities: 1,
    sites: 2,
    scp: 3,
    goi: 4,
    codices: 5,
    timeline: 6,
  };
  return order[entry.category] || 9;
}

export function buildAutolinkIndex(manifestEntries) {
  if (!Array.isArray(manifestEntries)) return [];

  // Map lowercased term -> best { term, id, priority }
  const bestByTerm = new Map();

  for (const entry of manifestEntries) {
    if (!entry || !VALID_ID_RE.test(String(entry.id || ""))) continue;
    const candidates = extractCandidateTerms(entry);
    for (const rawTerm of candidates) {
      if (!isEligibleTerm(rawTerm)) continue;
      const key = rawTerm.toLowerCase();
      const priority = getCategoryPriority(entry, rawTerm);
      const existing = bestByTerm.get(key);
      if (!existing || priority < existing.priority) {
        bestByTerm.set(key, {
          term: rawTerm,
          termLower: key,
          id: entry.id,
          priority,
          isAscii: ASCII_ONLY_RE.test(rawTerm),
        });
      }
    }
  }

  const list = [...bestByTerm.values()].map((item) => {
    const escaped = escapeRegExp(item.term);
    // Enforce strict ASCII alphanumeric boundaries so SCP-001 never matches SCP-0010
    const pattern = item.isAscii
      ? new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "i")
      : new RegExp(escaped);
    return {
      term: item.term,
      termLower: item.termLower,
      id: item.id,
      isAscii: item.isAscii,
      regex: pattern,
    };
  });

  list.sort((a, b) => b.term.length - a.term.length || a.id.localeCompare(b.id));
  return list;
}

function buildLinkHtml(id, displayLabel, linkMode, isAutolink = false) {
  const safeId = escapeHtml(id);
  const safeLabel = escapeHtml(displayLabel);
  if (linkMode === "drawer") {
    return `<button type="button" class="novel-term-link" data-entry-drawer="${safeId}" data-entry-preview="${safeId}">${safeLabel}</button>`;
  }
  const cls = isAutolink ? "wiki-link wiki-autolink" : "wiki-link";
  return `<a href="#/entry/${safeId}" class="${cls}" data-entry-preview="${safeId}">${safeLabel}</a>`;
}

export function renderProseWithLinks(rawText, options = {}) {
  const {
    autolinkIndex = [],
    excludeId = "",
    currentClearance,
    linkMode = "route",
    redactPrefix = "r",
    linkedSet = null,
  } = options;

  // Strip NUL bytes from input so external strings can never spoof internal placeholder tokens
  const cleanRaw = String(rawText ?? "").replace(/\u0000/g, "");
  if (!cleanRaw) return "";

  const clearanceState = getClearanceState();
  const effClearance =
    currentClearance !== undefined && currentClearance !== null
      ? Math.max(1, Number(currentClearance) || 1)
      : clearanceState.level;
  const revealedSet = new Set(clearanceState.revealedIds || []);

  const seenIds = linkedSet instanceof Set ? linkedSet : new Set();
  const cleanPrefix = sanitizeKeySegment(redactPrefix);

  const tokens = [];
  const putToken = (html) => {
    const idx = tokens.length;
    tokens.push(html);
    return `\u0000TOKEN_${idx}\u0000`;
  };

  let redactCounter = 0;

  // 1. Placeholder-protect {{redact:N:hidden}} FIRST so inner text is never corrupted or autolinked
  let stage = cleanRaw.replace(
    /\{\{redact:(\d+):([\s\S]*?)\}\}/g,
    (_, lvlStr, rawHidden) => {
      const N = Math.max(1, parseInt(lvlStr, 10) || 1);
      const redactKey = `${cleanPrefix}-${redactCounter++}-lv${N}-${hash36(rawHidden)}`;
      const escapedHidden = escapeHtml(rawHidden);
      const locked = effClearance < N;
      const isRevealed = !locked && revealedSet.has(redactKey);
      const cls = [
        "scp-redact",
        isRevealed ? "revealed" : "",
        locked ? "scp-redact-locked" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const innerHtml = isRevealed
        ? escapedHidden
        : locked
          ? `[Lv.${N} 加密记录 · 点击检定]`
          : escapedHidden;
      const doneAttr = isRevealed ? ' data-revealed-done="1"' : "";
      return putToken(
        `<span class="${cls}" role="button" tabindex="0" data-req-lv="${N}" data-redact-key="${redactKey}" data-secret="${escapedHidden}"${doneAttr}>${innerHtml}</span>`
      );
    }
  );

  // 2. Placeholder-protect explicit [[entryId|label]] or [[entryId]] SECOND
  stage = stage.replace(
    /\[\[([a-z0-9][a-z0-9-]*)(?:\|([^\]]+))?\]\]/g,
    (_, id, label) => {
      const display = label && label.trim() ? label.trim() : id;
      seenIds.add(id);
      return putToken(buildLinkHtml(id, display, linkMode, false));
    }
  );

  // 3. Split into plain-text vs protected token segments and run longest-match-first autolinking
  let segments = stage.split(/(\u0000TOKEN_\d+\u0000)/g).filter((s) => s.length > 0);

  if (Array.isArray(autolinkIndex) && autolinkIndex.length > 0) {
    for (const item of autolinkIndex) {
      if (!item || !item.id || item.id === excludeId) continue;
      if (seenIds.has(item.id)) continue;

      let matchedOnce = false;
      const nextSegments = [];

      for (const seg of segments) {
        if (matchedOnce || seg.startsWith("\u0000TOKEN_")) {
          nextSegments.push(seg);
          continue;
        }
        if (!seg.toLowerCase().includes(item.termLower)) {
          nextSegments.push(seg);
          continue;
        }
        const m = item.regex.exec(seg);
        if (!m) {
          nextSegments.push(seg);
          continue;
        }

        const start = m.index;
        const matchedText = m[0];
        const before = seg.slice(0, start);
        const after = seg.slice(start + matchedText.length);
        if (before) nextSegments.push(before);
        nextSegments.push(putToken(buildLinkHtml(item.id, matchedText, linkMode, true)));
        if (after) nextSegments.push(after);

        seenIds.add(item.id);
        matchedOnce = true;
      }

      segments = nextSegments;
    }
  }

  // 4. Escape all remaining plain-text segments and expand protected HTML tokens
  return segments
    .map((seg) => {
      const tm = seg.match(/^\u0000TOKEN_(\d+)\u0000$/);
      if (tm) {
        return tokens[Number(tm[1])] ?? "";
      }
      return escapeHtml(seg);
    })
    .join("");
}

/**
 * Plain-text preview helper: converts [[id|label]] -> label and {{redact:N:...}} -> safe preview text
 * without leaving raw markup braces in 2-line summary previews.
 */
export function formatPlainSummary(rawText, currentClearance) {
  const effLv =
    currentClearance !== undefined && currentClearance !== null
      ? Number(currentClearance) || 1
      : getClearanceState().level;

  const stripped = String(rawText ?? "")
    .replace(/\{\{redact:(\d+):([\s\S]*?)\}\}/g, (_, lvlStr, inner) => {
      const req = parseInt(lvlStr, 10) || 1;
      return effLv >= req ? inner : `[Lv.${req} 机密遮蔽]`;
    })
    .replace(/\[\[([a-z0-9][a-z0-9-]*)(?:\|([^\]]+))?\]\]/g, (_, id, label) =>
      label && label.trim() ? label.trim() : id
    );
  return escapeHtml(stripped);
}

function getProvenanceBadgeMeta(provenance, provenanceLabel) {
  if (provenance === "original") {
    return {
      cls: "badge-original",
      label: provenanceLabel || "本站设定",
    };
  }
  if (provenance === "cthulhu-canon") {
    return {
      cls: "badge-canon",
      label: provenanceLabel || "克苏鲁原典",
    };
  }
  return {
    cls: "badge-canon",
    label: provenanceLabel || "SCP原典",
  };
}

let previewSingleton = null;

function handleGradedRedactionTrigger(redactEl) {
  if (!redactEl || !redactEl.dataset.redactKey) return;
  const reqLv = Math.max(1, parseInt(redactEl.dataset.reqLv, 10) || 1);
  const key = redactEl.dataset.redactKey;
  const res = tryRevealRedaction(key, reqLv);

  if (!res.allowed) {
    redactEl.classList.remove("revealed");
    redactEl.classList.add("scp-redact-locked");
    redactEl.textContent = `[Lv.${res.reqLv} 加密记录 · 点击检定]`;
    showClearanceToast(
      `权限检定未通过 · 需 Clearance Lv.${res.reqLv}（当前 Lv.${res.currentLevel}）`
    );
    return;
  }

  const alreadyDone = redactEl.dataset.revealedDone === "1";
  redactEl.classList.remove("scp-redact-locked");
  redactEl.classList.add("revealed");
  if (redactEl.dataset.secret !== undefined) {
    redactEl.textContent = redactEl.dataset.secret;
  }
  redactEl.dataset.revealedDone = "1";
  if (!alreadyDone) {
    showClearanceToast(`机密记录已显影 · Clearance Lv.${res.reqLv}`);
  }
}

export function initEntryPreviewPopover({ getManifestEntry, fetchEntry } = {}) {
  if (typeof document === "undefined" || !document.body) {
    return { hide: () => {} };
  }

  if (previewSingleton) {
    previewSingleton.getManifestEntry = getManifestEntry;
    previewSingleton.fetchEntry = fetchEntry;
    return previewSingleton.api;
  }

  let popover = document.getElementById("wiki-preview-popover");
  if (!popover) {
    popover = document.createElement("aside");
    popover.id = "wiki-preview-popover";
    popover.className = "wiki-preview-popover";
    popover.setAttribute("role", "tooltip");
    popover.setAttribute("aria-hidden", "true");
    document.body.appendChild(popover);
  }

  const state = {
    getManifestEntry,
    fetchEntry,
    activeAnchor: null,
    activeId: "",
    showTimer: null,
    hideTimer: null,
    reqToken: 0,
    api: null,
  };

  const clearTimers = () => {
    if (state.showTimer) {
      clearTimeout(state.showTimer);
      state.showTimer = null;
    }
    if (state.hideTimer) {
      clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }
  };

  const hidePopover = () => {
    clearTimers();
    state.activeAnchor = null;
    state.activeId = "";
    state.reqToken++;
    popover.classList.remove("open");
    popover.setAttribute("aria-hidden", "true");
  };

  const positionPopover = (anchor) => {
    if (!anchor || ! anchor.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
    const vh = window.innerHeight || document.documentElement.clientHeight || 768;
    const margin = 12;

    const popRect = popover.getBoundingClientRect();
    const popW = popRect.width || Math.min(340, vw - margin * 2);
    const popH = popRect.height || 176;

    let left = rect.left;
    if (left + popW > vw - margin) {
      left = vw - margin - popW;
    }
    if (left < margin) {
      left = margin;
    }

    let top = rect.bottom + 8;
    if (top + popH > vh - margin && rect.top - 8 - popH >= margin) {
      top = rect.top - 8 - popH;
    } else if (top + popH > vh - margin) {
      top = Math.max(margin, vh - margin - popH);
    }

    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  };

  const resolveEntryData = async (id) => {
    if (typeof state.getManifestEntry === "function") {
      const m = await Promise.resolve(state.getManifestEntry(id));
      if (m) return m;
    }
    if (typeof state.fetchEntry === "function") {
      try {
        const full = await Promise.resolve(state.fetchEntry(id));
        if (full) return full;
      } catch (_) {}
    }
    return null;
  };

  const showForAnchor = async (anchor) => {
    if (!anchor) return;
    const id = String(anchor.dataset.entryPreview || "").trim();
    if (!VALID_ID_RE.test(id)) return;

    const token = ++state.reqToken;
    state.activeAnchor = anchor;
    state.activeId = id;

    const item = await resolveEntryData(id);
    if (token !== state.reqToken || !item) return;

    const badge = getProvenanceBadgeMeta(item.provenance, item.provenanceLabel);
    const clearanceLv = Math.max(1, Number(item.clearance) || 1);
    const codeText = item.code || String(item.category || "CODEX").toUpperCase();
    const summaryHtml = formatPlainSummary(item.summary || "");

    popover.innerHTML = `
      <div class="wpp-top">
        <span class="wpp-code">${escapeHtml(codeText)}</span>
        <span class="${badge.cls}">${escapeHtml(badge.label)}</span>
      </div>
      <div class="wpp-title">${escapeHtml(item.title || id)}</div>
      <p class="wpp-summary">${summaryHtml}</p>
      <div class="wpp-foot">
        <span class="wpp-clearance">CLEARANCE Lv.${clearanceLv}</span>
        <a class="wpp-link" href="#/entry/${encodeURIComponent(id)}">打开档案 →</a>
      </div>
    `;

    popover.classList.add("open");
    popover.setAttribute("aria-hidden", "false");
    positionPopover(anchor);
  };

  const scheduleHide = () => {
    if (state.showTimer) {
      clearTimeout(state.showTimer);
      state.showTimer = null;
    }
    if (state.hideTimer) clearTimeout(state.hideTimer);
    state.hideTimer = setTimeout(() => {
      hidePopover();
    }, 170);
  };

  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const inPopover = e.target.closest?.("#wiki-preview-popover");
    if (inPopover) {
      if (state.hideTimer) {
        clearTimeout(state.hideTimer);
        state.hideTimer = null;
      }
      return;
    }
    const anchor = e.target.closest?.("[data-entry-preview]");
    if (!anchor) return;

    if (state.hideTimer) {
      clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }
    if (state.activeAnchor === anchor && popover.classList.contains("open")) {
      return;
    }
    if (state.showTimer) clearTimeout(state.showTimer);
    state.showTimer = setTimeout(() => {
      showForAnchor(anchor);
    }, 90);
  });

  document.addEventListener("pointerout", (e) => {
    if (e.pointerType === "touch") return;
    const fromAnchor = e.target.closest?.("[data-entry-preview]");
    const fromPopover = e.target.closest?.("#wiki-preview-popover");
    if (!fromAnchor && !fromPopover) return;

    const toEl = e.relatedTarget;
    if (
      toEl &&
      (toEl.closest?.("#wiki-preview-popover") ||
        (state.activeAnchor && state.activeAnchor.contains(toEl)))
    ) {
      return;
    }
    scheduleHide();
  });

  document.addEventListener("focusin", (e) => {
    const anchor = e.target.closest?.("[data-entry-preview]");
    if (anchor) {
      if (state.hideTimer) {
        clearTimeout(state.hideTimer);
        state.hideTimer = null;
      }
      showForAnchor(anchor);
    }
  });

  document.addEventListener("focusout", (e) => {
    const next = e.relatedTarget;
    if (
      next &&
      (next.closest?.("#wiki-preview-popover") || next.closest?.("[data-entry-preview]"))
    ) {
      return;
    }
    scheduleHide();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && popover.classList.contains("open")) {
      hidePopover();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      const redact = e.target.closest?.(".scp-redact[data-redact-key]");
      if (redact) {
        e.preventDefault();
        handleGradedRedactionTrigger(redact);
      }
    }
  });

  document.addEventListener("click", (e) => {
    const redact = e.target.closest?.(".scp-redact[data-redact-key]");
    if (redact) {
      handleGradedRedactionTrigger(redact);
      return;
    }
    if (e.target.closest?.("#wiki-preview-popover a")) {
      hidePopover();
    }
  });

  window.addEventListener("hashchange", hidePopover);
  window.addEventListener("resize", hidePopover);
  document.addEventListener(
    "scroll",
    (e) => {
      if (!popover.classList.contains("open")) return;
      if (e.target && popover.contains?.(e.target)) return;
      hidePopover();
    },
    true
  );

  state.api = { hide: hidePopover };
  previewSingleton = state;
  return state.api;
}
