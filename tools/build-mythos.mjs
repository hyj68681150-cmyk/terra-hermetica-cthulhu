#!/usr/bin/env node
/**
 * tools/build-mythos.mjs — 「大浸染」图层生成器（零依赖）
 *
 * 输入：tools/mythos-data.mjs、data/map/places.geojson
 * 输出（data/map/）：
 *   mythos-threat.geojson  II–V 级危险区（每级一个 MultiPolygon，取“≥ 该级”的整片区域，叠起来就是交叉排线）
 *                          顶层 meta：阈值、各级面积占比、计数、等级说明
 *   mythos-points.geojson  异常点 / 人类据点 / 大区拉丁标签
 *   mythos-wards.geojson   据点结界圈、位置误差圈、结界航线
 *   CREDITS-mythos.md      来源与署名
 *
 * 危险场在“等级单位”里合成：背景 B = min(4.5, b0 + 0.9·n)，n 是球面 3D Perlin fBm（带域扭曲，标准差归一）；
 * 每个异常点贡献 λ = L + 0.6 − (d_eff/r)²（d_eff 被扭曲噪声拉伸），λ > 0.5 才计入，和背景按 τ = 0.35 做 log-sum-exp；
 * 再减去据点 / 城市结界平顶核与航线核；画出来的结界圈内封顶在 II 级以下。
 * 阈值固定（II ≥ 2 … V ≥ 5），二分 b0 让 ≥II 正好占地表 80%。
 *
 * 用法：node tools/build-mythos.mjs [--grid 0.25] [--seed 1925] [--report]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as D from "./mythos-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAP_DIR = path.join(ROOT, "data", "map");
const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
};
const STEP = Number(opt("--grid", "0.25"));
const SEED = Number(opt("--seed", "1925"));
const REPORT = argv.includes("--report");

const R = 6371.0088;
const RAD = Math.PI / 180;
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const LEVEL_IDS = [2, 3, 4, 5];

// ── 调参 ────────────────────────────────────────────────────────────────────
// 场直接以“等级”为单位：≥2 为 II 级，≥3 为 III 级……
// 每个异常点贡献 λ = L + peak − (d/r)²：中心比自己的等级高 0.6，每走出一个 r 掉一级；
// 多个来源与背景用 log-sum-exp 合成（温度 τ），扎堆的地方会更危险，但不会简单相加。
const P = {
  peak: 0.6,
  tau: 0.35,
  bgStd: 0.9, // 背景噪声（等级单位）
  bgCap: 4.5, // 背景最多到 IV 级：V 级必须有来头
  target2: 0.8, // 调背景基线，让 ≥II 级占地表 80%
  noiseFreq: 1.6,
  noiseOct: 5,
  warp: 0.22, // 域扭曲强度（让边界像墨迹、像触手）
  warpFreq: 2.3,
  distort: 0.25, // 异常核的径向扭曲（对数尺度标准差），免得每块都是正圆
  ringFactor: 0.912, // 画圈半径 = 0.912ρ：平顶核 exp(-(d/ρ)^4) 在此衰减一半
  wardW: { sanctuary: 3.2, site: 2.2, outpost: 2.0, ally: 1.8, relic: 1.5, archive: 1.3 },
  cityW: [0.8, 1.3], // 城防结界（看不见）：大城市 → 特大城市
  corrC: 1.3, // 航线中心压低的等级
  corrW: 150, // 航线核宽度（km）
  corrStepKm: 20,
  simplify: 0.07, // Douglas-Peucker 容差（度）
  minOuter: 0.12, // 丢掉面积小于此值（平方度）的碎块
  minHole: 0.12,
  digits: 2,
};

// ── 小工具 ──────────────────────────────────────────────────────────────────
const fail = (m) => {
  console.error("build-mythos: " + m);
  process.exit(1);
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (v, k = P.digits) => {
  const m = 10 ** k;
  return Math.round(v * m) / m;
};
function unit(lon, lat) {
  const c = Math.cos(lat * RAD);
  return [c * Math.cos(lon * RAD), c * Math.sin(lon * RAD), Math.sin(lat * RAD)];
}
function lonlat(v) {
  const n = Math.hypot(v[0], v[1], v[2]);
  return [Math.atan2(v[1], v[0]) / RAD, Math.asin(clamp(v[2] / n, -1, 1)) / RAD];
}
const angBetween = (a, b) => Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
function slerp(a, b, f) {
  const om = angBetween(a, b);
  if (om < 1e-12) return a.slice();
  const s = Math.sin(om);
  const k0 = Math.sin((1 - f) * om) / s;
  const k1 = Math.sin(f * om) / s;
  return [a[0] * k0 + b[0] * k1, a[1] * k0 + b[1] * k1, a[2] * k0 + b[2] * k1];
}
function destination(lon, lat, brg, km) {
  const d = km / R;
  const p1 = lat * RAD;
  const t = brg * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = lon * RAD + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [l2 / RAD, p2 / RAD];
}

// ── 噪声 ────────────────────────────────────────────────────────────────────
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makePerlin(seed) {
  const r = mulberry32(seed);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (t, a, b) => a + t * (b - a);
  const grad = (h, x, y, z) => {
    h &= 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return (h & 1 ? -u : u) + (h & 2 ? -v : v);
  };
  return (x, y, z) => {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fz = Math.floor(z);
    const X = fx & 255;
    const Y = fy & 255;
    const Z = fz & 255;
    x -= fx;
    y -= fy;
    z -= fz;
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;
    return lerp(
      w,
      lerp(v, lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)), lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))),
      lerp(
        v,
        lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)),
        lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))
      )
    );
  };
}

// ── 网格：M 个经度（−180 … 180−STEP）× NYr 个纬度（−90 … 90）；等值线用的补边网格另算 ──
const M = Math.round(360 / STEP);
const NYr = Math.round(180 / STEP) + 1;
const U = M * NYr;
const UX = new Float64Array(U);
const UY = new Float64Array(U);
const UZ = new Float64Array(U);
const rowW = new Float64Array(NYr); // 纬带面积权重
for (let r = 0; r < NYr; r++) {
  const lat = -90 + r * STEP;
  rowW[r] = Math.sin(Math.min(90, lat + STEP / 2) * RAD) - Math.sin(Math.max(-90, lat - STEP / 2) * RAD);
  const cl = Math.cos(lat * RAD);
  const sl = Math.sin(lat * RAD);
  for (let c = 0; c < M; c++) {
    const lon = (-180 + c * STEP) * RAD;
    const u = r * M + c;
    UX[u] = cl * Math.cos(lon);
    UY[u] = cl * Math.sin(lon);
    UZ[u] = sl;
  }
}

// 遍历以 (lon0, lat0) 为圆心、km 为半径的球冠里的格点：fn(u, dot)
function forCap(lon0, lat0, km, fn) {
  const a = Math.min(Math.PI, km / R);
  const k = unit(lon0, lat0);
  const cosA = Math.cos(a);
  const ad = a / RAD;
  const latMin = lat0 - ad;
  const latMax = lat0 + ad;
  const r0 = Math.max(0, Math.floor((latMin + 90) / STEP));
  const r1 = Math.min(NYr - 1, Math.ceil((latMax + 90) / STEP));
  let c0 = 0;
  let c1 = M - 1;
  if (latMin > -90 && latMax < 90) {
    const s = Math.sin(a) / Math.cos(lat0 * RAD);
    if (s < 1) {
      const dl = Math.asin(s) / RAD;
      c0 = Math.floor((lon0 - dl + 180) / STEP);
      c1 = Math.ceil((lon0 + dl + 180) / STEP);
      if (c1 - c0 + 1 >= M) {
        c0 = 0;
        c1 = M - 1;
      }
    }
  }
  for (let r = r0; r <= r1; r++) {
    const base = r * M;
    for (let cc = c0; cc <= c1; cc++) {
      const u = base + (((cc % M) + M) % M);
      const dot = UX[u] * k[0] + UY[u] * k[1] + UZ[u] * k[2];
      if (dot >= cosA) fn(u, dot);
    }
  }
}
const distKm = (dot) => Math.acos(Math.min(1, dot)) * R;

function wStats(A) {
  let sw = 0;
  let s = 0;
  let s2 = 0;
  for (let r = 0; r < NYr; r++) {
    const w = rowW[r];
    for (let c = 0; c < M; c++) {
      const v = A[r * M + c];
      sw += w;
      s += w * v;
      s2 += w * v * v;
    }
  }
  const mean = s / sw;
  return { mean, std: Math.sqrt(Math.max(1e-12, s2 / sw - mean * mean)) };
}
function normalize(A, std) {
  const st = wStats(A);
  for (let u = 0; u < U; u++) A[u] = ((A[u] - st.mean) / st.std) * std;
}

// ── 读数据 ──────────────────────────────────────────────────────────────────
const places = JSON.parse(fs.readFileSync(path.join(MAP_DIR, "places.geojson"), "utf8"));
const placeById = new Map(places.features.map((f) => [f.properties.id, f]));

// 档案条目 id（data/entries/**）：据点 / 异常与条目同名，或在 ENTRY_LINKS 里对上时，地图卡片给出「查阅卷宗」。
// build-manifest.mjs 会再校验一遍 entryId 是否存在。
const ENTRY_IDS = new Set();
(function walkEntries(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkEntries(full);
    else if (ent.name.endsWith(".json")) {
      const j = JSON.parse(fs.readFileSync(full, "utf8"));
      if (j.id) ENTRY_IDS.add(j.id);
    }
  }
})(path.join(ROOT, "data", "entries"));
const ENTRY_LINKS = { "s-2264": "dossier-scp-2264" };
const entryFor = (id) => {
  const e = ENTRY_LINKS[id] || id;
  return ENTRY_IDS.has(e) ? e : undefined;
};
const bastionById = new Map(D.BASTIONS.map((b) => [b.id, b]));

const allIds = new Map();
const claim = (id, where) => {
  if (!ID_RE.test(id)) fail(`id '${id}' (${where}) 不符合 ${ID_RE}`);
  if (allIds.has(id)) fail(`id '${id}' 重复（${allIds.get(id)} / ${where}）`);
  allIds.set(id, where);
};
const checkLonLat = ([lon, lat], id) => {
  if (!(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90)) fail(`'${id}' 坐标越界：${lon}, ${lat}`);
};
for (const a of D.ANOMALIES) {
  claim(a.id, "anomaly");
  checkLonLat(a.c, a.id);
  if (![1, 2, 3, 4, 5].includes(a.threat)) fail(`'${a.id}' threat 应为 1–5`);
  if (!["mythos", "scp", "omen"].includes(a.kind)) fail(`'${a.id}' kind 无效：${a.kind}`);
  if (!(a.r > 0)) fail(`'${a.id}' 缺少 r`);
  if (!a.src && !a.ref) fail(`'${a.id}' 缺少来源（src 或 ref）`);
}
for (const b of D.BASTIONS) {
  claim(b.id, "bastion");
  checkLonLat(b.c, b.id);
  if (!P.wardW[b.type]) fail(`'${b.id}' type 无效：${b.type}`);
}
for (const r of D.REGIONS) claim(r.id, "region");
for (const c of D.CORRIDORS) claim(c.id, "corridor");

const SOURCES = D.ANOMALIES.map((a) => ({ id: a.id, c: a.c, L: a.threat, r: a.r }));
for (const s of D.ARCHIVE_SOURCES) {
  const f = placeById.get(s.id);
  if (!f) fail(`ARCHIVE_SOURCES 里的 '${s.id}' 不在 places.geojson`);
  SOURCES.push({ id: s.id, c: f.geometry.coordinates, L: s.threat, r: s.r, archive: true });
}

const WARDS = []; // 结界核（含看不见的城防结界）
const RINGS = []; // 画出来的结界圈
for (const b of D.BASTIONS) {
  WARDS.push({ c: b.c, W: P.wardW[b.type], rho: b.ward / P.ringFactor });
  RINGS.push({ id: b.id, c: b.c, km: b.ward, type: b.type, name: b.name });
}
for (const w of D.ARCHIVE_WARDS) {
  const f = placeById.get(w.id);
  if (!f) fail(`ARCHIVE_WARDS 里的 '${w.id}' 不在 places.geojson`);
  WARDS.push({ c: f.geometry.coordinates, W: w.W, rho: w.ward / P.ringFactor });
  RINGS.push({ id: w.id, c: f.geometry.coordinates, km: w.ward, type: "archive-site", name: f.properties.name_zh });
}
for (const [name, lon, lat, s] of D.CITY_WARDS) {
  checkLonLat([lon, lat], name);
  const small = s < 0.5; // 波士顿：身处米斯卡托尼克河谷，只给很小的城防
  const t = (s - 0.7) / 0.3;
  WARDS.push({ c: [lon, lat], W: small ? 0.6 : P.cityW[0] + (P.cityW[1] - P.cityW[0]) * t, rho: small ? 30 : 140 + 80 * t });
}

const resolveVia = (v, cid) => {
  if (Array.isArray(v)) return v;
  const b = bastionById.get(v);
  if (b) return b.c;
  const f = placeById.get(v);
  if (f) return f.geometry.coordinates;
  return fail(`航线 '${cid}' 的途经点 '${v}' 找不到`);
};
const CORR = D.CORRIDORS.map((cd) => {
  const pts = cd.via.map((v) => resolveVia(v, cd.id));
  const geo = [];
  const samples = [];
  let km = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = unit(pts[k][0], pts[k][1]);
    const b = unit(pts[k + 1][0], pts[k + 1][1]);
    const om = angBetween(a, b);
    km += om * R;
    const nG = Math.max(10, Math.ceil(om / RAD)); // 每段 ≥ 10 段弧，约 1° 一个点
    for (let s = k === 0 ? 0 : 1; s <= nG; s++) geo.push(lonlat(slerp(a, b, s / nG)));
    const nS = Math.max(2, Math.ceil((om * R) / P.corrStepKm));
    for (let s = 0; s <= nS; s++) samples.push(slerp(a, b, s / nS));
  }
  return { ...cd, pts, geo, samples, km };
});

// ── 场 ──────────────────────────────────────────────────────────────────────
const t0 = Date.now();
const pn = [0, 1, 2, 3, 4].map((k) => makePerlin(SEED * 7919 + k * 104729));
const NZ = new Float64Array(U);
const MD = new Float64Array(U);
for (let u = 0; u < U; u++) {
  const x = UX[u];
  const y = UY[u];
  const z = UZ[u];
  const wf = P.warpFreq;
  const qx = x + P.warp * pn[1](x * wf + 3.1, y * wf, z * wf);
  const qy = y + P.warp * pn[2](x * wf, y * wf + 7.7, z * wf);
  const qz = z + P.warp * pn[3](x * wf, y * wf, z * wf + 5.3);
  let s = 0;
  let amp = 1;
  let f = P.noiseFreq;
  for (let o = 0; o < P.noiseOct; o++) {
    s += amp * pn[0](qx * f + o * 31.7, qy * f + o * 17.3, qz * f + o * 11.1);
    amp *= 0.5;
    f *= 2.03;
  }
  NZ[u] = s;
  MD[u] = 0.7 * pn[4](x * 5, y * 5, z * 5) + 0.3 * pn[4](x * 11 + 50, y * 11, z * 11);
}
normalize(NZ, 1);
normalize(MD, 1);

const AX = new Float64Array(U); // Σ exp(λ/τ)
const WD = new Float64Array(U);
const CR = new Float64Array(U);
const ringMask = new Uint8Array(U);
const eD = Math.exp(2 * P.distort);
const warpD = (u, dot) => distKm(dot) * Math.exp(P.distort * clamp(MD[u], -2, 2));

for (const s of SOURCES) {
  const peak = s.L + P.peak;
  forCap(s.c[0], s.c[1], s.r * Math.sqrt(peak - 0.5) * eD, (u, dot) => {
    const q = warpD(u, dot) / s.r;
    const lam = peak - q * q;
    if (lam > 0.5) AX[u] += Math.exp(lam / P.tau);
  });
}
for (const w of WARDS) {
  forCap(w.c[0], w.c[1], 2 * w.rho, (u, dot) => {
    const q = distKm(dot) / w.rho;
    const q2 = q * q;
    WD[u] += w.W * Math.exp(-q2 * q2);
  });
}
for (const r of RINGS) forCap(r.c[0], r.c[1], r.km, (u) => (ringMask[u] = 1));
for (const cd of CORR) {
  for (const v of cd.samples) {
    const [lon, lat] = lonlat(v);
    forCap(lon, lat, 3.5 * P.corrW, (u, dot) => {
      const q = distKm(dot) / P.corrW;
      const val = P.corrC * Math.exp(-q * q);
      if (val > CR[u]) CR[u] = val;
    });
  }
}
const T = { 2: 2, 3: 3, 4: 4, 5: 5 };
function compose(b0) {
  const F = new Float64Array(U);
  for (let u = 0; u < U; u++) {
    const B = Math.min(P.bgCap, b0 + P.bgStd * NZ[u]);
    let v = P.tau * Math.log(Math.exp(B / P.tau) + AX[u]) - WD[u] - CR[u];
    if (ringMask[u] && v > T[2] - 0.05) v = T[2] - 0.05;
    F[u] = v;
  }
  return F;
}
function shareAtLeast(F, t) {
  let s = 0;
  let tot = 0;
  for (let r = 0; r < NYr; r++) {
    const w = rowW[r];
    for (let c = 0; c < M; c++) {
      if (F[r * M + c] >= t) s += w;
      tot += w;
    }
  }
  return s / tot;
}
// 二分背景基线 b0，让 ≥II 级正好占 target2
let lo = 0;
let hi = 4;
for (let it = 0; it < 22; it++) {
  const mid = (lo + hi) / 2;
  if (shareAtLeast(compose(mid), T[2]) < P.target2) lo = mid;
  else hi = mid;
}
const B0 = (lo + hi) / 2;
const F = compose(B0);

const levelAtU = (u) => {
  if (ringMask[u]) return 0;
  const v = F[u];
  return v >= T[5] ? 5 : v >= T[4] ? 4 : v >= T[3] ? 3 : v >= T[2] ? 2 : 1;
};
const nearestU = (lon, lat) => {
  const r = clamp(Math.round((lat + 90) / STEP), 0, NYr - 1);
  const c = ((Math.round((lon + 180) / STEP) % M) + M) % M;
  return r * M + c;
};
// 结界圈按真实距离判断（小圈比网格还细）；其余按最近格点
const zoneAt = (lon, lat) => {
  const p = unit(lon, lat);
  for (const r of RINGS) if (angBetween(p, unit(r.c[0], r.c[1])) * R < r.km) return 0;
  return levelAtU(nearestU(lon, lat));
};

const share = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
let totW = 0;
for (let r = 0; r < NYr; r++) {
  for (let c = 0; c < M; c++) {
    share[levelAtU(r * M + c)] += rowW[r];
    totW += rowW[r];
  }
}
for (const k of Object.keys(share)) share[k] /= totW;

// ── 等值线（marching squares）─────────────────────────────────────────────
// 补边网格：四周各补一圈极低值，补边与真实边界坐标重合，于是每个环都闭合在 ±180° / ±90° 上
const NX = M + 3;
const NY = NYr + 2;
const lonOf = (i) => (i <= 1 ? -180 : i >= NX - 2 ? 180 : -180 + (i - 1) * STEP);
const latOf = (j) => (j <= 1 ? -90 : j >= NY - 2 ? 90 : -90 + (j - 1) * STEP);
const G = new Float64Array(NX * NY).fill(-1e6);
for (let j = 1; j <= NYr; j++) for (let i = 1; i <= M + 1; i++) G[j * NX + i] = F[(j - 1) * M + ((i - 1) % M)];

function edgePoint(e, t) {
  const cell = e >> 1;
  const i = cell % NX;
  const j = (cell - i) / NX;
  if ((e & 1) === 0) {
    const v0 = G[j * NX + i];
    const f = (t - v0) / (G[j * NX + i + 1] - v0);
    const x0 = lonOf(i);
    return [x0 + f * (lonOf(i + 1) - x0), latOf(j)];
  }
  const v0 = G[j * NX + i];
  const f = (t - v0) / (G[(j + 1) * NX + i] - v0);
  const y0 = latOf(j);
  return [lonOf(i), y0 + f * (latOf(j + 1) - y0)];
}

// 角点 a=左下 1、b=右下 2、c=右上 4、d=左上 8（北为上）；有向线段让“≥t”的一侧始终在左手边
function contour(t) {
  const NE = NX * NY * 2;
  const next = new Int32Array(NE).fill(-1);
  for (let j = 0; j < NY - 1; j++) {
    for (let i = 0; i < NX - 1; i++) {
      const va = G[j * NX + i];
      const vb = G[j * NX + i + 1];
      const vc = G[(j + 1) * NX + i + 1];
      const vd = G[(j + 1) * NX + i];
      const code = (va >= t ? 1 : 0) | (vb >= t ? 2 : 0) | (vc >= t ? 4 : 0) | (vd >= t ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const B = (j * NX + i) * 2;
      const Tp = ((j + 1) * NX + i) * 2;
      const L = (j * NX + i) * 2 + 1;
      const Rt = (j * NX + i + 1) * 2 + 1;
      const ctr = (va + vb + vc + vd) / 4 >= t;
      switch (code) {
        case 1: next[B] = L; break;
        case 2: next[Rt] = B; break;
        case 3: next[Rt] = L; break;
        case 4: next[Tp] = Rt; break;
        case 5: if (ctr) { next[B] = Rt; next[Tp] = L; } else { next[B] = L; next[Tp] = Rt; } break;
        case 6: next[Tp] = B; break;
        case 7: next[Tp] = L; break;
        case 8: next[L] = Tp; break;
        case 9: next[B] = Tp; break;
        case 10: if (ctr) { next[L] = B; next[Rt] = Tp; } else { next[Rt] = B; next[L] = Tp; } break;
        case 11: next[Rt] = Tp; break;
        case 12: next[L] = Rt; break;
        case 13: next[B] = Rt; break;
        case 14: next[L] = B; break;
      }
    }
  }
  const seen = new Uint8Array(NE);
  const rings = [];
  for (let e = 0; e < NE; e++) {
    if (next[e] < 0 || seen[e]) continue;
    const ring = [];
    let cur = e;
    while (cur >= 0 && !seen[cur]) {
      seen[cur] = 1;
      ring.push(edgePoint(cur, t));
      cur = next[cur];
    }
    if (cur !== e) fail(`等值线没有闭合（t=${t.toFixed(3)}）`);
    rings.push(ring);
  }
  return rings;
}

const ringArea = (r) => {
  let a = 0;
  for (let k = 0, n = r.length; k < n; k++) {
    const p = r[k];
    const q = r[(k + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};
const onSeam = (p) => Math.abs(p[0]) === 180 || Math.abs(p[1]) === 90;
const sameSeam3 = (a, p, b) =>
  (Math.abs(p[0]) === 180 && a[0] === p[0] && b[0] === p[0]) || (Math.abs(p[1]) === 90 && a[1] === p[1] && b[1] === p[1]);

function dpRange(pts, i0, i1, tol2, keep) {
  const n = pts.length;
  const stack = [[i0, i1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const A = pts[a % n];
    const B = pts[b % n];
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const L2 = dx * dx + dy * dy;
    let best = -1;
    let bi = -1;
    for (let k = a + 1; k < b; k++) {
      const p = pts[k % n];
      const tt = L2 === 0 ? 0 : clamp(((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / L2, 0, 1);
      const ex = p[0] - (A[0] + tt * dx);
      const ey = p[1] - (A[1] + tt * dy);
      const d2 = ex * ex + ey * ey;
      if (d2 > best) {
        best = d2;
        bi = k;
      }
    }
    if (best > tol2) {
      keep[bi % n] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
}
// 闭合环的 Douglas-Peucker；接缝（±180° / ±90°）段的端点固定不动，保证接缝段还在接缝上
function simplifyRing(pts, tol) {
  const n = pts.length;
  if (n <= 6) return pts;
  const keep = new Uint8Array(n);
  let anchors = [];
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    if (onSeam(p) && !sameSeam3(pts[(k - 1 + n) % n], p, pts[(k + 1) % n])) anchors.push(k);
  }
  if (anchors.length < 2) {
    const s = anchors.length ? anchors[0] : 0;
    let far = s;
    let best = -1;
    for (let k = 0; k < n; k++) {
      const dx = pts[k][0] - pts[s][0];
      const dy = pts[k][1] - pts[s][1];
      if (dx * dx + dy * dy > best) {
        best = dx * dx + dy * dy;
        far = k;
      }
    }
    if (far === s) return pts;
    anchors = [s, far].sort((x, y) => x - y);
  }
  for (const a of anchors) keep[a] = 1;
  for (let s = 0; s < anchors.length; s++) {
    const a = anchors[s];
    let b = anchors[(s + 1) % anchors.length];
    if (b <= a) b += n;
    dpRange(pts, a, b, tol * tol, keep);
  }
  return pts.filter((_, k) => keep[k]);
}
function pip(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
const bboxOf = (r) => {
  const bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of r) {
    if (p[0] < bb[0]) bb[0] = p[0];
    if (p[1] < bb[1]) bb[1] = p[1];
    if (p[0] > bb[2]) bb[2] = p[0];
    if (p[1] > bb[3]) bb[3] = p[1];
  }
  return bb;
};
const closeRing = (r) => [...r, r[0]];

function buildLevel(t) {
  const outers = [];
  const holes = [];
  let verts = 0;
  for (const raw of contour(t)) {
    let r = simplifyRing(raw, P.simplify).map((p) => [rnd(p[0]), rnd(p[1])]);
    r = r.filter((p, k) => k === 0 || p[0] !== r[k - 1][0] || p[1] !== r[k - 1][1]);
    while (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
    if (r.length < 3) continue;
    const a = ringArea(r);
    if (a >= P.minOuter) outers.push({ r, a, bb: bboxOf(r), holes: [] });
    else if (-a >= P.minHole) holes.push({ r, a: -a });
  }
  for (const h of holes) {
    const p = h.r[0];
    let best = null;
    for (const o of outers) {
      if (o.a <= h.a || p[0] < o.bb[0] || p[0] > o.bb[2] || p[1] < o.bb[1] || p[1] > o.bb[3]) continue;
      if (pip(p, o.r) && (!best || o.a < best.a)) best = o;
    }
    if (best) best.holes.push(h.r);
  }
  const polys = outers.map((o) => [closeRing(o.r), ...o.holes.map(closeRing)]);
  for (const poly of polys) for (const ring of poly) verts += ring.length;
  return { polys, outers: outers.length, holes: holes.length, verts };
}

const threatFeatures = [];
const levelStats = {};
for (const L of LEVEL_IDS) {
  const b = buildLevel(T[L]);
  levelStats[L] = { outers: b.outers, holes: b.holes, verts: b.verts };
  threatFeatures.push({
    type: "Feature",
    properties: { id: `threat-${L}`, level: L },
    geometry: { type: "MultiPolygon", coordinates: b.polys },
  });
}

// ── 点、圈、航线 ────────────────────────────────────────────────────────────
const c4 = (p) => [rnd(p[0], 4), rnd(p[1], 4)];
const c3 = (p) => [rnd(p[0], 3), rnd(p[1], 3)];
function srcProps(o) {
  const out = {};
  const s = o.src;
  if (s) Object.assign(out, { srcTitle: s.title, srcAuthor: s.author, srcUrl: s.url, srcLicense: s.license, srcPage: s.page, srcPageAuthor: s.pageAuthor });
  if (o.ref) out.ref = o.ref;
  return out;
}
const RANK = { sanctuary: 0, site: 2, outpost: 3, ally: 3, relic: 4, archive: 4 };
const mapLabel = (name) => name.replace(/（[^）]*）/g, "").trim();

const pointFeatures = [];
for (const b of D.BASTIONS) {
  pointFeatures.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: c4(b.c) },
    properties: {
      id: b.id, layer: "bastion", type: b.type, glyph: b.glyph, planet: b.planet, metal: b.metal,
      name: b.name, label: mapLabel(b.name), latin: b.latin, ward: b.ward, motto: b.motto, summary: b.s, role: b.role,
      ...srcProps(b), entryId: entryFor(b.id), zone: 0, rank: RANK[b.type],
    },
  });
}
const mismatches = [];
for (const a of D.ANOMALIES) {
  const zone = zoneAt(a.c[0], a.c[1]);
  const u0 = nearestU(a.c[0], a.c[1]);
  // 所在区域和自身等级不同的原因：ring 据点圈内 / corridor 航线 / ward 城防结界 / macro 身处更大的危险区
  const zoneWhy =
    zone === 0 ? "ring" : zone < a.threat ? (CR[u0] >= WD[u0] ? "corridor" : "ward") : zone > a.threat ? "macro" : undefined;
  if (zone !== a.threat) mismatches.push(`${a.id.padEnd(18)} threat ${a.threat} → zone ${zone} (${zoneWhy})`);
  pointFeatures.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: c4(a.c) },
    properties: {
      id: a.id, layer: "anomaly", kind: a.kind, threat: a.threat, zone, name: a.name, label: mapLabel(a.name), latin: a.latin,
      zoneWhy, prec: a.prec, unc: a.uncertaintyKm, summary: a.s, adapt: a.ad, human: a.hu,
      ...srcProps(a), entryId: entryFor(a.id), rank: 10 + (5 - a.threat),
    },
  });
}
for (const r of D.REGIONS) {
  pointFeatures.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: c4(r.c) },
    properties: { id: r.id, layer: "region", la: r.la, zh: r.zh, minzoom: r.minzoom, maxzoom: r.maxzoom, rank: 50 },
  });
}

function circle(lon, lat, km, n = 72) {
  const out = [];
  for (let k = n; k > 0; k--) out.push(destination(lon, lat, (360 * k) / n, km)); // 逆时针（RFC 7946 外环）
  for (let k = 1; k < out.length; k++) {
    while (out[k][0] - out[k - 1][0] > 180) out[k][0] -= 360;
    while (out[k][0] - out[k - 1][0] < -180) out[k][0] += 360;
  }
  const ring = out.map(c3);
  ring.push(ring[0].slice());
  return ring;
}
function splitAntimeridian(coords) {
  const parts = [[coords[0]]];
  for (let k = 1; k < coords.length; k++) {
    const p = coords[k - 1];
    const q = coords[k];
    const d = q[0] - p[0];
    if (Math.abs(d) > 180) {
      const qq = d > 0 ? q[0] - 360 : q[0] + 360;
      const edge = d > 0 ? -180 : 180;
      const lat = p[1] + ((edge - p[0]) / (qq - p[0])) * (q[1] - p[1]);
      parts[parts.length - 1].push([edge, rnd(lat, 3)]);
      parts.push([[-edge, rnd(lat, 3)]]);
    }
    parts[parts.length - 1].push(q);
  }
  return parts;
}

const wardFeatures = [];
for (const r of RINGS) {
  wardFeatures.push({
    type: "Feature",
    properties: { id: `ward-${r.id}`, kind: "ward", type: r.type, name: r.name, ward: r.km, cx: rnd(r.c[0], 4), cy: rnd(r.c[1], 4) },
    geometry: { type: "Polygon", coordinates: [circle(r.c[0], r.c[1], r.km, r.km > 100 ? 96 : 64)] },
  });
}
for (const a of D.ANOMALIES) {
  if (!(a.uncertaintyKm >= 20)) continue;
  wardFeatures.push({
    type: "Feature",
    properties: { id: `unc-${a.id}`, kind: "uncertainty", name: a.name, ward: a.uncertaintyKm },
    geometry: { type: "Polygon", coordinates: [circle(a.c[0], a.c[1], a.uncertaintyKm, 96)] },
  });
}
let corridorKm = 0;
for (const cd of CORR) {
  corridorKm += cd.km;
  const parts = splitAntimeridian(cd.geo.map(c3));
  wardFeatures.push({
    type: "Feature",
    properties: { id: cd.id, kind: "corridor", name: cd.name, latin: cd.latin, km: Math.round(cd.km) },
    geometry: parts.length === 1 ? { type: "LineString", coordinates: parts[0] } : { type: "MultiLineString", coordinates: parts },
  });
}

// ── 写文件 ──────────────────────────────────────────────────────────────────
const countBy = (arr, key) => arr.reduce((o, x) => ((o[x[key]] = (o[x[key]] || 0) + 1), o), {});
const meta = {
  generator: "tools/build-mythos.mjs",
  built: new Date().toISOString().slice(0, 10),
  grid: STEP,
  seed: SEED,
  base: rnd(B0, 4),
  thresholds: Object.fromEntries(LEVEL_IDS.map((L) => [L, rnd(T[L], 4)])),
  share: Object.fromEntries(Object.entries(share).map(([k, v]) => [k, rnd(v, 4)])),
  atLeast: Object.fromEntries(LEVEL_IDS.map((L) => [L, rnd(LEVEL_IDS.filter((x) => x >= L).reduce((s, x) => s + share[x], 0), 4)])),
  counts: {
    anomalies: D.ANOMALIES.length,
    anomalyKinds: countBy(D.ANOMALIES, "kind"),
    bastions: D.BASTIONS.length,
    bastionTypes: countBy(D.BASTIONS, "type"),
    corridors: CORR.length,
    corridorKm: Math.round(corridorKm),
    cityWards: D.CITY_WARDS.length,
  },
  levels: D.LEVELS,
};
function writeFC(name, features, extra = {}) {
  const head = JSON.stringify({ type: "FeatureCollection", ...extra }).slice(0, -1);
  const body = features.map((f) => JSON.stringify(f)).join(",\n");
  const text = `${head},"features":[\n${body}\n]}\n`;
  fs.writeFileSync(path.join(MAP_DIR, name), text, "utf8");
  return text.length;
}
const sizes = {
  "mythos-threat.geojson": writeFC("mythos-threat.geojson", threatFeatures, { meta }),
  "mythos-points.geojson": writeFC("mythos-points.geojson", pointFeatures),
  "mythos-wards.geojson": writeFC("mythos-wards.geojson", wardFeatures),
};

// 署名
const lines = [
  "# 「大浸染」地图层 · 来源与署名",
  "",
  `由 \`tools/build-mythos.mjs\` 根据 \`tools/mythos-data.mjs\` 生成（${meta.built}）。地图上的文字都是本站的中文转述与改编，不是原文。`,
  "",
  "- 洛夫克拉夫特的作品在美国已进入公有领域；与他人合写的作品只借用了地名和情节梗概。",
  "- SCP 基金会相关内容来自 SCP Wiki（https://scp-wiki.wikidot.com），按 CC BY-SA 3.0 授权；本站据此做的转述与改编同样按 CC BY-SA 3.0 提供。",
  "- 现实地点的史实部分参考维基百科；标为“本站设定”的内容是原创虚构，与真实的人、机构和事件无关。",
  "",
];
const groups = { mythos: [], scp: [], omen: [], bastion: [] };
const fmtSrc = (o) => {
  const s = o.src;
  const bits = [];
  if (s) {
    bits.push(`《${s.title}》`, s.author ? `作者：${s.author}` : "", s.url, s.license ? `（${s.license}）` : "");
    if (s.page) bits.push(`；条目原页：${s.page}`, s.pageAuthor ? `（${s.pageAuthor}）` : "");
  }
  if (o.ref) bits.push(s ? `；史实：${o.ref}` : `史实：${o.ref}`);
  return bits.filter(Boolean).join(" ");
};
for (const a of D.ANOMALIES) groups[a.kind].push(`- **${a.name}**（${a.id}）：${fmtSrc(a)}`);
for (const b of D.BASTIONS) if (b.src || b.ref) groups.bastion.push(`- **${b.name}**（${b.id}）：${fmtSrc(b)}`);
lines.push("## 洛夫克拉夫特原典", "", ...groups.mythos, "", "## SCP 基金会", "", ...groups.scp, "", "## 现实地点（本站改编）", "", ...groups.omen, "", "## 人类据点", "", ...groups.bastion, "");
lines.push("其余据点（七曜圣城中的六座、本站设定的前哨）为原创设定。", "");
fs.writeFileSync(path.join(MAP_DIR, "CREDITS-mythos.md"), lines.join("\n"), "utf8");

// ── 报告 ────────────────────────────────────────────────────────────────────
const pct = (v) => (v * 100).toFixed(1) + "%";
console.log(`build-mythos: grid ${STEP}°, seed ${SEED}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`  背景基线 b0 = ${B0.toFixed(3)}`);
console.log(`  面积 0:${pct(share[0])} I:${pct(share[1])} II:${pct(share[2])} III:${pct(share[3])} IV:${pct(share[4])} V:${pct(share[5])}  （≥II ${pct(meta.atLeast[2])}）`);
for (const L of LEVEL_IDS) console.log(`  L${L}: ${levelStats[L].outers} 外环 / ${levelStats[L].holes} 洞 / ${levelStats[L].verts} 顶点`);
for (const [k, v] of Object.entries(sizes)) console.log(`  ${k}: ${(v / 1024).toFixed(0)} KB`);
console.log(`  异常点 ${D.ANOMALIES.length}，据点 ${D.BASTIONS.length}，航线 ${CORR.length}（${Math.round(corridorKm).toLocaleString()} km）`);
if (REPORT || mismatches.length) {
  console.log(`  等级与所在区域不一致（${mismatches.length}）：`);
  for (const m of mismatches) console.log("    " + m);
}
