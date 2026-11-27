/**
 * js/markdown.js
 * Security-first parser & renderer for Theologia Caerulea dossier/guide Markdown (DEPTH_CONTRACT §2 & §6).
 *
 * Strict rules:
 *  - Escapes ALL raw input first; accepts ONLY front matter, ## / ### headings, paragraphs,
 *    `**label**` strong spans, `> ` quotes, `- ` lists, `| a | b |` tables, `---` rules,
 *    `::: doc ... :::` attachment blocks, `::: figure ... :::` figure blocks,
 *    whitelisted `{{redact:N:text}}` and `[[entry-id|label]]`.
 *  - Rejects raw HTML, `[text](javascript:...)`, external images, and invalid figure `src` paths.
 */

import { escapeHtml } from "./sanitize.js";
import { renderProseWithLinks } from "./autolink.js";

export const DOC_TYPE_LABELS = {
  report: "研究报告",
  interview: "访谈记录",
  "test-log": "实验记录",
  exploration: "探索日志",
  notes: "研究员手记",
  letter: "信件",
  clipping: "剪报",
  incident: "事故报告",
  memo: "备忘录",
  transcript: "通讯转录",
};

export const VALID_DOC_TYPES = new Set(Object.keys(DOC_TYPE_LABELS));
export const VALID_DOC_ORIGINS = new Set(["canon", "original"]);
export const VALID_FIGURE_SRC_RE = /^assets\/plates\/[a-z0-9][a-z0-9-]*-\d{2,3}\.webp$/;

const ATTR_RE = /(\w+)=(?:"([^"]*)"|(\S+))/g;
const TABLE_ROW_RE = /^\|.*\|$/;
const TABLE_SEP_RE = /^\|[\s:|-]+\|$/;
const MAX_TABLE_COLS = 24;
const MAX_TABLE_ROWS = 400;

export function parseDirectiveAttrs(headerRest) {
  const attrs = {};
  const str = String(headerRest ?? "");
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(str)) !== null) {
    const key = m[1];
    const val = m[2] !== undefined ? m[2] : m[3];
    attrs[key] = val;
  }
  return attrs;
}

export function stripFrontMatter(rawMd) {
  const normalized = String(rawMd ?? "").replace(/\u0000/g, "").replace(/\r\n/g, "\n");
  const frontMatter = {};
  let body = normalized;

  if (normalized.startsWith("---\n")) {
    const m = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (m) {
      for (const line of m[1].split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf(":");
        if (idx < 0) continue;
        const k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        frontMatter[k] = v;
      }
      body = m[2];
    }
  }
  return { frontMatter, body };
}

function splitTableCells(line) {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner
    .split("|")
    .slice(0, MAX_TABLE_COLS)
    .map((c) => c.trim());
}

