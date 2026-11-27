/**
 * js/clearance.js
 * Persistent Clearance Level (GRADVS I–V), Clue Ledger, Redaction Check,
 * and Monochrome Hairline Toast helper for Theologia Caerulea.
 */

const STORAGE_KEY_CLEARANCE = "tc_clearance_v1";
const STORAGE_KEY_PLAY = "tc_play_state_v1";

export const LEVEL_THRESHOLDS = [0, 40, 100, 180, 280];

export const LEVEL_TITLES = {
  1: { zh: "一级见习抄写员", latin: "GRADVS I · NOVITIVS" },
  2: { zh: "二级秘典馆员", latin: "GRADVS II · LIBRARIVS" },
  3: { zh: "三级战术神学官", latin: "GRADVS III · INQVISITOR" },
  4: { zh: "四级圣座监理", latin: "GRADVS IV · PRAEFECTVS" },
  5: { zh: "五级翠玉议会特使", latin: "GRADVS V · THAVMIEL" },
};

const VALID_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

let memoryFallbackStore = {
  xp: 0,
  clues: [],
  revealedIds: [],
};

function normalizeId(rawId) {
  const cleaned = String(rawId ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return VALID_ID_RE.test(cleaned) ? cleaned : "";
}

function readRawStore() {
  try {
    if (typeof localStorage !== "undefined") {
      const rawStr = localStorage.getItem(STORAGE_KEY_CLEARANCE);
      if (rawStr) {
        const parsed = JSON.parse(rawStr);
        if (parsed && typeof parsed === "object") {
          return sanitizeStore(parsed);
        }
      }
      return { xp: 0, clues: [], revealedIds: [] };
    }
  } catch (_) {
    // Fall back to in-memory store when storage is unavailable
  }
  return sanitizeStore(memoryFallbackStore);
}

function sanitizeStore(obj) {
  const xp = Math.max(0, Math.floor(Number(obj?.xp) || 0));
  const seenClues = new Set();
  const clues = [];
  if (Array.isArray(obj?.clues)) {
    for (const c of obj.clues) {
      const id = normalizeId(c?.id);
      if (!id || seenClues.has(id)) continue;
      seenClues.add(id);
      clues.push({
        id,
        title: String(c?.title || id),
        xp: Math.max(0, Math.floor(Number(c?.xp) || 0)),
        source: String(c?.source || ""),
        ts: Number(c?.ts) || 0,
      });
    }
  }
  const seenRev = new Set();
  const revealedIds = [];
  if (Array.isArray(obj?.revealedIds)) {
    for (const r of obj.revealedIds) {
      const id = normalizeId(r);
      if (!id || seenRev.has(id)) continue;
      seenRev.add(id);
      revealedIds.push(id);
    }
  }
  return { xp, clues, revealedIds };
}

function writeRawStore(store) {
  const clean = sanitizeStore(store);
  memoryFallbackStore = clean;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY_CLEARANCE, JSON.stringify(clean));
    }
  } catch (_) {
    // Ignore quota / security errors; memoryFallbackStore stays updated
  }
  return clean;
}

function computeLevelFromXp(xp) {
  let lv = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      lv = i + 1;
      break;
    }
  }
  return Math.min(5, Math.max(1, lv));
}

function attachNonEnumerableDetail(state) {
  try {
    Object.defineProperty(state, "detail", {
      value: state,
      enumerable: false,
      configurable: true,
    });
  } catch (_) {}
  return state;
}

function dispatchClearanceEvent(state) {
  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("tc:clearance-change", { detail: state }));
  }
}

export function getClearanceState() {
  const store = readRawStore();
  const xp = store.xp;
  const level = computeLevelFromXp(xp);
  const titleInfo = LEVEL_TITLES[level] || LEVEL_TITLES[1];

  const currentFloorXp = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nextLevelXp =
    level < LEVEL_THRESHOLDS.length
      ? LEVEL_THRESHOLDS[level]
      : LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];

  let progressPct = 100;
  if (level < LEVEL_THRESHOLDS.length) {
    const span = Math.max(1, nextLevelXp - currentFloorXp);
    progressPct = Math.min(100, Math.max(0, Math.round(((xp - currentFloorXp) / span) * 100)));
  }

  return attachNonEnumerableDetail({
    level,
    titleZh: titleInfo.zh,
    titleLatin: titleInfo.latin,
    xp,
    currentFloorXp,
    nextLevelXp,
    progressPct,
    clues: store.clues.map((c) => ({ ...c })),
    revealedIds: [...store.revealedIds],
  });
}

