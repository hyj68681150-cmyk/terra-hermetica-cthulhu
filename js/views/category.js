/**
 * js/views/category.js
 * 7-Category Archival Directory (#/category/<cat>)
 * Supports: entities | scp | sites | goi | timeline | codices | novels
 */

import { escapeHtml } from "../sanitize.js";
import { ARCHIVE_CATEGORIES } from "./home.js";

const VALID_CAT_SLUGS = new Set(ARCHIVE_CATEGORIES.map((c) => c.slug));

const PROVENANCE_FILTERS = [
  { value: "all", label: "全部" },
  { value: "scp-canon", label: "SCP原典" },
  { value: "cthulhu-canon", label: "克苏鲁原典" },
  { value: "original", label: "本站原创设定" },
];

const CLEARANCE_FILTERS = [
  { value: "all", label: "全部等级" },
  { value: "1", label: "Lv.1" },
  { value: "2", label: "Lv.2" },
  { value: "3", label: "Lv.3+" },
];

function getBadgeMeta(provenance, provenanceLabel) {
  if (provenance === "original") {
    return { cls: "badge-original", text: provenanceLabel || "本站设定" };
  }
  if (provenance === "cthulhu-canon") {
    return { cls: "badge-canon", text: provenanceLabel || "克苏鲁原典" };
  }
  return { cls: "badge-canon", text: provenanceLabel || "SCP原典" };
}

const KNOWN_MAP_SITE_IDS = new Set([
  "site-rlyeh",
  "site-alexandria",
  "site-2000",
  "site-001",
  "site-prague",
  "site-13",
  "site-cairo",
  "site-antarctica",
  "site-penglai",
  "site-baikal",
  "site-arkham",
  "site-innsmouth",
  "site-leng",
  "site-3000-bengal",
]);

export function buildEntryMapHref(item) {
  if (!item) return "";
  if (item.geo && typeof item.geo.lat === "number" && typeof item.geo.lon === "number") {
    if (KNOWN_MAP_SITE_IDS.has(item.id)) {
      return `#/map/${encodeURIComponent(item.id)}`;
    }
    const z =
      item.geo.precision === "exact" ? 12 : item.geo.precision === "city" ? 10 : 7;
    return `#/map/@${item.geo.lat},${item.geo.lon},${z}z?site=${encodeURIComponent(item.id)}`;
  }
  if (item.mapSiteId) {
    return `#/map/${encodeURIComponent(item.mapSiteId)}`;
  }
  return "";
}

function formatEntryCoord(geo) {
  if (!geo || typeof geo.lat !== "number" || typeof geo.lon !== "number") {
    return "";
  }
  const digits = geo.precision === "exact" ? 4 : 1;
  const ns = geo.lat >= 0 ? "N" : "S";
  const ew = geo.lon >= 0 ? "E" : "W";
  return `${Math.abs(geo.lat).toFixed(digits)}°${ns}, ${Math.abs(geo.lon).toFixed(digits)}°${ew}`;
}

function parseQuery(queryParams) {
  if (!queryParams) return new URLSearchParams();
  if (queryParams instanceof URLSearchParams) return queryParams;
  if (typeof queryParams === "string") {
    return new URLSearchParams(queryParams.replace(/^\?/, ""));
  }
  if (typeof queryParams === "object") {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(queryParams)) {
      if (v !== undefined && v !== null) sp.set(k, String(v));
    }
    return sp;
  }
  return new URLSearchParams();
}

function matchesClearanceFilter(itemLv, filterVal) {
  const lv = Math.max(1, Number(itemLv) || 1);
  if (filterVal === "all") return true;
  if (filterVal === "1") return lv === 1;
  if (filterVal === "2") return lv === 2;
  if (filterVal === "3") return lv >= 3;
  return true;
}

