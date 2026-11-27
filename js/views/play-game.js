/**
 * js/views/play-game.js
 * P3 Deliverable 2: Clearance Lv.1-5 Progression Terminal & Branching SAN + Hume Investigation Game (#/play, #/play/<caseId>)
 * Strictly Monochrome Klein-Blue & White, Zero Third Colors, Zero Inline Event Handlers, Zero Emoji, Zero window.confirm.
 */
import { escapeHtml } from "../sanitize.js";

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const PLAY_STATE_KEY = "tc_play_state_v1";

const DEFAULT_THRESHOLDS = [0, 40, 100, 180, 280];
const DEFAULT_TITLES = {
  1: { zh: "一级见习抄写员", latin: "GRADVS I · NOVITIVS" },
  2: { zh: "二级秘典馆员", latin: "GRADVS II · LIBRARIVS" },
  3: { zh: "三级战术神学官", latin: "GRADVS III · INQVISITOR" },
  4: { zh: "四级圣座监理", latin: "GRADVS IV · PRAEFECTVS" },
  5: { zh: "五级翠玉议会特使", latin: "GRADVS V · THAVMIEL" },
};

const TIER_PERMISSIONS = {
  1: {
    summary: "公开级基础馆藏与外勤入门卷宗",
    unlocks: [
      "开放全球 14 处收容与神话坐标铜版舆图及公开词条阅览",
      "开放《群青潮汐备忘录》连载正文与页内速览抽屉",
      "可执行推荐权限 Lv.1 的外勤声呐初步勘验任务",
    ],
  },
  2: {
    summary: "二级加密遮蔽条与声呐/盐漠现场附录",
    unlocks: [
      "解密全站词条与小说中的 [Lv.2 加密记录] 遮蔽段落",
      "查阅站点二级声呐频谱实录与水文异常勘测报告",
      "解锁帕米尔地下盐漠巡检分支与二级战术神学检定选项",
    ],
  },
  3: {
    summary: "三级机密收容实验与机动特遣队行动手记",
    unlocks: [
      "解密全站 [Lv.3 加密记录] 与 MTF 外勤行动伤亡手记",
      "调阅斯克兰顿现实稳定锚（SRA）反相谐振工程参数",
      "在分支调查中启用奇术频率反制与深潜声呐校准方案",
    ],
  },
  4: {
    summary: "四级圣座监理黑匣档案与跨体系帷幕协议",
    unlocks: [
      "解密全站 [Lv.4 加密记录] 与圣座监理级收容失效预案",
      "查阅亚历山大《翠玉录》与基金会帷幕并网核心条款",
      "在极端低休谟场（< 0.45 Hm）调查节点保持奇术锚定通路",
    ],
  },
  5: {
    summary: "五级 THAVMIEL / 翠玉议会最高绝密真相卷",
    unlocks: [
      "完全解密全站最高等级 [Lv.5 加密记录] 与 O5 评注附录",
      "调阅程序 220-Calabasas 真实效力评估与第七锁链疲劳底稿",
      "解锁分支调查中的最高权限神学洞见（GNOSIS）结局路线",
    ],
  },
};

const ENDING_META = {
  stabilized: {
    latin: "SANCTVM · VIS EIVS INTEGRA EST",
    zh: "现实锚定 · 收容稳固结局",
    desc: "外勤小组稳住局部休谟场，异常谐波被封回结界，帷幕维持完整。",
  },
  epiphany: {
    latin: "VERVM SINE MENDACIO · CERTVM ET VERISSIMVM",
    zh: "群青洞见 · 神学破译结局",
    desc: "在认知阈值边缘截获跨体系底层频率，补全关键馆藏拼图。",
  },
  retreat: {
    latin: "VIGILIA · SEPARABIS TERRAM AB IGNE",
    zh: "保全撤离 · 封存待考结局",
    desc: "在认知危害不可逆扩散前撤回安全半径，保留样本等待高阶复勘。",
  },
  breach: {
    latin: "TINCTVRA · PORTAVIT ILLVD VENTVS",
    zh: "认知失守 · 局部突破结局",
    desc: "局部现实稳定锚过载失锁，外勤记录由自动回收信标封存归档。",
  },
};

const SOURCE_LABELS = {
  entry: "词条调阅",
  novel: "连载小说",
  redact: "机密显影",
  play: "外勤调查",
};

function isValidId(val) {
  return typeof val === "string" && ID_RE.test(val);
}

function readPlayState() {
  try {
    const raw = localStorage.getItem(PLAY_STATE_KEY);
    if (!raw) {
      return { activeCaseId: "", cases: {}, unlockedEndings: [] };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { activeCaseId: "", cases: {}, unlockedEndings: [] };
    }
    return {
      activeCaseId: isValidId(parsed.activeCaseId) ? parsed.activeCaseId : "",
      cases: parsed.cases && typeof parsed.cases === "object" ? parsed.cases : {},
      unlockedEndings: Array.isArray(parsed.unlockedEndings)
        ? parsed.unlockedEndings.filter((x) => typeof x === "string")
        : [],
    };
  } catch (_) {
    return { activeCaseId: "", cases: {}, unlockedEndings: [] };
  }
}

