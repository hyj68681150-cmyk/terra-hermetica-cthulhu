/**
 * js/views/novel-reader.js
 * P3 Deliverable 1: Markdown Novel Reader (#/novel, #/novel/<bookId>, #/novel/<bookId>/<chapterId>)
 * Strictly Monochrome Klein-Blue & White, Zero-Dependency, Zero Inline Event Handlers, Zero Emoji.
 */
import { escapeHtml } from "../sanitize.js";

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const PROGRESS_KEY = "tc_novel_progress_v1";
const PREFS_KEY = "tc_reader_prefs_v1";

const FONT_SIZES = [
  { key: "sm", label: "小", px: "15px" },
  { key: "md", label: "标准", px: "16.5px" },
  { key: "lg", label: "大", px: "18.5px" },
  { key: "xl", label: "特大", px: "21px" },
];

const LINE_HEIGHTS = [
  { key: "compact", label: "紧凑", lh: "1.68" },
  { key: "normal", label: "标准", lh: "1.88" },
  { key: "loose", label: "宽松", lh: "2.12" },
];

const DEFAULT_PREFS = {
  fontSize: "md",
  lineHeight: "normal",
};

function isValidId(val) {
  return typeof val === "string" && ID_RE.test(val);
}

function readReaderPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    const fsOk = FONT_SIZES.some((f) => f.key === parsed?.fontSize);
    const lhOk = LINE_HEIGHTS.some((l) => l.key === parsed?.lineHeight);
    return {
      fontSize: fsOk ? parsed.fontSize : DEFAULT_PREFS.fontSize,
      lineHeight: lhOk ? parsed.lineHeight : DEFAULT_PREFS.lineHeight,
    };
  } catch (_) {
    return { ...DEFAULT_PREFS };
  }
}

function saveReaderPrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (_) {}
}

function readNovelProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!isValidId(parsed.bookId) || !isValidId(parsed.chapterId)) return null;
    return {
      bookId: parsed.bookId,
      chapterId: parsed.chapterId,
      chapterNumber: Number(parsed.chapterNumber) || 1,
      chapterTitle: String(parsed.chapterTitle || ""),
      scrollRatio: Math.max(0, Math.min(1, Number(parsed.scrollRatio) || 0)),
      updatedAt: String(parsed.updatedAt || ""),
      books: parsed.books && typeof parsed.books === "object" ? parsed.books : {},
    };
  } catch (_) {
    return null;
  }
}

function writeNovelProgress({ bookId, chapterId, chapterNumber, chapterTitle, scrollRatio }) {
  if (!isValidId(bookId) || !isValidId(chapterId)) return;
  const prev = readNovelProgress();
  const booksMap = prev?.books ? { ...prev.books } : {};
  const cleanRatio = Math.round(Math.max(0, Math.min(1, Number(scrollRatio) || 0)) * 1000) / 1000;
  const updatedAt = new Date().toISOString();
  const entry = {
    bookId,
    chapterId,
    chapterNumber: Number(chapterNumber) || 1,
    chapterTitle: String(chapterTitle || ""),
    scrollRatio: cleanRatio,
    updatedAt,
  };
  booksMap[bookId] = entry;
  try {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        ...entry,
        books: booksMap,
      })
    );
  } catch (_) {}
}

function getCurrentTheme() {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "night" ? "night" : "day";
}

function setDocumentTheme(targetTheme) {
  const next = targetTheme === "night" ? "night" : "day";
  const cur = getCurrentTheme();
  const topThemeBtn = document.getElementById("btn-theme");
  if (topThemeBtn && window.__archiveReady && cur !== next) {
    topThemeBtn.click();
  }
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("tc_theme", next);
  } catch (_) {}
  const lbl = document.getElementById("theme-label");
  if (lbl) lbl.textContent = next === "day" ? "夜间" : "纸本";
}

function getChapterStem(ch) {
  if (!ch?.path) return "";
  const file = String(ch.path).split("/").pop() || "";
  return file.replace(/\.md$/i, "").toLowerCase();
}

function matchChapter(chapters, rawSlug) {
  if (!Array.isArray(chapters) || !chapters.length) return null;
  const slug = String(rawSlug || "").trim().toLowerCase();
  if (!slug) return null;
  for (const ch of chapters) {
    if (String(ch.id || "").toLowerCase() === slug) return ch;
    const stem = getChapterStem(ch);
    if (stem && stem === slug) return ch;
    const numPad = `ch-${String(ch.chapterNumber || 0).padStart(2, "0")}`;
    const numPlain = `ch-${Number(ch.chapterNumber || 0)}`;
    if (slug === numPad || slug === numPlain) return ch;
  }
  return null;
}

/**
 * Parses YAML front matter and Markdown blocks (headings, blockquotes, scene breaks, paragraphs).
 */
function parseMarkdownChapter(rawMd) {
  const normalized = String(rawMd || "").replace(/\r\n/g, "\n");
  const meta = {};
  let body = normalized;

  if (normalized.startsWith("---\n")) {
    const endIdx = normalized.indexOf("\n---\n", 4);
    if (endIdx !== -1) {
      const fmLines = normalized.slice(4, endIdx).split("\n");
      for (const line of fmLines) {
        const colonIdx = line.indexOf(":");
        if (colonIdx <= 0) continue;
        const key = line.slice(0, colonIdx).trim();
        let val = line.slice(colonIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (key) meta[key] = val;
      }
      body = normalized.slice(endIdx + 5);
    }
  }

  const lines = body.split("\n");
  const blocks = [];
  let paraBuf = [];
  let quoteBuf = [];

  const flushPara = () => {
    if (!paraBuf.length) return;
    const text = paraBuf.join("").trim();
    paraBuf = [];
    if (text) blocks.push({ type: "para", text });
  };

  const flushQuote = () => {
    if (!quoteBuf.length) return;
    const joined = quoteBuf
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n");
    quoteBuf = [];
    if (joined) blocks.push({ type: "blockquote", lines: joined.split("\n") });
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushPara();
      flushQuote();
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,}|\*\s*\*\s*\*)$/.test(trimmed)) {
      flushPara();
      flushQuote();
      blocks.push({ type: "hr" });
      continue;
    }
    const hMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      flushPara();
      flushQuote();
      blocks.push({
        type: "heading",
        level: hMatch[1].length,
        text: hMatch[2].trim(),
      });
      continue;
    }
    if (trimmed.startsWith(">")) {
      flushPara();
      quoteBuf.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }
    flushQuote();
    if (paraBuf.length > 0) {
      const prev = paraBuf[paraBuf.length - 1];
      const needSpace = /[A-Za-z0-9]$/.test(prev) && /^[A-Za-z0-9]/.test(trimmed);
      paraBuf.push((needSpace ? " " : "") + trimmed);
    } else {
      paraBuf.push(trimmed);
    }
  }
  flushPara();
  flushQuote();

  return { meta, blocks };
}