export function grantClue({ id, title, xp = 20, source = "" } = {}) {
  const prevState = getClearanceState();
  const cleanId = normalizeId(id);
  if (!cleanId) {
    return {
      granted: false,
      leveledUp: false,
      prevLevel: prevState.level,
      level: prevState.level,
      state: prevState,
    };
  }

  const store = readRawStore();
  if (store.clues.some((c) => c.id === cleanId)) {
    return {
      granted: false,
      leveledUp: false,
      prevLevel: prevState.level,
      level: prevState.level,
      state: prevState,
    };
  }

  const xpGain = Math.max(0, Math.floor(Number(xp) || 0));
  store.clues.push({
    id: cleanId,
    title: String(title || cleanId),
    xp: xpGain,
    source: String(source || ""),
    ts: Date.now(),
  });
  store.xp += xpGain;
  writeRawStore(store);

  const nextState = getClearanceState();
  const leveledUp = nextState.level > prevState.level;
  dispatchClearanceEvent(nextState);

  if (leveledUp) {
    showClearanceToast(
      `权限晋升 · ${nextState.titleLatin}（${nextState.titleZh} · Lv.${nextState.level}）`
    );
  }

  return {
    granted: true,
    leveledUp,
    prevLevel: prevState.level,
    level: nextState.level,
    state: nextState,
  };
}

export function recordEntryRead(entryId, entryTitle) {
  const cleanEntryId = normalizeId(entryId);
  if (!cleanEntryId) {
    const state = getClearanceState();
    return {
      granted: false,
      leveledUp: false,
      prevLevel: state.level,
      level: state.level,
      state,
    };
  }
  return grantClue({
    id: "read-" + cleanEntryId,
    title: "调阅档案：" + String(entryTitle || cleanEntryId),
    xp: 10,
    source: "entry",
  });
}

export function tryRevealRedaction(redactKey, reqLv) {
  const required = Math.max(1, parseInt(reqLv, 10) || 1);
  const current = getClearanceState();
  if (current.level < required) {
    return {
      allowed: false,
      reqLv: required,
      currentLevel: current.level,
    };
  }

  const cleanKey = normalizeId(redactKey) || "item";
  const store = readRawStore();
  const isFirstReveal = !store.revealedIds.includes(cleanKey);

  if (isFirstReveal) {
    store.revealedIds.push(cleanKey);
    writeRawStore(store);
    const res = grantClue({
      id: "redact-" + cleanKey,
      title: "显影机密记录：" + cleanKey,
      xp: 8,
      source: "redact",
    });
    return {
      allowed: true,
      reqLv: required,
      currentLevel: res.state.level,
      state: res.state,
    };
  }

  return {
    allowed: true,
    reqLv: required,
    currentLevel: current.level,
    state: current,
  };
}

export function resetClearanceAndPlay() {
  memoryFallbackStore = { xp: 0, clues: [], revealedIds: [] };
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY_CLEARANCE);
      localStorage.removeItem(STORAGE_KEY_PLAY);
    }
  } catch (_) {}
  const state = getClearanceState();
  dispatchClearanceEvent(state);
  return state;
}

export function onClearanceChange(handler) {
  if (typeof window === "undefined" || typeof handler !== "function") {
    return () => {};
  }
  const wrapped = (event) => {
    const st = attachNonEnumerableDetail(event?.detail || getClearanceState());
    handler(st, event);
  };
  window.addEventListener("tc:clearance-change", wrapped);
  return () => {
    window.removeEventListener("tc:clearance-change", wrapped);
  };
}

let toastTimer = null;
let lastToastMsg = "";
let lastToastAt = 0;

export function showClearanceToast(message) {
  if (typeof document === "undefined" || !document.body) return;
  const text = String(message ?? "").trim();
  if (!text) return;

  const now = Date.now();
  if (text === lastToastMsg && now - lastToastAt < 350) {
    return;
  }
  lastToastMsg = text;
  lastToastAt = now;

  let el = document.getElementById("tc-clearance-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "tc-clearance-toast";
    el.className = "tc-clearance-toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }

  el.textContent = text;
  el.classList.add("open");

  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    el.classList.remove("open");
  }, 3200);
}