function parseInnerBlocks(lines, idState, allowDirectives) {
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Directives: ::: doc ... or ::: figure ...
    if (allowDirectives && trimmed.startsWith(":::") && trimmed.length > 3) {
      const rest = trimmed.slice(3).trim();
      const spaceIdx = rest.search(/\s/);
      const kind = (spaceIdx < 0 ? rest : rest.slice(0, spaceIdx)).toLowerCase();
      const attrPart = spaceIdx < 0 ? "" : rest.slice(spaceIdx + 1);
      const attrs = parseDirectiveAttrs(attrPart);

      const innerLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ":::") {
        innerLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim() === ":::") {
        i++; // consume closing :::
      }

      if (kind === "doc") {
        const docId = `doc-${++idState.docSeq}`;
        const rawType = String(attrs.type || "report").trim();
        const docType = VALID_DOC_TYPES.has(rawType) ? rawType : "report";
        const rawOrigin = String(attrs.origin || "original").trim();
        const origin = VALID_DOC_ORIGINS.has(rawOrigin) ? rawOrigin : "original";
        const clearance = Math.min(5, Math.max(1, parseInt(attrs.clearance, 10) || 1));
        const code = String(attrs.code || "").trim();
        const title = String(attrs.title || code || DOC_TYPE_LABELS[docType]).trim();
        const date = String(attrs.date || "").trim();
        const author = String(attrs.author || "").trim();

        const children = parseInnerBlocks(innerLines, idState, false);
        blocks.push({
          type: "doc",
          id: docId,
          docType,
          docTypeLabel: DOC_TYPE_LABELS[docType],
          code,
          title,
          date,
          author,
          clearance,
          origin,
          children,
        });
        idState.toc.push({
          id: docId,
          level: 2,
          kind: "doc",
          text: code ? `${code} · ${title}` : title,
          clearance,
        });
        continue;
      }

      if (kind === "figure") {
        const figId = `fig-${++idState.figSeq}`;
        const rawSrc = String(attrs.src || "").trim();
        const validSrc = VALID_FIGURE_SRC_RE.test(rawSrc) ? rawSrc : "";
        const prompt = String(attrs.prompt || "").trim();
        const caption = innerLines
          .map((l) => l.trim())
          .filter(Boolean)
          .join(" ");
        blocks.push({
          type: "figure",
          id: figId,
          src: validSrc,
          rawSrc,
          prompt,
          caption,
        });
        continue;
      }

      // Unknown directive: treat inner content as safe escaped paragraphs (never raw HTML)
      const fallbackChildren = parseInnerBlocks(innerLines, idState, false);
      blocks.push(...fallbackChildren);
      continue;
    }

    // Stray closing ::: line
    if (trimmed === ":::") {
      i++;
      continue;
    }

    // Horizontal rule ---
    if (/^-{3,}$/.test(trimmed)) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }

    // Headings ## or ### (clamp # to 2)
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const hashes = headingMatch[1].length;
      const level = hashes <= 2 ? 2 : 3;
      const text = headingMatch[2].replace(/\s+#+\s*$/, "").trim();
      const secId = `sec-${++idState.secSeq}`;
      blocks.push({
        type: "heading",
        id: secId,
        level,
        text,
      });
      if (allowDirectives) {
        idState.toc.push({
          id: secId,
          level,
          kind: "heading",
          text,
        });
      }
      i++;
      continue;
    }

    // Blockquote > ...
    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "quote",
        text: quoteLines.join("\n"),
      });
      continue;
    }

    // Unordered list - ...
    if (/^-\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^-\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^-\s+/, "").trim());
        i++;
      }
      blocks.push({
        type: "list",
        items,
      });
      continue;
    }

    // Pipe table | a | b |
    if (TABLE_ROW_RE.test(trimmed)) {
      const rawTableLines = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i].trim())) {
        if (rawTableLines.length < MAX_TABLE_ROWS + 2) {
          rawTableLines.push(lines[i].trim());
        }
        i++;
      }
      if (rawTableLines.length >= 2 && TABLE_SEP_RE.test(rawTableLines[1])) {
        const headers = splitTableCells(rawTableLines[0]);
        const rows = rawTableLines.slice(2).map(splitTableCells);
        blocks.push({ type: "table", headers, rows });
      } else {
        const headers = [];
        const rows = rawTableLines.map(splitTableCells);
        blocks.push({ type: "table", headers, rows });
      }
      continue;
    }

    // Paragraph (coalesce consecutive plain lines until blank line or block starter)
    const paraLines = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (
        !cur ||
        cur.startsWith(":::") ||
        /^-{3,}$/.test(cur) ||
        /^#{1,3}\s+/.test(cur) ||
        /^>\s?/.test(cur) ||
        /^-\s+/.test(cur) ||
        TABLE_ROW_RE.test(cur)
      ) {
        break;
      }
      paraLines.push(cur);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({
        type: "paragraph",
        text: paraLines.join(" "),
      });
    }
  }

  return blocks;
}

/**
 * Parses archival Markdown into structured AST blocks + Table of Contents.
 */
export function parseArchivalMarkdown(rawMd) {
  const { frontMatter, body } = stripFrontMatter(rawMd);
  const lines = body.split("\n");
  const idState = { secSeq: 0, docSeq: 0, figSeq: 0, toc: [] };
  const blocks = parseInnerBlocks(lines, idState, true);
  return {
    frontMatter,
    blocks,
    toc: idState.toc,
  };
}