function matchesKeyword(item, kwLower) {
  if (!kwLower) return true;
  const hay = [
    item.id || "",
    item.bookId || "",
    item.code || "",
    item.title || "",
    item.eraLabel || "",
    item.summary || "",
    ...(Array.isArray(item.aliases) ? item.aliases : []),
    ...(Array.isArray(item.chapters) ? item.chapters.map((c) => c.title || "") : []),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(kwLower);
}

export async function renderCategoryView(rootEl, catSlug, queryParams, ctx) {
  if (!rootEl) return;

  // Support both (rootEl, catSlug, queryParams, ctx) and 3-arg (rootEl, catSlug, ctx)
  if (queryParams && typeof queryParams.getManifest === "function" && !ctx) {
    ctx = queryParams;
    queryParams = "";
  }

  if (typeof rootEl.__wikiCleanup === "function") {
    rootEl.__wikiCleanup();
    rootEl.__wikiCleanup = null;
  }

  let rawCat = String(catSlug || "").trim();
  let extraQuery = "";
  const qPos = rawCat.indexOf("?");
  if (qPos >= 0) {
    extraQuery = rawCat.slice(qPos + 1);
    rawCat = rawCat.slice(0, qPos);
  }
  const cleanCat = rawCat.toLowerCase();
  const activeCat = VALID_CAT_SLUGS.has(cleanCat) ? cleanCat : "scp";

  const sp = parseQuery(queryParams || extraQuery);
  const filterState = {
    prov: PROVENANCE_FILTERS.some((p) => p.value === sp.get("prov"))
      ? sp.get("prov")
      : "all",
    clv: CLEARANCE_FILTERS.some((c) => c.value === sp.get("lv"))
      ? sp.get("lv")
      : "all",
    kw: String(sp.get("q") || sp.get("kw") || "").trim(),
  };

  const manifest = await ctx.getManifest();
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const novels = Array.isArray(manifest?.novels) ? manifest.novels : [];

  const catCounts = {};
  for (const c of ARCHIVE_CATEGORIES) catCounts[c.slug] = 0;
  for (const e of entries) {
    if (catCounts[e.category] !== undefined) catCounts[e.category]++;
  }
  catCounts.novels = novels.length;

  const activeMeta =
    ARCHIVE_CATEGORIES.find((c) => c.slug === activeCat) || ARCHIVE_CATEGORIES[1];

  const tabsHtml = ARCHIVE_CATEGORIES.map((c) => {
    const isAct = c.slug === activeCat;
    const count = catCounts[c.slug] || 0;
    return `
      <a
        href="#/category/${encodeURIComponent(c.slug)}"
        class="wiki-cat-tab ${isAct ? "active" : ""}"
        aria-current="${isAct ? "page" : "false"}"
      >
        <span class="wiki-tab-glyph" aria-hidden="true">${c.glyph}</span>
        <span>${escapeHtml(c.title)}</span>
        <span class="wiki-tab-num">(${count})</span>
      </a>
    `;
  }).join("");

  rootEl.innerHTML = `
    <div class="wiki-page wiki-category-page">
      <nav class="wiki-breadcrumb" aria-label="面包屑导航">
        <a href="#/">档案馆大厅</a>
        <span class="wiki-bc-sep">/</span>
        <span>${escapeHtml(activeMeta.title)}</span>
      </nav>

      <header class="wiki-cat-header">
        <div class="lapidary-serif">${escapeHtml(activeMeta.latin)}</div>
        <h1 class="wiki-cat-page-title">
          <span aria-hidden="true">${activeMeta.glyph}</span>
          ${escapeHtml(activeMeta.title)}
        </h1>
        <p class="wiki-cat-page-desc">${escapeHtml(activeMeta.desc)}</p>
      </header>

      <nav class="wiki-cat-switcher no-scrollbar" aria-label="馆藏七大分类切换">
        ${tabsHtml}
      </nav>

      <section class="wiki-filter-bar" aria-label="卷宗筛选栏">
        <div class="wiki-filter-group">
          <span class="wiki-filter-label">文献出处：</span>
          <div class="wiki-filter-pills" data-role="prov-pills">
            ${PROVENANCE_FILTERS.map(
              (f) =>
                `<button type="button" class="bp-btn ${filterState.prov === f.value ? "active" : ""}" data-prov="${escapeHtml(f.value)}">${escapeHtml(f.label)}</button>`
            ).join("")}
          </div>
        </div>

        <div class="wiki-filter-group">
          <span class="wiki-filter-label">权限等级：</span>
          <div class="wiki-filter-pills" data-role="clv-pills">
            ${CLEARANCE_FILTERS.map(
              (f) =>
                `<button type="button" class="bp-btn ${filterState.clv === f.value ? "active" : ""}" data-clv="${escapeHtml(f.value)}">${escapeHtml(f.label)}</button>`
            ).join("")}
          </div>
        </div>

        <div class="wiki-filter-kw-wrap">
          <input
            type="search"
            class="wiki-filter-kw-input"
            data-role="cat-kw-input"
            value="${escapeHtml(filterState.kw)}"
            placeholder="在“${escapeHtml(activeMeta.title)}”中即时筛选编号、标题或关键词..."
            aria-label="分类内关键词筛选"
          />
          <span class="wiki-filter-stat" data-role="cat-result-stat"></span>
        </div>
      </section>

      <section class="wiki-cat-results-host" data-role="cat-results-host"></section>

      <footer class="cc-footer">
        版权声明：实心“原典”徽章词条基于 <a href="https://scp-wiki.wikidot.com/" target="_blank" rel="noopener">SCP Foundation Wiki</a>、<a href="https://scp-wiki-cn.wikidot.com/" target="_blank" rel="noopener">SCP中文维基</a>（<a href="https://creativecommons.org/licenses/by-sa/3.0/deed.zh-hans" target="_blank" rel="noopener">CC BY-SA 3.0</a>）及洛夫克拉夫特公有领域作品；线框“本站设定”词条为本站原创衍生（CC BY-SA 3.0）。本站为虚构创作作品，地点与真实机构无关。
      </footer>
    </div>
  `;

  const resultsHost = rootEl.querySelector('[data-role="cat-results-host"]');
  const statEl = rootEl.querySelector('[data-role="cat-result-stat"]');
  const kwInput = rootEl.querySelector('[data-role="cat-kw-input"]');

  const renderResults = () => {
    if (!resultsHost) return;
    const clState = ctx.clearance.getClearanceState();
    const kwLower = filterState.kw.trim().toLowerCase();

    if (activeCat === "novels") {
      const filteredNovels = novels.filter((book) => {
        if (filterState.prov !== "all" && book.provenance !== filterState.prov) {
          return false;
        }
        if (!matchesClearanceFilter(book.clearance || 1, filterState.clv)) {
          return false;
        }
        return matchesKeyword(book, kwLower);
      });

      if (statEl) {
        statEl.textContent = `显示 ${filteredNovels.length} / ${novels.length} 部`;
      }

      if (filteredNovels.length === 0) {
        resultsHost.innerHTML = `
          <div class="wiki-empty-box">
            <h2 class="wiki-empty-title">当前筛选条件下无匹配连载小说</h2>
            <p class="wiki-empty-desc">请尝试切换文献出处、权限等级或清空筛选关键词。</p>
            <button type="button" class="bp-btn active" data-action="reset-filters">重置全部筛选条件</button>
          </div>
        `;
        return;
      }

      resultsHost.innerHTML = `
        <div class="wiki-novel-dir-list">
          ${filteredNovels
            .map((book) => {
              const badge = getBadgeMeta(book.provenance, book.provenanceLabel);
              const chapters = Array.isArray(book.chapters) ? book.chapters : [];
              return `
                <article class="wiki-novel-book-card">
                  <div class="wiki-dossier-top">
                    <span class="wiki-dossier-code">LIBER · ${escapeHtml(book.bookId.toUpperCase())}</span>
                    <div class="wiki-dossier-badges">
                      <span class="${badge.cls}">${escapeHtml(badge.text)}</span>
                      <span class="wiki-lv-pill">共 ${chapters.length} 章</span>
                    </div>
                  </div>
                  <h2 class="wiki-novel-book-title">
                    <a href="#/novel/${encodeURIComponent(book.bookId)}">${escapeHtml(book.title)}</a>
                  </h2>
                  <p class="wiki-dossier-summary">${escapeHtml(book.summary || "")}</p>
                  <div class="wiki-novel-ch-grid">
                    ${chapters
                      .map((ch) => {
                        const metaParts = [];
                        if (ch.estimatedMinutes) {
                          metaParts.push(`约 ${ch.estimatedMinutes} 分钟`);
                        } else if (ch.charCount) {
                          metaParts.push(`${ch.charCount} 字`);
                        }
                        if (ch.clueId) {
                          metaParts.push(`含现场线索`);
                        }
                        return `
                          <a class="wiki-novel-ch-card" href="#/novel/${encodeURIComponent(book.bookId)}/${encodeURIComponent(ch.id)}">
                            <div class="wiki-novel-ch-num">CH.0${Number(ch.chapterNumber) || 1}</div>
                            <div class="wiki-novel-ch-main">
                              <div class="wiki-novel-ch-title">${escapeHtml(ch.title)}</div>
                              <div class="wiki-novel-ch-meta">${escapeHtml(metaParts.join(" · "))}</div>
                            </div>
                            <span class="wiki-ch-arrow">阅读 →</span>
                          </a>
                        `;
                      })
                      .join("")}
                  </div>
                  <div class="wiki-dossier-actions">
                    <a class="bp-btn active" href="#/novel/${encodeURIComponent(book.bookId)}">进入整卷阅读器 →</a>
                  </div>
                </article>
              `;
            })
            .join("")}
        </div>
      `;
      return;
    }

    const basePool = entries.filter((e) => e.category === activeCat);
    const filtered = basePool.filter((item) => {
      if (filterState.prov !== "all" && item.provenance !== filterState.prov) {
        return false;
      }
      if (!matchesClearanceFilter(item.clearance || 1, filterState.clv)) {
        return false;
      }
      return matchesKeyword(item, kwLower);
    });

    if (activeCat === "timeline") {
      filtered.sort(
        (a, b) =>
          (Number(a.yearSort) || 0) - (Number(b.yearSort) || 0) ||
          String(a.id).localeCompare(String(b.id))
      );
    } else {
      filtered.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    }

    if (statEl) {
      statEl.textContent = `显示 ${filtered.length} / ${basePool.length} 卷`;
    }

    if (filtered.length === 0) {
      const hasAnyInCat = basePool.length > 0;
      resultsHost.innerHTML = `
        <div class="wiki-empty-box">
          <h2 class="wiki-empty-title">${
            hasAnyInCat
              ? "当前筛选条件下未匹配到卷宗"
              : `“${escapeHtml(activeMeta.title)}”分类暂无已归档卷宗`
          }</h2>
          <p class="wiki-empty-desc">${
            hasAnyInCat
              ? "可重置文献出处、权限等级或清空关键词重新检索。"
              : "您可先浏览其他分类或使用全站检索台查询关联记录。"
          }</p>
          ${
            hasAnyInCat
              ? `<button type="button" class="bp-btn active" data-action="reset-filters">重置全部筛选条件</button>`
              : `<a class="bp-btn active" href="#/category/scp">浏览收容档案 →</a>`
          }
        </div>
      `;
      return;
    }

    if (activeCat === "timeline") {
      resultsHost.innerHTML = `
        <div class="wiki-timeline-dir">
          ${filtered
            .map((item, idx) => {
              const badge = getBadgeMeta(item.provenance, item.provenanceLabel);
              const lv = Math.max(1, Number(item.clearance) || 1);
              const mapHref = buildEntryMapHref(item);
              const summaryHtml = ctx.autolink.renderProseWithLinks(item.summary || "", {
                autolinkIndex: [],
                excludeId: item.id,
                currentClearance: clState.level,
                redactPrefix: `tl-${item.id}`,
              });
              const eraText = item.eraLabel || item.code || `纪元节点 ${idx + 1}`;
              return `
                <article class="wiki-timeline-card">
                  <div class="wiki-timeline-era-col">
                    <span class="wiki-era-pill">${escapeHtml(eraText)}</span>
                    ${
                      item.code
                        ? `<span class="wiki-era-code">${escapeHtml(item.code)}</span>`
                        : ""
                    }
                  </div>
                  <div class="wiki-timeline-body-col">
                    <div class="wiki-dossier-top">
                      <span class="${badge.cls}">${escapeHtml(badge.text)}</span>
                      <span class="wiki-lv-pill">Lv.${lv}</span>
                    </div>
                    <h2 class="wiki-dossier-title">
                      <a href="#/entry/${encodeURIComponent(item.id)}" data-entry-preview="${escapeHtml(item.id)}">${escapeHtml(item.title)}</a>
                    </h2>
                    <p class="wiki-dossier-summary">${summaryHtml}</p>
                    <div class="wiki-dossier-actions">
                      <a class="bp-btn active" href="#/entry/${encodeURIComponent(item.id)}" data-entry-preview="${escapeHtml(item.id)}">查阅完整卷宗 →</a>
                      ${
                        mapHref
                          ? `<a class="bp-btn" href="${escapeHtml(mapHref)}">舆图定位 →</a>`
                          : ""
                      }
                    </div>
                  </div>
                </article>
              `;
            })
            .join("")}
        </div>
      `;
      return;
    }

    // Standard 2-column dossier grid for entities, scp, sites, goi, codices
    resultsHost.innerHTML = `
      <div class="wiki-dossier-grid">
        ${filtered
          .map((item) => {
            const badge = getBadgeMeta(item.provenance, item.provenanceLabel);
            const lv = Math.max(1, Number(item.clearance) || 1);
            const mapHref = buildEntryMapHref(item);
            const coordStr = formatEntryCoord(item.geo);
            const summaryHtml = ctx.autolink.renderProseWithLinks(item.summary || "", {
              autolinkIndex: [],
              excludeId: item.id,
              currentClearance: clState.level,
              redactPrefix: `cat-${item.id}`,
            });

            return `
              <article class="wiki-dossier-card">
                <div class="wiki-dossier-card-body">
                  <div class="wiki-dossier-top">
                    <span class="wiki-dossier-code">${escapeHtml(item.code || item.category.toUpperCase())}</span>
                    <div class="wiki-dossier-badges">
                      <span class="${badge.cls}">${escapeHtml(badge.text)}</span>
                      <span class="wiki-lv-pill">Lv.${lv}</span>
                    </div>
                  </div>
                  <h2 class="wiki-dossier-title">
                    <a href="#/entry/${encodeURIComponent(item.id)}" data-entry-preview="${escapeHtml(item.id)}">${escapeHtml(item.title)}</a>
                  </h2>
                  ${
                    coordStr
                      ? `<div class="wiki-dossier-coord">坐标：${escapeHtml(coordStr)}</div>`
                      : ""
                  }
                  <p class="wiki-dossier-summary">${summaryHtml}</p>
                </div>
                <div class="wiki-dossier-actions">
                  <a class="bp-btn active" href="#/entry/${encodeURIComponent(item.id)}" data-entry-preview="${escapeHtml(item.id)}">查阅完整卷宗 →</a>
                  ${
                    mapHref
                      ? `<a class="bp-btn" href="${escapeHtml(mapHref)}">舆图定位 →</a>`
                      : ""
                  }
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  };

  renderResults();

  const updatePillActiveStates = () => {
    rootEl.querySelectorAll("[data-prov]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.prov === filterState.prov);
    });
    rootEl.querySelectorAll("[data-clv]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.clv === filterState.clv);
    });
  };

  const onRootClick = (e) => {
    const provBtn = e.target.closest?.("[data-prov]");
    if (provBtn) {
      filterState.prov = provBtn.dataset.prov;
      updatePillActiveStates();
      renderResults();
      return;
    }

    const clvBtn = e.target.closest?.("[data-clv]");
    if (clvBtn) {
      filterState.clv = clvBtn.dataset.clv;
      updatePillActiveStates();
      renderResults();
      return;
    }

    const resetBtn = e.target.closest?.('[data-action="reset-filters"]');
    if (resetBtn) {
      filterState.prov = "all";
      filterState.clv = "all";
      filterState.kw = "";
      if (kwInput) kwInput.value = "";
      updatePillActiveStates();
      renderResults();
    }
  };

  const onKwInput = (e) => {
    filterState.kw = e.target.value;
    renderResults();
  };

  rootEl.addEventListener("click", onRootClick);
  kwInput?.addEventListener("input", onKwInput);

  const offClearance = ctx.clearance.onClearanceChange(() => {
    renderResults();
  });

  rootEl.__wikiCleanup = () => {
    rootEl.removeEventListener("click", onRootClick);
    kwInput?.removeEventListener("input", onKwInput);
    offClearance?.();
  };
}
