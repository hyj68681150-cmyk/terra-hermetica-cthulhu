/**
 * js/views/gallery.js
 * P3 Deliverable 3: Unified 4-Room Visual Exhibition Hall
 * (#/gallery, #/gallery/astrolabe, #/gallery/pantheon, #/gallery/timeline, #/gallery/cinema, plus #/pantheon & #/timeline)
 * Strictly Monochrome Klein-Blue (#0a1890) & White (#ffffff), Zero Third Colors, Zero Inline onclick, Zero Emoji.
 */
import { escapeHtml } from "../sanitize.js";
import { PANTHEON_SIGILS } from "../sigils.js";

const ROMAN_NUMS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

const GALLERY_ROOMS = [
  { id: "astrolabe", glyph: "\u2609\uFE0E", label: "神学星象仪", href: "#/gallery/astrolabe" },
  { id: "pantheon", glyph: "\u263D\uFE0E", label: "圣像铜版画廊", href: "#/gallery/pantheon" },
  { id: "timeline", glyph: "\u2644\uFE0E", label: "纪元事件时间轴", href: "#/gallery/timeline" },
  { id: "cinema", glyph: "\u263F\uFE0E", label: "巡礼放映室", href: "#/gallery/cinema" },
];

// Seven Chaldean Planetary Spheres (inner to outer) + Yuggoth per 07 Section 2.C
const CHALDEAN_SPHERES = [
  { sym: "\u263D\uFE0E", latin: "MATER EIVS LVNA", zh: "月 · 银 · 惠灵顿" },
  { sym: "\u263F\uFE0E", latin: "VERVM SINE MENDACIO", zh: "水星 · 汞 · 佛罗伦萨" },
  { sym: "\u2640\uFE0E", latin: "SEPARABIS TERRAM AB IGNE", zh: "金星 · 铜 · 京都" },
  { sym: "\u2609\uFE0E", latin: "PATER EIVS EST SOL", zh: "日 · 金 · 亚历山大" },
  { sym: "\u2642\uFE0E", latin: "VIS EIVS INTEGRA EST", zh: "火星 · 铁 · 魁北克城" },
  { sym: "\u2643\uFE0E", latin: "ASCENDIT A TERRA IN CAELVM", zh: "木星 · 锡 · 西安" },
  { sym: "\u2644\uFE0E", latin: "TOTIVS FORTITVDINIS FORTITVDO", zh: "土星 · 铅 · 布宜诺斯艾利斯" },
];

const CINEMA_MOVEMENTS = [
  {
    idx: 0,
    roman: "I",
    title: "序幕：翠玉圣律",
    latin: "VERVM SINE MENDACIO · CERTVM ET VERISSIMVM",
    durationSec: 8,
    freqBase: 110,
    caption:
      "七曜天球依迦勒底古序由内向外运转（\u263D\uFE0E \u263F\uFE0E \u2640\uFE0E \u2609\uFE0E \u2642\uFE0E \u2643\uFE0E \u2644\uFE0E），最外圈虚线孤轨标示不在七曜之列的冥王星 YVGGOTH。赫尔墨斯蓝色修会将《翠玉录》几何谐振并入现实稳定锚，在大浸染纪元维系圣域基准。",
    links: [
      { label: "查阅《翠玉录》补遗 →", href: "#/entry/dossier-tabula-caerulea" },
      { label: "蓝色神学与休谟场论 →", href: "#/entry/codex-hume-theory" },
    ],
  },
  {
    idx: 1,
    roman: "II",
    title: "第一幕：拉莱耶深渊",
    latin: "SANCTVM R'LYEH · 47°09'S 126°43'W",
    durationSec: 8,
    freqBase: 82.41,
    caption:
      "南太平洋万米海沟陡崖之上，非欧几里得玄武岩巨石卫城在深水高压中静默矗立。四座斯克兰顿现实稳定锚星塔环绕外围，持续对冲自深渊传出的十七赫兹反相潮汐。",
    links: [
      { label: "阅读拉莱耶站点卷宗 →", href: "#/entry/site-rlyeh" },
      { label: "在铜版舆图查看坐标 →", href: "#/map/site-rlyeh" },
    ],
  },
  {
    idx: 2,
    roman: "III",
    title: "第二幕：守门人与两河圣座",
    latin: "PORTAVIT ILLVD VENTVS IN VENTRE SVO",
    durationSec: 8,
    freqBase: 146.83,
    caption:
      "底格里斯河与幼发拉底河交汇之处，四翼发光实体持剑伫立（基于 DrClef 提案 SCP-001，CC BY-SA 3.0）。远古监测哨记录到高达 8.90 Hm 的刚性现实场梯度。",
    links: [
      { label: "查阅 SCP-001 守门人档案 →", href: "#/entry/dossier-scp-001-guardian" },
      { label: "在铜版舆图定位两河圣座 →", href: "#/map/site-001" },
    ],
  },
  {
    idx: 3,
    roman: "IV",
    title: "第三幕：亚历山大灯塔街景",
    latin: "PATER EIVS EST SOL · MATER EIVS LVNA",
    durationSec: 8,
    freqBase: 164.81,
    caption:
      "尼罗河入海口岬角之上，三层八角法罗斯大灯塔向全球结界航线发出 1.48 Hm 太阳圣座基准波束。拱廊下学者行旅往来，港湾航道维持圣域级平靖。",
    links: [
      { label: "查阅亚历山大圣座卷宗 →", href: "#/entry/site-alexandria" },
      { label: "切入星象仪街道近景 →", href: "#/gallery/astrolabe/alexandria" },
    ],
  },
  {
    idx: 4,
    roman: "V",
    title: "第四幕：八神铜版圣像",
    latin: "SEPARABIS TERRAM AB IGNE · SVBTILE A SPISSO",
    durationSec: 8,
    freqBase: 130.81,
    caption:
      "铜版蚀刻八角星轮依次显影克苏鲁、犹格·索托斯、四翼守门人、阿难陀舍沙、破碎之神麦卡恩、吞世者七链、原初盲核与阿拉卡达假面宫廷的几何圣徽。",
    links: [
      { label: "进入圣像铜版画廊 →", href: "#/gallery/pantheon" },
      { label: "浏览全部实体与神祇 →", href: "#/category/entities" },
    ],
  },
  {
    idx: 5,
    roman: "VI",
    title: "终幕：群青铭记",
    latin: "OMNIA AB VNO MEDITATIONE VNIVS · ITA MVNDVS CREATVS EST",
    durationSec: 8,
    freqBase: 110,
    caption:
      "七链虽断其六，第七锁链仍在群青谐振中坚守。人类以理性、奇术与盟约航线在浸染之世筑起灯火。全馆文献遵循 CC BY-SA 3.0 协议共享。",
    links: [
      { label: "阅读《群青潮汐备忘录》 →", href: "#/novel" },
      { label: "进入权限与分支调查终端 →", href: "#/play" },
    ],
  },
];

let activeCinemaCleanup = null;
let globalGalleryWatcherMounted = false;