/**
 * Safe inline renderer:
 * 1. Runs renderProseWithLinks (escapes ALL raw HTML characters `<>&"'`, handles
 *    whitelisted `{{redact:N:...}}`, `[[id|label]]`, and longest-match autolinks).
 * 2. Protects emitted HTML tags behind NUL tokens so `**bold**` never touches tag attributes,
 *    converts `**...**` in already-escaped text to `<strong class="wiki-md-strong">...</strong>`,
 *    and restores tokens. Never parses `[label](url)` or `![alt](url)`.
 */
export function renderInlineMarkdown(rawText, options = {}) {
  const baseSafeHtml = renderProseWithLinks(String(rawText ?? ""), options);
  if (!baseSafeHtml.includes("**")) {
    return baseSafeHtml;
  }

  const tagTokens = [];
  const withProtectedTags = baseSafeHtml.replace(/<[^>]+>/g, (tag) => {
    const idx = tagTokens.length;
    tagTokens.push(tag);
    return `\u0000TAG_${idx}\u0000`;
  });

  const withStrong = withProtectedTags.replace(
    /\*\*([^*\n]{1,160}?)\*\*/g,
    '<strong class="wiki-md-strong">$1</strong>'
  );

  return withStrong.replace(/\u0000TAG_(\d+)\u0000/g, (_, idx) => tagTokens[Number(idx)] ?? "");
}

function stripInlineSyntaxPlain(rawText) {
  return String(rawText ?? "")
    .replace(/\{\{redact:(\d+):([\s\S]*?)\}\}/g, "[机密遮蔽]")
    .replace(/\[\[([a-z0-9][a-z0-9-]*)(?:\|([^\]]+))?\]\]/g, (_, id, label) =>
      label && label.trim() ? label.trim() : id
    )
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}

