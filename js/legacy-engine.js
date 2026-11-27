/**
 * js/legacy-engine.js
 * Modularized Copperplate Astrolabe & Archival Views Engine (data-driven via JSON).
 */
import { escapeHtml, renderSafeMarkup } from "./sanitize.js";
import { pushChapterHash } from "./router.js";
import { PANTHEON_SIGILS, CITY_SIGILS } from "./sigils.js";
import {
  generateRichCityLandscape,
  MINOR_TOWNS,
  MACRO_ROUTES,
  MARITIME_ROUTES,
  ORBITAL_SATS,
} from "./legacy-globe-procedural.js";

export function mountArchiveEngine({ PANTHEON, SCP_FILES, CITIES, FACTIONS, AIC_KB }) {
  CITIES.forEach(generateRichCityLandscape);
  const TILT_OFFSET = 0.88;
    const SIN_TILT = Math.sin(TILT_OFFSET);

    const state = {
      liber: 'map',
      theme: document.documentElement.getAttribute('data-theme') || 'day',
      pantheonIdx: 0,
      scpCat: 'all',
      audioOn: false,
      cinemaPlaying: false,
      relief: 1.05,
      seal: 0.88,
      abyss: 0.86,
      outer: 0.88,
      showCities: true,
      showTerrain: true,
      showCrowds: !(window.matchMedia('(max-width: 860px), (pointer: coarse)').matches),
      showRings: true,
      showGods: true,
      autoRotate: true,
      uiHidden: false,
      rotY: -(29.92 * Math.PI) / 180,
      rotX: (31.20 * Math.PI) / 180 - TILT_OFFSET * 0.42,
      baseFocusRotY: -(29.92 * Math.PI) / 180,
      targetRotY: null,
      targetRotX: null,
      velY: 0, velX: 0,
      zoom: 2.35,
      targetZoom: 2.35,
      dragging: false,
      userDraggedAtHighZoom: false,
      lastX: 0, lastY: 0,
      mouseX: window.innerWidth * 0.5, mouseY: window.innerHeight * 0.5,
      selectedId: 'alexandria',
      hoveredId: null,
      time: 0
    };

    const cBack = document.getElementById('canvas-back');
    const cWebgl = document.getElementById('canvas-webgl');
    const cFront = document.getElementById('canvas-front');
    const ctxBack = cBack.getContext('2d');
    const ctxFront = cFront.getContext('2d');
    const gl = cWebgl.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false });

    let W = window.innerWidth, H = window.innerHeight;
    let IS_MOBILE = window.matchMedia('(max-width: 860px), (pointer: coarse)').matches;
    let DPR = Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.0 : 1.5);
    let GL_DPR = Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 0.72 : 1.0);

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      IS_MOBILE = window.matchMedia('(max-width: 860px), (pointer: coarse)').matches;
      DPR = Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.0 : 1.5);
      GL_DPR = Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 0.72 : 1.0);
      const mobCloseBtn = document.getElementById('mobile-drawer-close');
      if (mobCloseBtn) mobCloseBtn.style.display = IS_MOBILE ? 'inline-flex' : 'none';
      const uiBtn = document.getElementById('btn-toggle-ui');
      if (uiBtn && !state.uiHidden) uiBtn.textContent = IS_MOBILE ? '全屏视图' : '隐藏两侧面板';
      cBack.width = Math.floor(W * DPR); cBack.height = Math.floor(H * DPR);
      cFront.width = Math.floor(W * DPR); cFront.height = Math.floor(H * DPR);
      cWebgl.width = Math.floor(W * GL_DPR); cWebgl.height = Math.floor(H * GL_DPR);
      const pc = document.getElementById('prologus-canvas');
      if (pc) { pc.width = Math.floor(W * DPR); pc.height = Math.floor(H * DPR); }
      if (gl) gl.viewport(0, 0, cWebgl.width, cWebgl.height);
    }
    window.addEventListener('resize', resize);
    resize();

    function smoothstepJS(e0, e1, x) {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    }

    function getGlobeGeometry() {
      const cx = W * 0.5;
      const isPortraitMob = IS_MOBILE && H > W;
      const baseR = Math.min(W, H) * (isPortraitMob ? 0.42 : 0.375);
      const radius = baseR * state.zoom;
      const pan = smoothstepJS(1.3, 3.6, state.zoom);
      const surfMult = 1.0 + 0.018 * state.relief;
      const lowCy  = H * (isPortraitMob ? 0.43 : 0.54);
      const highCy = H * (isPortraitMob ? 0.56 : 0.69) + SIN_TILT * radius * surfMult;
      const cy = lowCy * (1 - pan) + highCy * pan;
      return { cx, cy, radius, surfRadius: radius * surfMult, pan };
    }

    function latLonToVec3(latDeg, lonDeg) {
      const lat = (latDeg * Math.PI) / 180, lon = (lonDeg * Math.PI) / 180, cl = Math.cos(lat);
      return [cl * Math.sin(lon), Math.sin(lat), cl * Math.cos(lon)];
    }
    function rotateToCamera(v, rotY, rotX) {
      const cy = Math.cos(rotY), sy = Math.sin(rotY);
      const x1 = v[0]*cy + v[2]*sy, y1 = v[1], z1 = -v[0]*sy + v[2]*cy;
      const cx = Math.cos(rotX), sx = Math.sin(rotX);
      return [x1, y1*cx - z1*sx, y1*sx + z1*cx];
    }
    function normalize3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; }
    function cross3(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
    function dot3(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
    function lerp2(a, b, t) { return { x: a.x + (b.x - a.x)*t, y: a.y + (b.y - a.y)*t }; }
    function bilerpQuad(b0, b1, t1, t0, u, v) { return lerp2(lerp2(b0, b1, u), lerp2(t0, t1, u), v); }

    // =========================================================================
    // 6. RAYMARCHED 3D HIGH-RELIEF TERRAIN & GLOBAL RIVERS WEBGL SHADER!!
    // =========================================================================
    let glProg = null, glUni = {};
    const VERT_SRC = `attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;
    const FRAG_SRC = `
      precision highp float;
      uniform vec2 u_res;
      uniform vec2 u_center;
      uniform float u_radius;
      uniform float u_rotY;
      uniform float u_rotX;
      uniform float u_time;
      uniform float u_relief;
      uniform float u_seal;
      uniform float u_abyss;
      uniform float u_outer;
      uniform float u_rivers;
      uniform float u_mobile;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.11, 0.23, 0.37));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x) {
        vec3 i = floor(x), f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }
      float fbm3(vec3 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.07 + vec3(11.3, 7.1, 5.9); a *= 0.5; }
        return v;
      }
      float fbm(vec3 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.07 + vec3(11.3, 7.1, 5.9); a *= 0.5; }
        return v;
      }
      float ridged(vec3 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { float n = 1.0 - abs(noise(p) * 2.0 - 1.0); v += a * n * n; p = p * 2.18 + 3.9; a *= 0.5; }
        return v;
      }
      vec3 camToObj(vec3 p, float ry, float rx) {
        float cx = cos(-rx), sx = sin(-rx);
        vec3 p1 = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
        float cy = cos(-ry), sy = sin(-ry);
        return vec3(p1.x * cy + p1.z * sy, p1.y, -p1.x * sy + p1.z * cy);
      }
      float blob(vec3 p, float latDeg, float lonDeg, float rad, float weight) {
        float lat = latDeg * 0.01745329, lon = lonDeg * 0.01745329;
        vec3 c = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
        float d = length(p - c);
        return weight * exp(-(d * d) / (rad * rad));
      }

      float macroContinents(vec3 p) {
        float m = 0.0;
        m += blob(p, 50.0, 22.0, 0.36, 0.52) + blob(p, 54.0, 75.0, 0.48, 0.62);
        m += blob(p, 35.0, 108.0, 0.40, 0.58) + blob(p, 22.0, 78.0, 0.24, 0.42);
        m += blob(p, 18.0, 18.0, 0.38, 0.58) + blob(p, -12.0, 24.0, 0.30, 0.52) + blob(p, 24.0, 45.0, 0.22, 0.38);
        m += blob(p, 46.0, -102.0, 0.42, 0.60) + blob(p, 22.0, -98.0, 0.20, 0.35);
        m += blob(p, -14.0, -60.0, 0.36, 0.58) + blob(p, -38.0, -66.0, 0.22, 0.42);
        m += blob(p, -25.0, 134.0, 0.26, 0.54) + blob(p, 73.0, -40.0, 0.22, 0.52);
        m += smoothstep(-0.70, -0.88, p.y) * 0.68;
        m += blob(p, -47.15, -126.72, 0.13, 0.38 + 0.12 * u_abyss);
        m += blob(p, 34.0, 84.0, 0.18, 0.42);
        m += blob(p, -18.0, -68.0, 0.14, 0.32);
        m += blob(p, 44.6, -110.5, 0.14, 0.28);
        m -= blob(p, 36.0, 18.0, 0.16, 0.36);
        return m;
      }

      // Fast coarse elevation for raymarching steps (6x faster!)
      float fastElevation(vec3 p) {
        float m = macroContinents(p);
        return m * 0.60 + fbm3(p * 5.8) * 0.44;
      }

      // Rich detail elevation evaluated only at hit surface
      float rawElevation(vec3 p) {
        float m = macroContinents(p);
        vec3 warp = vec3(fbm3(p * 3.2), fbm3(p * 3.2 + 5.1), 0.5);
        float base = m * 0.60 + fbm(p * 5.8 + (warp - 0.5) * 1.1) * 0.46;
        float mtn  = ridged(p * 18.0 + warp * 0.9);
        float terrace = floor(base * 16.0) / 16.0;
        return mix(base, terrace, 0.22) + pow(mtn, 1.6) * 0.24 * smoothstep(0.46, 0.68, base);
      }

      float sphereRadiusAt(vec3 P) {
        float h = fastElevation(P);
        float seaLevel = 0.495;
        float above = max(0.0, h - seaLevel);
        float trench = max(0.0, 0.34 - h);
        return 1.0 + (above * 0.135 - trench * 0.045) * u_relief;
      }

      void main() {
        vec2 fragPx = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
        vec2 d = (fragPx - u_center) / u_radius;
        float r2 = dot(d, d);

        float rMax = 1.0 + 0.082 * u_relief;
        if (r2 > rMax * rMax) {
          float distPx = (sqrt(r2) - 1.0) * u_radius;
          float halo = exp(-distPx * 0.042);
          gl_FragColor = vec4(vec3(0.08, 0.16, 0.78), halo * 0.28);
          return;
        }

        float zTop = sqrt(max(0.0, rMax * rMax - r2));
        float rInner = 1.0 - 0.025 * u_relief;
        float zBot = (r2 < rInner * rInner) ? sqrt(rInner * rInner - r2) : -0.14;

        bool hit = false;
        float zPrev = zTop;
        float zHit = zTop;
        float totalSteps = (u_mobile > 0.5) ? 7.0 : 11.0;
        const int STEPS = 11;
        for (int i = 1; i <= STEPS; i++) {
          if (u_mobile > 0.5 && i > 7) break;
          float u = float(i) / totalSteps;
          float zCur = mix(zTop, zBot, u);
          vec3 pCam = vec3(d.x, -d.y, zCur);
          float rRay = length(pCam);
          vec3 dirObj = camToObj(pCam / max(rRay, 0.0001), u_rotY, u_rotX);
          if (rRay <= sphereRadiusAt(dirObj)) {
            hit = true;
            float zA = zPrev, zB = zCur;
            for (int b = 0; b < 3; b++) {
              if (u_mobile > 0.5 && b >= 2) break;
              float zM = 0.5 * (zA + zB);
              vec3 pM = vec3(d.x, -d.y, zM);
              float rM = length(pM);
              if (rM <= sphereRadiusAt(camToObj(pM / max(rM, 0.0001), u_rotY, u_rotX))) zB = zM;
              else zA = zM;
            }
            zHit = 0.5 * (zA + zB);
            break;
          }
          zPrev = zCur;
        }

        if (!hit) {
          float distPx = max(0.0, (sqrt(r2) - 1.0) * u_radius);
          float halo = exp(-distPx * 0.045);
          gl_FragColor = vec4(vec3(0.08, 0.16, 0.78), halo * 0.28);
          return;
        }

        vec3 pHitCam = vec3(d.x, -d.y, zHit);
        vec3 N_sphere = normalize(pHitCam);
        vec3 P = camToObj(N_sphere, u_rotY, u_rotX);
        float lat = asin(clamp(P.y, -1.0, 1.0));
        float lon = atan(P.x, P.z);

        float h0 = rawElevation(P);
        float eps = 0.006;
        float hx = fastElevation(normalize(P + vec3(eps, 0.0, 0.0)));
        float hy = fastElevation(normalize(P + vec3(0.0, eps, 0.0)));
        vec3 N_bumped = normalize(N_sphere - vec3(hx - fastElevation(P), hy - fastElevation(P), 0.0) / eps * (0.11 + 0.08 * u_relief));

        float seaLevel = 0.495;
        float landMask = smoothstep(seaLevel - 0.009, seaLevel + 0.011, h0);
        float coastLine = smoothstep(0.010, 0.002, abs(h0 - seaLevel));

        // Bold Topographic Hypsometric Contour Lines (等高线体现强烈地势与高低差!)
        float iso = abs(fract((h0 - seaLevel) * 24.0) - 0.5);
        float contourLine = smoothstep(0.08, 0.015, iso) * landMask * 0.55;

        vec3 lightDir = normalize(vec3(0.58, 0.48, 0.66));
        float ndl = max(dot(N_bumped, lightDir), 0.0);

        vec3 deepCobalt  = vec3(0.04, 0.095, 0.64);
        vec3 brightKlein = vec3(0.11, 0.23, 0.95);
        vec3 valleyBlue  = vec3(0.14, 0.28, 0.94);
        vec3 ivoryWhite  = vec3(0.96, 0.98, 1.0);

        // Bathymetric Depth Contours in Oceans!
        float shelf = smoothstep(0.22, seaLevel, h0);
        float bathyIso = smoothstep(0.06, 0.01, abs(fract(h0 * 16.0) - 0.5)) * (1.0 - landMask) * 0.22;
        vec3 ocean = mix(deepCobalt, brightKlein, shelf * (0.42 + 0.58 * ndl)) + ivoryWhite * bathyIso;

        // Hypsometric Land Shading: Deep Cobalt Basins -> Bright Periwinkle Plateaus -> Pure White Snow Ridges!
        float elev = clamp((h0 - seaLevel) / 0.42, 0.0, 1.0);
        float landLum = clamp((0.18 + 0.85 * ndl) * (0.28 + 0.85 * elev), 0.0, 1.0);
        float scanWave = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.65);
        float woodcutHatch = smoothstep(0.88 - landLum * 0.75, 0.95 - landLum * 0.75, scanWave);
        vec3 landCol = mix(valleyBlue, ivoryWhite, landLum * 0.54 + woodcutHatch * 0.44);
        // Crisp Snow-Capped Alpine Peaks
        landCol = mix(landCol, ivoryWhite, smoothstep(0.56, 0.82, elev) * 0.75);

        // =========================================================
        // PLANETARY WINDING DENDRITIC RIVER SYSTEMS & DELTAS! (河流)
        // =========================================================
        if (u_rivers > 0.5 && landMask > 0.1) {
          vec3 rw = P * 6.8 + vec3(fbm(P * 14.0) * 0.55);
          float rVal1 = abs(fbm(rw) - 0.50);
          float rVal2 = (u_mobile > 0.5) ? 1.0 : abs(fbm(rw * 1.85 + 3.4) - 0.50);
          // Rivers widen near sea level (estuaries/deltas) and narrow in high mountains!
          float rWidth = mix(0.013, 0.004, elev);
          float riverMask = max(smoothstep(rWidth, 0.001, rVal1), smoothstep(rWidth * 0.75, 0.0008, rVal2) * 0.85);
          riverMask *= landMask * smoothstep(0.82, 0.02, elev);

          // Animated downstream shimmering flow pulse in Astral Cyan-Ivory!
          float flowPulse = 0.75 + 0.25 * sin((h0 - seaLevel) * 140.0 + u_time * 4.2);
          vec3 cyanRiver = vec3(0.46, 0.92, 1.0);
          landCol = mix(landCol, vec3(0.03, 0.12, 0.58), riverMask * 0.88);
          landCol = mix(landCol, cyanRiver, riverMask * smoothstep(rWidth * 0.58, 0.0, min(rVal1, rVal2)) * flowPulse);
        }

        vec3 col = mix(ocean, landCol, landMask);
        col = mix(col, ivoryWhite, clamp(coastLine * 0.92 + contourLine, 0.0, 1.0));

        // Dense Urban Street Networks & Warm Electrum-Gold Sanctuaries in River Basins & Coasts
        float su = abs(fract(lon * 190.0) - 0.5);
        float sv = abs(fract(lat * 190.0) - 0.5);
        float urbanZone = landMask * smoothstep(0.55, 0.10, elev) * smoothstep(0.48, 0.72, fbm(P * 12.0));
        float sGrid = smoothstep(0.14, 0.02, min(su, sv)) * urbanZone;
        vec3 electrumGold = vec3(1.0, 0.89, 0.58);
        col = mix(col, mix(ivoryWhite, electrumGold, 0.55), sGrid * 0.82);

        // Drifting Copperplate Atmospheric Cloud Swirls & R'lyeh Abyssal Typhoon!
        if (u_mobile < 0.5) {
          vec3 cPos = vec3(P.x * cos(u_time * 0.022) + P.z * sin(u_time * 0.022), P.y * 1.35, -P.x * sin(u_time * 0.022) + P.z * cos(u_time * 0.022));
          float cloudFbm = fbm(cPos * 4.6 + vec3(fbm(cPos * 9.0) * 0.45));
          float cloudBand = smoothstep(0.58, 0.78, cloudFbm) * 0.26;
          col = mix(col, vec3(0.86, 0.94, 1.0), cloudBand);
        }

        // Cthulhu & SCP-3000 Abyssal Trench Bioluminescence (shifts to Apollyon Crimson under breach!)
        float rift = pow(ridged(P * 9.5 + vec3(0.0, u_time * 0.03, 0.0)), 4.2) * (1.0 - landMask * 0.75);
        vec3 rlyehP = vec3(-0.545, -0.733, -0.407);
        float dR = length(P - rlyehP);
        float rlyehRings = smoothstep(0.18, 0.02, abs(fract(dR * 22.0 - u_time * 0.45) - 0.5)) * exp(-dR * 4.8);
        float breachTint = clamp((u_abyss - 0.72) * 3.2 * (1.0 - u_seal), 0.0, 1.0);
        vec3 riftColor = mix(vec3(0.52, 0.93, 1.0), vec3(1.0, 0.36, 0.54), breachTint);
        col = mix(col, riftColor, clamp((rift * 0.82 + rlyehRings * 0.88) * u_abyss, 0.0, 0.92));

        // Astrolabe Graticule
        float gLon = abs(fract(lon / (3.14159265 / 9.0) + 0.5) - 0.5);
        float gLat = abs(fract(lat / (3.14159265 / 9.0) + 0.5) - 0.5);
        col = mix(col, ivoryWhite, smoothstep(0.011, 0.002, min(gLon, gLat)) * 0.28 * u_seal);

        float fres = pow(1.0 - max(N_sphere.z, 0.0), 3.8);
        col = mix(col, ivoryWhite, fres * 0.72);

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    function initWebGL() {
      if (!gl) return;
      const compile = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
        return s;
      };
      const vs = compile(gl.VERTEX_SHADER, VERT_SRC), fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
      if (!vs || !fs) return;
      glProg = gl.createProgram(); gl.attachShader(glProg, vs); gl.attachShader(glProg, fs);
      gl.linkProgram(glProg); gl.useProgram(glProg);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(glProg, 'a_pos');
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      ['u_res','u_center','u_radius','u_rotY','u_rotX','u_time','u_relief','u_seal','u_abyss','u_outer','u_rivers','u_mobile'].forEach(k => {
        glUni[k] = gl.getUniformLocation(glProg, k);
      });
    }
    initWebGL();

    // =========================================================================
    // 7. COSMIC BACKDROP, OUTER GODS & ASTROLABE RINGS
    // =========================================================================
    const STARS = Array.from({ length: 220 }, () => ({
      x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.3,
      ph: Math.random() * 6.28, sp: 0.5 + Math.random() * 1.6
    }));
    const ROMANS_12 = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

    function safeR(v) { return Math.max(0, Number.isFinite(v) ? v : 0); }

    function drawEngravedEye(ctx, x, y, rx, ry, strokeCol = '#f4f7ff') {
      rx = safeR(rx); ry = safeR(ry);
      if (rx < 0.5 || ry < 0.5) return;
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = state.theme === 'day' ? '#fbf8f1' : '#181c26';
      ctx.strokeStyle = strokeCol; ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(-rx, 0); ctx.quadraticCurveTo(0, -ry * 1.28, rx, 0); ctx.quadraticCurveTo(0, ry * 1.28, -rx, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      const dx = state.mouseX - x, dy = state.mouseY - y, d = Math.hypot(dx, dy) || 1;
      const gx = (dx / d) * Math.min(rx * 0.25, d * 0.02), gy = (dy / d) * Math.min(ry * 0.20, d * 0.02);
      ctx.strokeStyle = strokeCol;
      ctx.beginPath(); ctx.arc(gx, gy, safeR(ry * 0.72), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = strokeCol;
      ctx.beginPath(); ctx.ellipse(gx, gy, safeR(Math.max(1.5, ry * 0.18)), safeR(ry * 0.58), 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function drawCurvedRingText(ctx, text, r, startAngle, fontSize = 9.5, alpha = 0.78, rgb = '244, 247, 255') {
      ctx.save();
      ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
      ctx.font = `${fontSize}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < text.length; i++) {
        const a = startAngle + (i / text.length) * Math.PI * 2;
        ctx.save(); ctx.rotate(a); ctx.fillText(text[i], 0, -r); ctx.restore();
      }
      ctx.restore();
    }

    function drawCosmicBackdrop(ctx, cx, cy, radius, pan, t) {
      ctx.save(); ctx.scale(DPR, DPR);
      const isDay = state.theme === 'day';
      const inkRgb = isDay ? '19, 38, 230' : '148, 172, 248';
      const inkHex = isDay ? '#1326e6' : '#7b96fa';

      if (IS_MOBILE) {
        ctx.fillStyle = isDay ? '#f3ede0' : '#12151c';
        ctx.fillRect(0, 0, W, H);
      } else {
        const bg = ctx.createRadialGradient(W * 0.5, H * 0.45, 50, W * 0.5, H * 0.5, Math.max(W, H) * 0.85);
        if (isDay) {
          bg.addColorStop(0, '#f7f3ea'); bg.addColorStop(0.65, '#efe8d8'); bg.addColorStop(1, '#e5dcc8');
        } else {
          bg.addColorStop(0, '#181d2a'); bg.addColorStop(0.65, '#12151c'); bg.addColorStop(1, '#0c0e14');
        }
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      }

      if (!IS_MOBILE) {
        ctx.fillStyle = isDay ? 'rgba(19, 38, 230, 0.18)' : '#9bb4ff';
        for (let si = 0; si < STARS.length; si += 2) {
          const s = STARS[si];
          ctx.globalAlpha = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
          ctx.beginPath(); ctx.arc(s.x * W, s.y * H, safeR(s.r), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      const og = state.outer;
      if (!IS_MOBILE && state.showGods && og > 0.05) {
        const azX = W * 0.19, azY = H * 0.23, ygX = W * 0.81, ygY = H * 0.23;
        ctx.save(); ctx.translate(azX, azY);
        ctx.strokeStyle = `rgba(${inkRgb}, ${0.32 * og})`;
        for (let k = 1; k <= 3; k++) {
          ctx.save(); ctx.rotate(t * (k % 2 ? 0.25 : -0.32)); ctx.beginPath();
          for (let i = 0; i <= 36; i++) {
            const a = (i / 36) * Math.PI * 2, r = 18 + k * 18 + Math.sin(a * 6 + t * 2.5) * 3;
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.stroke(); ctx.restore();
        }
        ctx.restore();
        for (let e = 0; e < 4; e++) {
          const ea = t * 0.4 + (e / 4) * Math.PI * 2;
          drawEngravedEye(ctx, azX + Math.cos(ea) * 44, azY + Math.sin(ea) * 44, 10 * og, 5.5 * og, inkHex);
        }

        const orbs = [[0,0,24,1],[-32,-18,16,1],[34,-16,16,1],[-24,25,14,0],[26,24,18,1]];
        ctx.strokeStyle = `rgba(${inkRgb}, ${0.28 * og})`;
        for (let i = 0; i < orbs.length; i++) for (let j = i + 1; j < orbs.length; j++) {
          ctx.beginPath(); ctx.moveTo(ygX + orbs[i][0], ygY + orbs[i][1]); ctx.lineTo(ygX + orbs[j][0], ygY + orbs[j][1]); ctx.stroke();
        }
        orbs.forEach(([dx, dy, rr, hasEye], idx) => {
          const wx = ygX + dx + Math.sin(t * 1.3 + idx) * 3, wy = ygY + dy + Math.cos(t * 1.1 + idx) * 3;
          ctx.fillStyle = isDay ? 'rgba(251, 248, 241, 0.9)' : 'rgba(24, 28, 38, 0.9)';
          ctx.strokeStyle = `rgba(${inkRgb}, ${0.65 * og})`; ctx.lineWidth = 1.15;
          ctx.beginPath(); ctx.arc(wx, wy, safeR(rr * og), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          if (hasEye) drawEngravedEye(ctx, wx, wy, rr * 0.62 * og, rr * 0.38 * og, inkHex);
        });
      }

      if (state.seal > 0.04) {
        ctx.save(); ctx.translate(cx, cy);
        const rIn = safeR(radius * 1.15), rOut = safeR(radius * 1.23), a = 0.25 + 0.38 * state.seal;
        ctx.strokeStyle = `rgba(${inkRgb}, ${a})`; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.arc(0, 0, safeR(rIn), 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, safeR(rOut), 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(${inkRgb}, ${a})`; ctx.font = '12px Georgia, serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ROMANS_12.forEach((rn, idx) => {
          const ang = (idx / 12) * Math.PI * 2 - Math.PI * 0.5 + t * 0.015;
          ctx.save(); ctx.rotate(ang + Math.PI * 0.5); ctx.fillText(rn, 0, -(rIn - 13)); ctx.restore();
        });
        if (!IS_MOBILE) {
          drawCurvedRingText(ctx, 'THEOLOGIA CAERULEA · SECURE · CONTAIN · PROTECT · ', (rIn + rOut) * 0.5, t * 0.018, Math.max(10, Math.min(13, radius * 0.023)), a * 0.85, inkRgb);
        }
        ctx.restore();
      }
      ctx.restore();
    }

    const RINGS = [
      { mult: 1.09, tiltX: 0.36, tiltZ: -0.22, speed: 0.09, width: 1.8, glyphs: ['α','β','γ','δ','ε','ζ','η','Ω'] },
      { mult: 1.17, tiltX: -0.52, tiltZ: 0.42, speed: -0.065, width: 1.3, glyphs: ['I','II','III','IV','V','VI','VII','VIII'] }
    ];
    function ringPoint3D(ang, r, ring, t) {
      const a = ang + t * ring.speed;
      let x = Math.cos(a) * r, y = 0, z = Math.sin(a) * r;
      const cx1 = Math.cos(ring.tiltX), sx1 = Math.sin(ring.tiltX);
      let y1 = y * cx1 - z * sx1, z1 = y * sx1 + z * cx1;
      const cz1 = Math.cos(ring.tiltZ), sz1 = Math.sin(ring.tiltZ);
      return rotateToCamera([x * cz1 - y1 * sz1, x * sz1 + y1 * cz1, z1], state.rotY * 0.25, state.rotX * 0.35);
    }
    function drawArmillaryHalf(ctx, cx, cy, radius, t, isFront) {
      if (!state.showRings || state.seal < 0.03) return;
      ctx.save(); ctx.scale(DPR, DPR);
      const isDay = state.theme === 'day';
      const segs = IS_MOBILE ? 36 : 84;
      for (const ring of RINGS) {
        const rr = radius * ring.mult, pts = [];
        for (let i = 0; i <= segs; i++) {
          const p = ringPoint3D((i / segs) * Math.PI * 2, rr, ring, t);
          pts.push({ x: cx + p[0], y: cy - p[1], z: p[2] });
        }
        ctx.strokeStyle = isDay
          ? `rgba(19, 38, 230, ${(isFront ? 0.56 : 0.24) * state.seal})`
          : `rgba(220, 230, 255, ${(isFront ? 0.62 : 0.28) * state.seal})`;
        ctx.lineWidth = ring.width * (isFront ? 1.0 : 0.78);
        ctx.beginPath();
        let penDown = false;
        for (let i = 0; i < segs; i++) {
          const a = pts[i], b = pts[i + 1], mz = (a.z + b.z) * 0.5;
          if (isFront ? mz < 0 : mz >= 0) { penDown = false; continue; }
          if ((a.x < -60 && b.x < -60) || (a.x > W + 60 && b.x > W + 60) || (a.y < -60 && b.y < -60) || (a.y > H + 60 && b.y > H + 60)) { penDown = false; continue; }
          if (!penDown) { ctx.moveTo(a.x, a.y); penDown = true; }
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
        if (!IS_MOBILE || isFront) {
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ring.glyphs.forEach((g, idx) => {
            if (IS_MOBILE && idx % 2 === 1) return;
            const p = ringPoint3D((idx / ring.glyphs.length) * Math.PI * 2, rr, ring, t);
            if (isFront ? p[2] < 0 : p[2] >= 0) return;
            const px = cx + p[0], py = cy - p[1];
            if (px < -30 || px > W + 30 || py < -30 || py > H + 30) return;
            const alpha = (0.4 + 0.6 * ((p[2] / (rr || 1) + 1) * 0.5)) * state.seal;
            ctx.fillStyle = `rgba(19, 38, 230, ${0.92 * alpha})`; ctx.strokeStyle = `rgba(244, 247, 255, ${alpha})`; ctx.lineWidth = 1.1;
            ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`; ctx.font = '12px Georgia, serif';
            ctx.fillText(g, px, py + 0.5);
          });
        }
      }
      ctx.restore();
    }

    const HORIZON_TENTACLES = Array.from({ length: 12 }, (_, i) => ({
      ang: (i / 12) * Math.PI * 2 + 0.14, len: 0.14 + (i % 4) * 0.05, sp: 1.25 + (i % 3) * 0.3, ph: i * 1.9
    }));
    function drawHorizonTentacles(ctx, cx, cy, radius, t) {
      if (IS_MOBILE || !state.showGods || state.abyss < 0.08) return;
      ctx.save(); ctx.scale(DPR, DPR);
      const pw = state.abyss;
      for (const tc of HORIZON_TENTACLES) {
        const rootA = tc.ang + state.rotY * 0.15;
        const bx = cx + Math.cos(rootA) * radius * 0.99, by = cy + Math.sin(rootA) * radius * 0.99;
        if (bx < -220 || bx > W + 220 || by < -220 || by > H + 220) continue;
        const reach = Math.min(230, radius * tc.len * (0.4 + 0.85 * pw));
        const baseThick = Math.min(18, Math.max(6, radius * 0.014)) * (0.55 + 0.55 * pw);
        const segs = 16, spine = [];
        for (let s = 0; s <= segs; s++) {
          const u = s / segs, r = radius * 0.99 + reach * u, wv = Math.sin(u * 5.6 - t * tc.sp + tc.ph) * (reach * 0.22 * u);
          spine.push({ x: cx + Math.cos(rootA)*r - Math.sin(rootA)*wv, y: cy + Math.sin(rootA)*r + Math.cos(rootA)*wv, w: baseThick * (1 - u * 0.88) });
        }
        const left = [], right = [], suckers = [];
        for (let s = 0; s <= segs; s++) {
          const p = spine[s], pn = spine[Math.min(segs, s+1)], pp = spine[Math.max(0, s-1)];
          const dx = pn.x - pp.x, dy = pn.y - pp.y, l = Math.hypot(dx, dy) || 1, nx = -dy/l, ny = dx/l;
          left.push({ x: p.x + nx*p.w, y: p.y + ny*p.w }); right.push({ x: p.x - nx*p.w, y: p.y - ny*p.w });
          if (s > 2 && s < segs - 2 && s % 2 === 0) suckers.push({ x: p.x + nx*p.w*0.92, y: p.y + ny*p.w*0.92, r: safeR(Math.max(1.4, p.w*0.42)) });
        }
        ctx.fillStyle = '#1326e6'; ctx.strokeStyle = '#f4f7ff'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(left[0].x, left[0].y);
        for (let s = 1; s <= segs; s++) ctx.lineTo(left[s].x, left[s].y);
        for (let s = segs; s >= 0; s--) ctx.lineTo(right[s].x, right[s].y);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f4f7ff'; ctx.strokeStyle = '#0e1fd2'; ctx.lineWidth = 0.8;
        for (const sk of suckers) { ctx.beginPath(); ctx.arc(sk.x, sk.y, safeR(sk.r), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      }
      ctx.restore();
    }

    // =========================================================================
    // 8. 3D MOUNTAINS, EMBANKED RIVERS, WATERFALLS, ARCHITECTURE & CROWD FLOWS!
    // =========================================================================
    let clickablePins = [];
    const SUN_CAM = normalize3([0.55, 0.52, 0.65]);

    function isFrontQuad(p0, p1, p2) {
      return ((p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x)) < 0;
    }
    function cobaltTone(shade, vis, highlightWhite = false) {
      if (highlightWhite) {
        return `rgba(${Math.min(255, Math.round(32 + shade * 85))}, ${Math.min(255, Math.round(58 + shade * 105))}, ${Math.min(255, Math.round(215 + shade * 38))}, ${0.96 * vis})`;
      }
      return `rgba(${Math.min(255, Math.round(14 + shade * 42))}, ${Math.min(255, Math.round(30 + shade * 68))}, ${Math.min(255, Math.round(175 + shade * 76))}, ${0.95 * vis})`;
    }
    function fillPoly(ctx, pts, fill, stroke, lw = 0.9) {
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath(); ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    }

    function drawBlueprintWall(ctx, b0, b1, t1, t0, shade, vis, opts) {
      if (!isFrontQuad(b0, b1, t1)) return;
      const wallW = Math.hypot(b1.x - b0.x, b1.y - b0.y);
      const wallH = Math.hypot(t0.x - b0.x, t0.y - b0.y);
      const lineAlpha = (opts.highlightWhite ? 0.95 : 0.78) * vis;

      fillPoly(ctx, [b0, b1, t1, t0], cobaltTone(shade, vis, opts.highlightWhite), `rgba(244, 247, 255, ${lineAlpha})`, 0.9);
      if (wallW < (IS_MOBILE ? 18 : 8) || wallH < (IS_MOBILE ? 18 : 8)) return;

      const floors = opts.windows || 0;
      if (floors >= 2 && wallH >= 16) {
        ctx.strokeStyle = `rgba(244, 247, 255, ${0.42 * vis})`; ctx.lineWidth = 0.65;
        for (let f = 1; f <= floors; f++) {
          const v = f / (floors + 0.4), pL = lerp2(b0, t0, v), pR = lerp2(b1, t1, v);
          ctx.beginPath(); ctx.moveTo(pL.x, pL.y); ctx.lineTo(pR.x, pR.y); ctx.stroke();
        }
      }
      if (floors >= 1 && wallW >= 10 && wallH >= 12) {
        const cols = Math.max(1, Math.min(6, Math.round(wallW / 11)));
        ctx.fillStyle = `rgba(248, 251, 255, ${0.92 * vis})`;
        for (let f = 0; f < floors; f++) {
          const vBot = (f + 0.25) / (floors + 0.35), vTop = (f + 0.75) / (floors + 0.35);
          for (let c = 0; c < cols; c++) {
            if (f === 0 && opts.portal && Math.abs((c + 0.5) / cols - 0.5) < 0.22) continue;
            const uL = (c + 0.28) / cols, uR = (c + 0.72) / cols;
            const w0 = bilerpQuad(b0,b1,t1,t0,uL,vBot), w1 = bilerpQuad(b0,b1,t1,t0,uR,vBot), w2 = bilerpQuad(b0,b1,t1,t0,uR,vTop), w3 = bilerpQuad(b0,b1,t1,t0,uL,vTop);
            ctx.beginPath(); ctx.moveTo(w0.x, w0.y); ctx.lineTo(w1.x, w1.y); ctx.lineTo(w2.x, w2.y); ctx.lineTo(w3.x, w3.y); ctx.closePath(); ctx.fill();
          }
        }
      }
      if (opts.portal && wallW >= 16 && wallH >= 18) {
        const p0 = bilerpQuad(b0,b1,t1,t0,0.38,0), p1 = bilerpQuad(b0,b1,t1,t0,0.62,0), p2 = bilerpQuad(b0,b1,t1,t0,0.62,0.26), p3 = bilerpQuad(b0,b1,t1,t0,0.38,0.26), archPeak = bilerpQuad(b0,b1,t1,t0,0.50,0.35);
        ctx.fillStyle = `rgba(7, 15, 128, ${0.96 * vis})`; ctx.strokeStyle = `rgba(255, 255, 255, ${0.96 * vis})`; ctx.lineWidth = 1.15;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.quadraticCurveTo(archPeak.x, archPeak.y, p3.x, p3.y); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      if ((opts.roseWindow || opts.clockFace) && wallW >= 18 && wallH >= 24) {
        const rc = bilerpQuad(b0, b1, t1, t0, 0.5, opts.clockFace ? 0.78 : 0.62);
        const rr = safeR(Math.min(wallW, wallH) * (opts.clockFace ? 0.24 : 0.21));
        ctx.fillStyle = `rgba(255, 255, 255, ${0.24 * vis})`; ctx.strokeStyle = `rgba(255, 255, 255, ${0.98 * vis})`; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(rc.x, rc.y, safeR(rr), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        for (let sp = 0; sp < 8; sp++) {
          const sa = (sp / 8) * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(rc.x, rc.y); ctx.lineTo(rc.x + Math.cos(sa)*rr, rc.y + Math.sin(sa)*rr); ctx.stroke();
        }
      }
    }

    // Interpolate along a 3D polyline path for crowd simulation!
    function samplePath3D(pts, u) {
      const segs = pts.length - 1;
      const f = Math.max(0, Math.min(0.9999, u)) * segs;
      const idx = Math.floor(f), t = f - idx;
      const a = pts[idx], b = pts[idx + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }

    function draw3DCitiesRiversAndCrowds(ctx, cx, cy, surfRadius, t) {
      clickablePins = [];
      ctx.save();
      ctx.scale(DPR, DPR);

      const archUnit = surfRadius * 0.052;
      const highLOD = state.zoom >= (IS_MOBILE ? 3.6 : 2.1);

      // 0A. 3D VAULTED THAUMATURGIC LEY-LINE ARCS & PILGRIMAGE STREAMS!
      if (!IS_MOBILE && state.zoom < 5.2) {
        for (let rIdx = 0; rIdx < MACRO_ROUTES.length; rIdx++) {
          const [idA, idB] = MACRO_ROUTES[rIdx];
          const cA = CITIES.find(x => x.id === idA), cB = CITIES.find(x => x.id === idB);
          if (!cA || !cB) continue;
          const vA = latLonToVec3(cA.lat, cA.lon), vB = latLonToVec3(cB.lat, cB.lon);

          if (state.showRings && state.seal > 0.1) {
            ctx.strokeStyle = rIdx % 2 === 0 ? `rgba(255, 229, 150, ${0.42 * state.seal})` : `rgba(136, 240, 255, ${0.42 * state.seal})`;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            let arcStarted = false;
            for (let s = 0; s <= 20; s++) {
              const u = s / 20;
              const p = normalize3([vA[0]*(1-u)+vB[0]*u, vA[1]*(1-u)+vB[1]*u, vA[2]*(1-u)+vB[2]*u]);
              const alt = 1.0 + Math.sin(u * Math.PI) * 0.115 * state.seal;
              const vc = rotateToCamera(p, state.rotY, state.rotX);
              if (vc[2] < -0.08) { arcStarted = false; continue; }
              const sx = cx + vc[0] * surfRadius * alt, sy = cy - vc[1] * surfRadius * alt;
              if (!arcStarted) { ctx.moveTo(sx, sy); arcStarted = true; } else ctx.lineTo(sx, sy);
            }
            ctx.stroke();

            const uPulse = (((t * 0.18 + rIdx * 0.23) % 1) + 1) % 1;
            const pP = normalize3([vA[0]*(1-uPulse)+vB[0]*uPulse, vA[1]*(1-uPulse)+vB[1]*uPulse, vA[2]*(1-uPulse)+vB[2]*uPulse]);
            const altP = 1.0 + Math.sin(uPulse * Math.PI) * 0.115 * state.seal;
            const vcP = rotateToCamera(pP, state.rotY, state.rotX);
            if (vcP[2] > 0) {
              ctx.fillStyle = rIdx % 2 === 0 ? '#ffe596' : '#88f0ff';
              ctx.beginPath(); ctx.arc(cx + vcP[0] * surfRadius * altP, cy - vcP[1] * surfRadius * altP, 2.3, 0, Math.PI * 2); ctx.fill();
            }
          }

          if (state.showCrowds && state.zoom < 4.5) {
            ctx.strokeStyle = 'rgba(244, 247, 255, 0.24)';
            ctx.lineWidth = 0.85;
            ctx.setLineDash([3, 5]);
            ctx.beginPath();
            let started = false;
            for (let s = 0; s <= 16; s++) {
              const u = s / 16;
              const p = normalize3([vA[0]*(1-u)+vB[0]*u, vA[1]*(1-u)+vB[1]*u, vA[2]*(1-u)+vB[2]*u]);
              const vc = rotateToCamera(p, state.rotY, state.rotX);
              if (vc[2] < 0) { started = false; continue; }
              const sx = cx + vc[0] * surfRadius * 1.004, sy = cy - vc[1] * surfRadius * 1.004;
              if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy);
            }
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#ffffff';
            for (let k = 0; k < 5; k++) {
              const u = (((k / 5 + t * 0.065) % 1) + 1) % 1;
              const p = normalize3([vA[0]*(1-u)+vB[0]*u, vA[1]*(1-u)+vB[1]*u, vA[2]*(1-u)+vB[2]*u]);
              const vc = rotateToCamera(p, state.rotY, state.rotX);
              if (vc[2] > 0.02) {
                ctx.beginPath();
                ctx.arc(cx + vc[0] * surfRadius * 1.006, cy - vc[1] * surfRadius * 1.006, 1.7, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }
      }

      // 0B. DESKTOP-ONLY AURORAS, MARITIME FLOTILLAS & ORBITAL SATELLITES (P4: disabled on mobile!)
      if (!IS_MOBILE && state.showTerrain && state.zoom < 5.5) {
        for (const poleLat of [-73, 68]) {
          for (let b = 0; b < 24; b++) {
            const lon = (b / 24) * 360 + Math.sin(t * 0.4 + b) * 8;
            const lat = poleLat + Math.sin(b * 0.7 + t * 0.9) * 3.8;
            const v0 = rotateToCamera(latLonToVec3(lat, lon), state.rotY, state.rotX);
            if (v0[2] < 0.02) continue;
            const x0 = cx + v0[0] * surfRadius * 1.015, y0 = cy - v0[1] * surfRadius * 1.015;
            const x1 = cx + v0[0] * surfRadius * 1.065, y1 = cy - v0[1] * surfRadius * 1.065;
            const aurAlpha = Math.max(0, (0.16 + 0.16 * Math.sin(t * 2.4 + b * 0.9)) * v0[2]);
            ctx.strokeStyle = b % 3 === 0 ? `rgba(255, 229, 150, ${aurAlpha})` : `rgba(116, 238, 255, ${aurAlpha})`;
            ctx.lineWidth = Math.max(1.5, surfRadius * 0.008);
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
          }
        }

        MARITIME_ROUTES.forEach((wp, mIdx) => {
          const pts3 = wp.map(([la, lo]) => latLonToVec3(la, lo));
          for (let shipIdx = 0; shipIdx < 2; shipIdx++) {
            const u = (((t * 0.038 + shipIdx * 0.48 + mIdx * 0.17) % 0.99) + 0.99) % 0.99;
            const pos3 = normalize3(samplePath3D(pts3, u));
            const nxt3 = normalize3(samplePath3D(pts3, Math.min(0.999, u + 0.02)));
            const vc = rotateToCamera(pos3, state.rotY, state.rotX);
            const vn = rotateToCamera(nxt3, state.rotY, state.rotX);
            if (vc[2] < 0.08) continue;
            const sx = cx + vc[0] * surfRadius * 1.005, sy = cy - vc[1] * surfRadius * 1.005;
            const ang = Math.atan2(-(vn[1] - vc[1]), vn[0] - vc[0]);
            ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
            ctx.strokeStyle = 'rgba(136, 240, 255, 0.55)'; ctx.lineWidth = 0.9;
            ctx.beginPath(); ctx.moveTo(-9, -3.2); ctx.lineTo(2, 0); ctx.lineTo(-9, 3.2); ctx.stroke();
            ctx.fillStyle = '#f4f7ff';
            ctx.beginPath(); ctx.moveTo(4.5, 0); ctx.lineTo(-3.5, -2.1); ctx.lineTo(-3.5, 2.1); ctx.closePath(); ctx.fill();
            ctx.restore();
            // Positive modulo guaranteed (P0.1 fix!)
            const sonarR = (((t * 14 + mIdx * 9 + shipIdx * 17) % 24) + 24) % 24;
            if (sonarR < 18) {
              ctx.strokeStyle = `rgba(136, 240, 255, ${(1 - sonarR / 18) * 0.5})`;
              ctx.lineWidth = 0.8;
              ctx.beginPath(); ctx.arc(sx, sy, safeR(sonarR), 0, Math.PI * 2); ctx.stroke();
            }
          }
        });
      }

      if (!IS_MOBILE && state.showRings && state.zoom < 3.6) {
        const isDay = state.theme === 'day';
        for (const sat of ORBITAL_SATS) {
          const a = t * sat.speed + sat.asc;
          const ox = Math.cos(a), oy = Math.sin(a) * Math.sin(sat.inc), oz = Math.sin(a) * Math.cos(sat.inc);
          const vc = rotateToCamera([ox, oy, oz], state.rotY * 0.4, state.rotX * 0.4);
          if (vc[2] < -0.1) continue;
          const sx = cx + vc[0] * surfRadius * sat.alt, sy = cy - vc[1] * surfRadius * sat.alt;
          const gx = cx + vc[0] * surfRadius, gy = cy - vc[1] * surfRadius;
          ctx.strokeStyle = isDay ? 'rgba(19, 38, 230, 0.25)' : 'rgba(136, 240, 255, 0.25)';
          ctx.lineWidth = 0.9; ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(gx, gy); ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle = isDay ? '#1326e6' : '#ffe596'; ctx.fillStyle = isDay ? '#fbf8f1' : '#0916b8'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(sx - 8, sy - 3); ctx.lineTo(sx + 8, sy + 3); ctx.stroke();
          ctx.beginPath(); ctx.rect(sx - 2.5, sy - 2.5, 5, 5); ctx.fill(); ctx.stroke();
        }
      }

      // 1. Secondary Continental Towns
      if (!IS_MOBILE && state.showCities && state.zoom < 4.2) {
        const mUnit = archUnit * 0.42;
        ctx.fillStyle = 'rgba(14, 30, 208, 0.92)'; ctx.strokeStyle = 'rgba(244, 247, 255, 0.85)'; ctx.lineWidth = 0.85;
        for (const [lat, lon] of MINOR_TOWNS) {
          const upObj = latLonToVec3(lat, lon), upCam = rotateToCamera(upObj, state.rotY, state.rotX);
          if (upCam[2] < -0.05) continue;
          const sx = cx + upCam[0] * surfRadius, sy = cy - upCam[1] * surfRadius;
          if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;
          const th = mUnit * 0.85, tw = Math.max(2.5, mUnit * 0.25);
          ctx.beginPath(); ctx.rect(sx - tw * 0.5, sy - th, tw, th); ctx.fill(); ctx.stroke();
        }
      }

      // 2. Render the 12 Rich Topographic Megacities & SCP Sites!
      const sortedCities = CITIES.map(c => {
        const upObj = latLonToVec3(c.lat, c.lon), upCam = rotateToCamera(upObj, state.rotY, state.rotX);
        return { c, upObj, upCam };
      }).sort((a, b) => a.upCam[2] - b.upCam[2]);

      for (const { c, upObj, upCam } of sortedCities) {
        if (upCam[2] < -0.24) continue;
        const baseX = cx + upCam[0] * surfRadius, baseY = cy - upCam[1] * surfRadius;
        const citySpanPx = archUnit * 3.1;
        if (baseX < -citySpanPx || baseX > W + citySpanPx || baseY < -citySpanPx || baseY > H + citySpanPx * 1.5) continue;

        const vis = Math.min(1, Math.max(0, (upCam[2] + 0.24) / 0.28));
        const isSel = state.selectedId === c.id;
        const isHov = state.hoveredId === c.id;

        let eastObj = cross3([0, 1, 0], upObj);
        if (Math.hypot(...eastObj) < 0.001) eastObj = [1, 0, 0];
        eastObj = normalize3(eastObj);
        const northObj = normalize3(cross3(upObj, eastObj));

        const eastCam = rotateToCamera(eastObj, state.rotY, state.rotX);
        const northCam = rotateToCamera(northObj, state.rotY, state.rotX);

        const reliefScale = 0.55 + 0.45 * state.relief;
        const proj = (lx, ly, lz) => ({
          x: cx + upCam[0] * surfRadius + (eastCam[0] * lx + northCam[0] * ly + upCam[0] * lz) * archUnit,
          y: cy - (upCam[1] * surfRadius + (eastCam[1] * lx + northCam[1] * ly + upCam[1] * lz) * archUnit),
          z: upCam[2] * surfRadius + (eastCam[2] * lx + northCam[2] * ly + upCam[2] * lz) * archUnit
        });

        const normalShade = (nx, ny, nz) => {
          const nc = normalize3([
            eastCam[0]*nx + northCam[0]*ny + upCam[0]*nz,
            eastCam[1]*nx + northCam[1]*ny + upCam[1]*nz,
            eastCam[2]*nx + northCam[2]*ny + upCam[2]*nz
          ]);
          return Math.max(0, dot3(nc, SUN_CAM));
        };

        const edgeWhite = `rgba(244, 247, 255, ${0.86 * vis})`;

        // Filter structures based on toggles & LOD
        let activeList = c.structures.filter(st => {
          if (st.lod && !highLOD) return false;
          if (IS_MOBILE && !highLOD) {
            if (st.isTerrain || st.kind === 'buttress' || st.kind === 'arch_bridge') return false;
            if (st.kind === 'prism' && (st.h || 0) < 0.42 && !st.roof && !st.highlightWhite) return false;
          }
          if ((st.kind === 'mountain_peak' || st.kind === 'river_channel') && !state.showTerrain) return false;
          if (!state.showCities && st.kind !== 'mountain_peak' && st.kind !== 'river_channel') return false;
          return true;
        });
        if (IS_MOBILE && !highLOD && activeList.length > 8) activeList = activeList.slice(0, 8);

        const sortedSt = activeList.map(st => {
          const cxLocal = st.x !== undefined ? st.x : (st.x1 !== undefined ? (st.x1 + st.x2) * 0.5 : 0);
          const cyLocal = st.y !== undefined ? st.y : (st.y1 !== undefined ? (st.y1 + st.y2) * 0.5 : -0.45);
          const czLocal = st.kind === 'river_channel' ? -0.05 : (st.z0 || 0) + (st.h || 0.3) * 0.5;
          return { st, zCam: proj(cxLocal, cyLocal, czLocal).z };
        }).sort((a, b) => a.zCam - b.zCam);

        for (const { st } of sortedSt) {
          // -----------------------------------------------------------------
          // A) 3D JAGGED TOPOGRAPHIC MOUNTAIN PEAKS & RIDGES (山峰与地势高低差!)
          // -----------------------------------------------------------------
          if (st.kind === 'mountain_peak') {
            const mh = st.h * reliefScale;
            if (mh < 0.05) continue;
            const sides = IS_MOBILE ? 4 : (st.jag || 6);
            const apex = proj(st.x, st.y, st.z0 + mh);
            const snowZ = st.z0 + mh * 0.62;
            const bot = [], mid = [];
            for (let s = 0; s < sides; s++) {
              const a = (s / sides) * Math.PI * 2 + st.x;
              const radMod = st.r * (0.82 + 0.32 * ((s * 3) % 2));
              bot.push(proj(st.x + Math.cos(a) * radMod, st.y + Math.sin(a) * radMod, st.z0));
              mid.push(proj(st.x + Math.cos(a) * radMod * 0.38, st.y + Math.sin(a) * radMod * 0.38, snowZ));
            }
            for (let s = 0; s < sides; s++) {
              const sn = (s + 1) % sides;
              const ma = ((s + 0.5) / sides) * Math.PI * 2 + st.x;
              const sh = normalShade(Math.cos(ma), Math.sin(ma), 0.45);
              if (isFrontQuad(bot[s], bot[sn], apex)) {
                // Lower cobalt rock slope + topographic contour lines
                fillPoly(ctx, [bot[s], bot[sn], mid[sn], mid[s]], cobaltTone(sh * 0.75, vis), `rgba(244,247,255,${0.48*vis})`, 0.8);
                // Snow-capped engraved white-periwinkle summit!
                fillPoly(ctx, [mid[s], mid[sn], apex], `rgba(232, 240, 255, ${(0.55 + 0.4 * sh) * vis})`, `rgba(255,255,255,${0.9*vis})`, 0.95);
              }
            }
          }

          // -----------------------------------------------------------------
          // B) 3D EMBANKED WINDING RIVER, SAILING BOATS & CASCADING WATERFALL!
          // -----------------------------------------------------------------
          else if (st.kind === 'river_channel') {
            const rPts = st.pts, hw = st.width * 0.5;
            const leftQuay = [], rightQuay = [], leftWater = [], rightWater = [];
            for (let i = 0; i < rPts.length; i++) {
              const cur = rPts[i];
              const nxt = rPts[Math.min(rPts.length - 1, i + 1)];
              const prv = rPts[Math.max(0, i - 1)];
              const dx = nxt[0] - prv[0], dy = nxt[1] - prv[1], l = Math.hypot(dx, dy) || 1;
              const nx = -dy / l, ny = dx / l;
              leftQuay.push(proj(cur[0] + nx * hw * 1.18, cur[1] + ny * hw * 1.18, 0.03));
              rightQuay.push(proj(cur[0] - nx * hw * 1.18, cur[1] - ny * hw * 1.18, 0.03));
              leftWater.push(proj(cur[0] + nx * hw, cur[1] + ny * hw, -0.02));
              rightWater.push(proj(cur[0] - nx * hw, cur[1] - ny * hw, -0.02));
            }

            // Stone Quay Embankment Rim
            ctx.strokeStyle = `rgba(244, 247, 255, ${0.82 * vis})`;
            ctx.lineWidth = Math.max(1.2, archUnit * 0.022);
            ctx.beginPath(); leftQuay.forEach((p, i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y)); ctx.stroke();
            ctx.beginPath(); rightQuay.forEach((p, i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y)); ctx.stroke();

            // Deep Ultramarine Riverbed Polygon
            ctx.fillStyle = `rgba(6, 15, 132, ${0.95 * vis})`;
            ctx.beginPath();
            leftWater.forEach((p, i) => i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
            for (let i = rightWater.length - 1; i >= 0; i--) ctx.lineTo(rightWater[i].x, rightWater[i].y);
            ctx.closePath(); ctx.fill();

            // Animated White Downstream Current Ripples & Sailing Boats / Patrol Craft!
            ctx.strokeStyle = `rgba(244, 247, 255, ${0.75 * vis})`;
            ctx.lineWidth = 1.0;
            const river3D = rPts.map(q => [q[0], q[1], -0.015]);
            const rippleN = IS_MOBILE ? 3 : 10;
            for (let w = 0; w < rippleN; w++) {
              const u0 = (w / rippleN + t * 0.16) % 0.92;
              const pA = proj(...samplePath3D(river3D, u0));
              const pB = proj(...samplePath3D(river3D, Math.min(0.99, u0 + 0.045)));
              ctx.beginPath(); ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y); ctx.stroke();
            }
            // 3 Gliding River Vessels / Boats with Sails!
            if (archUnit > 20) {
              for (let b = 0; b < 3; b++) {
                const ub = (b * 0.33 + t * 0.055) % 0.95;
                const bp = samplePath3D(river3D, ub);
                const hull = proj(bp[0], bp[1], 0.0);
                const mast = proj(bp[0], bp[1], 0.09);
                ctx.fillStyle = '#ffffff';
                ctx.beginPath(); ctx.ellipse(hull.x, hull.y, safeR(Math.max(2.5, archUnit * 0.045)), safeR(Math.max(1.4, archUnit * 0.022)), 0.2, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.1;
                ctx.beginPath(); ctx.moveTo(hull.x, hull.y); ctx.lineTo(mast.x, mast.y); ctx.stroke();
              }
            }

            // 3D Cascading Cliffside Waterfall plunging from northern mountain into the river headwaters!
            if (st.hasWaterfall) {
              const wfX = rPts[0][0] * 0.85, wfY = rPts[0][1] * 1.05;
              const wfTop = proj(wfX, wfY, 0.85 * reliefScale);
              const wfBot = proj(rPts[0][0], rPts[0][1], 0.0);
              ctx.strokeStyle = `rgba(244, 247, 255, ${0.88 * vis})`;
              ctx.lineWidth = Math.max(2.2, archUnit * 0.065);
              ctx.setLineDash([5, 3]);
              ctx.lineDashOffset = -t * 28;
              ctx.beginPath(); ctx.moveTo(wfTop.x, wfTop.y); ctx.lineTo(wfBot.x, wfBot.y); ctx.stroke();
              ctx.setLineDash([]);
              // Splash mist ring at waterfall base
              ctx.beginPath(); ctx.arc(wfBot.x, wfBot.y, safeR(Math.max(3, archUnit * (0.08 + 0.03 * Math.sin(t * 5)))), 0, Math.PI * 2); ctx.stroke();
            }
          }

          // -----------------------------------------------------------------
          // C) SCP-001 GATE GUARDIAN & SCP-2317 SEVEN CHAINS!
          // -----------------------------------------------------------------
          else if (st.kind === 'gate_guardian') {
            const gBase = proj(st.x, st.y, st.z0);
            const gHead = proj(st.x, st.y, st.z0 + 0.95);
            const sc = archUnit * 0.85;
            ctx.save();
            ctx.translate(gHead.x, gHead.y);
            ctx.strokeStyle = '#ffffff'; ctx.fillStyle = 'rgba(244,247,255,0.92)'; ctx.lineWidth = 1.4;
            // Four Radiant Seraphic Wings!
            const spread = 1 + Math.sin(t * 2.2) * 0.08;
            for (const dir of [-1, 1]) {
              for (const tier of [-0.35, 0.25]) {
                ctx.beginPath();
                ctx.moveTo(0, sc * 0.2);
                ctx.quadraticCurveTo(dir * sc * 0.95 * spread, sc * (tier - 0.55), dir * sc * 1.45 * spread, sc * tier);
                ctx.quadraticCurveTo(dir * sc * 0.7, sc * (tier + 0.25), 0, sc * 0.45);
                ctx.stroke();
              }
            }
            // Pillar of Light Torso & Blazing Vertical Greatsword!
            ctx.beginPath(); ctx.arc(0, 0, safeR(sc * 0.16), 0, Math.PI * 2); ctx.fill();
            ctx.lineWidth = 2.6;
            ctx.beginPath(); ctx.moveTo(0, -sc * 0.85); ctx.lineTo(0, gBase.y - gHead.y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-sc * 0.22, sc * 0.15); ctx.lineTo(sc * 0.22, sc * 0.15); ctx.stroke();
            ctx.restore();
          }
          else if (st.kind === 'scp2317_chains') {
            const centerPit = proj(st.x, st.y, st.z0);
            ctx.fillStyle = 'rgba(5, 10, 95, 0.95)'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(centerPit.x, centerPit.y, safeR(Math.max(5, archUnit * 0.22)), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            for (let k = 0; k < 7; k++) {
              const a = (k / 7) * Math.PI * 2;
              const px = st.x + Math.cos(a) * st.r, py = st.y + Math.sin(a) * st.r;
              const pBot = proj(px, py, st.z0), pTop = proj(px, py, st.z0 + 0.36);
              ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.8, archUnit * 0.035);
              ctx.beginPath(); ctx.moveTo(pBot.x, pBot.y); ctx.lineTo(pTop.x, pTop.y); ctx.stroke();
              // Chain #6 is the ONLY intact glowing taut chain; Chains 0..5 are snapped!
              if (k === 6) {
                ctx.strokeStyle = '#fff4b8'; ctx.lineWidth = 1.8;
                ctx.beginPath(); ctx.moveTo(pTop.x, pTop.y); ctx.lineTo(centerPit.x, centerPit.y); ctx.stroke();
              } else {
                ctx.strokeStyle = 'rgba(244,247,255,0.45)'; ctx.lineWidth = 1.0; ctx.setLineDash([2, 3]);
                ctx.beginPath(); ctx.moveTo(pTop.x, pTop.y); ctx.lineTo((pTop.x + centerPit.x) * 0.5, (pTop.y + centerPit.y) * 0.5 + 4); ctx.stroke();
                ctx.setLineDash([]);
              }
            }
          }

          // -----------------------------------------------------------------
          // D) STANDARD 3D ARCHITECTURAL STRUCTURES (Prisms, Terraces, Domes, Pagodas, Bridges)
          // -----------------------------------------------------------------
          else if (st.kind === 'prism') {
            const sides = st.sides || 4;
            const z0 = st.z0 || 0, z1 = z0 + st.h;
            const tx = st.tiltX || 0, ty = st.tiltY || 0;
            const rx = st.w * (sides === 4 ? 0.7071 : 0.5), ry = st.d * (sides === 4 ? 0.7071 : 0.5);
            const bot = [], top = [], norms = [];
            for (let s = 0; s < sides; s++) {
              let dx, dy;
              if (sides === 4 && !st.rot) {
                dx = (s === 1 || s === 2 ? 0.5 : -0.5) * st.w;
                dy = (s === 2 || s === 3 ? 0.5 : -0.5) * st.d;
              } else {
                const localA = (s / sides) * Math.PI * 2 + (sides === 4 ? -Math.PI * 0.75 : 0);
                const lx0 = Math.cos(localA) * rx, ly0 = Math.sin(localA) * ry;
                const cr = Math.cos(st.rot || 0), sr = Math.sin(st.rot || 0);
                dx = lx0 * cr - ly0 * sr; dy = lx0 * sr + ly0 * cr;
              }
              bot.push(proj(st.x + dx, st.y + dy, z0));
              top.push(proj(st.x + dx + tx, st.y + dy + ty, z1));
              const midA = (st.rot || 0) + ((s + 0.5) / sides) * Math.PI * 2 - (sides === 4 ? Math.PI * 0.75 : 0);
              norms.push([Math.cos(midA), Math.sin(midA), 0]);
            }
            for (let s = 0; s < sides; s++) {
              const sn = (s + 1) % sides;
              drawBlueprintWall(ctx, bot[s], bot[sn], top[sn], top[s], normalShade(norms[s][0], norms[s][1], 0), vis, {
                windows: (highLOD && !st.isTerrain) ? st.windows : 0,
                portal: s === 0 && st.portal,
                roseWindow: s === 0 && st.roseWindow,
                clockFace: st.clockFace && (s === 0 || s === 1),
                highlightWhite: st.highlightWhite
              });
            }
            if (st.roof === 'spire' && st.roofH) {
              const apex = proj(st.x + tx * 1.35, st.y + ty * 1.35, z1 + st.roofH);
              for (let s = 0; s < sides; s++) {
                const sn = (s + 1) % sides;
                if (isFrontQuad(top[s], top[sn], apex)) fillPoly(ctx, [top[s], top[sn], apex], cobaltTone(normalShade(norms[s][0], norms[s][1], 0.45), vis, true), edgeWhite);
              }
            } else if (st.roof === 'gable' && sides === 4 && st.roofH) {
              const g0 = proj(st.x + tx, st.y - st.d * 0.5 + ty, z1 + st.roofH), g1 = proj(st.x + tx, st.y + st.d * 0.5 + ty, z1 + st.roofH);
              if (isFrontQuad(top[0], top[1], g0)) fillPoly(ctx, [top[0], top[1], g0], cobaltTone(0.5, vis, true), edgeWhite);
              if (isFrontQuad(top[1], top[2], g1)) fillPoly(ctx, [top[1], top[2], g1, g0], cobaltTone(0.85, vis, true), edgeWhite);
              if (isFrontQuad(top[2], top[3], g1)) fillPoly(ctx, [top[2], top[3], g1], cobaltTone(0.4, vis, true), edgeWhite);
              if (isFrontQuad(top[3], top[0], g0)) fillPoly(ctx, [top[3], top[0], g0, g1], cobaltTone(0.65, vis, true), edgeWhite);
            } else if (isFrontQuad(top[0], top[1], top[2])) {
              fillPoly(ctx, top, st.isTerrain ? `rgba(11,23,178,${0.92*vis})` : cobaltTone(0.85, vis, st.highlightWhite), edgeWhite);
            }
          }
          else if (st.kind === 'stepped') {
            const tiers = IS_MOBILE ? Math.min(2, st.tiers || 4) : (st.tiers || 4), tierH = st.h / tiers, zb0 = st.z0 || 0;
            for (let k = 0; k < tiers; k++) {
              const frac = 1 - (k / tiers) * (st.isTerrace ? 0.16 : 0.76);
              const hw = st.w * 0.5 * frac, hd = st.d * 0.5 * frac;
              const zA = zb0 + k * tierH, zB = zb0 + (k + 1) * tierH;
              const isCap = st.whiteCap && k === tiers - 1;
              const b = [proj(st.x - hw, st.y - hd, zA), proj(st.x + hw, st.y - hd, zA), proj(st.x + hw, st.y + hd, zA), proj(st.x - hw, st.y + hd, zA)];
              const tp = [proj(st.x - hw*0.95, st.y - hd*0.95, zB), proj(st.x + hw*0.95, st.y - hd*0.95, zB), proj(st.x + hw*0.95, st.y + hd*0.95, zB), proj(st.x - hw*0.95, st.y + hd*0.95, zB)];
              const fNorms = [[0,-1,0.3],[1,0,0.3],[0,1,0.3],[-1,0,0.3]];
              for (let s = 0; s < 4; s++) {
                const sn = (s + 1) % 4;
                if (isFrontQuad(b[s], b[sn], tp[sn])) fillPoly(ctx, [b[s], b[sn], tp[sn], tp[s]], isCap ? `rgba(244,247,255,${0.95*vis})` : cobaltTone(normalShade(...fNorms[s]), vis), edgeWhite);
              }
              if (isFrontQuad(tp[0], tp[1], tp[2])) fillPoly(ctx, tp, isCap ? `rgba(255,255,255,${0.98*vis})` : cobaltTone(st.isTerrace ? 0.45 : 0.85, vis, !st.isTerrace), edgeWhite);
            }
            if (st.stairs && highLOD) {
              const offsets = st.twinStairs ? [-st.w * 0.14, st.w * 0.14] : [0], sw = st.w * (st.isTerrace ? 0.065 : 0.085);
              for (const ox of offsets) {
                const s0 = proj(st.x + ox - sw, st.y - st.d * 0.54, zb0), s1 = proj(st.x + ox + sw, st.y - st.d * 0.54, zb0);
                const s2 = proj(st.x + ox + sw * 0.8, st.y - st.d * (st.isTerrace ? 0.42 : 0.14), zb0 + st.h), s3 = proj(st.x + ox - sw * 0.8, st.y - st.d * (st.isTerrace ? 0.42 : 0.14), zb0 + st.h);
                fillPoly(ctx, [s0, s1, s2, s3], `rgba(244, 247, 255, ${0.9 * vis})`, '#0e1fd2', 0.9);
                ctx.strokeStyle = `rgba(14, 31, 210, ${0.8 * vis})`; ctx.lineWidth = 0.75;
                for (let step = 1; step < 8; step++) {
                  const u = step / 8, lP = lerp2(s0, s3, u), rP = lerp2(s1, s2, u);
                  ctx.beginPath(); ctx.moveTo(lP.x, lP.y); ctx.lineTo(rP.x, rP.y); ctx.stroke();
                }
              }
            }
          }
          else if (st.kind === 'dome') {
            const segs = IS_MOBILE ? 6 : 12, z0 = st.z0 || 0, zDrum = z0 + st.drumH;
            for (let s = 0; s < segs; s++) {
              const a1 = (s / segs) * Math.PI * 2, a2 = ((s + 1) / segs) * Math.PI * 2;
              drawBlueprintWall(ctx, proj(st.x+Math.cos(a1)*st.r, st.y+Math.sin(a1)*st.r, z0), proj(st.x+Math.cos(a2)*st.r, st.y+Math.sin(a2)*st.r, z0), proj(st.x+Math.cos(a2)*st.r, st.y+Math.sin(a2)*st.r, zDrum), proj(st.x+Math.cos(a1)*st.r, st.y+Math.sin(a1)*st.r, zDrum), 0.6, vis, { windows: highLOD ? 1 : 0 });
            }
            for (let r = 0; r < 3; r++) {
              const pA = (r / 3) * (Math.PI * 0.46), pB = ((r + 1) / 3) * (Math.PI * 0.46);
              const rA = Math.cos(pA) * st.r, zA = zDrum + Math.sin(pA) * st.domeH, rB = Math.cos(pB) * st.r, zB = zDrum + Math.sin(pB) * st.domeH;
              for (let s = 0; s < segs; s++) {
                const a1 = (s / segs) * Math.PI * 2, a2 = ((s + 1) / segs) * Math.PI * 2;
                const q0 = proj(st.x+Math.cos(a1)*rA, st.y+Math.sin(a1)*rA, zA), q1 = proj(st.x+Math.cos(a2)*rA, st.y+Math.sin(a2)*rA, zA), q2 = proj(st.x+Math.cos(a2)*rB, st.y+Math.sin(a2)*rB, zB), q3 = proj(st.x+Math.cos(a1)*rB, st.y+Math.sin(a1)*rB, zB);
                if (isFrontQuad(q0, q1, q2)) fillPoly(ctx, [q0, q1, q2, q3], cobaltTone(0.75, vis, true), edgeWhite, 0.95);
              }
            }
            const lBase = proj(st.x, st.y, zDrum + st.domeH), lTip = proj(st.x, st.y, zDrum + st.domeH + st.r * 0.65);
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(lBase.x, lBase.y); ctx.lineTo(lTip.x, lTip.y); ctx.stroke();
          }
          else if (st.kind === 'star_tower') {
            const bot = [], top = [];
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * Math.PI * 2 - Math.PI * 0.5, rr = (i % 2 === 0 ? 1.0 : 0.46) * st.r;
              bot.push(proj(st.x + Math.cos(a)*rr, st.y + Math.sin(a)*rr, st.z0));
              top.push(proj(st.x + Math.cos(a)*rr*0.78, st.y + Math.sin(a)*rr*0.78, st.z0 + st.h));
            }
            for (let i = 0; i < 10; i++) drawBlueprintWall(ctx, bot[i], bot[(i+1)%10], top[(i+1)%10], top[i], 0.55 + (i%2)*0.35, vis, { windows: highLOD ? st.tiers : 0, highlightWhite: true });
            fillPoly(ctx, top, cobaltTone(0.9, vis, true), '#ffffff');
          }
          else if (st.kind === 'pagoda') {
            let curZ = st.z0 || 0;
            for (let lv = 0; lv < st.stories; lv++) {
              const scale = 1 - lv * (0.52 / st.stories), hw = st.w * 0.5 * scale, nextZ = curZ + st.storyH;
              const b = [proj(st.x-hw, st.y-hw, curZ), proj(st.x+hw, st.y-hw, curZ), proj(st.x+hw, st.y+hw, curZ), proj(st.x-hw, st.y+hw, curZ)];
              const tp = [proj(st.x-hw, st.y-hw, nextZ), proj(st.x+hw, st.y-hw, nextZ), proj(st.x+hw, st.y+hw, nextZ), proj(st.x-hw, st.y+hw, nextZ)];
              for (let s = 0; s < 4; s++) drawBlueprintWall(ctx, b[s], b[(s+1)%4], tp[(s+1)%4], tp[s], 0.65, vis, { windows: highLOD ? 1 : 0, portal: lv === 0 && s === 0 });
              const ew = hw * 1.48, iw = hw * 0.88, eaveLowZ = nextZ - st.storyH * 0.05, ridgeHighZ = nextZ + st.storyH * 0.22;
              const ev = [proj(st.x-ew, st.y-ew, eaveLowZ), proj(st.x+ew, st.y-ew, eaveLowZ), proj(st.x+ew, st.y+ew, eaveLowZ), proj(st.x-ew, st.y+ew, eaveLowZ)];
              const rt = [proj(st.x-iw, st.y-iw, ridgeHighZ), proj(st.x+iw, st.y-iw, ridgeHighZ), proj(st.x+iw, st.y+iw, ridgeHighZ), proj(st.x-iw, st.y+iw, ridgeHighZ)];
              for (let s = 0; s < 4; s++) {
                const sn = (s + 1) % 4;
                if (isFrontQuad(ev[s], ev[sn], rt[sn])) fillPoly(ctx, [ev[s], ev[sn], rt[sn], rt[s]], cobaltTone(0.85, vis, true), '#ffffff', 1.0);
                const tipSpur = proj(st.x + (s===1||s===2?1.62:-1.62)*hw, st.y + (s>=2?1.62:-1.62)*hw, nextZ + st.storyH * 0.12);
                ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(ev[s].x, ev[s].y); ctx.lineTo(tipSpur.x, tipSpur.y); ctx.stroke();
              }
              curZ = nextZ + st.storyH * 0.14;
            }
            const pBase = proj(st.x, st.y, curZ), pTip = proj(st.x, st.y, curZ + 0.42);
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(pBase.x, pBase.y); ctx.lineTo(pTip.x, pTip.y); ctx.stroke();
          }
          else if (st.kind === 'arch_bridge') {
            const zb = st.zBase || 0, zTop = zb + st.h, nA = st.arches || 4;
            const d0 = proj(st.x1, st.y1, zTop), d1 = proj(st.x2, st.y2, zTop);
            ctx.strokeStyle = edgeWhite; ctx.lineWidth = Math.max(2.2, archUnit * 0.045);
            ctx.beginPath(); ctx.moveTo(d0.x, d0.y); ctx.lineTo(d1.x, d1.y); ctx.stroke();
            ctx.lineWidth = Math.max(1.2, archUnit * 0.024);
            for (let i = 0; i <= nA; i++) {
              const u = i / nA, px = st.x1 + (st.x2 - st.x1) * u, py = st.y1 + (st.y2 - st.y1) * u;
              const pBot = proj(px, py, zb), pTop = proj(px, py, zTop);
              ctx.beginPath(); ctx.moveTo(pBot.x, pBot.y); ctx.lineTo(pTop.x, pTop.y); ctx.stroke();
              if (i < nA) {
                const uMid = (i + 0.5) / nA, uNext = (i + 1) / nA;
                const aL = proj(px, py, zb + st.h*0.45), aM = proj(st.x1 + (st.x2-st.x1)*uMid, st.y1 + (st.y2-st.y1)*uMid, zTop*0.98), aR = proj(st.x1 + (st.x2-st.x1)*uNext, st.y1 + (st.y2-st.y1)*uNext, zb + st.h*0.45);
                ctx.beginPath(); ctx.moveTo(aL.x, aL.y); ctx.quadraticCurveTo(aM.x, aM.y, aR.x, aR.y); ctx.stroke();
              }
            }
          }
          else if (st.kind === 'buttress') {
            const p1 = proj(st.x1, st.y1, st.z1), pMid = proj((st.x1+st.x2)*0.5, (st.y1+st.y2)*0.5, st.z2+0.05), p2 = proj(st.x2, st.y2, st.z2);
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.2, archUnit * 0.022);
            ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.quadraticCurveTo(pMid.x, pMid.y, p2.x, p2.y); ctx.stroke();
          }
          else if (st.kind === 'octahedron') {
            const spin = t * 1.4, cz = st.z0 + Math.sin(t * 2.2) * 0.05;
            const topP = proj(st.x, st.y, cz + st.r * 1.35), botP = proj(st.x, st.y, cz - st.r * 1.35);
            const eq = [0,1,2,3].map(i => proj(st.x + Math.cos(spin + i*Math.PI*0.5)*st.r, st.y + Math.sin(spin + i*Math.PI*0.5)*st.r, cz));
            for (let i = 0; i < 4; i++) {
              const inx = (i + 1) % 4;
              if (isFrontQuad(eq[i], eq[inx], topP)) fillPoly(ctx, [eq[i], eq[inx], topP], `rgba(244,247,255,${0.88*vis})`, '#1022dc', 1.1);
              if (isFrontQuad(eq[inx], eq[i], botP)) fillPoly(ctx, [eq[inx], eq[i], botP], `rgba(180,202,255,${0.88*vis})`, '#1022dc', 1.1);
            }
          }
          else if (st.kind === 'ring_gate') {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.95 * vis})`; ctx.lineWidth = Math.max(2.2, archUnit * 0.05);
            for (const rr of [st.r, st.r * 0.82]) {
              ctx.beginPath();
              for (let s = 0; s <= 32; s++) {
                const a = (s / 32) * Math.PI * 2, p = proj(st.x + Math.cos(a)*rr, st.y, st.z0 + rr + Math.sin(a)*rr);
                if (s === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
              }
              ctx.stroke();
            }
            const gc = proj(st.x, st.y, st.z0 + st.r);
            drawEngravedEye(ctx, gc.x, gc.y, Math.max(8, archUnit * 0.24), Math.max(5, archUnit * 0.14));
          }
          else if (st.kind === 'tentacle_coil' && state.showGods && state.abyss > 0.12) {
            const wMain = Math.max(2.5, archUnit * 0.065 * state.abyss); ctx.lineCap = 'round';
            const pts = [];
            for (let s = 0; s <= 20; s++) {
              const u = s / 20, a = u * Math.PI * 5.0 - t * 2.0 + st.phase, rr = st.r * (1.25 - u * 0.45);
              pts.push(proj(st.x + Math.cos(a)*rr, st.y + Math.sin(a)*rr, u * st.h * (0.5 + 0.55 * state.abyss)));
            }
            ctx.strokeStyle = '#0b19b8'; ctx.lineWidth = wMain;
            ctx.beginPath(); pts.forEach((p, idx) => idx===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y)); ctx.stroke();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = wMain * 0.42;
            ctx.beginPath(); pts.forEach((p, idx) => idx===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y)); ctx.stroke();
          }
        }

        // Cairo Floating Inverted Pyramid
        if (c.id === 'cairo' && state.showGods && state.outer > 0.2) {
          const hz = 1.85 + Math.sin(t * 2.2) * 0.10, tip = proj(0, 0.25, hz - 0.56);
          const u = [proj(-0.34, -0.09, hz), proj(0.34, -0.09, hz), proj(0.34, 0.59, hz), proj(-0.34, 0.59, hz)];
          for (let s = 0; s < 4; s++) if (isFrontQuad(u[(s+1)%4], u[s], tip)) fillPoly(ctx, [u[(s+1)%4], u[s], tip], `rgba(6, 14, 120, ${0.96 * vis})`, '#ffffff', 1.4);
        }

        // -------------------------------------------------------------------
        // E) LIVING 3D STREET, BRIDGE & STAIRCASE HUMAN CROWD FLOWS! (人流!)
        // -------------------------------------------------------------------
        if (state.showCrowds && archUnit > 16) {
          const headR = Math.max(1.2, archUnit * 0.015);
          const crowdStride = IS_MOBILE ? 2 : 1;
          for (const path of c.crowdPaths) {
            for (let pIdx = 0; pIdx < path.count; pIdx += crowdStride) {
              // Bidirectional flow: even indices walk forward, odd indices walk reverse or staggered!
              const rawU = (pIdx / path.count + t * path.speed * (pIdx % 3 === 0 ? -0.75 : 1.0) + 100) % 1;
              const pos = samplePath3D(path.pts, rawU);
              // Slight lateral lane jitter + walking stride bob!
              const lane = ((pIdx % 3) - 1) * 0.032;
              const bob = Math.abs(Math.sin(t * 9.5 + pIdx * 1.7)) * 0.014;
              const foot = proj(pos[0] + lane, pos[1], pos[2] + bob);
              const head = proj(pos[0] + lane, pos[1], pos[2] + 0.052 + bob);

              // Robed / Tactical Body Silhouette + Glowing Torch/Lantern Leader every 5th figure!
              const isTorchBearer = (pIdx % 5 === 0);
              ctx.strokeStyle = isTorchBearer ? '#fff4b8' : `rgba(244, 247, 255, ${0.92 * vis})`;
              ctx.lineWidth = Math.max(1.5, headR * 1.35);
              ctx.lineCap = 'round';
              ctx.beginPath(); ctx.moveTo(foot.x, foot.y); ctx.lineTo(head.x, head.y); ctx.stroke();

              ctx.fillStyle = isTorchBearer ? '#fff4b8' : '#ffffff';
              ctx.beginPath(); ctx.arc(head.x, head.y - headR * 0.7, safeR(headR), 0, Math.PI * 2); ctx.fill();
              if (isTorchBearer && archUnit > 36) {
                ctx.fillStyle = 'rgba(255, 244, 184, 0.28)';
                ctx.beginPath(); ctx.arc(head.x, head.y - headR, safeR(headR * 3.4), 0, Math.PI * 2); ctx.fill();
              }
            }
          }
        }

        // F) COPPERPLATE ENGRAVED SPECTRAL CTHULHU & SRA CONTAINMENT BEAMS AT R'LYEH!
        if (c.id === 'rlyeh' && state.showGods && state.abyss > 0.15) {
          const sc = (0.42 + 0.48 * state.abyss) * archUnit * 0.95;
          const rise = proj(0, 0.88, 1.95 + Math.sin(t * 1.4) * 0.08);

          // 4 Cyan-Gold Scranton Reality Anchor Suppression Beams locking onto the Entity!
          if (state.seal > 0.15) {
            for (const [sx, sy] of [[-1.15, 0.85], [1.15, 0.85], [-1.15, -0.95], [1.15, -0.95]]) {
              const sTop = proj(sx, sy, 1.22);
              ctx.strokeStyle = `rgba(136, 240, 255, ${0.55 * state.seal * vis})`;
              ctx.lineWidth = 1.3;
              ctx.setLineDash([4, 3]); ctx.lineDashOffset = -t * 24;
              ctx.beginPath(); ctx.moveTo(sTop.x, sTop.y); ctx.lineTo(rise.x, rise.y - sc * 0.25); ctx.stroke();
              ctx.setLineDash([]);
            }
          }

          ctx.save(); ctx.translate(rise.x, rise.y); ctx.globalAlpha = vis * Math.min(0.92, state.abyss * 1.15);

          // Engraved Occult Double Astrolabe Aureole & Radial Sigil Ticks
          ctx.strokeStyle = 'rgba(255, 229, 150, 0.72)'; ctx.lineWidth = 1.1;
          ctx.beginPath(); ctx.arc(0, -sc * 0.35, safeR(sc * 1.18), 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = 'rgba(136, 240, 255, 0.55)'; ctx.lineWidth = 0.85;
          ctx.beginPath(); ctx.arc(0, -sc * 0.35, safeR(sc * 0.98), 0, Math.PI * 2); ctx.stroke();
          for (let r = 0; r < 16; r++) {
            const ra = (r / 16) * Math.PI * 2 + t * 0.18;
            ctx.beginPath();
            ctx.moveTo(Math.cos(ra) * sc * 0.98, -sc * 0.35 + Math.sin(ra) * sc * 0.98);
            ctx.lineTo(Math.cos(ra) * sc * 1.18, -sc * 0.35 + Math.sin(ra) * sc * 1.18);
            ctx.stroke();
          }

          // Ribbed Copperplate Hatched Wings (translucent skeleton + fine horizontal engraving lines!)
          const beat = Math.sin(t * 1.6) * 0.12;
          for (const dir of [-1, 1]) {
            const sh = { x: dir * sc * 0.28, y: -sc * 0.18 };
            const elb = { x: dir * sc * (1.05 + beat), y: -sc * (1.08 + beat * 0.3) };
            const tips = [
              { x: dir * sc * (2.05 + beat), y: -sc * 0.86 },
              { x: dir * sc * (1.88 + beat), y: -sc * 0.32 },
              { x: dir * sc * (1.48 + beat * 0.5), y: sc * 0.18 },
              { x: dir * sc * 0.92, y: sc * 0.42 }
            ];
            ctx.fillStyle = 'rgba(9, 20, 156, 0.68)'; ctx.strokeStyle = 'rgba(244, 247, 255, 0.88)'; ctx.lineWidth = 1.15;
            ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(elb.x, elb.y); ctx.lineTo(tips[0].x, tips[0].y);
            for (let k = 0; k < tips.length - 1; k++) {
              ctx.quadraticCurveTo((tips[k].x + tips[k+1].x) * 0.44, (tips[k].y + tips[k+1].y) * 0.44, tips[k+1].x, tips[k+1].y);
            }
            ctx.quadraticCurveTo(dir * sc * 0.4, sc * 0.15, sh.x, sc * 0.22); ctx.closePath(); ctx.fill(); ctx.stroke();

            // Fine wing-rib spokes + cross-ribs
            ctx.strokeStyle = 'rgba(136, 240, 255, 0.62)'; ctx.lineWidth = 0.85;
            for (const tp of tips) {
              ctx.beginPath(); ctx.moveTo(elb.x, elb.y); ctx.lineTo(tp.x, tp.y); ctx.stroke();
              for (let h = 1; h <= 4; h++) {
                const u = h / 5;
                const rx = elb.x + (tp.x - elb.x) * u, ry = elb.y + (tp.y - elb.y) * u;
                ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - dir * sc * 0.14, ry + sc * 0.08); ctx.stroke();
              }
            }
          }

          // Engraved Mitre-Crowned Cephalopod Cranium with Copperplate Contour Hatching!
          ctx.fillStyle = 'rgba(8, 17, 140, 0.92)'; ctx.strokeStyle = '#f4f7ff'; ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(0, -sc * 1.02);
          ctx.bezierCurveTo(sc * 0.56, -sc * 0.82, sc * 0.52, -sc * 0.12, sc * 0.28, sc * 0.05);
          ctx.lineTo(-sc * 0.28, sc * 0.05);
          ctx.bezierCurveTo(-sc * 0.52, -sc * 0.12, -sc * 0.56, -sc * 0.82, 0, -sc * 1.02);
          ctx.closePath(); ctx.fill(); ctx.stroke();

          // Horizontal copperplate shading lines across cranium
          ctx.strokeStyle = 'rgba(244, 247, 255, 0.48)'; ctx.lineWidth = 0.8;
          for (let h = -9; h <= 0; h++) {
            const hy = h * sc * 0.095;
            const hw = sc * 0.40 * Math.sqrt(Math.max(0, 1 - Math.pow((hy + sc * 0.48) / (sc * 0.56), 2)));
            ctx.beginPath(); ctx.moveTo(-hw, hy); ctx.lineTo(hw, hy); ctx.stroke();
          }

          // Six Slitted Eldritch Ocelli Eyes (3 per side, glowing Electrum Gold / Crimson!)
          const eyeCol = (state.abyss > 0.78 && state.seal < 0.45) ? '#ff6b86' : '#ffe596';
          for (const dir of [-1, 1]) {
            for (let e = 0; e < 3; e++) {
              const ex = dir * sc * (0.12 + e * 0.09), ey = -sc * (0.26 + e * 0.09);
              const er = safeR(sc * (0.055 - e * 0.01));
              ctx.strokeStyle = eyeCol; ctx.lineWidth = 1.1;
              ctx.beginPath(); ctx.ellipse(ex, ey, safeR(er * 1.4), safeR(er * 0.65), dir * -0.3, 0, Math.PI * 2); ctx.stroke();
              ctx.fillStyle = '#ffffff';
              ctx.beginPath(); ctx.arc(ex, ey, safeR(er * 0.38), 0, Math.PI * 2); ctx.fill();
            }
          }

          // Fine Engraved Tentacular Beard with Stipple Nodes
          for (let f = -3.5; f <= 3.5; f += 1) {
            const nf = f / 3.5, w1 = Math.sin(t * 2.6 + f * 1.3) * sc * 0.22;
            const x0 = nf * sc * 0.24, y0 = sc * 0.02, x1 = nf * sc * 0.46 + w1, y1 = sc * 0.38, x2 = nf * sc * 0.58 - w1 * 0.5, y2 = sc * (0.76 + (1 - Math.abs(nf)) * 0.22);
            ctx.strokeStyle = '#0917b5'; ctx.lineWidth = Math.max(2.0, sc * 0.075); ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x1, y1, x2, y2); ctx.stroke();
            ctx.strokeStyle = 'rgba(244, 247, 255, 0.92)'; ctx.lineWidth = Math.max(0.95, sc * 0.032);
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x1, y1, x2, y2); ctx.stroke();
          }
          ctx.restore();
        }

        if (upCam[2] > -0.02) {
          clickablePins.push({ id: c.id, x: baseX, y: baseY, r: Math.max(22, archUnit * 1.1) });
          if ((isSel && state.zoom < 3.6) || isHov || (state.zoom < 2.2 && upCam[2] > 0.32)) {
            const label = c.short;
            ctx.font = '12px Georgia, serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            const tw = ctx.measureText(label).width, lx = baseX + 14, ly = baseY - 14;
            ctx.fillStyle = isSel ? '#f4f7ff' : 'rgba(11, 22, 178, 0.9)'; ctx.strokeStyle = '#f4f7ff'; ctx.lineWidth = 1;
            ctx.fillRect(lx, ly - 10, tw + 12, 20); ctx.strokeRect(lx, ly - 10, tw + 12, 20);
            ctx.fillStyle = isSel ? '#1022dc' : '#ffffff'; ctx.fillText(label, lx + 6, ly + 0.5);
          }
        }
      }
      ctx.restore();
    }

    // =========================================================================
    // 9. LIBER II WOODCUT SCANLINE PORTRAIT ENGINE (MYTHOS + SCP ENTITIES!)
    // =========================================================================
    const wheelCanvas = document.getElementById('wheel-canvas');
    const ctxWheel = wheelCanvas.getContext('2d');
    const woodCanvas = document.getElementById('woodcut-canvas');
    const ctxWood = woodCanvas.getContext('2d');

    const radarCanvas = document.getElementById('pantheon-radar-canvas');
    const ctxRadar = radarCanvas ? radarCanvas.getContext('2d') : null;
    const RADAR_LABELS = ['休谟', '神性', '模因', '灭世', '秘教', '烈度'];

    function drawPantheonRadar(stats) {
      if (!ctxRadar) return;
      const isDay = state.theme === 'day';
      ctxRadar.clearRect(0, 0, 168, 148);
      const cx = 84, cy = 74, R = 46;
      ctxRadar.strokeStyle = isDay ? 'rgba(19, 38, 230, 0.22)' : 'rgba(220, 230, 255, 0.25)';
      ctxRadar.lineWidth = 0.9;
      for (const ring of [0.35, 0.68, 1.0]) {
        ctxRadar.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI * 0.5;
          const x = cx + Math.cos(a) * R * ring, y = cy + Math.sin(a) * R * ring;
          if (i === 0) ctxRadar.moveTo(x, y); else ctxRadar.lineTo(x, y);
        }
        ctxRadar.closePath(); ctxRadar.stroke();
      }
      ctxRadar.fillStyle = isDay ? '#1d1f24' : '#d9dde6';
      ctxRadar.font = '12px sans-serif';
      ctxRadar.textAlign = 'center'; ctxRadar.textBaseline = 'middle';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI * 0.5;
        ctxRadar.beginPath(); ctxRadar.moveTo(cx, cy); ctxRadar.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctxRadar.stroke();
        ctxRadar.fillText(RADAR_LABELS[i], cx + Math.cos(a) * (R + 16), cy + Math.sin(a) * (R + 14));
      }
      ctxRadar.fillStyle = isDay ? 'rgba(19, 38, 230, 0.16)' : 'rgba(115, 144, 250, 0.24)';
      ctxRadar.strokeStyle = isDay ? '#1326e6' : '#7390fa';
      ctxRadar.lineWidth = 1.6;
      ctxRadar.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI * 0.5;
        const v = (stats[i] || 80) / 100;
        const x = cx + Math.cos(a) * R * v, y = cy + Math.sin(a) * R * v;
        if (i === 0) ctxRadar.moveTo(x, y); else ctxRadar.lineTo(x, y);
      }
      ctxRadar.closePath(); ctxRadar.fill(); ctxRadar.stroke();
    }

    function sphereLit(nx, ny, cx0, cy0, r, lx = -0.45, ly = -0.55) {
      const dx = (nx - cx0) / r, dy = (ny - cy0) / r, d2 = dx * dx + dy * dy;
      if (d2 >= 1) return 0;
      const dz = Math.sqrt(1 - d2);
      const diff = Math.max(0, dx * lx + dy * ly + dz * 0.70);
      const rim = Math.pow(1 - dz, 2.4) * 0.55;
      return Math.min(1.15, 0.14 + diff * 0.88 + rim);
    }

    function drawLiberTwo(t) {
      const isDay = state.theme === 'day';
      const ringCol = isDay ? '#1326e6' : '#7390fa';
      ctxWheel.clearRect(0, 0, 648, 648);
      ctxWheel.save(); ctxWheel.translate(324, 324);
      ctxWheel.strokeStyle = isDay ? 'rgba(19, 38, 230, 0.55)' : 'rgba(220, 230, 255, 0.62)'; ctxWheel.lineWidth = 1.8;
      ctxWheel.beginPath(); ctxWheel.arc(0, 0, 260, 0, Math.PI * 2); ctxWheel.stroke();
      ctxWheel.strokeStyle = isDay ? 'rgba(19, 38, 230, 0.25)' : 'rgba(136, 240, 255, 0.30)'; ctxWheel.lineWidth = 1.1;
      ctxWheel.beginPath(); ctxWheel.arc(0, 0, 242, 0, Math.PI * 2); ctxWheel.stroke();
      for (let tk = 0; tk < 72; tk++) {
        const ta = (tk / 72) * Math.PI * 2 + t * 0.02;
        const r0 = tk % 9 === 0 ? 234 : 242;
        ctxWheel.beginPath(); ctxWheel.moveTo(Math.cos(ta)*r0, Math.sin(ta)*r0); ctxWheel.lineTo(Math.cos(ta)*250, Math.sin(ta)*250); ctxWheel.stroke();
      }

      PANTHEON.forEach((p, idx) => {
        const a = (idx / 8) * Math.PI * 2 - Math.PI * 0.5;
        const x = Math.cos(a) * 260, y = Math.sin(a) * 260, active = idx === state.pantheonIdx;
        ctxWheel.fillStyle = active ? ringCol : (isDay ? '#fbf8f1' : '#181c26');
        ctxWheel.strokeStyle = ringCol; ctxWheel.lineWidth = 2;
        ctxWheel.beginPath(); ctxWheel.arc(x, y, active ? 10 : 5.5, 0, Math.PI * 2); ctxWheel.fill(); ctxWheel.stroke();
        ctxWheel.fillStyle = active ? ringCol : (isDay ? 'rgba(29,31,36,0.65)' : 'rgba(217,221,230,0.65)');
        ctxWheel.font = `${active ? 'bold ' : ''}19px Georgia, serif`; ctxWheel.textAlign = 'center'; ctxWheel.textBaseline = 'middle';
        ctxWheel.fillText(p.roman, Math.cos(a) * 292, Math.sin(a) * 292);
      });
      ctxWheel.restore();

      // High-Definition Chiaroscuro Volumetric Copperplate Scanline Plate!
      const Wc = 520, Hc = 580;
      const grad = ctxWood.createRadialGradient(Wc * 0.5, Hc * 0.38, 20, Wc * 0.5, Hc * 0.5, Hc * 0.72);
      grad.addColorStop(0, '#1935f5'); grad.addColorStop(0.6, '#1022dc'); grad.addColorStop(1, '#07118c');
      ctxWood.fillStyle = grad; ctxWood.fillRect(0, 0, Wc, Hc);

      const art = PANTHEON[state.pantheonIdx].artType;
      const rows = IS_MOBILE ? 112 : 168, rowStep = Hc / rows, xStep = IS_MOBILE ? 4 : 2.5;

      for (let r = 0; r < rows; r++) {
        const py = (r + 0.5) * rowStep, ny = (py / Hc) * 2 - 1;
        for (let x = 14; x < Wc - 14; x += xStep) {
          const nx = (x / Wc) * 2 - 1;
          // Subtle Renaissance radiating chiaroscuro God-rays & fluted temple pilasters!
          const rayAng = Math.atan2(ny + 0.25, nx);
          let val = 0.05 + 0.07 * Math.max(0, Math.cos(rayAng * 18 + t * 0.6)) * Math.exp(-Math.hypot(nx, ny + 0.25) * 1.1);
          // Architectural fluted side columns & perspective pedestal steps
          if (Math.abs(Math.abs(nx) - 0.84) < 0.045 && ny > -0.32 && ny < 0.88) {
            val += 0.42 * Math.cos(((Math.abs(nx) - 0.84) / 0.045) * Math.PI * 0.5) * (0.65 + 0.35 * Math.sin(nx * 140));
          }
          if (ny > 0.76 && Math.abs(nx) < 0.88) {
            val += (Math.sin(ny * 75) > 0 ? 0.48 : 0.14) * (1 - Math.abs(nx) * 0.35);
          }

          if (art === 'cthulhu') {
            val += sphereLit(nx * 1.15, ny, 0, -0.22, 0.33, -0.5, -0.5) * 0.95;
            const dHalo = Math.hypot(nx, ny + 0.22);
            if (Math.abs(dHalo - 0.48) < 0.022 || Math.abs(dHalo - 0.55) < 0.012) val += 0.78;
            const wingTop = -0.22 - Math.abs(nx) * 0.42 + Math.sin(Math.abs(nx) * 9 - t * 1.8) * 0.04;
            if (Math.abs(nx) > 0.22 && Math.abs(nx) < 0.82 && ny > wingTop && ny < wingTop + 0.46) {
              const rib = 0.55 + 0.45 * Math.sin((ny - wingTop) * 42 + Math.abs(nx) * 16);
              val += 0.68 * (1 - (ny - wingTop) / 0.46) * rib;
            }
            if (ny > 0.02 && ny < 0.76 && Math.abs(nx) < 0.46) {
              const wave = Math.sin(nx * 22 + Math.sin(ny * 9 - t * 2.4) * 2.1);
              if (wave > 0.25) val += wave * 0.82 * (1 - Math.abs(nx) * 1.4);
            }
          } else if (art === 'guardian') {
            const swordGlow = Math.exp(-Math.abs(nx) * 26) * (ny > -0.78 && ny < 0.76 ? 1.15 : 0);
            val += swordGlow;
            if (Math.abs(ny - 0.06) < 0.022 && Math.abs(nx) < 0.26) val += 0.95;
            val += sphereLit(nx, ny, 0, -0.28, 0.20, 0, -0.6) * 0.95;
            for (const [slope, yOff] of [[-0.55, -0.28], [0.32, -0.02]]) {
              const wy = yOff + Math.abs(nx) * slope + Math.sin(Math.abs(nx) * 14 - t * 2) * 0.025;
              const feather = Math.abs(ny - wy);
              if (Math.abs(nx) > 0.07 && Math.abs(nx) < 0.82 && feather < 0.15) {
                val += (1 - feather / 0.15) * (0.62 + 0.35 * Math.sin(Math.abs(nx) * 48));
              }
            }
          } else if (art === 'scp3000') {
            for (let seg = -0.68; seg <= 0.72; seg += 0.07) {
              const sx = Math.sin(seg * 4.8 - t * 1.5) * (0.46 - seg * 0.14);
              const rad = 0.145 * (1.12 - (seg + 0.8) * 0.28);
              val = Math.max(val, sphereLit(nx, ny, sx, seg, rad, -0.55, -0.45) * 0.98);
            }
          } else if (art === 'mekhane') {
            const d = Math.hypot(nx, ny + 0.04), a = Math.atan2(ny + 0.04, nx);
            const gear = 0.54 + 0.065 * Math.sign(Math.sin(a * 16 + t * 1.2));
            if (d < gear && d > 0.34) val += 0.75 + 0.25 * Math.sin(d * 60);
            const dInner = Math.hypot(nx, ny + 0.04);
            const gear2 = 0.28 + 0.04 * Math.sign(Math.sin(a * 10 - t * 1.8));
            if (dInner < gear2 && dInner > 0.16) val += 0.85;
            val += sphereLit(nx, ny, 0, -0.04, 0.14) * 1.05;
          } else if (art === 'scp2317') {
            for (let p = -3; p <= 3; p++) {
              const px0 = p * 0.21;
              if (Math.abs(nx - px0) < 0.036 && ny > -0.28 && ny < 0.76) {
                val += 0.82 * Math.cos(((nx - px0) / 0.036) * 1.3);
              }
            }
            if (Math.abs(ny - (0.36 - Math.abs(nx) * 0.62)) < 0.022) val += 0.98;
            val += sphereLit(nx, ny, 0, 0.44, 0.27, 0, -0.8) * 0.92;
          } else if (art === 'yogsothoth') {
            for (let k = 0; k < 9; k++) {
              const ang = (k / 9) * Math.PI * 2 + t * 0.24, rad = k === 0 ? 0 : 0.43, sr = k === 0 ? 0.30 : 0.165;
              val = Math.max(val, sphereLit(nx, ny, Math.cos(ang) * rad, Math.sin(ang) * rad * 0.9 - 0.04, sr, -0.45, -0.55) * 1.04);
            }
          } else if (art === 'nyarlathotep') {
            if (ny > -0.52 && ny < 0.22 && Math.abs(nx) < (0.22 - ny) * 0.58) {
              val += (nx < 0 ? 0.88 : 0.38) * (0.75 + 0.25 * Math.sin(ny * 55));
            }
            val += sphereLit(nx, ny, 0, -0.60, 0.14, -0.3, -0.5) * 1.1;
            if (ny > 0.26 && ny < 0.78 && Math.abs(nx) < (ny - 0.15) * 0.85) {
              val += (nx > 0 ? 0.76 : 0.32);
            }
          } else {
            const d = Math.hypot(nx, ny + 0.04), a = Math.atan2(ny + 0.04, nx);
            const swirl = Math.sin(d * 28 - t * 2.8 + a * 5);
            if (d < 0.78 && d > 0.10) val += (0.52 + 0.48 * swirl) * (1 - d * 0.85);
            val += sphereLit(nx, ny, 0, -0.04, 0.16) * 0.95;
          }

          if (val > 0.07) {
            const hLine = Math.min(rowStep * 0.92, val * rowStep * 0.88);
            ctxWood.fillStyle = val > 0.92 ? '#ffe9a8' : '#f4f7ff';
            ctxWood.fillRect(x, py - hLine * 0.5, xStep + 0.18, hLine);
          }
        }
      }

      // Copperplate Inner Marginalia Frame & Coordinate Crosshairs inside Niche!
      ctxWood.strokeStyle = 'rgba(244, 247, 255, 0.42)'; ctxWood.lineWidth = 1;
      ctxWood.strokeRect(22, 260, Wc - 44, Hc - 282);
      ctxWood.fillStyle = 'rgba(7, 17, 140, 0.88)';
      ctxWood.fillRect(24, Hc - 47, Wc - 48, 22);
      ctxWood.fillStyle = 'rgba(255, 229, 150, 0.92)'; ctxWood.font = '12px Georgia, serif';
      ctxWood.fillText('ORDO CAERULEUS · TABULA SACRA', 34, Hc - 32);
      ctxWood.textAlign = 'right';
      ctxWood.fillText(`SCALE 1:${(state.pantheonIdx + 1) * 144}`, Wc - 34, Hc - 32);
      ctxWood.textAlign = 'left';
    }

    // =========================================================================
    // 10. PROLOGVS & COLOPHON CANVASES
    // =========================================================================
    function drawPrologus(t) {
      const c = document.getElementById('prologus-canvas'); if (!c) return;
      const isDay = state.theme === 'day';
      const inkRgb = isDay ? '19, 38, 230' : '126, 150, 224';
      const ctx = c.getContext('2d'); ctx.save(); ctx.scale(DPR, DPR); ctx.clearRect(0, 0, W, H);
      ctx.translate(W * 0.5, H * 0.5);
      const rArc = safeR(Math.min(W, H) * 0.40);
      ctx.strokeStyle = `rgba(${inkRgb}, 0.28)`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, safeR(rArc), 0, Math.PI * 2); ctx.stroke();
      drawCurvedRingText(ctx, 'THEOLOGIA CAERULEA · ARCHIVUM GENERALE · ', rArc + 14, t * 0.04, 12, 0.45, inkRgb);
      ctx.restore();
    }

    function drawColophon(t) {
      const ec = document.getElementById('seal-emblem-canvas'); if (!ec) return;
      const isDay = state.theme === 'day';
      const col = isDay ? '#1326e6' : '#7390fa';
      const ectx = ec.getContext('2d');
      ectx.clearRect(0, 0, 420, 420); ectx.save(); ectx.translate(210, 210);
      ectx.strokeStyle = col; ectx.lineWidth = 2.4;
      ectx.beginPath(); ectx.arc(0, 0, 175, 0, Math.PI * 2); ectx.stroke();
      ectx.beginPath(); ectx.arc(0, 0, 140, 0, Math.PI * 2); ectx.stroke();
      for (let k = 0; k < 3; k++) {
        ectx.save(); ectx.rotate((k / 3) * Math.PI * 2 + t * 0.12);
        ectx.lineWidth = 4;
        ectx.beginPath(); ectx.moveTo(0, -162); ectx.lineTo(0, -98); ectx.stroke();
        ectx.beginPath(); ectx.moveTo(-12, -114); ectx.lineTo(0, -96); ectx.lineTo(12, -114); ectx.stroke();
        ectx.restore();
      }
      const txt = 'THEOLOGIA CAERULEA · CC BY-SA 3.0 · ';
      ectx.fillStyle = col; ectx.font = 'bold 13px Georgia, serif'; ectx.textAlign = 'center'; ectx.textBaseline = 'middle';
      for (let i = 0; i < txt.length; i++) {
        ectx.save(); ectx.rotate(-t * 0.12 + (i / txt.length) * Math.PI * 2); ectx.fillText(txt[i], 0, -157); ectx.restore();
      }
      ectx.fillStyle = col;
      ectx.beginPath(); ectx.moveTo(-18, 48); ectx.quadraticCurveTo(-32, -8, 36, -74); ectx.quadraticCurveTo(22, -34, 42, -38); ectx.quadraticCurveTo(14, -8, 32, -12); ectx.quadraticCurveTo(4, 16, 18, 14); ectx.quadraticCurveTo(-6, 36, -18, 48); ectx.fill();
      ectx.restore();
    }

    // =========================================================================
    // 11. MAIN ANIMATION LOOP (P0.1 Crash-Proof + P4 Hidden/Chapter Gating!)
    // =========================================================================
    let prevTs = performance.now();
    const zoomReadout = document.getElementById('zoom-readout');

    const telCanvas = document.getElementById('telemetry-canvas');
    const ctxTel = telCanvas ? telCanvas.getContext('2d') : null;
    const cosmoCanvas = document.getElementById('cosmology-canvas');
    const ctxCosmo = cosmoCanvas ? cosmoCanvas.getContext('2d') : null;

    function drawTelemetryOscilloscope(t) {
      if (!ctxTel || state.uiHidden || (IS_MOBILE && !leftPanel.classList.contains('mobile-sheet-open'))) return;
      const isDay = state.theme === 'day';
      ctxTel.clearRect(0, 0, 244, 44);
      ctxTel.strokeStyle = isDay ? 'rgba(29,31,36,0.15)' : 'rgba(244,247,255,0.12)'; ctxTel.lineWidth = 0.7;
      ctxTel.beginPath(); ctxTel.moveTo(0, 22); ctxTel.lineTo(244, 22); ctxTel.stroke();

      ctxTel.strokeStyle = isDay ? '#1326e6' : '#7390fa'; ctxTel.lineWidth = 1.4;
      ctxTel.beginPath();
      for (let x = 0; x <= 244; x += 4) {
        const y = 22 - (state.seal - 0.5) * 12 + Math.sin(x * 0.09 - t * 4.5) * (3 + state.abyss * 7) * Math.sin(x * 0.025 + t);
        if (x === 0) ctxTel.moveTo(x, y); else ctxTel.lineTo(x, y);
      }
      ctxTel.stroke();

      ctxTel.strokeStyle = (state.abyss > 0.78 && state.seal < 0.45) ? '#c92a48' : (isDay ? '#9a6700' : '#ebd08a');
      ctxTel.lineWidth = 1.2;
      ctxTel.beginPath();
      for (let x = 0; x <= 244; x += 4) {
        const spike = Math.pow(Math.max(0, Math.sin(x * 0.14 - t * 6.2)), 6) * 14 * state.abyss;
        const y = 28 - spike + Math.cos(x * 0.06 + t * 2.2) * 2.5;
        if (x === 0) ctxTel.moveTo(x, y); else ctxTel.lineTo(x, y);
      }
      ctxTel.stroke();
    }

    function drawCosmology(t) {
      if (!ctxCosmo) return;
      const isDay = state.theme === 'day';
      ctxCosmo.clearRect(0, 0, 420, 240);
      ctxCosmo.save(); ctxCosmo.translate(210, 120);
      const spheres = [
        { r: 22, col: isDay ? '#1326e6' : '#88f0ff' },
        { r: 44, col: isDay ? 'rgba(19,38,230,0.45)' : 'rgba(244,247,255,0.45)' },
        { r: 68, col: isDay ? '#8a5a00' : '#ebd08a' },
        { r: 92, col: isDay ? 'rgba(14,98,154,0.55)' : 'rgba(136,240,255,0.45)' },
        { r: 110, col: isDay ? 'rgba(168,32,58,0.55)' : 'rgba(255,120,145,0.55)' }
      ];
      spheres.forEach((s, idx) => {
        ctxCosmo.strokeStyle = s.col; ctxCosmo.lineWidth = idx === 2 ? 1.6 : 1.1;
        ctxCosmo.beginPath(); ctxCosmo.ellipse(0, 0, safeR(s.r * 1.55), safeR(s.r * 0.88), 0, 0, Math.PI * 2); ctxCosmo.stroke();
        const na = t * (0.28 - idx * 0.04) * (idx % 2 === 0 ? 1 : -1) + idx * 1.2;
        const nx = Math.cos(na) * s.r * 1.55, ny = Math.sin(na) * s.r * 0.88;
        ctxCosmo.fillStyle = s.col;
        ctxCosmo.beginPath(); ctxCosmo.arc(nx, ny, 3.2, 0, Math.PI * 2); ctxCosmo.fill();
      });
      ctxCosmo.fillStyle = isDay ? '#1326e6' : '#ffffff';
      ctxCosmo.beginPath(); ctxCosmo.arc(0, 0, 5.5, 0, Math.PI * 2); ctxCosmo.fill();
      ctxCosmo.fillStyle = isDay ? '#4a5060' : '#d9dde6';
      ctxCosmo.font = '12px sans-serif'; ctxCosmo.textAlign = 'left';
      ctxCosmo.fillText('第九重：盲目混沌外圈', -198, -96);
      ctxCosmo.fillText('第八重：群青圣律天球', 62, -96);
      ctxCosmo.textAlign = 'center';
      ctxCosmo.fillText('第一重：休谟基准地球', 0, 17);
      ctxCosmo.restore();
    }

    const ANIMATED_LIBERS = new Set(['prologus', 'pantheon', 'oraculum', 'colophon', 'gallery']);
    let mobFrameTimer = 0;
    let rafActive = false;
    function scheduleNextFrame() {
      if (!ANIMATED_LIBERS.has(state.liber)) {
        rafActive = false;
        return;
      }
      rafActive = true;
      if (IS_MOBILE) {
        if (mobFrameTimer) clearTimeout(mobFrameTimer);
        mobFrameTimer = setTimeout(() => {
          mobFrameTimer = 0;
          requestAnimationFrame(animate);
        }, 18);
      } else {
        requestAnimationFrame(animate);
      }
    }

    function animate(ts) {
      scheduleNextFrame();
      const rawDt = (ts - prevTs) / 1000;
      const dt = Math.max(0, Math.min(0.05, Number.isFinite(rawDt) ? rawDt : 0));
      prevTs = ts;
      if (document.hidden) return;
      state.time += dt;

      try {
        if (state.liber === 'prologus') drawPrologus(state.time);
        else if (state.liber === 'pantheon') drawLiberTwo(state.time);
        else if (state.liber === 'oraculum') drawCosmology(state.time);
        else if (state.liber === 'colophon') drawColophon(state.time);
        else if (state.liber === 'gallery') {
          drawTelemetryOscilloscope(state.time);
          if (state.targetRotY !== null) {
            let dy = state.targetRotY - state.rotY;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            state.rotY += dy * 0.095; state.rotX += (state.targetRotX - state.rotX) * 0.095;
            if (Math.abs(dy) < 0.002 && Math.abs(state.targetRotX - state.rotX) < 0.002) {
              state.baseFocusRotY = state.targetRotY; state.targetRotY = null; state.targetRotX = null; state.userDraggedAtHighZoom = false;
            }
          } else if (!state.dragging) {
            state.rotY += state.velY; state.rotX = Math.max(-2.35, Math.min(1.35, state.rotX + state.velX));
            state.velY *= 0.92; state.velX *= 0.92;
            if (state.autoRotate) {
              if (state.zoom < 1.85) state.rotY += dt * 0.10;
              else if (!state.userDraggedAtHighZoom) state.rotY += (state.baseFocusRotY + Math.sin(state.time * 0.42) * 0.09 - state.rotY) * 0.04;
            }
          }

          state.zoom += (state.targetZoom - state.zoom) * 0.11;
          const zTxt = `${state.zoom.toFixed(1)}x`;
          if (zoomReadout.textContent !== zTxt) zoomReadout.textContent = zTxt;

          const { cx, cy, radius, surfRadius, pan } = getGlobeGeometry();
          ctxBack.clearRect(0, 0, cBack.width, cBack.height);
          drawCosmicBackdrop(ctxBack, cx, cy, radius, pan, state.time);
          drawHorizonTentacles(ctxBack, cx, cy, surfRadius, state.time);
          drawArmillaryHalf(ctxBack, cx, cy, surfRadius, state.time, false);

          if (gl && glProg) {
            gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(glProg);
            gl.uniform2f(glUni.u_res, cWebgl.width, cWebgl.height);
            gl.uniform2f(glUni.u_center, cx * GL_DPR, cy * GL_DPR);
            gl.uniform1f(glUni.u_radius, radius * GL_DPR);
            gl.uniform1f(glUni.u_rotY, state.rotY);
            gl.uniform1f(glUni.u_rotX, state.rotX);
            gl.uniform1f(glUni.u_time, state.time);
            gl.uniform1f(glUni.u_relief, state.relief);
            gl.uniform1f(glUni.u_seal, state.seal);
            gl.uniform1f(glUni.u_abyss, state.abyss);
            gl.uniform1f(glUni.u_outer, state.outer);
            gl.uniform1f(glUni.u_rivers, state.showTerrain ? 1.0 : 0.0);
            gl.uniform1f(glUni.u_mobile, IS_MOBILE ? 1.0 : 0.0);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          }

          ctxFront.clearRect(0, 0, cFront.width, cFront.height);
          draw3DCitiesRiversAndCrowds(ctxFront, cx, cy, surfRadius, state.time);
          drawArmillaryHalf(ctxFront, cx, cy, surfRadius, state.time, true);
        }
      } catch (err) {
        console.error('[frame]', err);
      }
    }
    requestAnimationFrame(animate);

    // =========================================================================
    // 12. NAVIGATION, DOSSIER RENDERING & INTERACTIVE CONTROLS
    // =========================================================================
    const LIBER_META = {
      prologus:     { right: '序卷 · 馆藏导览',     roman: '' },
      map:          { right: '第一卷 · 写实地球档案图', roman: '' },
      gallery:      { right: '展厅 · 铜版神学星象仪', roman: '' },
      entry:        { right: '馆藏词条详单', roman: '' },
      pantheon:     { right: '第二卷 · 神祇图鉴',   roman: '' },
      scp:          { right: '第三卷 · 机密档案',   roman: '' },
      architectura: { right: '第四卷 · 十二站点志', roman: '' },
      oraculum:     { right: '第五卷 · 神学检索台', roman: '' },
      colophon:     { right: '第六卷 · 版权与铭记', roman: '' }
    };

    const leftPanel = document.getElementById('left-panel');
    const rightPanel = document.getElementById('right-panel');
    const camBar = document.getElementById('globe-cam-bar');
    const liveTicker = document.getElementById('live-ticker');

    // Day / Night Theme Toggle with localStorage Persistence (P1)
    function applyTheme(theme) {
      state.theme = theme;
      document.documentElement.setAttribute('data-theme', theme);
      try { localStorage.setItem('tc_theme', theme); } catch (_) {}
      const lbl = document.getElementById('theme-label');
      if (lbl) lbl.textContent = theme === 'day' ? '夜间模式' : '日间纸本';
      if (PANTHEON[state.pantheonIdx]) drawPantheonRadar(PANTHEON[state.pantheonIdx].stats);
      const curCity = state.selectedId || 'alexandria';
      const profEl = document.getElementById('codex-profile-svg');
      if (profEl && typeof buildElevationProfileSVG === 'function') profEl.innerHTML = buildElevationProfileSVG(curCity, 38);
    }
    document.getElementById('btn-theme').addEventListener('click', () => {
      applyTheme(state.theme === 'day' ? 'night' : 'day');
    });

    // =========================================================================
    // PROCEDURAL WEBAUDIO SACRED CATHEDRAL CHOIR & ABYSSAL SONAR SYNTHESIZER!
    // =========================================================================
    let audioCtx = null, masterGain = null, sonarTimer = null;
    function playClickBlip(freq = 680) {
      if (!state.audioOn || !audioCtx) return;
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.04, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0008, audioCtx.currentTime + 0.065);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.07);
    }
    function toggleSacredAudio() {
      const btn = document.getElementById('btn-audio');
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.0;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 460;
        filter.connect(masterGain); masterGain.connect(audioCtx.destination);

        // Hermetic Sacred Fifth & Octave Choir Pad (110Hz A2, 165Hz E3, 220Hz A3, 277.18Hz C#4)
        [55, 110, 164.81, 220, 329.63].forEach((f, idx) => {
          const osc = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
          osc.frequency.value = f;
          g.gain.value = idx === 0 ? 0.28 : 0.12;
          osc.connect(g); g.connect(filter); osc.start();
        });
      }
      state.audioOn = !state.audioOn;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      masterGain.gain.setTargetAtTime(state.audioOn ? 0.16 : 0.0, audioCtx.currentTime, 0.35);
      if (sonarTimer) { clearInterval(sonarTimer); sonarTimer = null; }
      if (state.audioOn) {
        playClickBlip(880);
        sonarTimer = setInterval(() => {
          if (!state.audioOn || !audioCtx) return;
          const p = audioCtx.createOscillator(), pg = audioCtx.createGain();
          p.type = 'sine';
          p.frequency.setValueAtTime(state.abyss > 0.7 ? 196 : 528, audioCtx.currentTime);
          p.frequency.exponentialRampToValueAtTime(132, audioCtx.currentTime + 1.8);
          pg.gain.setValueAtTime(0.035, audioCtx.currentTime);
          pg.gain.exponentialRampToValueAtTime(0.0005, audioCtx.currentTime + 1.9);
          p.connect(pg); pg.connect(audioCtx.destination);
          p.start(); p.stop(audioCtx.currentTime + 2.0);
        }, 5200);
      }
      btn.innerHTML = `<svg class="ico" viewBox="0 0 14 14"><polygon points="2,5.2 4.8,5.2 8,2.5 8,11.5 4.8,8.8 2,8.8"/>${state.audioOn ? '<path d="M10 4.2 Q12.5 7 10 9.8"/><path d="M11.4 2.8 Q14.2 7 11.4 11.2"/>' : '<line x1="10" y1="5" x2="13" y2="9"/><line x1="13" y1="5" x2="10" y2="9"/>'}</svg><span>圣咏声景: ${state.audioOn ? '开' : '关'}</span>`;
    }
    document.getElementById('btn-audio').addEventListener('click', toggleSacredAudio);

    window.selectPantheon = selectPantheon;
    window.switchLiber = function(name, fromRouter = false) {
      if (name === 'terra') name = 'gallery';
      if (!fromRouter) pushChapterHash(name);
      playClickBlip(620);
      state.liber = name;
      document.querySelectorAll('.liber-nav-btn[data-liber]').forEach(b => b.classList.toggle('active', b.dataset.liber === name));
      ['prologus', 'map', 'pantheon', 'scp', 'architectura', 'oraculum', 'colophon', 'entry'].forEach(st => {
        const el = document.getElementById(`stage-${st}`);
        if (el) el.classList.toggle('open', name === st);
      });
      const inTerra = name === 'gallery';
      const gw = document.getElementById('globe-stage-wrap');
      gw.style.display = inTerra ? 'block' : 'none';
      gw.style.opacity = inTerra ? '1' : '0';
      gw.style.pointerEvents = inTerra ? 'auto' : 'none';
      camBar.style.display = inTerra ? 'flex' : 'none';
      leftPanel.style.display = inTerra ? 'flex' : 'none';
      rightPanel.style.display = inTerra ? 'flex' : 'none';
      if (liveTicker) liveTicker.style.display = (inTerra && !IS_MOBILE) ? 'flex' : 'none';
      if (!inTerra) leftPanel.classList.remove('mobile-sheet-open');
      leftPanel.classList.toggle('panel-hidden-left', !inTerra || state.uiHidden);
      rightPanel.classList.toggle('panel-hidden-right', !inTerra || state.uiHidden);
      const meta = LIBER_META[name] || LIBER_META.map;
      document.getElementById('top-right-pill').textContent = meta.right;
      if (name === 'prologus') drawPrologus(state.time);
      else if (name === 'pantheon') drawLiberTwo(state.time);
      else if (name === 'oraculum') drawCosmology(state.time);
      else if (name === 'colophon') drawColophon(state.time);
      if (ANIMATED_LIBERS.has(name) && !rafActive) {
        prevTs = performance.now();
        scheduleNextFrame();
      }
    };

    document.querySelectorAll('.liber-nav-btn[data-liber]').forEach(btn => {
      btn.addEventListener('click', () => { stopCinema(); window.switchLiber(btn.dataset.liber); });
    });

    const ICON_PLAY = `<svg class="ico" viewBox="0 0 14 14"><polygon points="3.5,2.2 11.5,7 3.5,11.8"/></svg><span>巡礼放映</span>`;
    const ICON_STOP = `<svg class="ico" viewBox="0 0 14 14"><rect x="3" y="3" width="8" height="8"/></svg><span>停止放映</span>`;
    let cinemaTimers = [];
    function stopCinema() {
      cinemaTimers.forEach(clearTimeout); cinemaTimers = [];
      state.cinemaPlaying = false;
      document.getElementById('btn-cinema').innerHTML = ICON_PLAY;
    }
    document.getElementById('btn-cinema').addEventListener('click', () => {
      if (state.cinemaPlaying) { stopCinema(); return; }
      state.cinemaPlaying = true;
      document.getElementById('btn-cinema').innerHTML = ICON_STOP;
      window.switchLiber('prologus');
      cinemaTimers.push(setTimeout(() => { selectPantheon(2); window.switchLiber('pantheon'); }, 3200));
      cinemaTimers.push(setTimeout(() => { window.switchLiber('scp'); }, 6600));
      cinemaTimers.push(setTimeout(() => { window.switchLiber('terra'); setCamMode('street', 'alexandria'); }, 10000));
      cinemaTimers.push(setTimeout(() => { setCamMode('skyline', 'site2000'); }, 14000));
      cinemaTimers.push(setTimeout(() => { window.switchLiber('colophon'); stopCinema(); }, 18000));
    });

    function selectPantheon(idx) {
      playClickBlip(740);
      state.pantheonIdx = idx;
      const p = PANTHEON[idx];
      document.getElementById('pan-symbol').innerHTML = p.sym;
      document.getElementById('pan-latin').textContent = p.latin;
      document.getElementById('pan-condensed').textContent = p.condensed;
      document.getElementById('pan-sub').textContent = p.sub;
      document.getElementById('pan-lore').textContent = p.lore;
      document.getElementById('pan-fig-caption').textContent = p.fig;
      const scripEl = document.getElementById('pan-scripture');
      if (scripEl) scripEl.textContent = p.scripture || '';
      const metEl = document.getElementById('pan-metrics');
      if (metEl && p.metrics) {
        metEl.innerHTML = p.metrics.map((m, mi) => `<span class="${mi===0?'badge-crimson':(mi===1?'badge-cyan':'badge-gold')}">${m}</span>`).join('');
      }
      drawPantheonRadar(p.stats || [90,90,90,90,90,90]);
      document.querySelectorAll('#pan-selector button').forEach((b, i) => b.classList.toggle('active', i === idx));
    }
    document.getElementById('pan-selector').innerHTML = PANTHEON.map((p, i) => `
      <button class="bp-btn ${i===0?'active':''}" style="padding:6px 12px; font-size:13px;" data-pidx="${i}">${p.roman}</button>
    `).join('');
    document.querySelectorAll('#pan-selector button').forEach(b => b.addEventListener('click', () => selectPantheon(Number(b.dataset.pidx))));
    wheelCanvas.addEventListener('click', (e) => {
      const rect = wheelCanvas.getBoundingClientRect();
      let ang = Math.atan2(e.clientY - (rect.top + rect.height*0.5), e.clientX - (rect.left + rect.width*0.5)) + Math.PI*0.5;
      if (ang < 0) ang += Math.PI * 2;
      selectPantheon(Math.round((ang / (Math.PI * 2)) * 8) % 8);
    });
    document.getElementById('pan-jump-btn').addEventListener('click', () => {
      const p = PANTHEON[state.pantheonIdx];
      window.switchLiber('terra'); setCamMode(p.cam, p.city);
    });
    selectPantheon(0);

    const CITY_META_EXTRA = {
      rlyeh:      { badge: 'badge-crimson', cls: '克苏鲁原典+原创', hume: '0.41 Hm', garrison: 'MTF Gamma-6 深海喂食者', prof: [18, 42, 24, 68, 86, 62, 12, 54, 38, 14], riverAt: 6 },
      alexandria: { badge: 'badge-gold',    cls: '本站原创设定',     hume: '1.48 Hm', garrison: 'MTF Alpha-1 红右手',     prof: [22, 34, 58, 92, 66, 14, 16, 48, 36, 20], riverAt: 5 },
      site2000:   { badge: 'badge-gold',    cls: 'SCP原典 CC-BY-SA', hume: '1.35 Hm', garrison: 'SRA 工程团 × Alpha-1',   prof: [92, 74, 42, 64, 58, 18, 52, 68, 88, 95], riverAt: 5 },
      gate001:    { badge: 'badge-gold',    cls: 'SCP原典 Clef提案', hume: '8.90 Hm', garrison: 'Site-0 远古守望哨',      prof: [38, 22, 14, 56, 96, 58, 14, 24, 42, 48], riverAt: 2 },
      prague:     { badge: 'badge-cyan',    cls: 'SCP-2264+原创',    hume: '0.62 Hm', garrison: '蔷薇十字 × 秘传学分部',  prof: [54, 78, 88, 62, 15, 36, 72, 92, 64, 44], riverAt: 4 },
      site13:     { badge: 'badge-crimson', cls: 'SCP-1730 原典',    hume: '0.24 Hm', garrison: 'MTF Tau-5 轮回小队',     prof: [90, 68, 22, 76, 94, 76, 18, 28, 74, 92], riverAt: 6 },
      cairo:      { badge: 'badge-cyan',    cls: '原典+破碎之神',    hume: '0.92 Hm', garrison: '齿轮正教 × 埃及站点',    prof: [46, 64, 92, 82, 56, 14, 18, 58, 44, 32], riverAt: 5 },
      antarctica: { badge: 'badge-crimson', cls: '洛氏原典+原创',    hume: '0.79 Hm', garrison: 'Outpost-72 × 密大科考',  prof: [96, 82, 44, 88, 94, 84, 42, 78, 92, 98], riverAt: -1 },
      penglai:    { badge: 'badge-gold',    cls: 'CN分部衍生+原创',  hume: '1.42 Hm', garrison: 'Site-CN-01 × 中华异学会',prof: [16, 48, 86, 96, 64, 16, 44, 62, 28, 12], riverAt: 5 },
      baikal:     { badge: 'badge-crimson', cls: 'SCP-610 原典衍生', hume: '0.88 Hm', garrison: 'MTF Eta-5 × 发条圣骑士', prof: [88, 66, 48, 78, 48, 10, 12, 52, 76, 90], riverAt: 5 },
      arkham:     { badge: 'badge-cyan',    cls: '洛氏原典+三波特兰',hume: '0.84 Hm', garrison: 'UIU × 密大秘仪馆藏组',   prof: [44, 68, 84, 52, 14, 38, 48, 22, 62, 16], riverAt: 4 },
      leng:       { badge: 'badge-crimson', cls: '洛氏+SCP-2317合流',hume: '0.31 Hm', garrison: 'O5 220-Calabasas 仪轨队',prof: [98, 86, 74, 92, 78, 24, 26, 72, 88, 96], riverAt: -1 }
    };

    function buildElevationProfileSVG(cityId, h = 38) {
      const m = CITY_META_EXTRA[cityId] || CITY_META_EXTRA.alexandria;
      const isDay = state.theme === 'day';
      const lineCol = isDay ? '#1326e6' : '#88f0ff';
      const fillCol = isDay ? 'rgba(19,38,230,0.12)' : 'rgba(116,232,255,0.16)';
      const pts = m.prof;
      const Wp = 260;
      const coords = pts.map((v, i) => `${(i / (pts.length - 1)) * Wp},${(h - 4) - (v / 100) * (h - 9)}`);
      const poly = `0,${h} ${coords.join(' ')} ${Wp},${h}`;
      const rx = m.riverAt >= 0 ? (m.riverAt / (pts.length - 1)) * Wp : -1;
      return `<svg viewBox="0 0 ${Wp} ${h}" style="width:100%; height:${h}px; display:block;">
        <polygon points="${poly}" fill="${fillCol}" />
        <polyline points="${coords.join(' ')}" fill="none" stroke="${lineCol}" stroke-width="1.5" />
        ${rx >= 0 ? `<circle cx="${rx}" cy="${h - 6}" r="3" fill="${lineCol}" /><line x1="${rx-8}" y1="${h-5}" x2="${rx+8}" y2="${h-5}" stroke="${lineCol}" stroke-width="1.6"/>` : ''}
        <line x1="0" y1="${h-1}" x2="${Wp}" y2="${h-1}" stroke="rgba(128,128,128,0.3)" stroke-width="0.8"/>
      </svg>`;
    }

    
    function renderInfoboxHtml(infobox) {
      if (!Array.isArray(infobox) || !infobox.length) return '';
      return '<div class="infobox-list">' + infobox.map(row =>
        '<div class="infobox-item">' +
          '<span class="infobox-label">' + escapeHtml(row.label) + '：</span>' +
          '<span class="infobox-val">' + escapeHtml(row.value) + '</span>' +
          (row.original ? '<span class="orig-field-tag">本站设定</span>' : '') +
        '</div>'
      ).join('') + '</div>';
    }

    const FILE_PROVENANCE = {
      scp: '出处：基于 SCP 基金会维基原典（CC BY-SA 3.0）及本站跨体系评注',
      mythos: '出处：洛夫克拉夫特公有领域原典 + 本站原创收容记录',
      goi: '出处：SCP 同行组织设定（CC BY-SA 3.0）+ 本站原创合流叙事',
      codex: '出处：古典文献公有领域传说 + 本站原创蓝色神学设定'
    };

    function renderScpArchive(cat = 'all') {
      state.scpCat = cat;
      const list = cat === 'all' ? SCP_FILES : SCP_FILES.filter(f => f.cat === cat);
      document.getElementById('scp-grid').innerHTML = list.map((f) => `
        <article class="archive-card">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap; border-bottom:1px solid var(--border-soft); padding-bottom:8px;">
              <span class="${escapeHtml(f.badge || 'badge-gold')}">${escapeHtml(f.code)}</span>
              <span class="badge-cyan">${escapeHtml(f.hume)} <span style="opacity:0.8;">(本站设定)</span></span>
            </div>
            <h3 style="font-size:18.5px; font-weight:700; margin-top:10px; color:var(--klein); line-height:1.4;">${escapeHtml(f.title)}</h3>
            <div style="font-size:12.5px; color:var(--ink-sec); margin-top:4px;">${escapeHtml(f.authorCredit || FILE_PROVENANCE[f.cat] || FILE_PROVENANCE.scp)}</div>
            ${renderInfoboxHtml(f.infobox)}
            <p class="prose-read" style="margin-top:10px;"><b>档案综述：</b>${renderSafeMarkup(f.summary)}</p>
            <p class="prose-read" style="margin-top:8px; color:var(--ink-sec);"><b>收容与驻防（本站设定）：</b>${renderSafeMarkup(f.proc)}</p>
            <details style="margin-top:10px; border:1px solid var(--border); background:var(--bg-sub); padding:8px 12px; font-size:15px; cursor:pointer; border-radius:2px;">
              <summary style="font-weight:700; color:var(--klein); outline:none;">展开现场探索 / 声呐 / 手记实录</summary>
              <p class="prose-read" style="margin-top:8px;">${renderSafeMarkup(f.log)}</p>
            </details>
          </div>
          <a class="bp-btn" style="width:100%; font-size:14.5px; text-decoration:none; text-align:center;" href="#/map/${encodeURIComponent(f.city)}">
            在地图中查看该站点地形与水系 →
          </a>
        </article>
      `).join('');
    }
    renderScpArchive('all');
    document.querySelectorAll('#scp-filter-bar button').forEach(btn => {
      btn.addEventListener('click', () => {
        playClickBlip(700);
        document.querySelectorAll('#scp-filter-bar button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderScpArchive(btn.dataset.scpcat);
      });
    });

    document.getElementById('atlas-grid').innerHTML = CITIES.map(c => {
      const m = CITY_META_EXTRA[c.id] || CITY_META_EXTRA.alexandria;
      return `
      <article class="archive-card" style="padding:18px;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="${escapeHtml(m.badge)}">${escapeHtml(m.cls)}</span>
            <span class="badge-cyan">${escapeHtml(m.hume)} · 本站设定</span>
          </div>
          <h3 class="condensed-monument" style="font-size:19px; margin-top:10px; margin-bottom:4px;">${escapeHtml(c.name)}</h3>
          <div style="font-size:12.5px; color:var(--ink-sec); font-family:monospace,sans-serif;">${escapeHtml(c.coords)}</div>
          <div style="margin:10px 0; border:1px solid var(--border-soft); background:var(--bg-sub); padding:6px 8px;">
            ${buildElevationProfileSVG(c.id, 34)}
          </div>
          <div class="desc-copy" style="font-weight:600;"><svg class="ico" viewBox="0 0 14 14"><path d="M1.8 8.8 L5.2 3 L8.2 7.2 L10.2 4.6 L12.4 8.8"/><path d="M1.5 11.2 Q4.5 9.6 7 11.2 T12.5 11.2"/></svg>${escapeHtml(c.terrain)}</div>
          <div class="desc-copy-sec" style="margin-top:4px;"><svg class="ico" viewBox="0 0 14 14"><circle cx="4.5" cy="4.2" r="1.3"/><path d="M4.5 5.8 L4.5 9.5 M4.5 9.5 L3 12 M4.5 9.5 L6 12"/><circle cx="9.5" cy="4.8" r="1.2"/><path d="M9.5 6.2 L9.5 9.6 M9.5 9.6 L8.2 12 M9.5 9.6 L10.8 12"/></svg>${escapeHtml(c.crowd)}</div>
          <p class="prose-read" style="font-size:15.5px; margin-top:8px;">${escapeHtml(c.desc)}</p>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <button class="bp-btn" type="button" style="font-size:14px;" data-astrolabe-city="${escapeHtml(c.id)}" data-astrolabe-cam="skyline">铜版星象仪视角</button>
          <a class="bp-btn active" style="font-size:14px; text-decoration:none; text-align:center;" href="#/map/${encodeURIComponent(c.id)}">在写实地球定位 →</a>
        </div>
      </article>`;
    }).join('');

    const facEl = document.getElementById('faction-list');
    if (facEl) {
      facEl.innerHTML = FACTIONS.map(f => `
        <div class="archive-card" style="padding:14px; gap:8px;">
          <div>
            <span class="${escapeHtml(f.badge)}">${escapeHtml(f.code)}</span>
            <div style="font-size:16px; font-weight:700; color:var(--klein); margin-top:6px;">${escapeHtml(f.name)}</div>
            <p class="desc-copy" style="margin-top:6px;">${escapeHtml(f.desc)}</p>
          </div>
          <a class="bp-btn" style="width:100%; font-size:14px; text-decoration:none; text-align:center;" href="#/map/${encodeURIComponent(f.city)}">在地图定位 →</a>
        </div>
      `).join('');
    }

    const UNIFIED_INDEX = [
      ...SCP_FILES.map(f => ({
        kind: '收容档案', title: `${f.code} · ${f.title}`, city: f.city, liber: 'scp',
        scpNums: (f.code.match(/SCP-\d+/gi) || []).map(s => s.toUpperCase()),
        terms: [f.code, f.title, f.city, ...(f.code.match(/SCP-\d+/gi) || [])],
        html: `<b>[收容档案命中 · ${escapeHtml(f.code)}]</b> <b>${escapeHtml(f.title)}</b><br/>${renderSafeMarkup(f.summary)}<br/><span style="font-size:14px; color:var(--ink-sec);">收容措施（本站设定）：${escapeHtml(f.proc)}</span>`
      })),
      ...CITIES.map(c => ({
        kind: '站点地理', title: `${c.name}（${c.coords}）`, city: c.id, liber: 'map',
        scpNums: ([c.name, c.tag].join(' ').match(/SCP-\d+/gi) || []).map(s => s.toUpperCase()),
        terms: [c.id, c.roman, c.name, c.short, c.god, ...c.name.split(/[·\s()（）/]+/).filter(x => x.length >= 2)],
        html: `<b>[站点地理命中 · ${escapeHtml(c.name)}]</b><br/><b>坐标位置：</b>${escapeHtml(c.coords)}（地势：${escapeHtml(c.terrain)}）<br/>${escapeHtml(c.desc)}<br/><a class="bp-btn active" style="margin-top:8px; display:inline-flex; text-decoration:none;" href="#/map/${encodeURIComponent(c.id)}">在写实地球定位 ${escapeHtml(c.short)} →</a>`
      })),
      ...PANTHEON.map((p, idx) => ({
        kind: '神祇图鉴', title: `${p.latin} · ${p.condensed}`, city: p.city, liber: 'pantheon', pIdx: idx,
        scpNums: (p.latin.match(/SCP-\d+/gi) || []).map(s => s.toUpperCase()),
        terms: [p.latin, p.condensed, p.sub, ...p.latin.split(/[·\s()（）/]+/).filter(x => x.length >= 2)],
        html: `<b>[神祇图鉴命中 · ${escapeHtml(p.condensed)}]</b><br/>${escapeHtml(p.lore)}<br/><button class="bp-btn" type="button" style="margin-top:8px;" data-select-pantheon="${idx}">打开铜版图鉴详情 →</button>`
      })),
      ...FACTIONS.map(f => ({
        kind: '同行组织', title: f.name, city: f.city, liber: 'oraculum',
        scpNums: [],
        terms: [f.name, f.code, ...f.name.split(/[·\s&]+/).filter(x => x.length >= 2)],
        html: `<b>[组织词条命中 · ${escapeHtml(f.name)}]</b>（${escapeHtml(f.code)}）<br/>${escapeHtml(f.desc)}`
      })),
      ...AIC_KB.map(k => ({
        kind: '专题综述', title: k.title, city: 'alexandria', liber: 'oraculum',
        scpNums: [],
        terms: k.keys,
        html: `<b>[检索结果 · ${escapeHtml(k.title)}]</b> ${escapeHtml(k.summary)}`
      }))
    ];

    const aicOut = document.getElementById('aic-output');
    function appendAicMsg(html, isUser = false) {
      if (!aicOut) return;
      const div = document.createElement('div');
      div.style.marginBottom = '12px';
      div.style.padding = '10px 12px';
      div.style.borderLeft = '3px solid var(--klein)';
      div.style.background = isUser ? 'var(--klein-soft)' : 'var(--bg-card)';
      div.innerHTML = html;
      aicOut.appendChild(div);
      aicOut.scrollTop = aicOut.scrollHeight;
    }
    appendAicMsg('<b>[检索终端就绪]</b> 已建立涵盖<b>神祇图鉴、收容档案、十二站点、同行组织与专题综述</b>的本地索引。支持输入问题（如“拉莱耶在哪”、“SCP-2000”、“破碎之神”），未收录编号将如实告知。');

    window.runQuickSearch = function(term) { handleAicQuery(term); };

    function handleAicQuery(rawQ) {
      const q = String(rawQ || '').trim();
      if (!q) return;
      playClickBlip(780);
      const safeQ = escapeHtml(q);
      appendAicMsg(`<b>[检索词]</b> ${safeQ}`, true);

      const scpMatch = q.match(/\bSCP-(\d+)\b/i) || q.match(/^(\d{3,4})$/);
      if (scpMatch) {
        const targetCode = `SCP-${scpMatch[1]}`.toUpperCase();
        const exactHits = UNIFIED_INDEX.filter(it => it.scpNums.includes(targetCode));
        if (exactHits.length > 0) {
          exactHits.slice(0, 2).forEach(h => appendAicMsg(h.html));
          return;
        }
        const targetNum = parseInt(scpMatch[1], 10);
        const nearScp = UNIFIED_INDEX
          .filter(it => it.scpNums.length > 0)
          .sort((a, b) => {
            const na = parseInt(a.scpNums[0].slice(4), 10) || 9999;
            const nb = parseInt(b.scpNums[0].slice(4), 10) || 9999;
            return Math.abs(na - targetNum) - Math.abs(nb - targetNum);
          })
          .slice(0, 3);
        const nearBtns = nearScp.map(it => `<button class="bp-btn" type="button" style="margin:4px 6px 0 0;" data-quick-search="${escapeHtml(it.scpNums[0])}">${escapeHtml(it.title)}</button>`).join('');
        appendAicMsg(`<b>[档案库未收录]</b> 档案库未收录：<b>${escapeHtml(targetCode)}</b>。<br/>馆藏最相近的 3 份 SCP 条目如下：<div style="margin-top:6px;">${nearBtns}</div>`);
        return;
      }

      const qLower = q.toLowerCase();
      const cleaned = qLower.replace(/(在哪儿?|在哪里|是什么|是谁|怎么去|位于哪里|位置|的资料|档案|介绍一下|[?？!！。，,\s])/g, '');

      const scored = [];
      for (const item of UNIFIED_INDEX) {
        let score = 0;
        for (const rawTerm of item.terms) {
          const term = String(rawTerm || '').toLowerCase().trim();
          if (term.length < 2) continue;
          if (/^\d+$/.test(term) && term !== cleaned) continue;
          if (qLower === term || cleaned === term) score = Math.max(score, 100);
          else if (qLower.includes(term) || (cleaned.length >= 2 && cleaned.includes(term))) score = Math.max(score, 75 + Math.min(20, term.length * 2));
          else if (cleaned.length >= 2 && term.includes(cleaned)) score = Math.max(score, 65);
        }
        if (score > 0) scored.push({ item, score });
      }
      scored.sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        const asksWhere = /在哪|位置|坐标/.test(q);
        if (asksWhere) {
          scored.sort((a, b) => (b.item.kind === '站点地理' ? 20 : 0) + b.score - ((a.item.kind === '站点地理' ? 20 : 0) + a.score));
        }
        appendAicMsg(scored[0].item.html);
        return;
      }

      const fallbackThree = [UNIFIED_INDEX[0], UNIFIED_INDEX[5], UNIFIED_INDEX[12]].filter(Boolean);
      const fbBtns = fallbackThree.map(it => `<button class="bp-btn" type="button" style="margin:4px 6px 0 0;" data-quick-search="${escapeHtml(it.terms[0])}">${escapeHtml(it.title)}</button>`).join('');
      appendAicMsg(`<b>[档案库未收录]</b> 档案库未收录：“<b>${safeQ}</b>”。<br/>您可尝试检索以下馆藏条目：<div style="margin-top:6px;">${fbBtns}</div>`);
    }

    document.getElementById('aic-send-btn').addEventListener('click', () => {
      const inp = document.getElementById('aic-input');
      handleAicQuery(inp.value); inp.value = '';
    });
    document.getElementById('aic-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { handleAicQuery(e.target.value); e.target.value = ''; }
    });
    document.querySelectorAll('.aic-quick').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.q) {
          handleAicQuery(btn.dataset.q);
        } else if (btn.dataset.ritual) {
          playClickBlip(520);
          const r = btn.dataset.ritual;
          if (r === 'calabasas') {
            sRelief.value = 105; sSeal.value = 96; sAbyss.value = 35; sOuter.value = 45; applySliders();
            appendAicMsg('<b>[仪轨已执行 · 220-CALABASAS]</b> 帕米尔冷原第七锁链已完成群青奇术加固，全球休谟指数回升至安全阈值！正在为您切入冷原双环星门现场……');
            setTimeout(() => { window.switchLiber('terra'); setCamMode('skyline', 'leng'); }, 900);
          } else if (r === 'overdrive') {
            sRelief.value = 100; sSeal.value = 100; sAbyss.value = 12; sOuter.value = 15; applySliders();
            appendAicMsg('<b>[仪轨已执行 · SRA 满功率共振]</b> 全球十二座圣城现实稳定锚已进入 100% 群青超频模式，深渊裂隙已全面压制！');
            setTimeout(() => { window.switchLiber('terra'); setCamMode('cradle', 'alexandria'); }, 900);
          } else if (r === 'starsright') {
            sRelief.value = 140; sSeal.value = 15; sAbyss.value = 100; sOuter.value = 100; applySliders();
            appendAicMsg('<b style="color:var(--badge-crim-fg);">[警告 · XK级群星归位推演已激活]</b> 全球现实稳定锚跌破 15%，拉莱耶海沟爆发绯红阿波罗级异常脉冲，外神星环全面显圣！');
            setTimeout(() => { window.switchLiber('terra'); setCamMode('skyline', 'rlyeh'); }, 900);
          }
        }
      });
    });