function stopCinemaRoom() {
  if (typeof activeCinemaCleanup === "function") {
    try {
      activeCinemaCleanup();
    } catch (_) {}
    activeCinemaCleanup = null;
  }
}

function isGalleryHash(hashStr = window.location.hash) {
  const clean = String(hashStr || "")
    .replace(/^#\/?/, "")
    .split(/[/?]/)[0]
    .trim()
    .toLowerCase();
  return (
    clean === "gallery" ||
    clean === "pantheon" ||
    clean === "timeline" ||
    clean === "terra"
  );
}

function ensureGallerySubnav(activeRoom) {
  let nav = document.getElementById("gallery-subnav");
  if (!nav) {
    nav = document.createElement("nav");
    nav.id = "gallery-subnav";
    nav.className = "gallery-subnav no-scrollbar";
    nav.setAttribute("aria-label", "视觉展厅分厅导航");
    nav.innerHTML = GALLERY_ROOMS.map(
      (r) =>
        `<a class="gallery-subnav-link" data-gallery-tab="${r.id}" href="${r.href}"><span class="gallery-subnav-glyph">${r.glyph}</span><span>${escapeHtml(r.label)}</span></a>`
    ).join("");
    const topNav = document.getElementById("top-nav");
    if (topNav && topNav.parentNode) {
      topNav.parentNode.insertBefore(nav, topNav.nextSibling);
    } else {
      document.body.appendChild(nav);
    }
  }

  nav.querySelectorAll("[data-gallery-tab]").forEach((link) => {
    const isAct = link.getAttribute("data-gallery-tab") === activeRoom;
    link.classList.toggle("active", isAct);
    if (isAct) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  document.body.setAttribute("data-gallery-active", "1");
  document.body.setAttribute("data-gallery-room", activeRoom);

  if (!globalGalleryWatcherMounted) {
    globalGalleryWatcherMounted = true;
    const syncVisibility = () => {
      if (!isGalleryHash(window.location.hash)) {
        document.body.removeAttribute("data-gallery-active");
        document.body.removeAttribute("data-gallery-room");
        stopCinemaRoom();
        const customStage = document.getElementById("stage-gallery-custom");
        if (customStage) {
          customStage.classList.remove("open");
          customStage.style.display = "none";
        }
      }
    };
    window.addEventListener("hashchange", syncVisibility);
  }

  return nav;
}

function setLegacyAstrolabeDomVisible(visible) {
  const gw = document.getElementById("globe-stage-wrap");
  const camBar = document.getElementById("globe-cam-bar");
  const leftPanel = document.getElementById("left-panel");
  const rightPanel = document.getElementById("right-panel");
  const liveTicker = document.getElementById("live-ticker");
  const isMob = window.matchMedia("(max-width: 860px)").matches;

  if (gw) {
    gw.style.display = visible ? "block" : "none";
    gw.style.opacity = visible ? "1" : "0";
    gw.style.pointerEvents = visible ? "auto" : "none";
  }
  if (camBar) camBar.style.display = visible ? "flex" : "none";
  if (leftPanel) {
    leftPanel.style.display = visible ? "flex" : "none";
    if (!visible) leftPanel.classList.remove("mobile-sheet-open");
    leftPanel.classList.toggle("panel-hidden-left", !visible);
  }
  if (rightPanel) {
    rightPanel.style.display = visible ? "flex" : "none";
    rightPanel.classList.toggle("panel-hidden-right", !visible);
  }
  if (liveTicker) {
    liveTicker.style.display = visible && !isMob ? "flex" : "none";
  }
}

function getDedicatedGalleryStage(rootEl) {
  if (
    rootEl &&
    rootEl.id !== "stage-pantheon" &&
    rootEl.id !== "globe-stage-wrap"
  ) {
    return rootEl;
  }
  let el = document.getElementById("stage-gallery-custom");
  if (!el) {
    el = document.createElement("section");
    el.id = "stage-gallery-custom";
    el.className = "chapter-stage custom-scroll";
    document.body.appendChild(el);
  }
  return el;
}

function romanOrderIndex(code) {
  const idx = ROMAN_NUMS.indexOf(String(code || "").trim().toUpperCase());
  return idx >= 0 ? idx : 99;
}

function guessArtType(entry) {
  if (entry.artType && PANTHEON_SIGILS[entry.artType]) return entry.artType;
  const id = String(entry.id || "");
  if (id.includes("cthulhu")) return "cthulhu";
  if (id.includes("yog")) return "yogsothoth";
  if (id.includes("guardian") || id.includes("001")) return "guardian";
  if (id.includes("3000")) return "scp3000";
  if (id.includes("mekhane")) return "mekhane";
  if (id.includes("2317")) return "scp2317";
  if (id.includes("azathoth")) return "azathoth";
  if (id.includes("nyarlathotep") || id.includes("alagadda")) return "nyarlathotep";
  return "cthulhu";
}

function formatYearLabel(yearSort, eraLabel) {
  if (eraLabel) return eraLabel;
  const y = Number(yearSort);
  if (!Number.isFinite(y)) return "纪元待考";
  if (y <= -1000000) return `约 ${Math.round(Math.abs(y) / 100000000 * 10) / 10} 亿年前`;
  if (y < 0) return `公元前 ${Math.abs(y)} 年`;
  return `公元 ${y} 年`;
}

/**
 * Room 2: Pantheon 8-Plate Copperplate Gallery + Interactive Etching Wheel (#stage-pantheon)
 */
async function renderPantheonRoom(customStage, roomParam, ctx) {
  if (customStage) {
    customStage.classList.remove("open");
    customStage.style.display = "none";
  }
  setLegacyAstrolabeDomVisible(false);

  const stagePantheon = document.getElementById("stage-pantheon");
  const manifest = await ctx.getManifest();
  const entities = (manifest?.entries || [])
    .filter((e) => e.category === "entities")
    .slice()
    .sort((a, b) => romanOrderIndex(a.code) - romanOrderIndex(b.code));

  let initialIdx = 0;
  if (roomParam) {
    const asNum = parseInt(roomParam, 10);
    if (!Number.isNaN(asNum) && asNum >= 0 && asNum < 8) {
      initialIdx = asNum;
    } else {
      const byId = entities.findIndex((e) => e.id === roomParam);
      if (byId >= 0) initialIdx = byId;
    }
  }

  if (ctx?.openPantheonIndex) {
    await ctx.openPantheonIndex(initialIdx);
  } else if (typeof window.switchLiber === "function") {
    window.switchLiber("pantheon", true);
    if (typeof window.selectPantheon === "function") {
      window.selectPantheon(initialIdx);
    }
  }
  if (stagePantheon) {
    stagePantheon.classList.add("open");
  }

  if (!stagePantheon) return;

  // Non-destructively wrap original two columns of #stage-pantheon so #wheel-canvas and #woodcut-canvas stay intact
  let topSplit = stagePantheon.querySelector(".pantheon-etching-top");
  if (!topSplit) {
    topSplit = document.createElement("div");
    topSplit.className = "pantheon-etching-top";
    const existingChildren = Array.from(stagePantheon.children);
    for (const child of existingChildren) {
      topSplit.appendChild(child);
    }
    stagePantheon.classList.add("pantheon-upgraded-stage");
    stagePantheon.appendChild(topSplit);
  }

  // Inject direct #/entry/<id> button beside #pan-jump-btn
  const jumpBtn = stagePantheon.querySelector("#pan-jump-btn");
  let entryLinkBtn = stagePantheon.querySelector("#pan-entry-link");
  if (jumpBtn && !entryLinkBtn) {
    const btnRow = document.createElement("div");
    btnRow.className = "pantheon-hero-btn-row";
    jumpBtn.parentNode.insertBefore(btnRow, jumpBtn);
    jumpBtn.style.marginTop = "0";
    btnRow.appendChild(jumpBtn);

    entryLinkBtn = document.createElement("a");
    entryLinkBtn.id = "pan-entry-link";
    entryLinkBtn.className = "bp-btn";
    entryLinkBtn.textContent = "查阅完整词条 →";
    btnRow.appendChild(entryLinkBtn);
  }

  // Mount or refresh 8-Plate Copperplate Grid + Seven Planetary Spheres Strip below the interactive wheel
  let deckEl = stagePantheon.querySelector("#pantheon-plates-deck");
  if (!deckEl) {
    deckEl = document.createElement("section");
    deckEl.id = "pantheon-plates-deck";
    deckEl.className = "pantheon-plates-deck";
    stagePantheon.appendChild(deckEl);
  }

  const spheresHtml = CHALDEAN_SPHERES.map(
    (s) =>
      `<div class="chaldean-sphere-chip" title="${escapeHtml(s.zh)}"><span class="chaldean-sym">${s.sym}</span><span class="chaldean-lat">${s.latin}</span></div>`
  ).join("");

  const platesHtml = entities
    .map((ent, idx) => {
      const artKey = guessArtType(ent);
      const sigilSvg = PANTHEON_SIGILS[artKey] || PANTHEON_SIGILS.cthulhu;
      const isOrig = ent.provenance === "original";
      const badgeCls = isOrig ? "plate-badge-orig" : "plate-badge-canon";
      const badgeLabel =
        ent.provenance === "scp-canon"
          ? "SCP 原典"
          : ent.provenance === "cthulhu-canon"
            ? "克苏鲁原典"
            : "本站设定";
      const mapTarget = ent.geo ? ent.id : ent.mapSiteId || "";

      return `
        <article class="pantheon-plate-card ${idx === initialIdx ? "is-selected" : ""}" data-plate-card="${idx}">
          <div class="pantheon-plate-art">
            <div class="pantheon-plate-top">
              <span class="pantheon-plate-fig">FIG. ${escapeHtml(ent.code || ROMAN_NUMS[idx] || String(idx + 1))}</span>
              <span class="${badgeCls}">${escapeHtml(badgeLabel)}</span>
            </div>
            <div class="pantheon-plate-sigil">${sigilSvg}</div>
            <div class="pantheon-plate-code">${escapeHtml(ent.id.toUpperCase())}</div>
          </div>
          <div class="pantheon-plate-body">
            <h3 class="condensed-monument pantheon-plate-title">${escapeHtml(ent.title)}</h3>
            <p class="prose-read pantheon-plate-summary">${escapeHtml(ent.summary || "")}</p>
            <div class="pantheon-plate-actions">
              <button type="button" class="bp-btn" data-focus-pantheon="${idx}">铜版轮盘检视 ↑</button>
              <a class="bp-btn active" href="#/entry/${encodeURIComponent(ent.id)}">完整卷宗 →</a>
              ${
                mapTarget
                  ? `<a class="bp-btn" href="#/map/${encodeURIComponent(mapTarget)}">舆图定位</a>`
                  : ""
              }
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  deckEl.innerHTML = `
    <div class="pantheon-spheres-banner" aria-label="迦勒底七曜天球与冥王外轨">
      <div class="lapidary-serif">OMNIA AB VNO MEDITATIONE VNIVS · 七曜圣城天球序与界外孤轨</div>
      <div class="chaldean-spheres-row">
        ${spheresHtml}
        <span class="chaldean-divider" aria-hidden="true">|</span>
        <div class="chaldean-sphere-chip is-yuggoth" title="洛夫克拉夫特《暗夜呢喃》冥王星 · 不在七曜之列">
          <span class="chaldean-lat">YVGGOTH · 界外虚轨</span>
        </div>
      </div>
    </div>

    <div class="pantheon-deck-header">
      <div>
        <div class="lapidary-serif">HINC ERVNT ADAPTATIONES MIRABILES · 八神铜版蚀刻圣像总览</div>
        <h2 class="condensed-monument play-section-title">八幅馆藏神祇与至高实体图版（I–VIII）</h2>
      </div>
      <a class="bp-btn" href="#/category/entities">进入实体分类目录 →</a>
    </div>

    <div class="pantheon-plates-grid">
      ${platesHtml}
    </div>
  `;

  const syncSelectedEntityUi = (idx) => {
    const safeIdx = Math.max(0, Math.min(entities.length - 1, Number(idx) || 0));
    const curEnt = entities[safeIdx];
    if (entryLinkBtn && curEnt) {
      entryLinkBtn.href = `#/entry/${encodeURIComponent(curEnt.id)}`;
      entryLinkBtn.textContent = `查阅 ${curEnt.code || ""} 完整卷宗 →`;
    }
    deckEl.querySelectorAll("[data-plate-card]").forEach((card) => {
      card.classList.toggle("is-selected", Number(card.getAttribute("data-plate-card")) === safeIdx);
    });
  };

  syncSelectedEntityUi(initialIdx);

  if (typeof stagePantheon._pantheonSyncCleanup === "function") {
    stagePantheon._pantheonSyncCleanup();
  }

  const onPantheonClick = (e) => {
    const focusBtn = e.target.closest("[data-focus-pantheon]");
    if (focusBtn) {
      const idx = Number(focusBtn.getAttribute("data-focus-pantheon")) || 0;
      if (ctx?.openPantheonIndex) ctx.openPantheonIndex(idx);
      else if (typeof window.selectPantheon === "function") window.selectPantheon(idx);
      syncSelectedEntityUi(idx);
      stagePantheon.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const pidxBtn = e.target.closest("[data-pidx]");
    if (pidxBtn) {
      syncSelectedEntityUi(Number(pidxBtn.getAttribute("data-pidx")) || 0);
      return;
    }
    if (e.target.closest("#wheel-canvas")) {
      requestAnimationFrame(() => {
        const activeBtn = stagePantheon.querySelector("#pan-selector button.active");
        if (activeBtn) {
          syncSelectedEntityUi(Number(activeBtn.getAttribute("data-pidx")) || 0);
        }
      });
    }
  };

  stagePantheon.addEventListener("click", onPantheonClick);
  stagePantheon._pantheonSyncCleanup = () => {
    stagePantheon.removeEventListener("click", onPantheonClick);
  };
}

/**
 * Room 3: Interactive Cross-Canon Chronological Timeline (#/gallery/timeline & #/timeline)
 */
async function renderTimelineRoom(customStage, roomParam, ctx) {
  const stagePantheon = document.getElementById("stage-pantheon");
  if (stagePantheon) stagePantheon.classList.remove("open");
  setLegacyAstrolabeDomVisible(false);

  customStage.style.display = "";
  customStage.classList.add("open");

  if (typeof customStage._galleryRoomCleanup === "function") {
    customStage._galleryRoomCleanup();
    customStage._galleryRoomCleanup = null;
  }

  const [manifest, autolinkIndex] = await Promise.all([
    ctx.getManifest(),
    ctx.getAutolinkIndex ? ctx.getAutolinkIndex() : Promise.resolve([]),
  ]);

  const allTimeline = (manifest?.entries || [])
    .filter((e) => e.category === "timeline")
    .slice()
    .sort((a, b) => (Number(a.yearSort) || 0) - (Number(b.yearSort) || 0));

  let activeProvFilter = "all";
  let highlightedId = roomParam || (allTimeline[0]?.id ?? "");

  const renderTimelineProse = (raw, itemId) => {
    const lv = ctx?.clearance?.getClearanceState?.()?.level || 1;
    if (ctx?.autolink?.renderProseWithLinks) {
      return ctx.autolink.renderProseWithLinks(raw || "", {
        autolinkIndex,
        excludeId: itemId,
        currentClearance: lv,
        linkMode: "route",
        redactPrefix: `tl-${itemId}`,
        linkedSet: new Set(),
      });
    }
    return escapeHtml(raw || "");
  };

  const countByProv = (prov) =>
    prov === "all"
      ? allTimeline.length
      : allTimeline.filter((e) => e.provenance === prov).length;

  function updateTimelineDom() {
    const filtered =
      activeProvFilter === "all"
        ? allTimeline
        : allTimeline.filter((e) => e.provenance === activeProvFilter);

    // Build SVG Hairline Chronological Axis
    const n = filtered.length;
    const svgW = Math.max(680, n * 116);
    const axisSvgHtml =
      n > 0
        ? `<svg class="timeline-axis-svg" viewBox="0 0 ${svgW} 68" role="img" aria-label="纪元时间轴刻度">
            <line x1="36" y1="34" x2="${svgW - 36}" y2="34" stroke="currentColor" stroke-width="1"/>
            <line x1="36" y1="38" x2="${svgW - 36}" y2="38" stroke="currentColor" stroke-width="0.5" stroke-dasharray="3 3"/>
            ${filtered
              .map((item, idx) => {
                const x = n === 1 ? svgW / 2 : 54 + (idx / (n - 1)) * (svgW - 108);
                const roman = ROMAN_NUMS[allTimeline.indexOf(item)] || String(idx + 1);
                const isOrig = item.provenance === "original";
                return `
                  <g class="timeline-svg-node">
                    <circle cx="${x}" cy="34" r="7" fill="${isOrig ? "var(--bg-card)" : "currentColor"}" stroke="currentColor" stroke-width="1.4"/>
                    ${isOrig ? `<circle cx="${x}" cy="34" r="3" fill="none" stroke="currentColor" stroke-width="1"/>` : ""}
                    <text x="${x}" y="18" text-anchor="middle" class="timeline-svg-roman">${roman}</text>
                    <text x="${x}" y="58" text-anchor="middle" class="timeline-svg-era">${escapeHtml((item.eraLabel || formatYearLabel(item.yearSort)).slice(0, 10))}</text>
                  </g>
                `;
              })
              .join("")}
          </svg>`
        : "";

    const eraChipsHtml = filtered
      .map((item, idx) => {
        const globalIdx = allTimeline.indexOf(item);
        const roman = ROMAN_NUMS[globalIdx] || String(idx + 1);
        const eraText = formatYearLabel(item.yearSort, item.eraLabel);
        const isHi = item.id === highlightedId;
        return `
          <button type="button" class="timeline-era-chip ${isHi ? "active" : ""}" data-jump-era="${escapeHtml(item.id)}">
            <span class="timeline-chip-roman">${roman}</span>
            <span>${escapeHtml(eraText)}</span>
          </button>
        `;
      })
      .join("");

    const cardsHtml = filtered.length
      ? filtered
          .map((item, idx) => {
            const globalIdx = allTimeline.indexOf(item);
            const roman = ROMAN_NUMS[globalIdx] || String(idx + 1);
            const eraText = formatYearLabel(item.yearSort, item.eraLabel);
            const isOrig = item.provenance === "original";
            const provCls = isOrig ? "badge-original" : "badge-canon";
            const provName =
              item.provenanceLabel ||
              (item.provenance === "cthulhu-canon"
                ? "克苏鲁神话原典"
                : item.provenance === "scp-canon"
                  ? "SCP 基金会原典"
                  : "本站原创设定");
            const mapTarget = item.mapSiteId || (item.geo ? item.id : "");
            const isHi = item.id === highlightedId;

            return `
              <article id="tl-node-${escapeHtml(item.id)}" class="timeline-node-row ${isHi ? "is-highlighted" : ""}">
                <div class="timeline-node-marker" aria-hidden="true">
                  <span class="timeline-marker-dot ${isOrig ? "is-hollow" : "is-solid"}"></span>
                  <span class="timeline-marker-roman">${roman}</span>
                </div>
                <div class="timeline-node-card">
                  <div class="timeline-card-head">
                    <div class="novel-badge-row">
                      <span class="timeline-era-pill">${roman} · ${escapeHtml(eraText)}</span>
                      <span class="${provCls}">${escapeHtml(provName)}</span>
                      <span class="novel-stat-pill">Lv.${Number(item.clearance) || 1}</span>
                    </div>
                    ${item.code ? `<span class="lapidary-serif">${escapeHtml(item.code)}</span>` : ""}
                  </div>
                  <h3 class="condensed-monument timeline-card-title">${escapeHtml(item.title)}</h3>
                  <p class="prose-read timeline-card-summary">${renderTimelineProse(item.summary, item.id)}</p>
                  <div class="timeline-card-actions">
                    <a class="bp-btn active" href="#/entry/${encodeURIComponent(item.id)}">阅读事件卷宗 →</a>
                    ${
                      mapTarget
                        ? `<a class="bp-btn" href="#/map/${encodeURIComponent(mapTarget)}">在铜版舆图查看 →</a>`
                        : ""
                    }
                  </div>
                </div>
              </article>
            `;
          })
          .join("")
      : `
        <div class="archive-card">
          <p class="prose-read">当前筛选条件下暂无匹配的纪元事件记录。</p>
        </div>
      `;

    customStage.innerHTML = `
      <div class="p3-shell gallery-room-shell">
        <header class="p3-editorial-header">
          <div class="lapidary-serif">ITA MVNDVS CREATVS EST · CHRONOLOGIA</div>
          <h1 class="condensed-monument p3-page-title">跨体系纪元事件时间轴</h1>
          <p class="prose-read p3-page-lead">
            自远古地质纪元至现代大浸染与收容时代，按时间序并置<b>克苏鲁神话原典</b>、<b>SCP 基金会维基原典</b>（实心徽章）与<b>本站蓝色神学合流设定</b>（线框徽章）。
          </p>
        </header>

        <!-- Provenance Filter Bar -->
        <div class="timeline-filter-bar" role="toolbar" aria-label="文献出处筛选">
          <button type="button" class="bp-btn ${activeProvFilter === "all" ? "active" : ""}" data-tl-prov="all">
            全部 (${countByProv("all")})
          </button>
          <button type="button" class="bp-btn ${activeProvFilter === "cthulhu-canon" ? "active" : ""}" data-tl-prov="cthulhu-canon">
            克苏鲁原典 (${countByProv("cthulhu-canon")})
          </button>
          <button type="button" class="bp-btn ${activeProvFilter === "scp-canon" ? "active" : ""}" data-tl-prov="scp-canon">
            SCP原典 (${countByProv("scp-canon")})
          </button>
          <button type="button" class="bp-btn ${activeProvFilter === "original" ? "active" : ""}" data-tl-prov="original">
            本站设定 (${countByProv("original")})
          </button>
        </div>

        <!-- Monochrome Hairline Chronological Axis & Era Nodes Strip -->
        ${
          filtered.length
            ? `
              <section class="timeline-axis-box" aria-label="纪元刻度轴">
                <div class="timeline-axis-scroll no-scrollbar">
                  ${axisSvgHtml}
                </div>
                <div class="timeline-era-strip">
                  ${eraChipsHtml}
                </div>
              </section>
            `
            : ""
        }

        <!-- Chronological Spine -->
        <div class="timeline-spine">
          ${cardsHtml}
        </div>

        <footer class="cc-footer">
          文献署名：凡标实心徽章之纪元节点分别源自洛夫克拉夫特公有领域作品及 <a href="https://scp-wiki.wikidot.com/" target="_blank" rel="noopener">SCP Foundation Wiki</a>（CC BY-SA 3.0）；标线框徽章之桥接历史为本站原创衍生，同样按 CC BY-SA 3.0 共享。本站为虚构作品。
        </footer>
      </div>
    `;
  }

  updateTimelineDom();

  const onStageClick = (e) => {
    const provBtn = e.target.closest("[data-tl-prov]");
    if (provBtn) {
      activeProvFilter = provBtn.getAttribute("data-tl-prov") || "all";
      updateTimelineDom();
      return;
    }
    const jumpBtn = e.target.closest("[data-jump-era]");
    if (jumpBtn) {
      const targetId = jumpBtn.getAttribute("data-jump-era");
      highlightedId = targetId;
      customStage.querySelectorAll(".timeline-era-chip").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-jump-era") === targetId);
      });
      customStage.querySelectorAll(".timeline-node-row").forEach((row) => {
        row.classList.toggle("is-highlighted", row.id === `tl-node-${targetId}`);
      });
      const rowEl = customStage.querySelector(`#tl-node-${CSS.escape ? CSS.escape(targetId) : targetId}`);
      rowEl?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  customStage.addEventListener("click", onStageClick);
  customStage._galleryRoomCleanup = () => {
    customStage.removeEventListener("click", onStageClick);
  };
}

/**
 * Draws strictly monochrome Klein-Blue (#0a1890) & Crisp White (#ffffff) Copperplate Plates for the 6 Cinema Movements.
 */
function drawCinemaMovementPlate(ctx2d, w, h, movIdx, localProgress, timeSec) {
  ctx2d.save();
  // Pure Klein-Blue Copperplate Plate Background (#0a1890)
  ctx2d.fillStyle = "#0a1890";
  ctx2d.fillRect(0, 0, w, h);

  const cx = w * 0.5;
  const cy = h * 0.5;
  const R = Math.min(w, h) * 0.36;

  // Outer Copperplate Inset Hairline Frame
  ctx2d.strokeStyle = "rgba(255, 255, 255, 0.32)";
  ctx2d.lineWidth = 1;
  ctx2d.strokeRect(14, 14, w - 28, h - 28);
  ctx2d.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx2d.strokeRect(19, 19, w - 38, h - 38);

  // Subtle horizontal engraving lines (strictly inside illustration canvas, never over HTML text)
  ctx2d.strokeStyle = "rgba(255, 255, 255, 0.035)";
  ctx2d.lineWidth = 1;
  for (let y = 22; y < h - 22; y += 4) {
    ctx2d.beginPath();
    ctx2d.moveTo(20, y);
    ctx2d.lineTo(w - 20, y);
    ctx2d.stroke();
  }

  ctx2d.translate(cx, cy);

  if (movIdx === 0) {
    // Movement I: Tabula Smaragdina & Seven Chaldean Spheres + Broken Yuggoth Outer Ring
    for (let i = 0; i < 7; i++) {
      const rad = R * (0.24 + i * 0.105);
      ctx2d.strokeStyle = `rgba(255, 255, 255, ${0.22 + i * 0.06})`;
      ctx2d.lineWidth = i === 3 ? 1.6 : 1;
      ctx2d.setLineDash([]);
      ctx2d.beginPath();
      ctx2d.arc(0, 0, rad, 0, Math.PI * 2);
      ctx2d.stroke();

      const ang = timeSec * (0.45 - i * 0.045) + i * 0.92;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      ctx2d.fillStyle = "#ffffff";
      ctx2d.beginPath();
      ctx2d.arc(px, py, i === 3 ? 4.2 : 2.8, 0, Math.PI * 2);
      ctx2d.fill();
    }
    // Outer Broken Dashed Ring: YVGGOTH
    const yugRad = R * 1.06;
    ctx2d.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx2d.lineWidth = 1.1;
    ctx2d.setLineDash([7, 9]);
    ctx2d.beginPath();
    ctx2d.arc(0, 0, yugRad, -2.5, 2.2);
    ctx2d.stroke();
    ctx2d.setLineDash([]);

    // Sacred Interlocking Triangles
    ctx2d.rotate(timeSec * 0.08);
    ctx2d.strokeStyle = "rgba(255, 255, 255, 0.78)";
    ctx2d.lineWidth = 1.3;
    for (const dir of [1, -1]) {
      ctx2d.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI * 2) / 3 - (Math.PI * 0.5 * dir);
        const vx = Math.cos(a) * R * 0.56;
        const vy = Math.sin(a) * R * 0.56;
        if (k === 0) ctx2d.moveTo(vx, vy);
        else ctx2d.lineTo(vx, vy);
      }
      ctx2d.closePath();
      ctx2d.stroke();
    }
  } else if (movIdx === 1) {
    // Movement II: R'lyeh Non-Euclidean Monoliths & 17Hz Sonar Rings
    for (let k = 0; k < 5; k++) {
      const waveR = (((timeSec * 0.38 + k * 0.2) % 1) * R) * 1.18;
      const alpha = (1 - waveR / (R * 1.18)) * 0.55;
      ctx2d.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
      ctx2d.lineWidth = 1.2;
      ctx2d.beginPath();
      ctx2d.arc(0, -R * 0.08, waveR, 0, Math.PI * 2);
      ctx2d.stroke();
    }
    // Non-Euclidean Stepped Spires
    const blocks = [
      [-R * 0.72, R * 0.55, R * 0.26, R * 0.62],
      [-R * 0.42, R * 0.55, R * 0.28, R * 0.96],
      [-R * 0.12, R * 0.55, R * 0.24, R * 1.22],
      [R * 0.16, R * 0.55, R * 0.30, R * 0.88],
      [R * 0.48, R * 0.55, R * 0.24, R * 0.58],
    ];
    ctx2d.strokeStyle = "#ffffff";
    ctx2d.lineWidth = 1.3;
    for (const [bx, by, bw, bh] of blocks) {
      ctx2d.fillStyle = "#0a1890";
      ctx2d.fillRect(bx, by - bh, bw, bh);
      ctx2d.strokeRect(bx, by - bh, bw, bh);
      // Hatching lines
      ctx2d.strokeStyle = "rgba(255, 255, 255, 0.28)";
      for (let hy = by - bh + 8; hy < by; hy += 8) {
        ctx2d.beginPath();
        ctx2d.moveTo(bx + 3, hy);
        ctx2d.lineTo(bx + bw - 3, hy);
        ctx2d.stroke();
      }
      ctx2d.strokeStyle = "#ffffff";
    }
  } else if (movIdx === 2) {
    // Movement III: Gate Guardian Four-Winged Radiant Geometry & Two Rivers
    // Radiant Halo
    for (let r = 0; r < 24; r++) {
      const ang = (r / 24) * Math.PI * 2 + timeSec * 0.06;
      ctx2d.strokeStyle = r % 2 === 0 ? "rgba(255,255,255,0.52)" : "rgba(255,255,255,0.22)";
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.moveTo(Math.cos(ang) * R * 0.22, Math.sin(ang) * R * 0.22 - R * 0.1);
      ctx2d.lineTo(Math.cos(ang) * R * 0.92, Math.sin(ang) * R * 0.92 - R * 0.1);
      ctx2d.stroke();
    }
    // Four Wings Arcs
    ctx2d.strokeStyle = "#ffffff";
    ctx2d.lineWidth = 1.6;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        ctx2d.beginPath();
        ctx2d.moveTo(0, -R * 0.1);
        ctx2d.quadraticCurveTo(sx * R * 0.78, sy * R * 0.56 - R * 0.1, sx * R * 0.95, sy * R * 0.12 - R * 0.1);
        ctx2d.stroke();
      }
    }
    // Central Vertical Flame Sword Axis
    ctx2d.lineWidth = 2.2;
    ctx2d.beginPath();
    ctx2d.moveTo(0, -R * 0.88);
    ctx2d.lineTo(0, R * 0.78);
    ctx2d.moveTo(-R * 0.22, -R * 0.1);
    ctx2d.lineTo(R * 0.22, -R * 0.1);
    ctx2d.stroke();
  } else if (movIdx === 3) {
    // Movement IV: Three-Tiered Pharos of Alexandria & Rotating Lighthouse Beam
    const beamAng = Math.sin(timeSec * 0.9) * 0.42;
    ctx2d.fillStyle = "rgba(255, 255, 255, 0.11)";
    ctx2d.beginPath();
    ctx2d.moveTo(0, -R * 0.62);
    ctx2d.lineTo(-R * 1.35, -R * 0.62 + Math.tan(beamAng - 0.16) * R * 1.35);
    ctx2d.lineTo(-R * 1.35, -R * 0.62 + Math.tan(beamAng + 0.16) * R * 1.35);
    ctx2d.closePath();
    ctx2d.fill();

    ctx2d.beginPath();
    ctx2d.moveTo(0, -R * 0.62);
    ctx2d.lineTo(R * 1.35, -R * 0.62 - Math.tan(beamAng - 0.16) * R * 1.35);
    ctx2d.lineTo(R * 1.35, -R * 0.62 - Math.tan(beamAng + 0.16) * R * 1.35);
    ctx2d.closePath();
    ctx2d.fill();

    // Three-Tiered Lighthouse Structure
    ctx2d.strokeStyle = "#ffffff";
    ctx2d.lineWidth = 1.5;
    // Tier 1 (Square base)
    ctx2d.strokeRect(-R * 0.26, R * 0.05, R * 0.52, R * 0.52);
    // Tier 2 (Octagonal middle)
    ctx2d.strokeRect(-R * 0.18, -R * 0.36, R * 0.36, R * 0.41);
    // Tier 3 (Lantern cupola)
    ctx2d.strokeRect(-R * 0.10, -R * 0.66, R * 0.20, R * 0.30);
    ctx2d.beginPath();
    ctx2d.arc(0, -R * 0.66, R * 0.10, Math.PI, 0);
    ctx2d.stroke();
    // Harbor water lines
    for (let wy = 0; wy < 4; wy++) {
      const y = R * 0.62 + wy * 9;
      ctx2d.strokeStyle = `rgba(255,255,255,${0.55 - wy * 0.11})`;
      ctx2d.beginPath();
      ctx2d.moveTo(-R * 1.1, y);
      ctx2d.lineTo(R * 1.1, y);
      ctx2d.stroke();
    }
  } else if (movIdx === 4) {
    // Movement V: Eight-Fold Pantheon Copperplate Rose Wheel
    ctx2d.rotate(timeSec * 0.12);
    ctx2d.strokeStyle = "#ffffff";
    ctx2d.lineWidth = 1.4;
    ctx2d.beginPath();
    ctx2d.arc(0, 0, R * 0.92, 0, Math.PI * 2);
    ctx2d.arc(0, 0, R * 0.76, 0, Math.PI * 2);
    ctx2d.arc(0, 0, R * 0.26, 0, Math.PI * 2);
    ctx2d.stroke();

    // 8-Pointed Star Octagram ({8/3})
    ctx2d.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx2d.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = ((i * 3) % 8) * (Math.PI / 4);
      const px = Math.cos(a) * R * 0.76;
      const py = Math.sin(a) * R * 0.76;
      if (i === 0) ctx2d.moveTo(px, py);
      else ctx2d.lineTo(px, py);
    }
    ctx2d.stroke();

    for (let i = 0; i < 8; i++) {
      const a = i * (Math.PI / 4);
      const mx = Math.cos(a) * R * 0.84;
      const my = Math.sin(a) * R * 0.84;
      ctx2d.fillStyle = "#ffffff";
      ctx2d.beginPath();
      ctx2d.arc(mx, my, 3.2, 0, Math.PI * 2);
      ctx2d.fill();
    }
  } else {
    // Movement VI: Seal of Theologia Caerulea & Seventh Chain Containment Ring
    ctx2d.strokeStyle = "#ffffff";
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.arc(0, 0, R * 0.88, 0, Math.PI * 2);
    ctx2d.stroke();

    // Seven Pillars & 6 Broken Chains + 1 Intact Seventh Chain
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 - Math.PI * 0.5;
      const px = Math.cos(a) * R * 0.78;
      const py = Math.sin(a) * R * 0.78;
      const intact = i === 0;
      ctx2d.strokeStyle = intact ? "#ffffff" : "rgba(255, 255, 255, 0.36)";
      ctx2d.lineWidth = intact ? 2.2 : 1.1;
      ctx2d.setLineDash(intact ? [] : [4, 5]);
      ctx2d.beginPath();
      ctx2d.moveTo(px, py);
      ctx2d.lineTo(0, 0);
      ctx2d.stroke();
      ctx2d.setLineDash([]);

      ctx2d.fillStyle = intact ? "#ffffff" : "#0a1890";
      ctx2d.strokeStyle = "#ffffff";
      ctx2d.lineWidth = 1.4;
      ctx2d.beginPath();
      ctx2d.arc(px, py, 6, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.stroke();
    }
    const pulse = 1 + Math.sin(timeSec * 2.4) * 0.06;
    ctx2d.fillStyle = "#0a1890";
    ctx2d.strokeStyle = "#ffffff";
    ctx2d.lineWidth = 1.8;
    ctx2d.beginPath();
    ctx2d.arc(0, 0, R * 0.22 * pulse, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.stroke();
  }

  // Movement Progress Hairline at bottom of copperplate frame
  ctx2d.restore();
  ctx2d.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx2d.fillRect(20, h - 20, Math.max(0, (w - 40) * localProgress), 2);
}