/**
 * Applies inline Markdown **bold** and *italic* safely ONLY outside HTML tags.
 */
function applySafeInlineEmphasis(safeHtml) {
  return String(safeHtml)
    .split(/(<[^>]+>)/g)
    .map((seg) => {
      if (seg.startsWith("<")) return seg;
      return seg
        .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    })
    .join("");
}

/**
 * Fallback prose renderer if ctx.autolink.renderProseWithLinks is unavailable.
 */
function fallbackRenderProse(rawText, { currentClearance = 1, linkMode = "drawer", redactPrefix = "r", revealedIds = [] } = {}) {
  const tokens = [];
  const putToken = (html) => {
    const idx = tokens.length;
    tokens.push(html);
    return `\u0000TK_${idx}_\u0000`;
  };

  let rCounter = 0;
  let working = String(rawText ?? "").replace(
    /\{\{redact:(\d+):([\s\S]*?)\}\}/g,
    (_, lvlStr, inner) => {
      const reqLv = parseInt(lvlStr, 10) || 1;
      const redactKey = `${redactPrefix}-${rCounter++}`;
      const isRevealed = Array.isArray(revealedIds) && revealedIds.includes(redactKey);
      const locked = currentClearance < reqLv;
      const escInner = escapeHtml(inner);
      const visibleText = isRevealed
        ? escInner
        : locked
          ? `[Lv.${reqLv} 加密记录 · 点击检定]`
          : escInner;
      return putToken(
        `<span class="scp-redact ${isRevealed ? "revealed" : ""} ${locked ? "scp-redact-locked" : ""}" role="button" tabindex="0" data-req-lv="${reqLv}" data-redact-key="${escapeHtml(redactKey)}" data-secret="${escInner}">${visibleText}</span>`
      );
    }
  );

  working = working.replace(
    /\[\[([a-z0-9][a-z0-9-]*)(?:\|([^\]]+))?\]\]/g,
    (_, id, label) => {
      const safeId = escapeHtml(id);
      const safeLabel = escapeHtml(label || id);
      if (linkMode === "drawer") {
        return putToken(
          `<button type="button" class="novel-term-link" data-entry-drawer="${safeId}" data-entry-preview="${safeId}">${safeLabel}</button>`
        );
      }
      return putToken(
        `<a href="#/entry/${safeId}" class="wiki-link" data-entry-preview="${safeId}">${safeLabel}</a>`
      );
    }
  );

  const escapedPlain = escapeHtml(working);
  return escapedPlain.replace(/\u0000TK_(\d+)_\u0000/g, (_, idxStr) => tokens[Number(idxStr)] || "");
}

function renderNovelProse(rawText, options, ctx) {
  let html = "";
  if (ctx?.autolink?.renderProseWithLinks) {
    html = ctx.autolink.renderProseWithLinks(rawText, options);
  } else {
    const cState = ctx?.clearance?.getClearanceState?.() || { level: 1, revealedIds: [] };
    html = fallbackRenderProse(rawText, {
      ...options,
      currentClearance: options.currentClearance ?? cState.level,
      revealedIds: cState.revealedIds || [],
    });
  }
  return applySafeInlineEmphasis(html);
}

function formatEntryCoord(geo) {
  if (!geo || typeof geo.lat !== "number" || typeof geo.lon !== "number") return "";
  const digits = geo.precision === "exact" ? 4 : 1;
  const ns = geo.lat >= 0 ? "N" : "S";
  const ew = geo.lon >= 0 ? "E" : "W";
  return `${Math.abs(geo.lat).toFixed(digits)}°${ns}, ${Math.abs(geo.lon).toFixed(digits)}°${ew}`;
}

function getBookPlateSvg() {
  return `<svg class="novel-plate-svg" viewBox="0 0 180 180" aria-hidden="true">
    <rect x="8" y="8" width="164" height="164" fill="none" stroke="currentColor" stroke-width="1"/>
    <rect x="14" y="14" width="152" height="152" fill="none" stroke="currentColor" stroke-width="0.6" stroke-dasharray="3 2"/>
    <circle cx="90" cy="78" r="44" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <circle cx="90" cy="78" r="28" fill="none" stroke="currentColor" stroke-width="0.8" stroke-dasharray="2 2"/>
    <polygon points="90,36 126,98 54,98" fill="none" stroke="currentColor" stroke-width="1"/>
    <circle cx="90" cy="78" r="5" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <line x1="90" y1="24" x2="90" y2="132" stroke="currentColor" stroke-width="0.7"/>
    <line x1="36" y1="78" x2="144" y2="78" stroke="currentColor" stroke-width="0.7"/>
    <path d="M26 142 Q58 132 90 142 T154 142" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <path d="M26 151 Q58 141 90 151 T154 151" fill="none" stroke="currentColor" stroke-width="0.9"/>
  </svg>`;
}

function getScrollHost(rootEl) {
  if (!rootEl) return null;
  if (rootEl.id === "stage-novel") return rootEl;
  return rootEl.closest("#stage-novel") || rootEl.closest(".chapter-stage") || rootEl;
}

function getClueSet(ctx) {
  const cState = ctx?.clearance?.getClearanceState?.();
  const list = Array.isArray(cState?.clues) ? cState.clues : [];
  return new Set(list.map((c) => c.id));
}