function writePlayState(state) {
  try {
    localStorage.setItem(PLAY_STATE_KEY, JSON.stringify(state));
  } catch (_) {}
}

function getSafeClearanceState(ctx) {
  if (ctx?.clearance?.getClearanceState) {
    return ctx.clearance.getClearanceState();
  }
  return {
    level: 1,
    titleZh: DEFAULT_TITLES[1].zh,
    titleLatin: DEFAULT_TITLES[1].latin,
    xp: 0,
    currentFloorXp: 0,
    nextLevelXp: 40,
    progressPct: 0,
    clues: [],
    revealedIds: [],
  };
}

function renderSafePlayProse(rawText, options, ctx) {
  if (ctx?.autolink?.renderProseWithLinks) {
    return ctx.autolink.renderProseWithLinks(rawText, options);
  }
  const escaped = escapeHtml(rawText);
  return escaped.replace(
    /\[\[([a-z0-9][a-z0-9-]*)(?:\|([^\]]+))?\]\]/g,
    (_, id, label) =>
      `<a href="#/entry/${escapeHtml(id)}" class="wiki-link">${escapeHtml(label || id)}</a>`
  );
}

function ensureCaseProgress(playState, caseData) {
  const cid = caseData.caseId;
  const maxSan = Number(caseData.maxSan) || 100;
  const initSan = Math.max(1, Math.min(maxSan, Number(caseData.initialSan) || 90));
  const initHume = Number(caseData.initialHume) || 0.85;
  const startNode =
    caseData.startNode && caseData.nodes?.[caseData.startNode]
      ? caseData.startNode
      : Object.keys(caseData.nodes || {})[0] || "start";

  const existing = playState.cases[cid];
  if (
    existing &&
    typeof existing === "object" &&
    (existing.currentNode === "__cognitive_overload__" || caseData.nodes?.[existing.currentNode])
  ) {
    existing.maxSan = Number(existing.maxSan) || maxSan;
    existing.san = Math.max(0, Math.min(existing.maxSan, Number(existing.san ?? initSan)));
    existing.hume = Number.isFinite(Number(existing.hume)) ? Number(existing.hume) : initHume;
    existing.history = Array.isArray(existing.history) && existing.history.length ? existing.history : [startNode];
    existing.completedEndings = Array.isArray(existing.completedEndings) ? existing.completedEndings : [];
    return existing;
  }

  const fresh = {
    currentNode: startNode,
    san: initSan,
    maxSan,
    hume: initHume,
    history: [startNode],
    completedEndings: Array.isArray(existing?.completedEndings) ? existing.completedEndings : [],
  };
  playState.cases[cid] = fresh;
  return fresh;
}

function buildOverloadNode(caseData) {
  return {
    title: "紧急强制撤离 · 认知过载保护协议已触发",
    location: "外勤医疗隔离舱 · 斯克兰顿记忆锚定室",
    paragraphs: [
      "当便携式理智监测仪读数归零的瞬间，战术神学部外勤领口自动释放了微量逆模因阻断气溶胶。耳蜗深处持续放大的异常低频谐波被强行截断，回收小队将你拖回现实稳定锚安全半径之内。",
      "本次现场勘验因认知负荷超限被迫中止，但黑匣记录仪已保存部分环境基线。建议前往馆藏档案或连载小说收集更多前置线索、提升权限职级后再次重返现场。",
    ],
    endingType: "retreat",
    endingCode: `${caseData.caseId}-overload-retreat`,
    grantClue: {
      id: `overload-${caseData.caseId}`,
      title: `认知过载撤离记录：${caseData.title}`,
      xp: 20,
    },
    relatedEntries: [],
    choices: [],
  };
}

function resolveClueDisplayName(clueId, manifest, clearanceState) {
  if (!clueId) return "";
  const owned = (clearanceState.clues || []).find((c) => c.id === clueId);
  if (owned?.title) return owned.title;
  for (const book of manifest?.novels || []) {
    for (const ch of book.chapters || []) {
      const cid = ch.clueId || `novel-${ch.id}`;
      if (cid === clueId) return ch.clueTitle || `《${book.title}》${ch.title}`;
    }
  }
  if (clueId.startsWith("read-")) {
    const eid = clueId.slice(5);
    const ent = (manifest?.entries || []).find((e) => e.id === eid);
    if (ent) return `调阅词条《${ent.title}》`;
  }
  return clueId;
}

async function loadCasesIndex(manifest, ctx) {
  let rawIndex = null;
  try {
    rawIndex = await ctx.fetchJson("data/play/index.json");
  } catch (_) {}

  const fromIndex = Array.isArray(rawIndex)
    ? rawIndex
    : Array.isArray(rawIndex?.cases)
      ? rawIndex.cases
      : Array.isArray(rawIndex?.playCases)
        ? rawIndex.playCases
        : [];
  const fromManifest = Array.isArray(manifest?.playCases) ? manifest.playCases : [];

  const mergedMap = new Map();
  for (const item of [...fromManifest, ...fromIndex]) {
    if (item && isValidId(item.caseId)) {
      mergedMap.set(item.caseId, { ...(mergedMap.get(item.caseId) || {}), ...item });
    }
  }
  return Array.from(mergedMap.values());
}