function formatSec(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/**
 * Room 4: Curated 6-Movement Automated Audio-Visual Screening Room (#/gallery/cinema)
 */
function renderCinemaRoom(customStage, roomParam, ctx) {
  stopCinemaRoom();
  ctx?.stopLegacyCinema?.();

  const stagePantheon = document.getElementById("stage-pantheon");
  if (stagePantheon) stagePantheon.classList.remove("open");
  setLegacyAstrolabeDomVisible(false);

  customStage.style.display = "";
  customStage.classList.add("open");

  const totalDuration = CINEMA_MOVEMENTS.reduce((acc, m) => acc + m.durationSec, 0);
  let initMov = parseInt(roomParam, 10);
  if (Number.isNaN(initMov) || initMov < 0 || initMov >= CINEMA_MOVEMENTS.length) {
    initMov = 0;
  }

  let isPlaying = true;
  let elapsedSec = initMov * 8;
  let currentMovIdx = -1;
  let droneOn = false;
  let audioCtx = null;
  let droneGain = null;
  let droneOscs = [];
  let rafId = null;
  let lastFrameTs = performance.now();

  customStage.innerHTML = `
    <div class="p3-shell gallery-room-shell cinema-shell">
      <header class="cinema-top-header">
        <div>
          <div class="lapidary-serif">ASCENDIT A TERRA IN CAELVM · ITERVMQVE DESCENDIT IN TERRAM</div>
          <h1 class="condensed-monument p3-page-title">蓝色神学 · 六幕铜版视听巡礼</h1>
        </div>
        <div class="cinema-transport-bar" role="toolbar" aria-label="放映控制栏">
          <button type="button" id="cinema-btn-play" class="bp-btn active" data-cinema-cmd="play-pause">暂停放映</button>
          <button type="button" id="cinema-btn-stop" class="bp-btn" data-cinema-cmd="stop">停止重置</button>
          <button type="button" id="cinema-btn-drone" class="bp-btn" data-cinema-cmd="drone">圣咏声景: 关</button>
        </div>
      </header>

      <!-- Copperplate Screening Stage + Side/Bottom Movement Plate -->
      <div class="cinema-stage-grid">
        <div class="cinema-canvas-frame">
          <canvas id="cinema-plate-canvas" width="760" height="440"></canvas>
        </div>

        <aside class="cinema-caption-panel">
          <div id="cinema-mov-latin" class="lapidary-serif"></div>
          <div class="novel-badge-row">
            <span id="cinema-mov-badge" class="badge-canon"></span>
            <span id="cinema-time-readout" class="novel-stat-pill">00:00 / 00:48</span>
          </div>
          <h2 id="cinema-mov-title" class="condensed-monument cinema-mov-title"></h2>
          <p id="cinema-mov-desc" class="prose-read cinema-mov-desc"></p>
          <div id="cinema-mov-links" class="cinema-mov-links"></div>
        </aside>
      </div>

      <!-- Seekable Progress Timeline -->
      <div class="cinema-timeline-wrap">
        <div id="cinema-progress-track" class="cinema-progress-track" role="slider" tabindex="0" aria-label="巡礼总进度条" aria-valuemin="0" aria-valuemax="${totalDuration}" aria-valuenow="0">
          <div id="cinema-progress-fill" class="cinema-progress-fill" style="width:0%;"></div>
        </div>
      </div>

      <!-- 6 Movement Jump Buttons -->
      <div class="cinema-chapters-grid" role="tablist" aria-label="六幕章节切换">
        ${CINEMA_MOVEMENTS.map(
          (m) => `
            <button type="button" class="cinema-chapter-btn" data-cinema-jump="${m.idx}">
              <span class="cinema-chap-roman">${m.roman}</span>
              <span class="cinema-chap-name">${escapeHtml(m.title)}</span>
            </button>
          `
        ).join("")}
      </div>

      <footer class="cc-footer">
        放映室图形完全由本地双色铜版几何算法实时绘制，声景由浏览器 WebAudio 合成器生成，无需外部流媒体资源。全馆内容遵循 CC BY-SA 3.0 协议。
      </footer>
    </div>
  `;

  const canvas = customStage.querySelector("#cinema-plate-canvas");
  const ctx2d = canvas ? canvas.getContext("2d") : null;
  const playBtn = customStage.querySelector("#cinema-btn-play");
  const droneBtn = customStage.querySelector("#cinema-btn-drone");
  const latinEl = customStage.querySelector("#cinema-mov-latin");
  const badgeEl = customStage.querySelector("#cinema-mov-badge");
  const timeEl = customStage.querySelector("#cinema-time-readout");
  const titleEl = customStage.querySelector("#cinema-mov-title");
  const descEl = customStage.querySelector("#cinema-mov-desc");
  const linksEl = customStage.querySelector("#cinema-mov-links");
  const progTrack = customStage.querySelector("#cinema-progress-track");
  const progFill = customStage.querySelector("#cinema-progress-fill");

  function syncCanvasSize() {
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(300, Math.floor(rect.width * dpr));
    const h = Math.max(220, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  syncCanvasSize();
  window.addEventListener("resize", syncCanvasSize);

  function updateDroneHarmony(baseFreq) {
    if (!audioCtx || !droneOscs.length) return;
    const now = audioCtx.currentTime;
    const ratios = [0.5, 1, 1.5, 2];
    droneOscs.forEach((osc, i) => {
      osc.frequency.setTargetAtTime(baseFreq * (ratios[i] || 1), now, 0.45);
    });
  }

  function toggleWebAudioDrone(forceOff = false) {
    if (forceOff) {
      droneOn = false;
      if (droneGain && audioCtx) {
        try {
          droneGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.15);
        } catch (_) {}
      }
      if (droneBtn) {
        droneBtn.classList.remove("active");
        droneBtn.textContent = "圣咏声景: 关";
      }
      return;
    }

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    if (!audioCtx) {
      audioCtx = new AC();
      droneGain = audioCtx.createGain();
      droneGain.gain.value = 0;
      const filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 420;
      filter.connect(droneGain);
      droneGain.connect(audioCtx.destination);

      const base = CINEMA_MOVEMENTS[Math.max(0, currentMovIdx)]?.freqBase || 110;
      [0.5, 1, 1.5, 2].forEach((mult, idx) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = idx % 2 === 0 ? "sine" : "triangle";
        osc.frequency.value = base * mult;
        g.gain.value = idx === 0 ? 0.26 : 0.11;
        osc.connect(g);
        g.connect(filter);
        osc.start();
        droneOscs.push(osc);
      });
    }

    droneOn = !droneOn;
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    droneGain.gain.setTargetAtTime(droneOn ? 0.14 : 0, audioCtx.currentTime, 0.28);
    if (droneBtn) {
      droneBtn.classList.toggle("active", droneOn);
      droneBtn.textContent = droneOn ? "圣咏声景: 开" : "圣咏声景: 关";
    }
  }

  function destroyAudio() {
    if (audioCtx) {
      try {
        droneOscs.forEach((o) => o.stop());
      } catch (_) {}
      try {
        audioCtx.close();
      } catch (_) {}
      audioCtx = null;
      droneGain = null;
      droneOscs = [];
    }
  }

  function applyMovementUi(movIdx) {
    if (movIdx === currentMovIdx) return;
    currentMovIdx = movIdx;
    const m = CINEMA_MOVEMENTS[movIdx] || CINEMA_MOVEMENTS[0];
    if (latinEl) latinEl.textContent = m.latin;
    if (badgeEl) badgeEl.textContent = `ACTVS ${m.roman} / VI`;
    if (titleEl) titleEl.textContent = m.title;
    if (descEl) descEl.textContent = m.caption;
    if (linksEl) {
      linksEl.innerHTML = m.links
        .map((lk, i) => `<a class="bp-btn ${i === 0 ? "active" : ""}" href="${lk.href}">${escapeHtml(lk.label)}</a>`)
        .join("");
    }
    customStage.querySelectorAll("[data-cinema-jump]").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.getAttribute("data-cinema-jump")) === movIdx);
    });
    updateDroneHarmony(m.freqBase);
  }

  function renderFrame(nowTs) {
    const dt = Math.min(0.1, Math.max(0, (nowTs - lastFrameTs) / 1000));
    lastFrameTs = nowTs;

    if (isPlaying) {
      elapsedSec += dt;
      if (elapsedSec >= totalDuration) {
        elapsedSec = 0;
      }
    }

    const movIdx = Math.min(
      CINEMA_MOVEMENTS.length - 1,
      Math.floor(elapsedSec / 8)
    );
    const localProgress = (elapsedSec - movIdx * 8) / 8;
    applyMovementUi(movIdx);

    const overallPct = Math.max(0, Math.min(100, (elapsedSec / totalDuration) * 100));
    if (progFill) progFill.style.width = `${overallPct.toFixed(2)}%`;
    if (progTrack) progTrack.setAttribute("aria-valuenow", String(Math.round(elapsedSec)));
    if (timeEl) timeEl.textContent = `${formatSec(elapsedSec)} / ${formatSec(totalDuration)}`;

    if (ctx2d && canvas) {
      drawCinemaMovementPlate(ctx2d, canvas.width, canvas.height, movIdx, localProgress, nowTs / 1000);
    }

    rafId = requestAnimationFrame(renderFrame);
  }

  const syncPlayBtnLabel = () => {
    if (!playBtn) return;
    playBtn.textContent = isPlaying ? "暂停放映" : "继续播放";
    playBtn.classList.toggle("active", isPlaying);
  };

  const onCinemaClick = (e) => {
    const cmdBtn = e.target.closest("[data-cinema-cmd]");
    if (cmdBtn) {
      const cmd = cmdBtn.getAttribute("data-cinema-cmd");
      if (cmd === "play-pause") {
        isPlaying = !isPlaying;
        syncPlayBtnLabel();
      } else if (cmd === "stop") {
        isPlaying = false;
        elapsedSec = 0;
        applyMovementUi(0);
        syncPlayBtnLabel();
        toggleWebAudioDrone(true);
      } else if (cmd === "drone") {
        toggleWebAudioDrone(false);
      }
      return;
    }

    const jumpBtn = e.target.closest("[data-cinema-jump]");
    if (jumpBtn) {
      const idx = Number(jumpBtn.getAttribute("data-cinema-jump")) || 0;
      elapsedSec = idx * 8;
      applyMovementUi(idx);
      return;
    }

    const track = e.target.closest("#cinema-progress-track");
    if (track) {
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      elapsedSec = ratio * totalDuration;
    }
  };

  customStage.addEventListener("click", onCinemaClick);
  rafId = requestAnimationFrame(renderFrame);

  activeCinemaCleanup = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    window.removeEventListener("resize", syncCanvasSize);
    customStage.removeEventListener("click", onCinemaClick);
    destroyAudio();
  };
  customStage._galleryRoomCleanup = activeCinemaCleanup;
}

