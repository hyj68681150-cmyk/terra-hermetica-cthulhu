/**
 * js/views/home.js
 * Archive Lobby (#/) — Hermes-inspired monochrome editorial header,
 * full-site instant search with live suggestions, Clearance progression strip,
 * 7-category directory grid, recent dossiers, and novel/investigation portals.
 */

import { escapeHtml } from "../sanitize.js";
import { formatPlainSummary } from "../autolink.js";

export const ARCHIVE_CATEGORIES = [
  {
    slug: "entities",
    title: "实体与神祇",
    latin: "ENTITATES ET NVMINA",
    glyph: "☽\uFE0E",
    desc: "旧日支配者、外神与基金会至高神性实体的谱系考据及跨体系对照。",
  },
  {
    slug: "scp",
    title: "收容档案",
    latin: "CODICES CONTENTIONIS",
    glyph: "♄\uFE0E",
    desc: "基金会特殊收容措施、异界门径、机械降神巨构与分级加密实录。",
  },
  {
    slug: "sites",
    title: "地点与站点",
    latin: "TOPOGRAPHIA SANCTORVM",
    glyph: "☉\uFE0E",
    desc: "全球收容要塞、远古遗迹与神话海渊的实测高程、经纬坐标与驻防志。",
  },
  {
    slug: "goi",
    title: "同行组织",
    latin: "ORDINES ET SOCIETATES",
    glyph: "☿\uFE0E",
    desc: "战术神学部、破碎之神教会、欲肉教、蛇之手、密大与赫尔墨斯蓝色修会。",
  },
  {
    slug: "timeline",
    title: "事件年表",
    latin: "CHRONICA AETATVM",
    glyph: "☉\uFE0E",
    desc: "自古生代远古者筑城、青铜神战、法罗斯立约至现代休谟并网的编年史。",
  },
  {
    slug: "codices",
    title: "典籍残卷",
    latin: "FRAGMENTA HERMETICA",
    glyph: "♄\uFE0E",
    desc: "蓝色神学休谟场论、外神分级矩阵与跨宇宙秘传文献汇编。",
  },
  {
    slug: "novels",
    title: "连载小说",
    latin: "NARRATIONES CAERVLEAE",
    glyph: "☽\uFE0E",
    desc: "基于馆藏世界观创作的克苏鲁新怪谈连载长卷，支持术语侧栏即点即查。",
  },
];

const QUICK_QUERIES = ["SCP-2317", "拉莱耶在哪", "破碎之神", "翠玉录"];

const CAT_LABEL_MAP = Object.fromEntries(
  ARCHIVE_CATEGORIES.map((c) => [c.slug, c.title])
);

function getBadgeMeta(provenance, provenanceLabel) {
  if (provenance === "original") {
    return { cls: "badge-original", text: provenanceLabel || "本站设定" };
  }
  if (provenance === "cthulhu-canon") {
    return { cls: "badge-canon", text: provenanceLabel || "克苏鲁原典" };
  }
  return { cls: "badge-canon", text: provenanceLabel || "SCP原典" };
}