function renderBlockList(blocks, ctxState) {
  const htmlParts = [];

  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const block = blocks[bIdx];
    if (!block) continue;

    if (block.type === "heading") {
      // Reset autolink linkedSet at every H2 section boundary so each section links terms once
      if (block.level === 2 && !ctxState.insideDoc) {
        ctxState.linkedSet = new Set();
        ctxState.sectionIdx++;
      }
      const tag = block.level === 3 ? "h3" : "h2";
      const cls = block.level === 3 ? "wiki-md-h3" : "wiki-md-h2";
      const safeHeading = escapeHtml(stripInlineSyntaxPlain(block.text));
      htmlParts.push(`<${tag} id="${escapeHtml(block.id)}" class="${cls}">${safeHeading}</${tag}>`);
      continue;
    }

    if (block.type === "rule") {
      htmlParts.push('<hr class="wiki-md-rule" />');
      continue;
    }

    if (block.type === "paragraph") {
      const inner = renderInlineMarkdown(block.text, {
        autolinkIndex: ctxState.autolinkIndex,
        excludeId: ctxState.excludeId,
        currentClearance: ctxState.currentClearance,
        linkMode: ctxState.linkMode,
        redactPrefix: `${ctxState.prefix}-s${ctxState.sectionIdx}-b${bIdx}`,
        linkedSet: ctxState.linkedSet,
      });
      htmlParts.push(`<p class="prose-read wiki-md-p">${inner}</p>`);
      continue;
    }

    if (block.type === "quote") {
      const quoteLines = String(block.text || "")
        .split("\n")
        .filter((l) => l.trim().length > 0);
      const inner = quoteLines
        .map(
          (line, qIdx) =>
            `<p class="prose-read">${renderInlineMarkdown(line, {
              autolinkIndex: ctxState.autolinkIndex,
              excludeId: ctxState.excludeId,
              currentClearance: ctxState.currentClearance,
              linkMode: ctxState.linkMode,
              redactPrefix: `${ctxState.prefix}-q${bIdx}-${qIdx}`,
              linkedSet: ctxState.linkedSet,
            })}</p>`
        )
        .join("");
      htmlParts.push(`<blockquote class="wiki-md-quote">${inner}</blockquote>`);
      continue;
    }

    if (block.type === "list") {
      const lis = (block.items || [])
        .map(
          (it, liIdx) =>
            `<li>${renderInlineMarkdown(it, {
              autolinkIndex: ctxState.autolinkIndex,
              excludeId: ctxState.excludeId,
              currentClearance: ctxState.currentClearance,
              linkMode: ctxState.linkMode,
              redactPrefix: `${ctxState.prefix}-l${bIdx}-${liIdx}`,
              linkedSet: ctxState.linkedSet,
            })}</li>`
        )
        .join("");
      htmlParts.push(`<ul class="wiki-md-list">${lis}</ul>`);
      continue;
    }

    if (block.type === "table") {
      const colCount = Math.max(
        block.headers?.length || 0,
        ...(block.rows || []).map((r) => r.length),
        1
      );
      const theadHtml =
        block.headers && block.headers.length > 0
          ? `<thead><tr>${Array.from({ length: colCount }, (_, c) => {
              const cell = block.headers[c] ?? "";
              return `<th scope="col">${renderInlineMarkdown(cell, {
                autolinkIndex: [],
                excludeId: ctxState.excludeId,
                currentClearance: ctxState.currentClearance,
                linkMode: ctxState.linkMode,
                redactPrefix: `${ctxState.prefix}-th${bIdx}-${c}`,
              })}</th>`;
            }).join("")}</tr></thead>`
          : "";

      const tbodyHtml = `<tbody>${(block.rows || [])
        .map(
          (row, rIdx) =>
            `<tr>${Array.from({ length: colCount }, (_, c) => {
              const cell = row[c] ?? "";
              return `<td>${renderInlineMarkdown(cell, {
                autolinkIndex: ctxState.autolinkIndex,
                excludeId: ctxState.excludeId,
                currentClearance: ctxState.currentClearance,
                linkMode: ctxState.linkMode,
                redactPrefix: `${ctxState.prefix}-td${bIdx}-${rIdx}-${c}`,
                linkedSet: ctxState.linkedSet,
              })}</td>`;
            }).join("")}</tr>`
        )
        .join("")}</tbody>`;

      htmlParts.push(
        `<div class="wiki-table-scroll"><table class="wiki-md-table">${theadHtml}${tbodyHtml}</table></div>`
      );
      continue;
    }

    if (block.type === "figure") {
      const plainCap = stripInlineSyntaxPlain(block.caption || "馆藏铜版插图");
      const capHtml = block.caption
        ? renderInlineMarkdown(block.caption, {
            autolinkIndex: ctxState.autolinkIndex,
            excludeId: ctxState.excludeId,
            currentClearance: ctxState.currentClearance,
            linkMode: ctxState.linkMode,
            redactPrefix: `${ctxState.prefix}-fig${bIdx}`,
            linkedSet: ctxState.linkedSet,
          })
        : escapeHtml("馆藏铜版插图");

      const frameCls = block.src
        ? "wiki-figure-frame"
        : "wiki-figure-frame is-missing";
      const imgHtml = block.src
        ? `<img class="wiki-figure-img" src="./${escapeHtml(block.src)}" alt="${escapeHtml(plainCap)}" loading="lazy" decoding="async" />`
        : "";

      htmlParts.push(`
        <figure id="${escapeHtml(block.id)}" class="wiki-figure">
          <div class="${frameCls}" data-figure-frame="1">
            <div class="wiki-figure-placeholder" aria-hidden="true">
              <svg class="wiki-figure-placeholder-svg" viewBox="0 0 120 80">
                <rect x="2" y="2" width="116" height="76" />
                <line x1="2" y1="2" x2="118" y2="78" stroke-dasharray="3 3" />
                <line x1="118" y1="2" x2="2" y2="78" stroke-dasharray="3 3" />
                <circle cx="60" cy="40" r="14" />
                <circle cx="60" cy="40" r="4" />
              </svg>
              <span class="lapidary-serif">TABVLA AENEA · 铜版图版框</span>
            </div>
            ${imgHtml}
          </div>
          <figcaption class="wiki-figure-caption">${capHtml}</figcaption>
        </figure>
      `);
      continue;
    }

    if (block.type === "doc") {
      const originBadgeCls = block.origin === "canon" ? "badge-canon" : "badge-original";
      const originBadgeText = block.origin === "canon" ? "原典文献" : "本站设定";
      const metaItems = [
        block.code ? `编号：${escapeHtml(block.code)}` : "",
        block.date ? `日期：${escapeHtml(block.date)}` : "",
        block.author ? `署名：${escapeHtml(block.author)}` : "",
      ].filter(Boolean);

      if (ctxState.currentClearance < block.clearance) {
        htmlParts.push(`
          <section id="${escapeHtml(block.id)}" class="wiki-doc-card wiki-doc-locked" aria-label="加密档案附件">
            <header class="wiki-doc-head">
              <div class="wiki-doc-head-top">
                <span class="wiki-doc-type-tag">${escapeHtml(block.docTypeLabel)}</span>
                <div class="wiki-doc-badges">
                  <span class="${originBadgeCls}">${originBadgeText}</span>
                  <span class="wiki-lv-pill">需 Clearance Lv.${block.clearance}</span>
                </div>
              </div>
              <h3 class="wiki-doc-title">${escapeHtml(block.title)}</h3>
              ${
                metaItems.length > 0
                  ? `<div class="wiki-doc-meta">${metaItems.join(" · ")}</div>`
                  : ""
              }
            </header>
            <div class="wiki-clearance-lock-panel wiki-doc-lock-body">
              <div class="wiki-lock-top">
                <span class="wiki-lock-badge">[机密附件 · 需 Clearance Lv.${block.clearance} 解锁]</span>
                <span class="wiki-lv-pill">当前权限 Lv.${ctxState.currentClearance}</span>
              </div>
              <p class="wiki-lock-desc">
                本份${escapeHtml(block.docTypeLabel)}受第 ${block.clearance} 级保密协议封存。调阅更多馆藏档案、收录现场线索或完成认知调查可晋升 Clearance 等级以显影全文。
              </p>
              <div class="wiki-lock-actions">
                <a class="bp-btn active" href="#/play">进入权限与调查终端 →</a>
              </div>
            </div>
          </section>
        `);
        continue;
      }

      const childState = {
        ...ctxState,
        prefix: `${ctxState.prefix}-${block.id}`,
        linkedSet: new Set(),
        insideDoc: true,
      };
      const innerHtml = renderBlockList(block.children || [], childState);

      htmlParts.push(`
        <section id="${escapeHtml(block.id)}" class="wiki-doc-card" aria-label="档案附件">
          <header class="wiki-doc-head">
            <div class="wiki-doc-head-top">
              <span class="wiki-doc-type-tag">${escapeHtml(block.docTypeLabel)}</span>
              <div class="wiki-doc-badges">
                <span class="${originBadgeCls}">${originBadgeText}</span>
                <span class="wiki-lv-pill">Clearance Lv.${block.clearance}</span>
              </div>
            </div>
            <h3 class="wiki-doc-title">${escapeHtml(block.title)}</h3>
            ${
              metaItems.length > 0
                ? `<div class="wiki-doc-meta">${metaItems.join(" · ")}</div>`
                : ""
            }
          </header>
          <div class="wiki-doc-body">
            ${innerHtml}
          </div>
        </section>
      `);
    }
  }

  return htmlParts.join("\n");
}

export function renderMarkdownBlocks(blocks, options = {}) {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";
  const ctxState = {
    autolinkIndex: options.autolinkIndex || [],
    excludeId: options.excludeId || "",
    currentClearance: Math.max(1, Number(options.currentClearance) || 1),
    linkMode: options.linkMode || "route",
    prefix: String(options.entryId || options.redactPrefix || "md"),
    linkedSet: new Set(),
    sectionIdx: 0,
    insideDoc: false,
  };
  return renderBlockList(blocks, ctxState);
}

export function renderMarkdownToHtml(rawMd, options = {}) {
  const parsed = parseArchivalMarkdown(rawMd);
  const html = renderMarkdownBlocks(parsed.blocks, options);
  return {
    ...parsed,
    html,
  };
}

export function renderMarkdown(rawMd, options = {}) {
  return renderMarkdownToHtml(rawMd, options).html;
}