export async function renderGalleryView(rootEl, subRoute, ctx) {
  const cleanSub = String(subRoute || "")
    .split("?")[0]
    .replace(/^\/+|\/+$/g, "")
    .trim();
  const segments = cleanSub ? cleanSub.split("/").filter(Boolean) : [];
  const rawRoom = (segments[0] || "astrolabe").toLowerCase();
  const room = ["astrolabe", "pantheon", "timeline", "cinema"].includes(rawRoom)
    ? rawRoom
    : "astrolabe";
  const roomParam = segments[1] || "";

  ensureGallerySubnav(room);
  const customStage = getDedicatedGalleryStage(rootEl);

  if (room !== "cinema") {
    stopCinemaRoom();
    ctx?.stopLegacyCinema?.();
  }

  // Room 1: Theological Astrolabe (#/gallery or #/gallery/astrolabe)
  if (room === "astrolabe") {
    if (customStage) {
      customStage.classList.remove("open");
      customStage.style.display = "none";
      customStage.innerHTML = "";
    }
    const stagePantheon = document.getElementById("stage-pantheon");
    if (stagePantheon) stagePantheon.classList.remove("open");

    if (ctx?.activateAstrolabe) {
      await ctx.activateAstrolabe(roomParam || undefined, undefined);
    } else if (typeof window.switchLiber === "function") {
      window.switchLiber("gallery", true);
    }
    setLegacyAstrolabeDomVisible(true);
    return;
  }

  // Room 2: Copperplate Pantheon Gallery (#/gallery/pantheon & #/pantheon)
  if (room === "pantheon") {
    await renderPantheonRoom(customStage, roomParam, ctx);
    return;
  }

  // Room 3: Cross-Canon Chronological Timeline (#/gallery/timeline & #/timeline)
  if (room === "timeline") {
    await renderTimelineRoom(customStage, roomParam, ctx);
    return;
  }

  // Room 4: 6-Movement Automated Screening Room (#/gallery/cinema)
  await renderCinemaRoom(customStage, roomParam, ctx);
}