function renderChapterRowsHtml(book, chapters, progress, clueSet) {
  const bookProgress =
    progress?.bookId === book.bookId ? progress : progress?.books?.[book.bookId] || null;

  return chapters
    .map((ch, idx) => {
      const chNum = Number(ch.chapterNumber) || idx + 1;
      const estMin = Number(ch.estimatedMinutes) || Math.max(2, Math.ceil((Number(ch.charCount) || 1200) / 420));
      const chars = Number(ch.charCount) || 0;
      const clueId = isValidId(ch.clueId) ? ch.clueId : `novel-${ch.id}`;
      const clueXp = Number(ch.clueXp) || 30;
      const hasClue = clueSet.has(clueId);
      const isCurrent = bookProgress && bookProgress.chapterId === ch.id;
      const pct = isCurrent ? Math.round((bookProgress.scrollRatio || 0) * 100) : 0;

      return `
        <div class="novel-chap-row ${isCurrent ? "is-current" : ""}">
          <div class="novel-chap-meta">
            <span class="novel-chap-num">CH.${String(chNum).padStart(2, "0")}</span>
            <div class="novel-chap-info">
              <a class="novel-chap-title-link" href="#/novel/${encodeURIComponent(book.bookId)}/${encodeURIComponent(ch.id)}">
                ${escapeHtml(ch.title || `第 ${chNum} 章`)}
              </a>
              <div class="novel-chap-sub">
                <span>约 ${estMin} 分钟阅读${chars ? ` · ${chars.toLocaleString()} 字` : ""}</span>
                <span class="badge-original">${hasClue ? `已收录线索 (+${clueXp} XP)` : `调阅奖励 +${clueXp} XP`}</span>
                ${isCurrent ? `<span class="badge-canon">上次读至 ${pct}%</span>` : ""}
              </div>
            </div>
          </div>
          <a class="bp-btn ${isCurrent ? "active" : ""}" href="#/novel/${encodeURIComponent(book.bookId)}/${encodeURIComponent(ch.id)}">
            ${isCurrent ? "继续阅读 →" : "开始阅读 →"}
          </a>
        </div>
      `;
    })
    .join("");
}