// Populate Live Overwatch Incident Ticker!
    const TICKER_EVENTS = [
      { city: 'leng',       txt: '[APOLLYON] 帕米尔冷原 SCP-2317 第七锁链张力升至 94.2%，程序 220-Calabasas 正在注入群青谐波' },
      { city: 'alexandria', txt: '[THAUMIEL] 亚历山大 Site-01 法罗斯大灯塔休谟基准稳定于 1.48 Hm，尼罗河航道商船通行正常' },
      { city: 'rlyeh',      txt: '[SONAR-17Hz] 南太平洋 47°09\'S 侦测到拉莱耶低频梦境潮汐，MTF Gamma-6 四艘潜航舰已合围' },
      { city: 'site13',     txt: '[KETER] 得州大本德 Site-13 地下第 28 层奇术焚化炉持续运转，MTF Tau-5 轮回小队已控制高空连廊' },
      { city: 'baikal',     txt: '[CONCORDAT] 贝加尔湖隔离墙外围气温 -34°C，破碎之神发条大穹顶正以 88Hz 压制 SCP-610 活性' },
      { city: 'penglai',    txt: '[SITE-CN-01] 东海蓬莱太乙七重镇海塔完成酉时巡检，西太平洋海眼水脉平稳' }
    ];
    const tickerTrack = document.getElementById('ticker-track');
    if (tickerTrack) {
      const htmlItems = [...TICKER_EVENTS, ...TICKER_EVENTS].map(ev =>
        `<span style="cursor:pointer; color:var(--ink);" data-astrolabe-city="${escapeHtml(ev.city)}" data-astrolabe-cam="skyline"><b style="color:var(--klein);">◈</b> ${ev.txt}</span>`
      ).join('');
      tickerTrack.innerHTML = htmlItems;
    }

    window.jumpRealMap = function(cityId) {
      window.location.hash = '#/map/' + encodeURIComponent(cityId);
    };
    window.jumpAtlas = window.jumpRealMap;

    document.addEventListener('click', (ev) => {
      const astBtn = ev.target.closest('[data-astrolabe-city]');
      if (astBtn) {
        window.switchLiber('gallery');
        setCamMode(astBtn.dataset.astrolabeCam || 'skyline', astBtn.dataset.astrolabeCity);
        return;
      }
      const panBtn = ev.target.closest('[data-select-pantheon]');
      if (panBtn) {
        selectPantheon(Number(panBtn.dataset.selectPantheon) || 0);
        window.switchLiber('pantheon');
        return;
      }
      const qsBtn = ev.target.closest('[data-quick-search]');
      if (qsBtn) {
        handleAicQuery(qsBtn.dataset.quickSearch);
      }
    });

    // Globe Multi-Touch Pinch-to-Zoom, Single-Finger Orbit & Wheel Controls
    const activePointers = new Map();
    let lastPinchDist = 0;
    let downPt = { x: 0, y: 0, moved: false };

    cFront.addEventListener('pointerdown', (e) => {
      if (state.liber !== 'gallery') return;
      if (leftPanel.classList.contains('mobile-sheet-open')) {
        leftPanel.classList.remove('mobile-sheet-open');
      }
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { cFront.setPointerCapture(e.pointerId); } catch (_) {}
      state.targetRotY = null; state.targetRotX = null;

      if (activePointers.size === 1) {
        state.dragging = true;
        if (state.zoom >= 1.85) state.userDraggedAtHighZoom = true;
        state.lastX = e.clientX; state.lastY = e.clientY;
        downPt = { x: e.clientX, y: e.clientY, moved: false };
      } else if (activePointers.size === 2) {
        downPt.moved = true;
        const [p1, p2] = Array.from(activePointers.values());
        lastPinchDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        state.lastX = (p1.x + p2.x) * 0.5;
        state.lastY = (p1.y + p2.y) * 0.5;
      }
    });

    cFront.addEventListener('pointermove', (e) => {
      state.mouseX = e.clientX; state.mouseY = e.clientY;
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activePointers.size >= 2) {
          const [p1, p2] = Array.from(activePointers.values());
          const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          if (lastPinchDist > 8 && dist > 8) {
            const ratio = dist / lastPinchDist;
            state.targetZoom = Math.max(0.65, Math.min(10.5, state.targetZoom * Math.pow(ratio, 1.15)));
            document.querySelectorAll('[data-cam]').forEach(b => b.classList.remove('active'));
          }
          lastPinchDist = dist;
          const mx = (p1.x + p2.x) * 0.5, my = (p1.y + p2.y) * 0.5;
          const dx = mx - state.lastX, dy = my - state.lastY;
          state.lastX = mx; state.lastY = my;
          const sens = 0.0048 / Math.pow(state.zoom, 0.88);
          state.rotY += dx * sens; state.rotX = Math.max(-2.35, Math.min(1.35, state.rotX + dy * sens));
          if (state.zoom >= 1.85) state.userDraggedAtHighZoom = true;
        } else if (activePointers.size === 1 && state.dragging) {
          if (Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y) > (IS_MOBILE ? 10 : 5)) downPt.moved = true;
          const dx = e.clientX - state.lastX, dy = e.clientY - state.lastY;
          state.lastX = e.clientX; state.lastY = e.clientY;
          const sens = (IS_MOBILE ? 0.0068 : 0.0055) / Math.pow(state.zoom, 0.88);
          state.rotY += dx * sens; state.rotX = Math.max(-2.35, Math.min(1.35, state.rotX + dy * sens));
          state.velY = dx * sens * 0.42; state.velX = dy * sens * 0.42;
        }
      } else if (state.liber === 'gallery' && !IS_MOBILE) {
        let hit = null;
        for (const p of clickablePins) if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= p.r) { hit = p.id; break; }
        state.hoveredId = hit; cFront.style.cursor = hit ? 'pointer' : 'grab';
      }
    });

    function handlePointerEnd(e) {
      const wasSingleTap = activePointers.size === 1 && !downPt.moved && e.type === 'pointerup';
      activePointers.delete(e.pointerId);
      lastPinchDist = 0;
      if (activePointers.size === 1) {
        const rem = activePointers.values().next().value;
        state.lastX = rem.x; state.lastY = rem.y;
        state.dragging = true;
      } else if (activePointers.size === 0) {
        state.dragging = false;
        if (state.liber === 'gallery' && wasSingleTap) {
          const pad = IS_MOBILE ? 14 : 4;
          let best = null, bestD = Infinity;
          for (const p of clickablePins) {
            const d = Math.hypot(e.clientX - p.x, e.clientY - p.y);
            if (d <= p.r + pad && d < bestD) { best = p.id; bestD = d; }
          }
          if (best) selectCity(best, true);
        }
      }
    }
    cFront.addEventListener('pointerup', handlePointerEnd);
    cFront.addEventListener('pointercancel', handlePointerEnd);

    cFront.addEventListener('wheel', (e) => {
      if (state.liber !== 'gallery') return;
      e.preventDefault();
      state.targetZoom = Math.max(0.65, Math.min(10.5, state.targetZoom * Math.exp(-e.deltaY * 0.0012)));
      document.querySelectorAll('[data-cam]').forEach(b => b.classList.remove('active'));
    }, { passive: false });

    // Mobile Bottom-Sheet Drawer Toggle
    const mobDrawerBtn = document.getElementById('mobile-drawer-btn');
    const mobDrawerClose = document.getElementById('mobile-drawer-close');
    if (mobDrawerBtn) {
      mobDrawerBtn.addEventListener('click', () => {
        leftPanel.classList.toggle('mobile-sheet-open');
      });
    }
    if (mobDrawerClose) {
      mobDrawerClose.addEventListener('click', () => {
        leftPanel.classList.remove('mobile-sheet-open');
      });
    }

    const sRelief = document.getElementById('relief-slider');
    const sSeal   = document.getElementById('seal-slider');
    const sAbyss  = document.getElementById('abyss-slider');
    const sOuter  = document.getElementById('outer-slider');
    function applySliders() {
      state.relief = sRelief.value / 100;
      state.seal   = sSeal.value / 100;
      state.abyss  = sAbyss.value / 100;
      state.outer  = sOuter.value / 100;
      document.getElementById('relief-val').textContent = `${sRelief.value}%`;
      document.getElementById('seal-val').textContent   = `${sSeal.value}%`;
      document.getElementById('abyss-val').textContent  = `${sAbyss.value}%`;
      document.getElementById('outer-val').textContent  = `${sOuter.value}%`;
      const hume = (0.35 + 1.15 * state.seal - 0.32 * state.abyss).toFixed(2);
      const akiva = Math.round(12 + 115 * state.seal - 45 * state.abyss + 35 * state.outer);
      const san = Math.max(8, Math.min(99, Math.round(52 + 48 * state.seal - 38 * state.abyss)));
      const oscH = document.getElementById('osc-hume'), oscA = document.getElementById('osc-akiva'), oscS = document.getElementById('osc-san');
      if (oscH) oscH.textContent = `休谟: ${hume}`;
      if (oscA) oscA.textContent = `阿基瓦: ${akiva}`;
      if (oscS) {
        oscS.textContent = `理智: ${san}%`;
        oscS.style.color = san < 45 ? 'var(--badge-crim-fg)' : 'var(--ink)';
      }
    }
    [sRelief, sSeal, sAbyss, sOuter].forEach(el => el.addEventListener('input', () => {
      document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
      applySliders();
    }));

    const PRESETS = {
      communion: { relief: 105, seal: 88, abyss: 86, outer: 88 },
      deluge:    { relief: 138, seal: 18, abyss: 100, outer: 100 },
      sapphire:  { relief: 95,  seal: 100, abyss: 15, outer: 12 }
    };
    document.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        playClickBlip(640);
        const p = PRESETS[btn.dataset.preset];
        document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        sRelief.value = p.relief; sSeal.value = p.seal; sAbyss.value = p.abyss; sOuter.value = p.outer;
        applySliders();
      });
    });

    const CAM_MODES = { cosmos: 0.72, planet: 1.20, cradle: 2.35, skyline: 5.2, street: 8.8 };
    function setCamMode(mode, cityOverride) {
      playClickBlip(720);
      document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('active', b.dataset.cam === mode));
      state.targetZoom = CAM_MODES[mode];
      selectCity(cityOverride || state.selectedId, true, CAM_MODES[mode]);
    }
    document.querySelectorAll('[data-cam]').forEach(btn => btn.addEventListener('click', () => setCamMode(btn.dataset.cam)));
    document.getElementById('btn-skyline').addEventListener('click', () => setCamMode('skyline'));
    document.getElementById('btn-street').addEventListener('click', () => setCamMode('street'));
    document.getElementById('btn-open-dossier').addEventListener('click', () => {
      window.switchLiber('scp');
      renderScpArchive('all');
    });

    const btnToggleUI = document.getElementById('btn-toggle-ui');
    btnToggleUI.addEventListener('click', () => {
      state.uiHidden = !state.uiHidden;
      if (state.uiHidden) leftPanel.classList.remove('mobile-sheet-open');
      leftPanel.classList.toggle('panel-hidden-left', state.uiHidden);
      rightPanel.classList.toggle('panel-hidden-right', state.uiHidden);
      btnToggleUI.textContent = state.uiHidden
        ? (IS_MOBILE ? '显示底栏' : '显示两侧图版')
        : (IS_MOBILE ? '全屏视图' : '隐藏两侧图版');
    });

    function bindTog(id, key) {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('active', Boolean(state[key]));
      el.addEventListener('click', () => { state[key] = !state[key]; el.classList.toggle('active', state[key]); });
    }
    bindTog('tog-cities', 'showCities');
    bindTog('tog-terrain', 'showTerrain');
    bindTog('tog-crowds', 'showCrowds');
    bindTog('tog-rings', 'showRings');
    bindTog('tog-gods', 'showGods');
    bindTog('tog-rotate', 'autoRotate');

    const nodeListEl = document.getElementById('node-list');
    function renderCityList() {
      nodeListEl.innerHTML = CITIES.map(c => {
        const sel = c.id === state.selectedId ? 'selected' : '';
        return `
          <button class="city-row ${sel}" style="width:100%; text-align:left; padding:6px 9px; display:flex; justify-content:space-between; align-items:center; font-size:13px;" data-id="${c.id}">
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${c.short}</span>
            <span style="display:inline-flex; align-items:center;">${c.glyph}</span>
          </button>
        `;
      }).join('');
      nodeListEl.querySelectorAll('.city-row').forEach(b => {
        b.addEventListener('click', () => {
          if (state.targetZoom < 3.5) {
            state.targetZoom = 5.2;
            document.querySelectorAll('[data-cam]').forEach(btn => btn.classList.toggle('active', btn.dataset.cam === 'skyline'));
          }
          selectCity(b.dataset.id, true, state.targetZoom);
          leftPanel.classList.remove('mobile-sheet-open');
        });
      });
    }

    function selectCity(id, focus, upcomingZoom = state.targetZoom) {
      const c = CITIES.find(x => x.id === id);
      if (!c) return;
      state.selectedId = id;
      const m = CITY_META_EXTRA[id] || CITY_META_EXTRA.alexandria;
      document.getElementById('codex-tag').textContent = m.cls;
      document.getElementById('codex-roman-title').textContent = c.short.replace(/^[IVX]+\s*·\s*[A-Za-z0-9-]+\s*/, '') || c.name;
      document.getElementById('codex-title').textContent = c.name;
      document.getElementById('codex-coords').textContent = c.coords;
      document.getElementById('codex-motto').textContent = c.motto;
      document.getElementById('codex-desc').textContent = c.desc;
      document.getElementById('codex-terrain').textContent = c.terrain;
      document.getElementById('codex-arch').textContent = c.arch;
      document.getElementById('codex-crowd').textContent = c.crowd;

      const badgeEl = document.getElementById('codex-badges');
      if (badgeEl) {
        badgeEl.innerHTML = `<span class="${m.badge}">${m.cls}</span><span class="badge-cyan">休谟 ${escapeHtml(m.hume)} (本站设定)</span>`;
      }
      const garEl = document.getElementById('codex-garrison');
      if (garEl) garEl.textContent = m.garrison;
      const profEl = document.getElementById('codex-profile-svg');
      if (profEl) profEl.innerHTML = buildElevationProfileSVG(id, 38);

      if (focus) {
        state.targetRotY = -(c.lon * Math.PI) / 180;
        const panAmt = smoothstepJS(1.3, 3.6, upcomingZoom);
        state.targetRotX = (c.lat * Math.PI) / 180 - TILT_OFFSET * panAmt;
      }
      renderCityList();
    }

    applyTheme(state.theme);
    applySliders();
    renderCityList();
    selectCity('alexandria', false);
  
}