function renderSegmentedSanBar(san, maxSan, isLowSan) {
  const totalSegs = 20;
  const ratio = maxSan > 0 ? Math.max(0, Math.min(1, san / maxSan)) : 0;
  const filledSegs = Math.round(ratio * totalSegs);
  const segsHtml = [];
  for (let i = 0; i < totalSegs; i++) {
    const active = i < filledSegs;
    segsHtml.push(
      `<span class="play-san-seg ${active ? "filled" : ""} ${active && isLowSan ? "hatched" : ""}"></span>`
    );
  }
  return `<div class="play-san-bar ${isLowSan ? "is-low-san" : ""}" role="progressbar" aria-valuenow="${san}" aria-valuemin="0" aria-valuemax="${maxSan}">${segsHtml.join("")}</div>`;
}

export async function renderPlayView(rootEl, subRoute, ctx) {
  if (!rootEl) return;
  if (typeof rootEl._playCleanup === "function") {
    try {
      rootEl._playCleanup();
    } catch (_) {}
    rootEl._playCleanup = null;
  }

  const manifest = await ctx.getManifest();
  const [autolinkIndex, casesList] = await Promise.all([
    ctx.getAutolinkIndex ? ctx.getAutolinkIndex() : Promise.resolve([]),
    loadCasesIndex(manifest, ctx),
  ]);

  const thresholds = ctx?.clearance?.LEVEL_THRESHOLDS || DEFAULT_THRESHOLDS;
  const titlesMap = ctx?.clearance?.LEVEL_TITLES || DEFAULT_TITLES;

  const cleanSub = String(subRoute || "")
    .split("?")[0]
    .replace(/^\/+|\/+$/g, "")
    .trim()
    .toLowerCase();

  let playState = readPlayState();
  let selectedTierTab = getSafeClearanceState(ctx).level || 1;
  let cluesExpanded = false;
  let confirmResetArmed = false;
  let resetNotice = "";
  let showCaseSelectorGrid = !cleanSub;

  // Determine active case ID from route, saved state, or first case
  let activeCaseMeta = null;
  if (cleanSub && isValidId(cleanSub)) {
    activeCaseMeta = casesList.find((c) => c.caseId === cleanSub) || null;
  }
  if (!activeCaseMeta && playState.activeCaseId) {
    activeCaseMeta = casesList.find((c) => c.caseId === playState.activeCaseId) || null;
  }
  if (!activeCaseMeta && casesList.length > 0) {
    activeCaseMeta = casesList[0];
  }

  const caseDataCache = new Map();
  async function getCaseData(caseMeta) {
    if (!caseMeta) return null;
    if (caseDataCache.has(caseMeta.caseId)) return caseDataCache.get(caseMeta.caseId);
    const path = caseMeta.path || `data/play/${caseMeta.caseId}.json`;
    try {
      const data = await ctx.fetchJson(path);
      if (data && data.nodes) {
        caseDataCache.set(caseMeta.caseId, data);
        return data;
      }
    } catch (_) {}
    return null;
  }

  let activeCaseData = await getCaseData(activeCaseMeta);
  if (activeCaseData) {
    playState.activeCaseId = activeCaseData.caseId;
    ensureCaseProgress(playState, activeCaseData);
    writePlayState(playState);
  }

  function processNodeArrival(caseData, cProg) {
    if (!caseData || !cProg) return;
    const node =
      cProg.currentNode === "__cognitive_overload__"
        ? buildOverloadNode(caseData)
        : caseData.nodes?.[cProg.currentNode];
    if (!node || !node.endingType) return;

    const endingCode = node.endingCode || `${caseData.caseId}-${cProg.currentNode}`;
    if (!cProg.completedEndings.includes(endingCode)) {
      cProg.completedEndings.push(endingCode);
    }
    if (!playState.unlockedEndings.includes(endingCode)) {
      playState.unlockedEndings.push(endingCode);
    }
    writePlayState(playState);

    const clueObj = node.grantClue || {
      id: `ending-${endingCode.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`,
      title: `调查结案：${node.title}`,
      xp: 50,
    };
    if (isValidId(clueObj.id)) {
      const res = ctx?.clearance?.grantClue?.({
        id: clueObj.id,
        title: clueObj.title || `调查结案：${node.title}`,
        xp: Number(clueObj.xp) || 50,
        source: "play",
      });
      if (res?.granted) {
        ctx?.clearance?.showClearanceToast?.(
          res.leveledUp
            ? `达成调查结局 +${Number(clueObj.xp) || 50} XP · 权限晋升至 Lv.${res.level}`
            : `达成调查结局：${clueObj.title} (+${Number(clueObj.xp) || 50} XP)`
        );
      }
    }
  }

  function renderAll() {
    const cState = getSafeClearanceState(ctx);
    const curLv = Number(cState.level) || 1;
    const clues = Array.isArray(cState.clues) ? cState.clues : [];
    const xpLabel =
      curLv >= 5 || !cState.nextLevelXp
        ? `${cState.xp} XP · 已达最高职级 (THAVMIEL)`
        : `${cState.xp} / ${cState.nextLevelXp} XP（距 Lv.${curLv + 1} 还需 ${Math.max(0, cState.nextLevelXp - cState.xp)} XP）`;
    const pct = curLv >= 5 ? 100 : Math.max(0, Math.min(100, Number(cState.progressPct) || 0));

    const tierInfo = TIER_PERMISSIONS[selectedTierTab] || TIER_PERMISSIONS[1];
    const tierTitle = titlesMap[selectedTierTab] || DEFAULT_TITLES[selectedTierTab];
    const tierFloor = thresholds[selectedTierTab - 1] ?? 0;

    // Clues Ledger HTML
    const cluesRowsHtml = clues.length
      ? clues
          .slice()
          .reverse()
          .map((c) => {
            const srcTag = SOURCE_LABELS[c.source] || "馆藏归档";
            return `
              <div class="play-clue-row">
                <div class="play-clue-main">
                  <span class="badge-original">${escapeHtml(srcTag)}</span>
                  <span class="play-clue-title">${escapeHtml(c.title || c.id)}</span>
                </div>
                <span class="play-clue-xp">+${Number(c.xp) || 0} XP</span>
              </div>
            `;
          })
          .join("")
      : `<div class="play-empty-clues">尚未收录调查线索。调阅任意馆藏词条（+10 XP）、阅读《群青潮汐备忘录》章节（+30 XP）或推进下方分支调查（+20~50 XP）即可晋升权限职级。</div>`;

    // Cases Selector Grid HTML
    const casesCardsHtml = casesList.length
      ? casesList
          .map((cm) => {
            const isSel = activeCaseData && activeCaseData.caseId === cm.caseId;
            const savedCase = playState.cases[cm.caseId];
            const endingsDone = Array.isArray(savedCase?.completedEndings)
              ? savedCase.completedEndings.length
              : 0;
            const recLv = Number(cm.recommendedClearance) || 1;

            return `
              <article class="play-case-card ${isSel ? "is-active" : ""}">
                <div>
                  <div class="novel-badge-row">
                    <span class="badge-original">${escapeHtml(cm.provenanceLabel || "本站原创互动调查")}</span>
                    <span class="novel-stat-pill">建议权限 Lv.${recLv}</span>
                    ${endingsDone > 0 ? `<span class="badge-canon">已达成 ${endingsDone} 结局</span>` : ""}
                  </div>
                  <h3 class="condensed-monument play-case-card-title">${escapeHtml(cm.title)}</h3>
                  ${cm.subtitle ? `<div class="play-case-subtitle">${escapeHtml(cm.subtitle)}</div>` : ""}
                  <p class="prose-read play-case-summary">${escapeHtml(cm.summary || "")}</p>
                  <div class="play-case-metrics">
                    <span>初始理智 SAN ${Number(cm.initialSan) || 90}</span>
                    <span>·</span>
                    <span>初始休谟 ${Number(cm.initialHume || 0.85).toFixed(2)} Hm</span>
                  </div>
                </div>
                <div class="play-case-card-actions">
                  <button type="button" class="bp-btn ${isSel ? "active" : ""}" data-select-case="${escapeHtml(cm.caseId)}">
                    ${isSel ? "当前正在调查" : savedCase ? "继续本案调查 →" : "启动本案调查 →"}
                  </button>
                </div>
              </article>
            `;
          })
          .join("")
      : `<div class="archive-card"><p class="prose-read">当前未检出可用外勤调查脚本（data/play/index.json）。</p></div>`;

    // Active Investigation Engine HTML
    let activeEngineHtml = "";
    if (activeCaseData) {
      const cProg = ensureCaseProgress(playState, activeCaseData);
      processNodeArrival(activeCaseData, cProg);
      const updatedClearance = getSafeClearanceState(ctx);
      const liveLevel = Number(updatedClearance.level) || 1;
      const clueIdSet = new Set((updatedClearance.clues || []).map((c) => c.id));

      const node =
        cProg.currentNode === "__cognitive_overload__"
          ? buildOverloadNode(activeCaseData)
          : activeCaseData.nodes?.[cProg.currentNode] ||
            activeCaseData.nodes?.[activeCaseData.startNode];

      if (node) {
        const lowThresh = Number(node.lowSanThreshold) || 55;
        const isLowSan = cProg.san <= lowThresh;
        const humeVal = Number(cProg.hume).toFixed(2);
        const humeLow = Number(cProg.hume) < 0.65;

        const linkedSet = new Set();
        const parasHtml = (node.paragraphs || [])
          .map(
            (p, idx) =>
              `<p class="prose-read play-scene-para">${renderSafePlayProse(
                p,
                {
                  autolinkIndex,
                  currentClearance: liveLevel,
                  linkMode: "route",
                  redactPrefix: `${activeCaseData.caseId}-${cProg.currentNode}-${idx}`,
                  linkedSet,
                },
                ctx
              )}</p>`
          )
          .join("");

        const lowSanHtml =
          isLowSan && node.lowSanNote
            ? `
              <div class="play-low-san-block">
                <div class="play-low-san-header">
                  <span class="lapidary-serif">SEPARABIS SVBTILE A SPISSO</span>
                  <span class="badge-original">[认知偏移记录 · SAN ${cProg.san}/${cProg.maxSan}]</span>
                </div>
                <p class="play-low-san-copy">${renderSafePlayProse(
                  node.lowSanNote,
                  {
                    autolinkIndex,
                    currentClearance: liveLevel,
                    linkMode: "route",
                    redactPrefix: `${activeCaseData.caseId}-lowsan`,
                    linkedSet: new Set(),
                  },
                  ctx
                )}</p>
              </div>
            `
            : "";

        let interactionHtml = "";
        if (node.endingType) {
          const endMeta = ENDING_META[node.endingType] || ENDING_META.stabilized;
          const endingCode = node.endingCode || `${activeCaseData.caseId}-${cProg.currentNode}`;
          const relatedEntries = Array.isArray(node.relatedEntries) ? node.relatedEntries : [];
          const relatedLinksHtml = relatedEntries
            .map((eid) => {
              const ent = (manifest?.entries || []).find((e) => e.id === eid);
              const label = ent ? `${ent.code ? ent.code + " · " : ""}${ent.title}` : eid;
              return `<a class="bp-btn" href="#/entry/${encodeURIComponent(eid)}">关联卷宗：${escapeHtml(label)} →</a>`;
            })
            .join("");

          interactionHtml = `
            <div class="play-ending-box">
              <div class="lapidary-serif">${escapeHtml(endMeta.latin)} · 结局代号 ${escapeHtml(endingCode.toUpperCase())}</div>
              <h4 class="condensed-monument play-ending-title">${escapeHtml(endMeta.zh)}</h4>
              <p class="prose-read play-ending-desc">${escapeHtml(endMeta.desc)}</p>
              ${
                node.grantClue
                  ? `<div class="play-ending-reward"><span class="badge-canon">结案奖励已归档</span><span>${escapeHtml(node.grantClue.title)} (+${Number(node.grantClue.xp) || 50} XP)</span></div>`
                  : ""
              }
              ${
                relatedLinksHtml
                  ? `<div class="play-related-links"><div class="play-related-label">关联馆藏档案延伸查阅：</div><div class="play-related-row">${relatedLinksHtml}</div></div>`
                  : ""
              }
              <div class="play-ending-actions">
                <button type="button" class="bp-btn active" data-play-action="restart-case">再次调查探索其他分支</button>
                <button type="button" class="bp-btn" data-play-action="toggle-selector">切换其他调查卷宗</button>
                <a class="bp-btn" href="#/novel">前往阅读《群青潮汐备忘录》 →</a>
              </div>
            </div>
          `;
        } else {
          const choices = Array.isArray(node.choices) ? node.choices : [];
          const choicesHtml = choices
            .map((ch, idx) => {
              const reqLv = Number(ch.minClearance) || 1;
              const lacksLv = liveLevel < reqLv;
              const reqClue = ch.requiresClue || null;
              const lacksClue = Boolean(reqClue && !clueIdSet.has(reqClue));
              const locked = lacksLv || lacksClue;

              const reqBadges = [];
              if (lacksLv) {
                reqBadges.push(`<span class="badge-original">[需 Lv.${reqLv} 权限]</span>`);
              } else if (reqLv > 1) {
                reqBadges.push(`<span class="badge-canon">[Lv.${reqLv} 权限已核准]</span>`);
              }
              if (lacksClue) {
                const clueName = resolveClueDisplayName(reqClue, manifest, updatedClearance);
                reqBadges.push(`<span class="badge-original">[需线索：${escapeHtml(clueName)}]</span>`);
              } else if (reqClue) {
                reqBadges.push(`<span class="badge-canon">[关键线索已齐备]</span>`);
              }

              return `
                <button
                  type="button"
                  class="play-choice-btn ${locked ? "is-locked" : ""}"
                  data-choice-idx="${idx}"
                  ${locked ? 'disabled aria-disabled="true"' : ""}
                >
                  <div class="play-choice-top">
                    <span class="play-choice-num">${String.fromCharCode(65 + idx)}.</span>
                    <span class="play-choice-label">${escapeHtml(ch.label)}</span>
                  </div>
                  ${reqBadges.length ? `<div class="play-choice-tags">${reqBadges.join("")}</div>` : ""}
                </button>
              `;
            })
            .join("");

          interactionHtml = `
            <div class="play-choices-wrap" role="group" aria-label="行动决策分支">
              <div class="lapidary-serif play-choices-kicker">HIC EST TOTIVS FORTITVDINIS FORTITVDO FORTIS · 选择现场处置行动</div>
              <div class="play-choices-list">
                ${choicesHtml}
              </div>
            </div>
          `;
        }

        activeEngineHtml = `
          <section class="play-engine-panel" aria-label="现场分支调查引擎">
            <!-- Strictly Monochrome Klein-Blue & White Tactical HUD -->
            <div class="play-hud-bar ${isLowSan ? "hud-low-san" : ""}">
              <div class="play-hud-cell play-hud-san">
                <div class="play-hud-top">
                  <span class="lapidary-serif">SAN · 理智值</span>
                  <span class="play-hud-num ${isLowSan ? "is-italic" : ""}">${cProg.san} / ${cProg.maxSan}${isLowSan ? " · 偏移警戒" : ""}</span>
                </div>
                ${renderSegmentedSanBar(cProg.san, cProg.maxSan, isLowSan)}
              </div>

              <div class="play-hud-cell play-hud-hume">
                <span class="lapidary-serif">HVME · 休谟场</span>
                <span class="play-hud-num">${humeVal} Hm ${humeLow ? "· 现实稀薄" : "· 锚定内"}</span>
              </div>

              <div class="play-hud-cell play-hud-loc">
                <span class="lapidary-serif">LOCVS · 当前位置</span>
                <span class="play-hud-loc-text">${escapeHtml(node.location || activeCaseData.title)}</span>
              </div>

              <div class="play-hud-actions">
                <button type="button" class="bp-btn" data-play-action="restart-case">重新开始本案</button>
                <button type="button" class="bp-btn" data-play-action="toggle-selector">
                  ${showCaseSelectorGrid ? "收起卷宗列表" : "切换调查卷宗"}
                </button>
              </div>
            </div>

            <!-- Scene Narrative Body -->
            <article class="play-scene-card">
              <header class="play-scene-header">
                <div class="novel-badge-row">
                  <span class="badge-original">${escapeHtml(activeCaseData.title)}</span>
                  <span class="novel-stat-pill">节点记录 #${cProg.history.length}</span>
                  ${
                    cProg.completedEndings.length
                      ? `<span class="novel-stat-pill">本案已解锁 ${cProg.completedEndings.length} 结局</span>`
                      : ""
                  }
                </div>
                <h3 class="condensed-monument play-scene-title">${escapeHtml(node.title)}</h3>
              </header>

              <div class="play-scene-prose">
                ${parasHtml}
              </div>

              ${lowSanHtml}
              ${interactionHtml}
            </article>
          </section>
        `;
      }
    }

    rootEl.innerHTML = `
      <div class="p3-shell play-shell">
        <nav class="p3-breadcrumb" aria-label="面包屑导航">
          <a href="#/">档案馆大厅</a>
          <span>/</span>
          <span>权限晋升与分支调查终端</span>
          ${activeCaseData ? `<span>/</span><span>${escapeHtml(activeCaseData.title)}</span>` : ""}
        </nav>

        <!-- Clearance Lv.1 - Lv.5 Progression Dashboard -->
        <section class="play-clearance-panel" aria-label="权限等级终端">
          <div class="play-clearance-top">
            <div>
              <div class="lapidary-serif">${escapeHtml(cState.titleLatin || DEFAULT_TITLES[curLv].latin)}</div>
              <h1 class="condensed-monument p3-page-title">
                CLEARANCE Lv.${curLv} · ${escapeHtml(cState.titleZh || DEFAULT_TITLES[curLv].zh)}
              </h1>
              <div class="play-xp-caption">${escapeHtml(xpLabel)} · 已累计收录 ${clues.length} 项线索 · 全站已解锁 ${playState.unlockedEndings.length} 个调查结局</div>
            </div>
            <div class="play-reset-zone">
              ${
                confirmResetArmed
                  ? `
                    <div class="play-reset-confirm" role="group" aria-label="确认清空存档">
                      <span class="play-reset-prompt">确认清空存档？</span>
                      <button type="button" class="bp-btn active" data-reset-step="confirm">确认</button>
                      <button type="button" class="bp-btn" data-reset-step="cancel">取消</button>
                    </div>
                  `
                  : `<button type="button" class="bp-btn" data-reset-step="ask">重置权限与调查存档</button>`
              }
            </div>
          </div>

          ${resetNotice ? `<div class="play-status-banner">${escapeHtml(resetNotice)}</div>` : ""}

          <div class="play-xp-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="play-xp-fill" style="width:${pct}%;"></div>
          </div>

          <!-- Interactive 5-Tier Clearance Matrix -->
          <div class="play-tier-matrix" role="tablist" aria-label="五级权限矩阵">
            ${[1, 2, 3, 4, 5]
              .map((lv) => {
                const unlocked = curLv >= lv;
                const isCurrent = curLv === lv;
                const isSelected = selectedTierTab === lv;
                const tMeta = titlesMap[lv] || DEFAULT_TITLES[lv];
                const reqXp = thresholds[lv - 1] ?? 0;
                return `
                  <button
                    type="button"
                    role="tab"
                    aria-selected="${isSelected}"
                    class="play-tier-tab ${isSelected ? "is-selected" : ""} ${unlocked ? "is-unlocked" : "is-locked"}"
                    data-tier-tab="${lv}"
                  >
                    <span class="play-tier-lv">Lv.${lv} ${isCurrent ? "· 当前" : unlocked ? "· 已授印" : "· 待晋升"}</span>
                    <span class="play-tier-zh">${escapeHtml(tMeta.zh)}</span>
                    <span class="play-tier-xp">${reqXp} XP</span>
                  </button>
                `;
              })
              .join("")}
          </div>

          <div class="play-tier-detail">
            <div class="play-tier-detail-head">
              <span class="lapidary-serif">${escapeHtml(tierTitle.latin)}（门槛 ${tierFloor} XP）</span>
              <span class="${curLv >= selectedTierTab ? "badge-canon" : "badge-original"}">
                ${curLv >= selectedTierTab ? "该职级权限已生效" : `需累计 ${tierFloor} XP 解锁`}
              </span>
            </div>
            <div class="play-tier-summary">${escapeHtml(tierInfo.summary)}</div>
            <ul class="play-tier-list">
              ${tierInfo.unlocks.map((u) => `<li>${escapeHtml(u)}</li>`).join("")}
            </ul>
          </div>

          <!-- Expandable Collected Clues Ledger -->
          <div class="play-ledger-bar">
            <button type="button" class="bp-btn" data-toggle-clues="1" aria-expanded="${cluesExpanded}">
              ${cluesExpanded ? "收起已收录调查线索台账 ▲" : `展开已收录调查线索台账 (${clues.length}) ▼`}
            </button>
            <div class="play-ledger-links">
              <a class="bp-btn" href="#/category/scp">调阅收容档案 (+10 XP)</a>
              <a class="bp-btn" href="#/novel">阅读新怪谈连载 (+30 XP)</a>
            </div>
          </div>

          ${cluesExpanded ? `<div class="play-clues-ledger">${cluesRowsHtml}</div>` : ""}
        </section>

        <!-- Case Selector Grid -->
        <section id="play-case-selector" class="play-selector-section ${showCaseSelectorGrid ? "" : "is-collapsed"}">
          <div class="play-section-head">
            <div>
              <div class="lapidary-serif">ASCENDIT A TERRA IN CAELVM · 外勤分支调查卷宗</div>
              <h2 class="condensed-monument play-section-title">选择现场调查行动</h2>
            </div>
            <span class="novel-stat-pill">共 ${casesList.length} 份可执行调查档案</span>
          </div>
          <div class="play-cases-grid">
            ${casesCardsHtml}
          </div>
        </section>

        <!-- Active Investigation Engine -->
        ${activeEngineHtml}

        <footer class="cc-footer">
          说明：本终端的五级权限体系、休谟场与理智检定分支叙事为<b>本站原创互动模块</b>，其中引用的 SCP 基金会词条与世界观概念遵循 <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.zh-hans" target="_blank" rel="noopener">CC BY-SA 3.0</a> 协议。本站为虚构创作作品，与任何真实机构无关。
        </footer>
      </div>
    `;
  }

  renderAll();

  const onRootClick = async (e) => {
    const tierBtn = e.target.closest("[data-tier-tab]");
    if (tierBtn) {
      selectedTierTab = Number(tierBtn.getAttribute("data-tier-tab")) || 1;
      resetNotice = "";
      renderAll();
      return;
    }

    const toggleCluesBtn = e.target.closest("[data-toggle-clues]");
    if (toggleCluesBtn) {
      cluesExpanded = !cluesExpanded;
      renderAll();
      return;
    }

    const resetBtn = e.target.closest("[data-reset-step]");
    if (resetBtn) {
      const step = resetBtn.getAttribute("data-reset-step");
      if (step === "ask") {
        confirmResetArmed = true;
        resetNotice = "";
        renderAll();
      } else if (step === "cancel") {
        confirmResetArmed = false;
        renderAll();
      } else if (step === "confirm") {
        confirmResetArmed = false;
        if (ctx?.clearance?.resetClearanceAndPlay) {
          ctx.clearance.resetClearanceAndPlay();
        } else {
          try {
            localStorage.removeItem("tc_clearance_v1");
            localStorage.removeItem(PLAY_STATE_KEY);
          } catch (_) {}
        }
        playState = { activeCaseId: activeCaseData?.caseId || "", cases: {}, unlockedEndings: [] };
        if (activeCaseData) ensureCaseProgress(playState, activeCaseData);
        writePlayState(playState);
        selectedTierTab = 1;
        resetNotice = "权限等级、已解密遮蔽记录与调查分支存档已全部重置为 Lv.1 初始状态。";
        renderAll();
      }
      return;
    }

    const selectCaseBtn = e.target.closest("[data-select-case]");
    if (selectCaseBtn) {
      const targetId = selectCaseBtn.getAttribute("data-select-case");
      if (!isValidId(targetId)) return;
      const targetMeta = casesList.find((c) => c.caseId === targetId);
      if (!targetMeta) return;
      const loaded = await getCaseData(targetMeta);
      if (loaded) {
        activeCaseMeta = targetMeta;
        activeCaseData = loaded;
        playState.activeCaseId = loaded.caseId;
        ensureCaseProgress(playState, loaded);
        writePlayState(playState);
        showCaseSelectorGrid = false;
        resetNotice = "";
        const targetHash = `#/play/${encodeURIComponent(loaded.caseId)}`;
        if (window.location.hash !== targetHash) {
          history.pushState(null, "", targetHash);
        }
        renderAll();
      }
      return;
    }

    const actionBtn = e.target.closest("[data-play-action]");
    if (actionBtn && activeCaseData) {
      const act = actionBtn.getAttribute("data-play-action");
      if (act === "restart-case") {
        const prevCompleted = playState.cases[activeCaseData.caseId]?.completedEndings || [];
        delete playState.cases[activeCaseData.caseId];
        const fresh = ensureCaseProgress(playState, activeCaseData);
        fresh.completedEndings = prevCompleted;
        writePlayState(playState);
        resetNotice = "";
        renderAll();
      } else if (act === "toggle-selector") {
        showCaseSelectorGrid = !showCaseSelectorGrid;
        renderAll();
        if (showCaseSelectorGrid) {
          const selEl = rootEl.querySelector("#play-case-selector");
          selEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
      return;
    }

    const choiceBtn = e.target.closest("[data-choice-idx]");
    if (choiceBtn && activeCaseData && !choiceBtn.disabled) {
      const idx = Number(choiceBtn.getAttribute("data-choice-idx"));
      const cProg = ensureCaseProgress(playState, activeCaseData);
      const curNode = activeCaseData.nodes?.[cProg.currentNode];
      const choice = curNode?.choices?.[idx];
      if (!choice) return;

      const cState = getSafeClearanceState(ctx);
      const reqLv = Number(choice.minClearance) || 1;
      const clueIds = new Set((cState.clues || []).map((c) => c.id));
      if (cState.level < reqLv) return;
      if (choice.requiresClue && !clueIds.has(choice.requiresClue)) return;

      const sanDelta = Number(choice.sanDelta) || 0;
      const humeDelta = Number(choice.humeDelta) || 0;
      cProg.san = Math.max(0, Math.min(cProg.maxSan, cProg.san + sanDelta));
      cProg.hume = Math.max(0.01, Math.round((Number(cProg.hume) + humeDelta) * 100) / 100);

      if (choice.grantClue && isValidId(choice.grantClue.id)) {
        const res = ctx?.clearance?.grantClue?.({
          id: choice.grantClue.id,
          title: choice.grantClue.title || choice.label,
          xp: Number(choice.grantClue.xp) || 20,
          source: "play",
        });
        if (res?.granted) {
          ctx?.clearance?.showClearanceToast?.(
            res.leveledUp
              ? `获得现场线索 +${Number(choice.grantClue.xp) || 20} XP · 权限晋升至 Lv.${res.level}`
              : `获得现场线索：${choice.grantClue.title} (+${Number(choice.grantClue.xp) || 20} XP)`
          );
        }
      }

      const targetNext = choice.next;
      const targetNodeObj = activeCaseData.nodes?.[targetNext];
      if (cProg.san <= 0 && !targetNodeObj?.endingType) {
        cProg.currentNode = "__cognitive_overload__";
        cProg.history.push("__cognitive_overload__");
      } else if (targetNodeObj) {
        cProg.currentNode = targetNext;
        cProg.history.push(targetNext);
      }

      writePlayState(playState);
      resetNotice = "";
      renderAll();
      return;
    }

    const redactEl = e.target.closest(".scp-redact[data-redact-key]");
    if (redactEl && ctx?.clearance?.tryRevealRedaction) {
      e.preventDefault();
      e.stopPropagation();
      const key = redactEl.getAttribute("data-redact-key");
      const reqLv = parseInt(redactEl.getAttribute("data-req-lv") || "1", 10) || 1;
      const res = ctx.clearance.tryRevealRedaction(key, reqLv);
      if (!res.allowed) {
        ctx.clearance.showClearanceToast?.(
          `权限不足：需 Clearance Lv.${reqLv} 方可显影（当前 Lv.${res.currentLevel}）`
        );
      } else {
        redactEl.classList.remove("scp-redact-locked");
        redactEl.classList.add("revealed");
        if (redactEl.dataset.secret) {
          redactEl.textContent = redactEl.dataset.secret;
        }
      }
    }
  };

  rootEl.addEventListener("click", onRootClick);

  const offClearance = ctx?.clearance?.onClearanceChange
    ? ctx.clearance.onClearanceChange(() => {
        renderAll();
      })
    : null;

  rootEl._playCleanup = () => {
    rootEl.removeEventListener("click", onRootClick);
    if (typeof offClearance === "function") offClearance();
  };
}