function renderBookshelfView(rootEl, books, progress, ctx) {
  const clueSet = getClueSet(ctx);

  let resumeBannerHtml = "";
  if (progress) {
    const targetBook = books.find((b) => b.bookId === progress.bookId);
    const targetChap = targetBook ? matchChapter(targetBook.chapters || [], progress.chapterId) : null;
    if (targetBook && targetChap) {
      const chNum = Number(targetChap.chapterNumber) || 1;
      const pct = Math.round((progress.scrollRatio || 0) * 100);
      resumeBannerHtml = `
        <section class="novel-resume-banner" aria-label="上次阅读进度">
          <div class="novel-resume-info">
            <div class="lapidary-serif">ITERVMQVE DESCENDIT IN TERRAM · 阅读进度记忆</div>
            <div class="novel-resume-title">
              《${escapeHtml(targetBook.title)}》 · ${escapeHtml(targetChap.title || `第 ${chNum} 章`)}
            </div>
            <div class="novel-resume-sub">
              已保存章节滚动位置（进度 ${pct}%），点击可直接回到上次阅读段落。
            </div>
          </div>
          <div class="novel-resume-actions">
            <a class="bp-btn active" href="#/novel/${encodeURIComponent(targetBook.bookId)}/${encodeURIComponent(targetChap.id)}">
              继续阅读：第 ${chNum} 章 →
            </a>
            <a class="bp-btn" href="#/novel/${encodeURIComponent(targetBook.bookId)}">
              查看全书目录
            </a>
          </div>
        </section>
      `;
    }
  }

  const booksHtml = books.length
    ? books
        .map((book) => {
          const chapters = Array.isArray(book.chapters) ? book.chapters : [];
          const firstChap = chapters[0] || null;
          const bookProg =
            progress?.bookId === book.bookId ? progress : progress?.books?.[book.bookId] || null;
          const resumeChap = bookProg ? matchChapter(chapters, bookProg.chapterId) : null;
          const totalChars = chapters.reduce((acc, c) => acc + (Number(c.charCount) || 0), 0);

          const primaryHref = resumeChap
            ? `#/novel/${encodeURIComponent(book.bookId)}/${encodeURIComponent(resumeChap.id)}`
            : firstChap
              ? `#/novel/${encodeURIComponent(book.bookId)}/${encodeURIComponent(firstChap.id)}`
              : `#/novel/${encodeURIComponent(book.bookId)}`;
          const primaryLabel = resumeChap
            ? `继续阅读：第 ${Number(resumeChap.chapterNumber) || 1} 章 →`
            : "从第一章开始阅读 →";

          return `
            <article class="novel-book-card">
              <div class="novel-book-cover-grid">
                <div class="novel-cover-plate">
                  <div class="novel-plate-kicker">VERVM SINE MENDACIO</div>
                  ${getBookPlateSvg()}
                  <div class="novel-plate-caption">OMNIA AB VNO</div>
                </div>
                <div class="novel-book-details">
                  <div class="novel-badge-row">
                    <span class="badge-original">本站原创 · 克苏鲁新怪谈</span>
                    <span class="badge-original">${escapeHtml(book.provenanceLabel || "CC BY-SA 3.0 原创连载")}</span>
                    <span class="novel-stat-pill">共 ${chapters.length} 章${totalChars ? ` · ${totalChars.toLocaleString()} 字` : ""}</span>
                  </div>
                  <h2 class="condensed-monument novel-book-title">${escapeHtml(book.title)}</h2>
                  <p class="prose-read novel-book-summary">${escapeHtml(book.summary || "")}</p>
                  <div class="novel-book-cta-row">
                    <a class="bp-btn active" href="${primaryHref}">${escapeHtml(primaryLabel)}</a>
                    <a class="bp-btn" href="#/novel/${encodeURIComponent(book.bookId)}">卷宗扉页与目录</a>
                    <a class="bp-btn" href="#/play">前往调查终端检验线索 →</a>
                  </div>
                </div>
              </div>
              <div class="novel-chap-directory">
                <div class="novel-dir-header">
                  <span class="lapidary-serif">HINC ERVNT ADAPTATIONES MIRABILES · 连载章节目录</span>
                  <span class="novel-dir-note">文中虚线术语点击可唤出馆藏词条速览抽屉</span>
                </div>
                <div class="novel-chap-list">
                  ${renderChapterRowsHtml(book, chapters, progress, clueSet)}
                </div>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="archive-card"><p class="prose-read">当前馆藏暂无连载小说卷宗。</p></div>`;

  rootEl.innerHTML = `
    <div class="p3-shell novel-shell">
      <nav class="p3-breadcrumb" aria-label="面包屑导航">
        <a href="#/">档案馆大厅</a>
        <span>/</span>
        <a href="#/category/novels">连载小说分类</a>
        <span>/</span>
        <span>新怪谈阅读室</span>
      </nav>

      <header class="p3-editorial-header">
        <div class="lapidary-serif">VERVM SINE MENDACIO · CERTVM ET VERISSIMVM</div>
        <h1 class="condensed-monument p3-page-title">蓝色神学 · 连载小说书架</h1>
        <p class="prose-read p3-page-lead">
          收录以战术神学部与密斯卡托尼克跨体系合流为背景的<b>本站原创克苏鲁新怪谈小说</b>。正文中嵌有馆藏交互链接与权限加密记录，点击术语可在页内抽屉速览词条而不中断阅读心流。
        </p>
      </header>

      ${resumeBannerHtml}
      ${booksHtml}

      <footer class="cc-footer">
        版权与创作声明：本栏目连载小说均为<b>本站原创克苏鲁新怪谈衍生作品</b>，其中涉及的 SCP 基金会世界观概念遵循 <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.zh-hans" target="_blank" rel="noopener">CC BY-SA 3.0 协议</a> 发布；洛夫克拉夫特神话元素源自公有领域原典。本站为虚构文学作品，与真实地理位置或机构无关。
      </footer>
    </div>
  `;
}

async function renderBookDetailView(rootEl, book, progress, ctx) {
  let bookJson = null;
  try {
    bookJson = await ctx.fetchJson(`data/novels/${book.bookId}/book.json`);
  } catch (_) {}

  const merged = { ...book, ...(bookJson || {}), chapters: book.chapters || [] };
  const chapters = Array.isArray(merged.chapters) ? merged.chapters : [];
  const clueSet = getClueSet(ctx);
  const bookProg =
    progress?.bookId === merged.bookId ? progress : progress?.books?.[merged.bookId] || null;
  const resumeChap = bookProg ? matchChapter(chapters, bookProg.chapterId) : null;
  const firstChap = chapters[0] || null;
  const totalChars = chapters.reduce((acc, c) => acc + (Number(c.charCount) || 0), 0);
  const collectedCount = chapters.filter((ch) => {
    const cid = isValidId(ch.clueId) ? ch.clueId : `novel-${ch.id}`;
    return clueSet.has(cid);
  }).length;

  const startHref = resumeChap
    ? `#/novel/${encodeURIComponent(merged.bookId)}/${encodeURIComponent(resumeChap.id)}`
    : firstChap
      ? `#/novel/${encodeURIComponent(merged.bookId)}/${encodeURIComponent(firstChap.id)}`
      : `#/novel`;
  const startLabel = resumeChap
    ? `继续阅读：第 ${Number(resumeChap.chapterNumber) || 1} 章（${Math.round((bookProg.scrollRatio || 0) * 100)}%） →`
    : "开始阅读第一章 →";

  rootEl.innerHTML = `
    <div class="p3-shell novel-shell">
      <nav class="p3-breadcrumb" aria-label="面包屑导航">
        <a href="#/">档案馆大厅</a>
        <span>/</span>
        <a href="#/novel">连载小说书架</a>
        <span>/</span>
        <span>${escapeHtml(merged.title)}</span>
      </nav>

      <article class="novel-book-card">
        <div class="novel-book-cover-grid">
          <div class="novel-cover-plate">
            <div class="novel-plate-kicker">VERVM SINE MENDACIO</div>
            ${getBookPlateSvg()}
            <div class="novel-plate-caption">ITA MVNDVS CREATVS EST</div>
          </div>
          <div class="novel-book-details">
            <div class="novel-badge-row">
              <span class="badge-original">本站原创 · 克苏鲁新怪谈</span>
              <span class="badge-original">${escapeHtml(merged.provenanceLabel || "本站原创小说（CC BY-SA 3.0）")}</span>
            </div>
            <h1 class="condensed-monument novel-book-title">${escapeHtml(merged.title)}</h1>
            <p class="prose-read novel-book-summary">${escapeHtml(merged.summary || "")}</p>
            <div class="infobox-list">
              <div class="infobox-item">
                <span class="infobox-label">卷宗编号：</span>
                <span class="infobox-val">${escapeHtml(merged.bookId.toUpperCase())}</span>
                <span class="orig-field-tag">本站设定</span>
              </div>
              <div class="infobox-item">
                <span class="infobox-label">连载篇幅：</span>
                <span class="infobox-val">共 ${chapters.length} 章${totalChars ? `（${totalChars.toLocaleString()} 字）` : ""}</span>
              </div>
              <div class="infobox-item">
                <span class="infobox-label">调查线索收录：</span>
                <span class="infobox-val">${collectedCount} / ${chapters.length} 章已解锁</span>
              </div>
              <div class="infobox-item">
                <span class="infobox-label">最近校订：</span>
                <span class="infobox-val">${escapeHtml(merged.updatedAt || "2026-11")}</span>
              </div>
            </div>
            <div class="novel-book-cta-row">
              <a class="bp-btn active" href="${startHref}">${escapeHtml(startLabel)}</a>
              <a class="bp-btn" href="#/novel">← 返回书架</a>
              <a class="bp-btn" href="#/play">进入权限与调查终端 →</a>
            </div>
            <p class="fiction-notice prose-read">
              署名与许可声明：本书为本站原创跨世界观小说，基于洛夫克拉夫特公有领域作品与 SCP 基金会维基设定衍生创作，全文以 <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.zh-hans" target="_blank" rel="noopener">CC BY-SA 3.0</a> 协议授权共享。虚构叙事与真实机构无关。
            </p>
          </div>
        </div>

        <div class="novel-chap-directory">
          <div class="novel-dir-header">
            <span class="lapidary-serif">SEPARABIS TERRAM AB IGNE · 全书章节目录</span>
            <span class="novel-dir-note">完成每章调阅可领取 +30 XP 现场调查线索</span>
          </div>
          <div class="novel-chap-list">
            ${renderChapterRowsHtml(merged, chapters, progress, clueSet)}
          </div>
        </div>
      </article>
    </div>
  `;
}

async function renderChapterReaderView(rootEl, book, ch, chapters, ctx, registerCleanup) {
  const chIdx = chapters.findIndex((c) => c.id === ch.id);
  const prevChap = chIdx > 0 ? chapters[chIdx - 1] : null;
  const nextChap = chIdx >= 0 && chIdx < chapters.length - 1 ? chapters[chIdx + 1] : null;

  const [rawMd, autolinkIndex, manifest] = await Promise.all([
    ctx.fetchText(ch.path),
    ctx.getAutolinkIndex ? ctx.getAutolinkIndex() : Promise.resolve([]),
    ctx.getManifest(),
  ]);

  const { meta, blocks } = parseMarkdownChapter(rawMd);
  const cState = ctx?.clearance?.getClearanceState?.() || { level: 1, clues: [], revealedIds: [] };
  const currentClearance = Number(cState.level) || 1;

  const chNum = Number(meta.chapterNumber || ch.chapterNumber) || chIdx + 1;
  const chTitle = meta.title || ch.title || `第 ${chNum} 章`;
  const estMin =
    Number(meta.estimatedMinutes || ch.estimatedMinutes) ||
    Math.max(2, Math.ceil((Number(ch.charCount) || rawMd.length) / 420));

  const clueId = isValidId(meta.clueId)
    ? meta.clueId
    : isValidId(ch.clueId)
      ? ch.clueId
      : `novel-${ch.id}`;
  const clueTitle = meta.clueTitle || ch.clueTitle || `完成调阅：${chTitle}`;
  const clueXp = Number(meta.clueXp || ch.clueXp) || 30;
  const alreadyClaimed = Array.isArray(cState.clues) && cState.clues.some((c) => c.id === clueId);

  // Render Markdown blocks with per-section linkedSet so each archive term auto-links at most once per section
  let linkedSet = new Set();
  let pIdx = 0;
  const bodyHtml = blocks
    .map((blk) => {
      if (blk.type === "heading") {
        if (blk.level === 1 && blk.text === chTitle) return "";
        linkedSet = new Set();
        const tag = blk.level <= 2 ? "h2" : "h3";
        const cls = blk.level <= 2 ? "novel-subheading" : "novel-subheading-sm";
        return `<${tag} class="${cls}">${escapeHtml(blk.text)}</${tag}>`;
      }
      if (blk.type === "hr") {
        linkedSet = new Set();
        return `<div class="novel-scene-break" role="separator" aria-label="场景转换"><span class="novel-scene-glyph">☉&#xFE0E;</span></div>`;
      }
      if (blk.type === "blockquote") {
        const linesHtml = blk.lines
          .map((line) => {
            const idx = pIdx++;
            return `<p class="novel-quote-line">${renderNovelProse(
              line,
              {
                autolinkIndex,
                currentClearance,
                linkMode: "drawer",
                redactPrefix: `${ch.id}-bq-${idx}`,
                linkedSet,
              },
              ctx
            )}</p>`;
          })
          .join("");
        return `<blockquote class="novel-blockquote">${linesHtml}</blockquote>`;
      }
      const idx = pIdx++;
      return `<p class="novel-para">${renderNovelProse(
        blk.text,
        {
          autolinkIndex,
          currentClearance,
          linkMode: "drawer",
          redactPrefix: `${ch.id}-${idx}`,
          linkedSet,
        },
        ctx
      )}</p>`;
    })
    .join("\n");

  const prefs = readReaderPrefs();
  const fsObj = FONT_SIZES.find((f) => f.key === prefs.fontSize) || FONT_SIZES[1];
  const lhObj = LINE_HEIGHTS.find((l) => l.key === prefs.lineHeight) || LINE_HEIGHTS[1];
  const curTheme = getCurrentTheme();

  const savedProg = readNovelProgress();
  const savedForThisChap =
    savedProg?.bookId === book.bookId && savedProg?.chapterId === ch.id
      ? savedProg
      : savedProg?.books?.[book.bookId]?.chapterId === ch.id
        ? savedProg.books[book.bookId]
        : null;
  const initialRatio = savedForThisChap ? savedForThisChap.scrollRatio : 0;

  // Record active chapter immediately (preserving saved scrollRatio if returning to same chapter)
  writeNovelProgress({
    bookId: book.bookId,
    chapterId: ch.id,
    chapterNumber: chNum,
    chapterTitle: chTitle,
    scrollRatio: initialRatio,
  });

  rootEl.innerHTML = `
    <div class="p3-shell novel-reader-shell" style="--novel-font-size:${fsObj.px}; --novel-line-height:${lhObj.lh};">
      <nav class="p3-breadcrumb" aria-label="面包屑导航">
        <a href="#/">档案馆大厅</a>
        <span>/</span>
        <a href="#/novel">小说书架</a>
        <span>/</span>
        <a href="#/novel/${encodeURIComponent(book.bookId)}">${escapeHtml(book.title)}</a>
        <span>/</span>
        <span>第 ${chNum} 章</span>
      </nav>

      <!-- Reader Typography & Paper Controls Toolbar -->
      <div class="novel-toolbar" role="toolbar" aria-label="阅读排版控制">
        <div class="novel-toolbar-group">
          <span class="novel-ctrl-label">字号</span>
          ${FONT_SIZES.map(
            (f) =>
              `<button type="button" class="novel-ctrl-btn ${f.key === prefs.fontSize ? "active" : ""}" data-reader-fs="${f.key}">${f.label}</button>`
          ).join("")}
        </div>
        <div class="novel-toolbar-group">
          <span class="novel-ctrl-label">行距</span>
          ${LINE_HEIGHTS.map(
            (l) =>
              `<button type="button" class="novel-ctrl-btn ${l.key === prefs.lineHeight ? "active" : ""}" data-reader-lh="${l.key}">${l.label}</button>`
          ).join("")}
        </div>
        <div class="novel-toolbar-group">
          <span class="novel-ctrl-label">底色</span>
          <button type="button" class="novel-ctrl-btn ${curTheme === "day" ? "active" : ""}" data-reader-theme="day">纸本</button>
          <button type="button" class="novel-ctrl-btn ${curTheme === "night" ? "active" : ""}" data-reader-theme="night">夜间</button>
        </div>
        <div class="novel-toolbar-group novel-toolbar-right">
          <span id="novel-scroll-indicator" class="novel-progress-readout">进度 ${Math.round(initialRatio * 100)}%</span>
          <a class="novel-ctrl-btn" href="#/novel/${encodeURIComponent(book.bookId)}">章节目录</a>
        </div>
      </div>

      <!-- Main Reading Paper Sheet -->
      <article class="novel-paper-sheet">
        <header class="novel-chapter-header">
          <div class="novel-badge-row">
            <span class="badge-original">本站原创 · 克苏鲁新怪谈</span>
            <span class="novel-stat-pill">CAPVT ${chNum} · 约 ${estMin} 分钟</span>
            <span class="novel-stat-pill">当前权限 Lv.${currentClearance}</span>
          </div>
          <h1 class="condensed-monument novel-chapter-title">${escapeHtml(chTitle)}</h1>
          <div class="novel-chapter-subnote">
            提示：点击文中带虚线底纹的档案术语可展开页内速览抽屉；点击加密黑条可按当前权限等级显影机密记录。
          </div>
        </header>

        <div id="novel-prose-body" class="novel-prose-body">
          ${bodyHtml}
        </div>

        <!-- Chapter Completion & Clue Grant Card -->
        <section id="novel-clue-card" class="novel-clue-card ${alreadyClaimed ? "is-claimed" : ""}">
          <div class="novel-clue-info">
            <div class="lapidary-serif">VIS EIVS INTEGRA EST · 章节调查线索归档</div>
            <div class="novel-clue-title">${escapeHtml(clueTitle)}</div>
            <div id="novel-clue-status" class="novel-clue-desc">
              ${
                alreadyClaimed
                  ? `已收录至您的权限档案台账（+${clueXp} XP），可在调查终端解锁对应加密分支。`
                  : `完成本章阅读即可将现场声呐与奇术线索记入权限档案（奖励 +${clueXp} XP）。`
              }
            </div>
          </div>
          <div class="novel-clue-action">
            <button
              type="button"
              id="btn-claim-novel-clue"
              class="bp-btn ${alreadyClaimed ? "" : "active"}"
              data-claim-chapter-clue="1"
              ${alreadyClaimed ? "disabled" : ""}
            >
              ${alreadyClaimed ? `已领取线索 (+${clueXp} XP)` : `完成本章调阅 · 领取调查线索 (+${clueXp} XP)`}
            </button>
          </div>
        </section>

        <!-- Chapter Bottom Navigation -->
        <nav class="novel-chapter-nav" aria-label="章节翻页导航">
          ${
            prevChap
              ? `<a class="bp-btn novel-nav-prev" href="#/novel/${encodeURIComponent(book.bookId)}/${encodeURIComponent(prevChap.id)}">← 上一章：${escapeHtml(prevChap.title)}</a>`
              : `<a class="bp-btn novel-nav-prev" href="#/novel/${encodeURIComponent(book.bookId)}">← 返回《${escapeHtml(book.title)}》目录</a>`
          }
          <a class="bp-btn" href="#/novel">全部书架</a>
          ${
            nextChap
              ? `<a class="bp-btn active novel-nav-next" href="#/novel/${encodeURIComponent(book.bookId)}/${encodeURIComponent(nextChap.id)}">下一章：${escapeHtml(nextChap.title)} →</a>`
              : `<a class="bp-btn active novel-nav-next" href="#/play">终章已毕 · 前往调查终端 →</a>`
          }
        </nav>
      </article>

      <footer class="cc-footer">
        《${escapeHtml(book.title)}》为<b>本站原创克苏鲁新怪谈连载</b>，遵循 <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.zh-hans" target="_blank" rel="noopener">CC BY-SA 3.0</a> 协议发布。本站为虚构作品，与真实机构或地点无关。
      </footer>

      <!-- In-Page Dossier Slide-Over / Bottom-Sheet Drawer -->
      <div id="novel-drawer-backdrop" class="novel-drawer-backdrop" data-close-novel-drawer="1" aria-hidden="true"></div>
      <aside id="novel-entry-drawer" class="novel-entry-drawer custom-scroll" aria-hidden="true" aria-label="词条速览抽屉">
        <div id="novel-drawer-inner" class="novel-drawer-inner"></div>
      </aside>
    </div>
  `;

  const shellEl = rootEl.querySelector(".novel-reader-shell");
  const drawerEl = rootEl.querySelector("#novel-entry-drawer");
  const backdropEl = rootEl.querySelector("#novel-drawer-backdrop");
  const drawerInner = rootEl.querySelector("#novel-drawer-inner");
  const scrollInd = rootEl.querySelector("#novel-scroll-indicator");
  const scrollHost = getScrollHost(rootEl);

  let clueClaimedLocal = alreadyClaimed;

  const claimChapterClue = (autoTriggered = false) => {
    if (clueClaimedLocal) return;
    clueClaimedLocal = true;
    const res = ctx?.clearance?.grantClue?.({
      id: clueId,
      title: clueTitle,
      xp: clueXp,
      source: "novel",
    });
    const cardEl = rootEl.querySelector("#novel-clue-card");
    const statusEl = rootEl.querySelector("#novel-clue-status");
    const btnEl = rootEl.querySelector("#btn-claim-novel-clue");
    if (cardEl) cardEl.classList.add("is-claimed");
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.classList.remove("active");
      btnEl.textContent = `已领取线索 (+${clueXp} XP)`;
    }
    if (statusEl) {
      const lvMsg = res?.leveledUp ? ` 权限已晋升至 Lv.${res.level}！` : "";
      statusEl.textContent = `${autoTriggered ? "已读至章末并自动归档线索" : "已成功收录调查线索"}（+${clueXp} XP）。${lvMsg}`;
    }
    if (res?.granted) {
      ctx?.clearance?.showClearanceToast?.(
        res.leveledUp
          ? `收录小说线索 +${clueXp} XP · 权限晋升至 Lv.${res.level}`
          : `收录小说线索：${clueTitle} (+${clueXp} XP)`
      );
    }
  };

  const closeDrawer = () => {
    if (!drawerEl || !backdropEl) return;
    drawerEl.classList.remove("open");
    backdropEl.classList.remove("open");
    drawerEl.setAttribute("aria-hidden", "true");
  };

  const openEntryDrawer = async (entryId) => {
    if (!isValidId(entryId) || !drawerEl || !drawerInner || !backdropEl) return;
    drawerEl.classList.add("open");
    backdropEl.classList.add("open");
    drawerEl.setAttribute("aria-hidden", "false");
    drawerInner.innerHTML = `
      <div class="novel-drawer-top">
        <span class="lapidary-serif">VERVM SINE MENDACIO · 馆藏速览</span>
        <button type="button" class="bp-btn novel-drawer-close" data-close-novel-drawer="1">关闭抽屉 ×</button>
      </div>
      <p class="prose-read">正在调取馆藏卷宗 ${escapeHtml(entryId)} ……</p>
    `;

    let entry = null;
    try {
      if (ctx?.fetchEntry) entry = await ctx.fetchEntry(entryId);
    } catch (_) {}
    if (!entry && Array.isArray(manifest?.entries)) {
      entry = manifest.entries.find((e) => e.id === entryId) || null;
    }

    if (!entry) {
      drawerInner.innerHTML = `
        <div class="novel-drawer-top">
          <span class="lapidary-serif">VERVM SINE MENDACIO · 馆藏速览</span>
          <button type="button" class="bp-btn novel-drawer-close" data-close-novel-drawer="1">关闭抽屉 ×</button>
        </div>
        <h3 class="condensed-monument novel-drawer-title">档案库未收录：${escapeHtml(entryId)}</h3>
        <p class="prose-read">当前索引中未找到该编号对应的详细卷宗。</p>
        <div class="novel-drawer-actions">
          <button type="button" class="bp-btn active" data-close-novel-drawer="1">返回继续阅读</button>
        </div>
      `;
      return;
    }

    ctx?.clearance?.recordEntryRead?.(entry.id, entry.title);
    const liveLv = ctx?.clearance?.getClearanceState?.()?.level || currentClearance;
    const isOrig = entry.provenance === "original";
    const provBadgeCls = isOrig ? "badge-original" : "badge-canon";
    const provText =
      entry.provenanceLabel ||
      (isOrig
        ? "本站原创设定"
        : entry.provenance === "cthulhu-canon"
          ? "克苏鲁神话原典"
          : "SCP 基金会原典");

    const infoRows = Array.isArray(entry.infobox) ? entry.infobox.slice(0, 6) : [];
    const coordStr = formatEntryCoord(entry.geo);
    const infoboxHtml =
      infoRows.length || coordStr
        ? `<div class="infobox-list novel-drawer-infobox">` +
          infoRows
            .map(
              (r) =>
                `<div class="infobox-item"><span class="infobox-label">${escapeHtml(r.label)}：</span><span class="infobox-val">${escapeHtml(r.value)}</span>${
                  r.original ? '<span class="orig-field-tag">本站设定</span>' : ""
                }</div>`
            )
            .join("") +
          (coordStr
            ? `<div class="infobox-item"><span class="infobox-label">地理坐标：</span><span class="infobox-val">${escapeHtml(coordStr)}</span></div>`
            : "") +
          `</div>`
        : "";

    const summaryHtml = renderNovelProse(
      entry.summary || "",
      {
        autolinkIndex,
        excludeId: entry.id,
        currentClearance: liveLv,
        linkMode: "drawer",
        redactPrefix: `drawer-${entry.id}`,
        linkedSet: new Set(),
      },
      ctx
    );

    const mapTarget = entry.geo ? entry.id : entry.mapSiteId || "";

    drawerInner.innerHTML = `
      <div class="novel-drawer-top">
        <span class="lapidary-serif">VERVM SINE MENDACIO · 词条速览</span>
        <button type="button" class="bp-btn novel-drawer-close" data-close-novel-drawer="1">关闭抽屉 ×</button>
      </div>
      <div class="novel-badge-row">
        <span class="${provBadgeCls}">${escapeHtml(entry.code || String(entry.category || "ENTRY").toUpperCase())}</span>
        <span class="${provBadgeCls}">${escapeHtml(provText)}</span>
        <span class="novel-stat-pill">Lv.${Number(entry.clearance) || 1}</span>
      </div>
      <h3 class="condensed-monument novel-drawer-title">${escapeHtml(entry.title)}</h3>
      ${infoboxHtml}
      <div class="prose-read novel-drawer-summary">${summaryHtml}</div>
      ${
        entry.scripture
          ? `<blockquote class="novel-blockquote novel-drawer-quote">${escapeHtml(entry.scripture)}</blockquote>`
          : ""
      }
      <div class="novel-drawer-actions">
        <a class="bp-btn active" href="#/entry/${encodeURIComponent(entry.id)}">打开完整词条 →</a>
        ${
          mapTarget
            ? `<a class="bp-btn" href="#/map/${encodeURIComponent(mapTarget)}">铜版舆图定位 →</a>`
            : ""
        }
        <button type="button" class="bp-btn" data-close-novel-drawer="1">关闭抽屉 ×</button>
      </div>
    `;
  };

  // Delegated click handler inside rootEl
  const onRootClick = (e) => {
    const closeBtn = e.target.closest("[data-close-novel-drawer]");
    if (closeBtn) {
      e.preventDefault();
      closeDrawer();
      return;
    }

    const drawerTrigger = e.target.closest("[data-entry-drawer]");
    if (drawerTrigger) {
      e.preventDefault();
      openEntryDrawer(drawerTrigger.getAttribute("data-entry-drawer"));
      return;
    }

    const fsBtn = e.target.closest("[data-reader-fs]");
    if (fsBtn && shellEl) {
      const nextFs = fsBtn.getAttribute("data-reader-fs");
      const found = FONT_SIZES.find((f) => f.key === nextFs);
      if (found) {
        const cur = readReaderPrefs();
        cur.fontSize = found.key;
        saveReaderPrefs(cur);
        shellEl.style.setProperty("--novel-font-size", found.px);
        rootEl.querySelectorAll("[data-reader-fs]").forEach((b) => {
          b.classList.toggle("active", b.getAttribute("data-reader-fs") === found.key);
        });
      }
      return;
    }

    const lhBtn = e.target.closest("[data-reader-lh]");
    if (lhBtn && shellEl) {
      const nextLh = lhBtn.getAttribute("data-reader-lh");
      const found = LINE_HEIGHTS.find((l) => l.key === nextLh);
      if (found) {
        const cur = readReaderPrefs();
        cur.lineHeight = found.key;
        saveReaderPrefs(cur);
        shellEl.style.setProperty("--novel-line-height", found.lh);
        rootEl.querySelectorAll("[data-reader-lh]").forEach((b) => {
          b.classList.toggle("active", b.getAttribute("data-reader-lh") === found.key);
        });
      }
      return;
    }

    const themeBtn = e.target.closest("[data-reader-theme]");
    if (themeBtn) {
      const targetTheme = themeBtn.getAttribute("data-reader-theme");
      setDocumentTheme(targetTheme);
      rootEl.querySelectorAll("[data-reader-theme]").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-reader-theme") === getCurrentTheme());
      });
      return;
    }

    const claimBtn = e.target.closest("[data-claim-chapter-clue]");
    if (claimBtn) {
      e.preventDefault();
      claimChapterClue(false);
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

  const onKeyDown = (e) => {
    if (e.key === "Escape" && drawerEl?.classList.contains("open")) {
      closeDrawer();
    }
  };
  document.addEventListener("keydown", onKeyDown);

  // Sync theme buttons if user clicks #btn-theme in #top-nav
  const themeObserver = new MutationObserver(() => {
    const t = getCurrentTheme();
    rootEl.querySelectorAll("[data-reader-theme]").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-reader-theme") === t);
    });
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  // Debounced scroll progress tracking & restoration on #stage-novel
  let scrollTimer = null;
  let restoringScroll = true;

  const computeScrollRatio = () => {
    if (!scrollHost) return 0;
    const maxScroll = scrollHost.scrollHeight - scrollHost.clientHeight;
    if (maxScroll <= 4) return 1;
    return Math.max(0, Math.min(1, scrollHost.scrollTop / maxScroll));
  };

  const onScroll = () => {
    if (restoringScroll) return;
    const ratio = computeScrollRatio();
    if (scrollInd) {
      scrollInd.textContent = `进度 ${Math.round(ratio * 100)}%`;
    }
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      writeNovelProgress({
        bookId: book.bookId,
        chapterId: ch.id,
        chapterNumber: chNum,
        chapterTitle: chTitle,
        scrollRatio: ratio,
      });
      if (ratio >= 0.94 && !clueClaimedLocal) {
        claimChapterClue(true);
      }
    }, 160);
  };

  if (scrollHost) {
    scrollHost.addEventListener("scroll", onScroll, { passive: true });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!scrollHost) return;
        const maxScroll = Math.max(0, scrollHost.scrollHeight - scrollHost.clientHeight);
        if (initialRatio > 0.01 && maxScroll > 0) {
          scrollHost.scrollTop = Math.round(initialRatio * maxScroll);
        } else {
          scrollHost.scrollTop = 0;
        }
        restoringScroll = false;
      });
    });
  } else {
    restoringScroll = false;
  }

  registerCleanup(() => {
    rootEl.removeEventListener("click", onRootClick);
    document.removeEventListener("keydown", onKeyDown);
    themeObserver.disconnect();
    if (scrollTimer) clearTimeout(scrollTimer);
    if (scrollHost) scrollHost.removeEventListener("scroll", onScroll);
  });
}