function buildLiveSuggestions(rawQuery, manifest) {
  const q = String(rawQuery ?? "").trim();
  if (!q) return [];
  const qLower = q.toLowerCase();

  // Check exact SCP-XXXX word boundary first so SCP-173 never falsely claims SCP-1730
  const scpMatch = q.match(/\bSCP-(\d+)\b/i);
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];

  if (scpMatch) {
    const targetCode = `SCP-${scpMatch[1]}`.toUpperCase();
    const exactCodeRe = new RegExp(`(?<![A-Za-z0-9_])${targetCode}(?![A-Za-z0-9_])`, "i");
    const exactHits = entries.filter(
      (e) =>
        exactCodeRe.test(e.code || "") ||
        exactCodeRe.test(e.title || "") ||
        (Array.isArray(e.aliases) && e.aliases.some((a) => exactCodeRe.test(a)))
    );
    if (exactHits.length === 0) {
      return [
        {
          kind: "unrecorded",
          href: `#/search?q=${encodeURIComponent(targetCode)}`,
          code: targetCode,
          title: `档案库未收录：${targetCode}`,
          sub: "点击查看相近编号收容档案推荐 →",
          badgeCls: "badge-original",
          badgeText: "未收录提示",
        },
      ];
    }
  }

  // Strip natural-language question suffixes ("拉莱耶在哪" -> "拉莱耶")
  const coreTerm = q
    .replace(/(在哪里?|在哪儿?|在什么地方|的?坐标(是多少)?|是谁|是什么|怎么去|[？?。！!])/g, "")
    .trim()
    .toLowerCase();

  const scored = [];
  for (const e of entries) {
    const titleL = String(e.title || "").toLowerCase();
    const codeL = String(e.code || "").toLowerCase();
    const aliasesL = (e.aliases || []).map((a) => String(a).toLowerCase());
    const sumL = String(e.summary || "").toLowerCase();

    let score = 0;
    for (const term of [qLower, coreTerm].filter((t) => t.length >= 1)) {
      if (codeL === term || titleL === term) score = Math.max(score, 100);
      else if (codeL.includes(term)) score = Math.max(score, 85);
      else if (titleL.includes(term)) score = Math.max(score, 80);
      else if (aliasesL.some((a) => a.includes(term))) score = Math.max(score, 72);
      else if (sumL.includes(term)) score = Math.max(score, 45);
    }

    if (score > 0) {
      const badge = getBadgeMeta(e.provenance, e.provenanceLabel);
      scored.push({
        score,
        kind: "entry",
        href: `#/entry/${encodeURIComponent(e.id)}`,
        previewId: e.id,
        code: e.code || CAT_LABEL_MAP[e.category] || e.category,
        title: e.title,
        sub: CAT_LABEL_MAP[e.category] || e.category,
        badgeCls: badge.cls,
        badgeText: badge.text,
      });
    }
  }

  for (const book of manifest?.novels || []) {
    const hay = `${book.title || ""} ${book.summary || ""}`.toLowerCase();
    if (hay.includes(qLower) || (coreTerm && hay.includes(coreTerm))) {
      const badge = getBadgeMeta(book.provenance, book.provenanceLabel);
      scored.push({
        score: 68,
        kind: "novel",
        href: `#/novel/${encodeURIComponent(book.bookId)}`,
        code: "NOVEL",
        title: book.title,
        sub: "连载小说",
        badgeCls: badge.cls,
        badgeText: badge.text,
      });
    }
  }

  for (const c of manifest?.playCases || []) {
    const hay = `${c.title || ""} ${c.subtitle || ""} ${c.summary || ""}`.toLowerCase();
    if (hay.includes(qLower) || (coreTerm && hay.includes(coreTerm))) {
      const badge = getBadgeMeta(c.provenance || "original", c.provenanceLabel);
      scored.push({
        score: 65,
        kind: "play",
        href: `#/play/${encodeURIComponent(c.caseId)}`,
        code: "CASE",
        title: c.title,
        sub: "互动调查卷宗",
        badgeCls: badge.cls,
        badgeText: badge.text,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return scored.slice(0, 6);
}

function renderClearanceStripHtml(clState) {
  const nextLabel =
    clState.level >= 5
      ? `${clState.xp} XP · 最高权限已解锁`
      : `${clState.xp} / ${clState.nextLevelXp} XP`;
  return `
    <div class="wiki-clearance-strip-main">
      <div class="wiki-clearance-rank">
        <span class="lapidary-serif">${escapeHtml(clState.titleLatin)}</span>
        <strong class="wiki-clearance-zh">${escapeHtml(clState.titleZh)}（Lv.${clState.level}）</strong>
      </div>
      <div class="wiki-clearance-meter-wrap">
        <div class="wiki-xp-bar" role="progressbar" aria-valuenow="${clState.progressPct}" aria-valuemin="0" aria-valuemax="100">
          <div class="wiki-xp-bar-fill" style="width:${clState.progressPct}%;"></div>
        </div>
        <span class="wiki-xp-meta">${escapeHtml(nextLabel)} · 线索 ${clState.clues.length} 项</span>
      </div>
      <a class="bp-btn wiki-clearance-cta" href="#/play">进入权限与调查终端 →</a>
    </div>
  `;
}

export async function renderHomeView(rootEl, ctx) {
  if (!rootEl) return;
  if (typeof rootEl.__wikiCleanup === "function") {
    rootEl.__wikiCleanup();
    rootEl.__wikiCleanup = null;
  }

  const manifest = await ctx.getManifest();
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const novels = Array.isArray(manifest?.novels) ? manifest.novels : [];

  let playCases = Array.isArray(manifest?.playCases) ? manifest.playCases : [];
  if (playCases.length === 0 && typeof ctx.fetchJson === "function") {
    try {
      const idxData = await ctx.fetchJson("data/play/index.json");
      if (Array.isArray(idxData?.cases)) playCases = idxData.cases;
      else if (Array.isArray(idxData)) playCases = idxData;
    } catch (_) {
      // Optional before play cases are merged
    }
  }

  // Count per category
  const catCounts = {};
  for (const cat of ARCHIVE_CATEGORIES) catCounts[cat.slug] = 0;
  for (const e of entries) {
    if (catCounts[e.category] !== undefined) catCounts[e.category]++;
  }
  catCounts.novels = novels.length;

  // Latest 6 entries sorted by updatedAt desc
  const recentEntries = [...entries]
    .sort((a, b) => {
      const d = String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
      if (d !== 0) return d;
      return String(a.id).localeCompare(String(b.id));
    })
    .slice(0, 6);

  const clState = ctx.clearance.getClearanceState();

  const categoryCardsHtml = ARCHIVE_CATEGORIES.map((c) => {
    const countNum = catCounts[c.slug] || 0;
    const unit = c.slug === "novels" ? "部" : "卷";
    return `
      <a class="wiki-cat-card" href="#/category/${encodeURIComponent(c.slug)}">
        <div class="wiki-cat-card-top">
          <span class="wiki-cat-glyph" aria-hidden="true">${c.glyph}</span>
          <span class="wiki-cat-latin">${escapeHtml(c.latin)}</span>
          <span class="wiki-cat-count">${countNum} ${unit}</span>
        </div>
        <h3 class="wiki-cat-title">${escapeHtml(c.title)}</h3>
        <p class="wiki-cat-desc">${escapeHtml(c.desc)}</p>
        <span class="wiki-cat-enter">查阅分类目录 →</span>
      </a>
    `;
  }).join("");

  const recentListHtml = recentEntries
    .map((e) => {
      const badge = getBadgeMeta(e.provenance, e.provenanceLabel);
      const catName = CAT_LABEL_MAP[e.category] || e.category;
      return `
        <a class="wiki-recent-row" href="#/entry/${encodeURIComponent(e.id)}" data-entry-preview="${escapeHtml(e.id)}">
          <div class="wiki-recent-top">
            <span class="wiki-recent-code">${escapeHtml(e.code || catName)}</span>
            <div class="wiki-recent-badges">
              <span class="${badge.cls}">${escapeHtml(badge.text)}</span>
              <span class="wiki-meta-date">${escapeHtml(e.updatedAt || "")}</span>
            </div>
          </div>
          <div class="wiki-recent-title">${escapeHtml(e.title)}</div>
          <p class="wiki-recent-sum">${formatPlainSummary(e.summary, clState.level)}</p>
        </a>
      `;
    })
    .join("");

  const featuredNovel = novels[0] || null;
  const novelBlockHtml = featuredNovel
    ? (() => {
        const badge = getBadgeMeta(
          featuredNovel.provenance,
          featuredNovel.provenanceLabel
        );
        const chapters = Array.isArray(featuredNovel.chapters)
          ? featuredNovel.chapters.slice(0, 3)
          : [];
        return `
          <div class="wiki-portal-box">
            <div class="wiki-portal-head">
              <span class="lapidary-serif">LIBER NARRATIONIS · 连载新怪谈</span>
              <span class="${badge.cls}">${escapeHtml(badge.text)}</span>
            </div>
            <h3 class="wiki-portal-title">${escapeHtml(featuredNovel.title)}</h3>
            <p class="wiki-portal-desc">${escapeHtml(featuredNovel.summary || "")}</p>
            ${
              chapters.length
                ? `<div class="wiki-portal-chapters">
                    ${chapters
                      .map(
                        (ch) => `
                        <a class="wiki-portal-ch-link" href="#/novel/${encodeURIComponent(featuredNovel.bookId)}/${encodeURIComponent(ch.id)}">
                          <span>${escapeHtml(ch.title)}</span>
                          <span class="wiki-ch-arrow">阅读 →</span>
                        </a>`
                      )
                      .join("")}
                  </div>`
                : ""
            }
            <div class="wiki-portal-actions">
              <a class="bp-btn active" href="#/novel/${encodeURIComponent(featuredNovel.bookId)}">进入连载阅读器 →</a>
            </div>
          </div>
        `;
      })()
    : `
      <div class="wiki-portal-box">
        <div class="wiki-portal-head">
          <span class="lapidary-serif">LIBER NARRATIONIS · 连载新怪谈</span>
          <span class="badge-original">本站设定</span>
        </div>
        <h3 class="wiki-portal-title">新怪谈调查手记</h3>
        <p class="wiki-portal-desc">跨洋异常声呐与战术神学调查长卷，支持正文内档案术语侧栏即点即查。</p>
        <div class="wiki-portal-actions">
          <a class="bp-btn active" href="#/novel">打开连载阅读器 →</a>
        </div>
      </div>
    `;

  const casesBlockHtml =
    playCases.length > 0
      ? `
        <div class="wiki-portal-box">
          <div class="wiki-portal-head">
            <span class="lapidary-serif">INQVISITIO · 互动认知调查</span>
            <span class="badge-original">SAN / 休谟检定</span>
          </div>
          <div class="wiki-case-list">
            ${playCases
              .slice(0, 3)
              .map(
                (c) => `
                <a class="wiki-case-item" href="#/play/${encodeURIComponent(c.caseId)}">
                  <div class="wiki-case-item-top">
                    <strong>${escapeHtml(c.title)}</strong>
                    <span class="wiki-lv-pill">建议 Lv.${Number(c.recommendedClearance) || 1}</span>
                  </div>
                  <p class="wiki-case-item-desc">${escapeHtml(c.summary || c.subtitle || "")}</p>
                </a>`
              )
              .join("")}
          </div>
          <div class="wiki-portal-actions">
            <a class="bp-btn" href="#/play">进入权限与调查终端 →</a>
          </div>
        </div>
      `
      : `
        <div class="wiki-portal-box">
          <div class="wiki-portal-head">
            <span class="lapidary-serif">INQVISITIO · 权限与调查终端</span>
            <span class="badge-original">本站互动模块</span>
          </div>
          <h3 class="wiki-portal-title">战术神学现场调查与权限晋升</h3>
          <p class="wiki-portal-desc">通过调阅馆藏卷宗收集现场线索，提升 Clearance 权限等级（GRADVS I–V），解锁高密级附录与调查分支。</p>
          <div class="wiki-portal-actions">
            <a class="bp-btn active" href="#/play">进入权限与调查终端 →</a>
          </div>
        </div>
      `;

  rootEl.innerHTML = `
    <div class="wiki-page wiki-home-page">
      <header class="wiki-editorial-hero">
        <div class="wiki-hero-kicker">ARCHIVVM GENERALE · MONVMENTA CAERVLEA</div>
        <div class="wiki-hero-display">THEOLOGIA CAERVLEA</div>
        <h1 class="wiki-hero-zh">蓝色神学档案馆</h1>
        <div class="wiki-hero-rule"></div>
        <p class="wiki-hero-subtitle">
          汇整克苏鲁神话公有领域原典、SCP 基金会维基文献（CC BY-SA 3.0）与本站原创赫尔墨斯蓝色神学设定。馆内以实心徽章标示原典出处，以线框徽章标示本站原创设定。
        </p>
        <blockquote class="wiki-hero-epigraph">
          <span>VERVM SINE MENDACIO, CERTVM ET VERISSIMVM · OMNIA AB VNO MEDITATIONE VNIVS</span>
          <cite>—— TABVLA SMARAGDINA · 翠玉录拉丁古本</cite>
        </blockquote>
      </header>

      <section class="wiki-search-hub" aria-label="全馆即时检索">
        <form class="wiki-search-form" data-role="home-search-form" role="search">
          <div class="wiki-search-input-wrap">
            <input
              type="search"
              class="wiki-search-input"
              data-role="home-search-input"
              autocomplete="off"
              placeholder="输入编号、神祇、地名或提问（如：SCP-2317 / 拉莱耶在哪 / 破碎之神）..."
              aria-label="全馆检索关键词"
            />
            <button type="submit" class="bp-btn active wiki-search-submit">检索</button>
          </div>
          <div class="wiki-search-suggest" data-role="home-search-suggest" hidden></div>
        </form>

        <div class="wiki-quick-chips" aria-label="快捷检索推荐">
          <span class="wiki-quick-label">常调检索：</span>
          ${QUICK_QUERIES.map(
            (q) =>
              `<a class="wiki-chip" href="#/search?q=${encodeURIComponent(q)}">${escapeHtml(q)}</a>`
          ).join("")}
        </div>
      </section>

      <section class="wiki-action-bar" aria-label="馆藏快捷入口">
        <div class="wiki-action-buttons">
          <button type="button" class="bp-btn active" data-action="random-entry">随机调阅一份档案</button>
          <a class="bp-btn" href="#/map">进入铜版蓝色舆图 →</a>
          <a class="bp-btn" href="#/novel">继续阅读小说 →</a>
        </div>
        <div class="wiki-clearance-strip" data-role="home-clearance-strip">
          ${renderClearanceStripHtml(clState)}
        </div>
      </section>

      <section class="wiki-section" aria-labelledby="home-cat-heading">
        <div class="wiki-section-head">
          <div>
            <div class="lapidary-serif">INDEX SEPTEM ORDINVM</div>
            <h2 id="home-cat-heading" class="wiki-section-title">七大馆藏分类目录</h2>
          </div>
          <span class="wiki-section-count">共收录 ${entries.length} 份档案卷宗 · ${novels.length} 部连载</span>
        </div>
        <div class="wiki-cat-grid">
          ${categoryCardsHtml}
        </div>
      </section>

      <section class="wiki-home-bottom-grid">
        <div class="wiki-home-col">
          <div class="wiki-section-head">
            <div>
              <div class="lapidary-serif">RECENTIORA FOLIA</div>
              <h2 class="wiki-section-title">最近更新卷宗</h2>
            </div>
            <a class="wiki-inline-link" href="#/category/scp">全部卷宗 →</a>
          </div>
          <div class="wiki-recent-list">
            ${recentListHtml}
          </div>
        </div>

        <div class="wiki-home-col">
          <div class="wiki-section-head">
            <div>
              <div class="lapidary-serif">NARRATIO ET INQVISITIO</div>
              <h2 class="wiki-section-title">连载新怪谈与互动调查入口</h2>
            </div>
          </div>
          <div class="wiki-portal-stack">
            ${novelBlockHtml}
            ${casesBlockHtml}
          </div>
        </div>
      </section>

      <footer class="cc-footer">
        版权声明：凡标有实心“原典”徽章之 SCP 相关词条基于 <a href="https://scp-wiki.wikidot.com/" target="_blank" rel="noopener">SCP Foundation Wiki</a> 及 <a href="https://scp-wiki-cn.wikidot.com/" target="_blank" rel="noopener">SCP基金会中文维基</a> 创作，遵循 <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.zh-hans" target="_blank" rel="noopener">CC BY-SA 3.0 协议</a> 发布；克苏鲁神话原典源自 H.P. 洛夫克拉夫特公有领域作品；标有线框“本站设定”之内容为本站原创衍生，同样以 CC BY-SA 3.0 共享。免责声明：本站为虚构创作作品，所涉地点、组织与任何真实机构无关。
      </footer>
    </div>
  `;

  // Wire delegated events inside rootEl (zero inline handlers)
  const formEl = rootEl.querySelector('[data-role="home-search-form"]');
  const inputEl = rootEl.querySelector('[data-role="home-search-input"]');
  const suggestEl = rootEl.querySelector('[data-role="home-search-suggest"]');
  const clearanceEl = rootEl.querySelector('[data-role="home-clearance-strip"]');

  const closeSuggest = () => {
    if (suggestEl) {
      suggestEl.hidden = true;
      suggestEl.innerHTML = "";
    }
  };

  const renderSuggestions = (val) => {
    if (!suggestEl) return;
    const trimmed = String(val ?? "").trim();
    if (!trimmed) {
      closeSuggest();
      return;
    }
    const items = buildLiveSuggestions(trimmed, {
      entries,
      novels,
      playCases,
    });
    if (items.length === 0) {
      suggestEl.innerHTML = `
        <a class="wiki-suggest-row" href="#/search?q=${encodeURIComponent(trimmed)}">
          <div class="wiki-suggest-main">
            <span class="wiki-suggest-code">SEARCH</span>
            <span class="wiki-suggest-title">全馆深度检索：“${escapeHtml(trimmed)}”</span>
          </div>
          <span class="wiki-suggest-sub">按回车查看相近档案 →</span>
        </a>
      `;
      suggestEl.hidden = false;
      return;
    }

    suggestEl.innerHTML = items
      .map(
        (it) => `
        <a class="wiki-suggest-row" href="${escapeHtml(it.href)}"${it.previewId ? ` data-entry-preview="${escapeHtml(it.previewId)}"` : ""}>
          <div class="wiki-suggest-main">
            <span class="wiki-suggest-code">${escapeHtml(it.code)}</span>
            <span class="wiki-suggest-title">${escapeHtml(it.title)}</span>
          </div>
          <div class="wiki-suggest-meta">
            <span class="wiki-suggest-sub">${escapeHtml(it.sub)}</span>
            <span class="${it.badgeCls}">${escapeHtml(it.badgeText)}</span>
          </div>
        </a>`
      )
      .join("");
    suggestEl.hidden = false;
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const q = String(inputEl?.value ?? "").trim();
    closeSuggest();
    const target = q ? `#/search?q=${encodeURIComponent(q)}` : "#/search";
    if (typeof ctx.navigate === "function") ctx.navigate(target);
    else window.location.hash = target;
  };

  const handleSearchInput = (e) => {
    renderSuggestions(e.target.value);
  };

  const handleInputKeydown = (e) => {
    if (e.key === "Escape") {
      closeSuggest();
    }
  };

  const onRootClick = (e) => {
    const randBtn = e.target.closest?.('[data-action="random-entry"]');
    if (randBtn && entries.length > 0) {
      const chosen = entries[Math.floor(Math.random() * entries.length)];
      if (chosen?.id) {
        const hash = `#/entry/${encodeURIComponent(chosen.id)}`;
        if (typeof ctx.navigate === "function") ctx.navigate(hash);
        else window.location.hash = hash;
      }
      return;
    }
    if (e.target.closest?.(".wiki-suggest-row")) {
      closeSuggest();
    }
  };

  const onDocPointerDown = (e) => {
    if (formEl && !formEl.contains(e.target)) {
      closeSuggest();
    }
  };

  formEl?.addEventListener("submit", handleFormSubmit);
  inputEl?.addEventListener("input", handleSearchInput);
  inputEl?.addEventListener("keydown", handleInputKeydown);
  rootEl.addEventListener("click", onRootClick);
  document.addEventListener("pointerdown", onDocPointerDown);

  const offClearance = ctx.clearance.onClearanceChange((nextState) => {
    if (clearanceEl && clearanceEl.isConnected) {
      clearanceEl.innerHTML = renderClearanceStripHtml(nextState);
    }
  });

  rootEl.__wikiCleanup = () => {
    formEl?.removeEventListener("submit", handleFormSubmit);
    inputEl?.removeEventListener("input", handleSearchInput);
    inputEl?.removeEventListener("keydown", handleInputKeydown);
    rootEl.removeEventListener("click", onRootClick);
    document.removeEventListener("pointerdown", onDocPointerDown);
    offClearance?.();
  };
}