export async function renderNovelView(rootEl, subRoute, ctx) {
  if (!rootEl) return;
  if (typeof rootEl._novelCleanup === "function") {
    try {
      rootEl._novelCleanup();
    } catch (_) {}
    rootEl._novelCleanup = null;
  }

  const registerCleanup = (fn) => {
    rootEl._novelCleanup = fn;
  };

  const scrollHost = getScrollHost(rootEl);
  const cleanSub = String(subRoute || "")
    .split("?")[0]
    .replace(/^\/+|\/+$/g, "")
    .trim();
  const segments = cleanSub ? cleanSub.split("/").filter(Boolean) : [];

  const manifest = await ctx.getManifest();
  const books = Array.isArray(manifest?.novels) ? manifest.novels : [];
  const progress = readNovelProgress();

  // 1. Bookshelf View (#/novel)
  if (segments.length === 0) {
    if (scrollHost) scrollHost.scrollTop = 0;
    renderBookshelfView(rootEl, books, progress, ctx);
    return;
  }

  // Validate bookId
  const rawBookId = segments[0].toLowerCase();
  const book = isValidId(rawBookId) ? books.find((b) => b.bookId === rawBookId) : null;

  if (!book) {
    if (scrollHost) scrollHost.scrollTop = 0;
    rootEl.innerHTML = `
      <div class="p3-shell novel-shell">
        <div class="archive-card">
          <div class="lapidary-serif">SEPARABIS SVBTILE A SPISSO · 卷宗未命中</div>
          <h2 class="condensed-monument" style="font-size:26px;">未收录小说卷宗：${escapeHtml(segments[0])}</h2>
          <p class="prose-read">请返回连载小说书架选择馆藏已收录的原创新怪谈卷宗。</p>
          <div><a class="bp-btn active" href="#/novel">返回连载小说书架 →</a></div>
        </div>
      </div>
    `;
    return;
  }

  // 2. Book Cover & Directory View (#/novel/<bookId>)
  if (segments.length === 1) {
    if (scrollHost) scrollHost.scrollTop = 0;
    await renderBookDetailView(rootEl, book, progress, ctx);
    return;
  }

  // 3. Chapter Reader View (#/novel/<bookId>/<chapterId>)
  const chapters = Array.isArray(book.chapters) ? book.chapters : [];
  const targetChap = matchChapter(chapters, segments[1]);

  if (!targetChap) {
    if (scrollHost) scrollHost.scrollTop = 0;
    rootEl.innerHTML = `
      <div class="p3-shell novel-shell">
        <div class="archive-card">
          <div class="lapidary-serif">SEPARABIS SVBTILE A SPISSO · 章节未命中</div>
          <h2 class="condensed-monument" style="font-size:26px;">未找到章节：${escapeHtml(segments[1])}</h2>
          <p class="prose-read">《${escapeHtml(book.title)}》当前未包含该章节代号，请从章节目录重新选择。</p>
          <div class="novel-book-cta-row">
            <a class="bp-btn active" href="#/novel/${encodeURIComponent(book.bookId)}">返回《${escapeHtml(book.title)}》目录 →</a>
            <a class="bp-btn" href="#/novel">返回小说书架</a>
          </div>
        </div>
      </div>
    `;
    return;
  }

  await renderChapterReaderView(rootEl, book, targetChap, chapters, ctx, registerCleanup);
}
