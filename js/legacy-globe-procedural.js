export function generateRichCityLandscape(city) {
      const items = [];
      const paths = []; // 3D pedestrian/pilgrim/MTF walkways: [{pts: [[x,y,z],...], count, speed}]
      const style = city.style;

      const addPrism = (opts) => items.push({ kind: 'prism', ...opts });
      const addStepped = (opts) => items.push({ kind: 'stepped', ...opts });
      const addDome = (opts) => items.push({ kind: 'dome', ...opts });
      const addArch = (opts) => items.push({ kind: 'arch_bridge', ...opts });
      const addPeak = (x, y, r, h, jag = 5) => items.push({ kind: 'mountain_peak', x, y, z0: -0.08, r, h, jag });

      // -----------------------------------------------------------------------
      // A. SURROUNDING 3D TOPOGRAPHY: MOUNTAINS, ESCARPMENTS & MULTI-TIER TERRACES!
      // -----------------------------------------------------------------------
      // Solid bedrock cliff plinth beneath city so high-relief terrain never shows gaps!
      addPrism({ x: 0, y: 0, z0: -0.32, w: 3.4, d: 3.4, h: 0.32, sides: 12, windows: 0, isTerrain: true });

      // Upper Acropolis / Citadel Terrace (creates unmistakable 3D elevation difference inside the city!)
      const acropH = (style === 'site13') ? 0.10 : 0.24;
      addStepped({ x: 0, y: 0.18, w: 1.42, d: 1.18, h: acropH, tiers: 2, stairs: true, isTerrace: true });

      // Flanking 3D Mountain Ranges / Caldera Rim / Cliff Bluffs (地势与高低差!)
      const mRing = city.mountainRing;
      const peakCount = (mRing === 'himalaya_peaks' || mRing === 'antarctic_spires' || mRing === 'caldera_peaks') ? 11 : 7;
      for (let m = 0; m < peakCount; m++) {
        // Place mountain arc mainly around the northern/eastern/western horizon behind the city (`a` from -0.15π to +1.15π)!
        const a = -0.12 * Math.PI + (m / (peakCount - 1)) * 1.24 * Math.PI;
        const dist = 1.92 + (m % 3) * 0.26;
        const px = Math.cos(a) * dist, py = Math.sin(a) * dist;
        const tall = (mRing === 'himalaya_peaks' || mRing === 'antarctic_spires') ? 1.55 : (mRing === 'caldera_peaks' || mRing === 'rift_mountains' ? 1.25 : 0.85);
        const ph = tall * (0.65 + ((m * 7) % 5) * 0.14);
        addPeak(px, py, 0.42 + (m % 2) * 0.16, ph, m % 2 === 0 ? 6 : 5);
      }

      // -----------------------------------------------------------------------
      // B. 3D WINDING RIVER CHANNEL, QUAY EMBANKMENTS, BOATS & WATERFALL!
      // -----------------------------------------------------------------------
      if (city.hasRiver) {
        items.push({
          kind: 'river_channel',
          hasWaterfall: city.hasWaterfall,
          // Winding river curve from north-west hills through south-front valley
          pts: [
            [-1.95, 0.85], [-1.25, 0.25], [-0.55, -0.38], [0.15, -0.52], [0.95, -0.44], [1.95, -0.68]
          ],
          width: 0.26
        });
        // Two multi-arch stone bridges spanning across the river with pedestrian crowds!
        addArch({ x1: -0.55, y1: -0.72, x2: -0.55, y2: -0.04, zBase: 0.0, h: 0.20, arches: 4 });
        addArch({ x1: 0.48, y1: -0.82, x2: 0.48, y2: -0.16, zBase: 0.0, h: 0.20, arches: 4 });
        // Riverfront Dock Piers
        addPrism({ x: -0.05, y: -0.34, z0: 0.0, w: 0.24, d: 0.08, h: 0.05, windows: 0, lod: 1 });
        // Crowd flows crossing both river bridges & walking along riverfront quays!
        paths.push({ pts: [[-0.55, -0.95, 0.02], [-0.55, -0.38, 0.21], [-0.55, 0.02, 0.04], [0, 0.12, acropH + 0.02]], count: 14, speed: 0.22 });
        paths.push({ pts: [[0.48, -0.98, 0.02], [0.48, -0.49, 0.21], [0.48, -0.10, 0.04], [0, 0.12, acropH + 0.02]], count: 14, speed: 0.19 });
        paths.push({ pts: [[-1.5, -0.62, 0.02], [-0.55, -0.72, 0.02], [0.48, -0.82, 0.02], [1.5, -0.90, 0.02]], count: 16, speed: 0.15 });
      } else {
        paths.push({ pts: [[0, -1.55, 0.02], [0, -0.55, 0.04], [0, 0.05, acropH + 0.02]], count: 18, speed: 0.20 });
      }

      // Circular sacred/containment procession path around the upper acropolis terrace!
      const ringPts = [];
      for (let s = 0; s <= 12; s++) {
        const a = (s / 12) * Math.PI * 2;
        ringPts.push([Math.cos(a) * 0.62, 0.18 + Math.sin(a) * 0.52, acropH + 0.02]);
      }
      paths.push({ pts: ringPts, count: 18, speed: 0.14 });

      // Helpers for buildings seated at local terrain height `zGround(x, y)`
      const zGround = (x, y) => {
        if (Math.abs(x) < 0.66 && Math.abs(y - 0.18) < 0.54) return acropH;
        const rDist = Math.hypot(x, y);
        if (rDist > 1.35 && y > 0.1) return 0.16; // Mid-slope hillside district!
        return 0.0;
      };

      const addPortico = (cx, cy, width, depth, zBase, colH, cols = 6) => {
        for (let i = 0; i < cols; i++) {
          const u = cols === 1 ? 0 : (i / (cols - 1) - 0.5);
          addPrism({ x: cx + u * width, y: cy, z0: zBase, w: 0.035, d: 0.035, h: colH, sides: 6, windows: 0 });
        }
        addPrism({ x: cx, y: cy, z0: zBase + colH, w: width + 0.06, d: depth, h: 0.055, windows: 0, roof: 'gable', roofH: 0.11 });
      };

      const addSRA = (x, y, z0, h = 0.85) => {
        // Scranton Reality Anchor (斯克兰顿现实稳定锚) Gyroscopic Spire!
        addPrism({ x, y, z0, w: 0.15, d: 0.15, h, sides: 8, windows: 4, roof: 'spire', roofH: 0.22, highlightWhite: true });
        items.push({ kind: 'octahedron', x, y, z0: z0 + h + 0.34, r: 0.10 });
      };

      const addHillsideUrbanBlocks = (count, styleMode) => {
        for (let i = 0; i < count; i++) {
          const ring = i % 3;
          const r = 0.72 + ring * 0.42 + ((i * 7) % 3) * 0.11;
          const a = (i / count) * Math.PI * 2 + ring * 0.23;
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          // Avoid river bed!
          if (city.hasRiver && y < -0.22 && y > -0.68) continue;
          if (Math.abs(x) < 0.14 && y < 0) continue;
          const zg = zGround(x, y);
          const floors = 2 + ((i * 5) % 4);
          const roofType = styleMode === 'gothic' ? 'gable' : (i % 4 === 0 ? 'spire' : (i % 3 === 0 ? 'gable' : 'flat'));
          addPrism({
            x, y, z0: zg,
            w: 0.13 + (i % 3) * 0.04, d: 0.12 + ((i + 1) % 3) * 0.04, h: 0.13 + floors * 0.065,
            rot: a, tiltX: styleMode === 'abyss' ? Math.sin(i * 1.9) * 0.09 : 0,
            windows: floors, portal: true, roof: roofType, roofH: roofType === 'flat' ? 0 : 0.11,
            lod: i % 2 === 0 ? 0 : 1
          });
        }
      };

      // -----------------------------------------------------------------------
      // C. SITE-SPECIFIC MONUMENTS (MYTHOS × SCP × HERMETIC)
      // -----------------------------------------------------------------------
      if (style === 'rlyeh') {
        addStepped({ x: 0, y: 0.2, z0: acropH, w: 0.86, d: 0.78, h: 0.56, tiers: 4, stairs: true });
        addPrism({ x: 0, y: 0.22, z0: acropH + 0.56, w: 0.38, d: 0.34, h: 0.68, tiltX: 0.14, tiltY: -0.08, windows: 4, portal: true, roof: 'spire', roofH: 0.46 });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + 0.35, r = 0.96 + (i % 2) * 0.22;
          const bx = Math.cos(a) * r, by = Math.sin(a) * r, bh = 0.64 + (i % 3) * 0.26;
          if (by < -0.22 && by > -0.68) continue;
          addPrism({ x: bx, y: by, z0: zGround(bx, by), w: 0.18, d: 0.16, h: bh, tiltX: Math.sin(i * 2.4) * 0.20, windows: 4, portal: true, roof: 'spire', roofH: 0.24 });
          if (i % 2 === 0) items.push({ kind: 'tentacle_coil', x: bx, y: by, r: 0.13, h: bh + 0.2, phase: i * 1.5 });
        }
        for (const [sx, sy] of [[-1.15, 0.85], [1.15, 0.85], [-1.15, -0.95], [1.15, -0.95]]) addSRA(sx, sy, zGround(sx, sy), 0.88);
        addHillsideUrbanBlocks(44, 'abyss');

      } else if (style === 'site2000') {
        // SCP-2000 Yellowstone Deus Ex Machina: Central Blast Dome + 8 SRA Cooling Towers!
        addDome({ x: 0, y: 0.20, z0: acropH, r: 0.36, drumH: 0.26, domeH: 0.34 });
        addPortico(0, -0.18, 0.42, 0.10, acropH, 0.24, 6);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + 0.2;
          const rx = Math.cos(a) * 0.98, ry = 0.18 + Math.sin(a) * 0.82;
          if (ry < -0.22 && ry > -0.68) continue;
          addSRA(rx, ry, zGround(rx, ry), 0.78);
        }
        addHillsideUrbanBlocks(42, 'hermetic');

      } else if (style === 'gate001') {
        // SCP-001 The Gate Guardian: Stepped Sacred Mountain + Eden Portal + Towering 4-Winged Flaming Sword Entity!
        addStepped({ x: 0, y: 0.25, z0: acropH, w: 0.92, d: 0.82, h: 0.68, tiers: 5, stairs: true, whiteCap: true });
        items.push({ kind: 'gate_guardian', x: 0, y: 0.25, z0: acropH + 0.68 });
        // Overwatch Site-0 perimeter bunkers south of the rivers
        for (let b = -3; b <= 3; b++) {
          addPrism({ x: b * 0.38, y: -0.96, z0: 0, w: 0.20, d: 0.16, h: 0.28 + (Math.abs(b) % 2) * 0.16, windows: 2, portal: true, highlightWhite: b === 0 });
        }
        addHillsideUrbanBlocks(34, 'hermetic');

      } else if (style === 'site13') {
        // SCP-1730 Site-13: Sunken Containment Pit + Brutalist Ziggurat + 6 Thaumic Incinerator Chimneys + Sky-Bridges!
        addStepped({ x: 0, y: 0.18, z0: acropH, w: 1.05, d: 0.92, h: 0.64, tiers: 4, stairs: true });
        addPrism({ x: 0, y: 0.18, z0: acropH + 0.64, w: 0.44, d: 0.44, h: 0.78, windows: 6, portal: true, highlightWhite: true });
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const cx0 = Math.cos(a) * 0.88, cy0 = 0.18 + Math.sin(a) * 0.75;
          if (cy0 < -0.22 && cy0 > -0.68) continue;
          addPrism({ x: cx0, y: cy0, z0: 0, w: 0.16, d: 0.16, h: 1.15, sides: 8, windows: 5, highlightWhite: true });
          addArch({ x1: 0, y1: 0.18, x2: cx0, y2: cy0, zBase: 0.68, h: 0.08, arches: 3, lod: 1 });
        }
        addHillsideUrbanBlocks(38, 'abyss');

      } else if (style === 'baikal') {
        // SCP-610 Quarantine Wall + Mekhane Clockwork Gear Cathedral Dome!
        addDome({ x: 0, y: 0.22, z0: acropH, r: 0.32, drumH: 0.32, domeH: 0.36 });
        items.push({ kind: 'octahedron', x: 0, y: 0.22, z0: acropH + 1.05, r: 0.16 });
        // Hexagonal Quarantine Fortress Wall + Watchtowers
        for (let i = 0; i < 10; i++) {
          const a1 = (i / 10) * Math.PI * 2, a2 = ((i + 1) / 10) * Math.PI * 2;
          const wx = Math.cos(a1) * 1.48, wy = Math.sin(a1) * 1.48;
          if (wy < -0.22 && wy > -0.68) continue;
          addPrism({ x: wx, y: wy, z0: 0, w: 0.16, d: 0.16, h: 0.56, windows: 3, roof: 'spire', roofH: 0.20, highlightWhite: true });
          const mx = (Math.cos(a1) + Math.cos(a2)) * 0.5 * 1.48, my = (Math.sin(a1) + Math.sin(a2)) * 0.5 * 1.48;
          if (my > -0.20 || my < -0.70) {
            addPrism({ x: mx, y: my, z0: 0, w: 0.78, d: 0.08, h: 0.32, rot: (a1 + a2) * 0.5 + Math.PI * 0.5, windows: 1 });
          }
        }
        addHillsideUrbanBlocks(38, 'gothic');

      } else if (style === 'alexandria') {
        addStepped({ x: 0, y: 0.20, z0: acropH, w: 0.72, d: 0.72, h: 0.26, tiers: 3, stairs: true });
        addPrism({ x: 0, y: 0.20, z0: acropH + 0.26, w: 0.36, d: 0.36, h: 0.66, windows: 5, portal: true, highlightWhite: true });
        addPrism({ x: 0, y: 0.20, z0: acropH + 0.92, w: 0.24, d: 0.24, h: 0.48, sides: 8, windows: 3, highlightWhite: true });
        addDome({ x: 0, y: 0.20, z0: acropH + 1.40, r: 0.11, drumH: 0.05, domeH: 0.16 });
        items.push({ kind: 'octahedron', x: 0, y: 0.20, z0: acropH + 1.82, r: 0.15 });
        for (const sx of [-0.78, 0.78]) {
          addPrism({ x: sx, y: 0.22, z0: 0.08, w: 0.44, d: 0.36, h: 0.32, windows: 2, portal: true });
          addDome({ x: sx, y: 0.22, z0: 0.40, r: 0.18, drumH: 0.14, domeH: 0.24 });
          addPortico(sx, 0.01, 0.34, 0.08, 0.08, 0.26, 6);
        }
        addHillsideUrbanBlocks(48, 'hermetic');

      } else if (style === 'gothic_cathedral') {
        // Prague Cathedral + Alagadda Twisted Ambassador Tower!
        addPrism({ x: -0.18, y: 0.22, z0: acropH, w: 0.34, d: 0.74, h: 0.56, windows: 4, portal: true, roseWindow: true, roof: 'gable', roofH: 0.24, highlightWhite: true });
        for (const dx of [-0.15, 0.15]) {
          addPrism({ x: -0.18 + dx, y: -0.14, z0: acropH, w: 0.14, d: 0.14, h: 0.90, windows: 5, portal: true, highlightWhite: true });
          addPrism({ x: -0.18 + dx, y: -0.14, z0: acropH + 0.90, w: 0.10, d: 0.10, h: 0.16, sides: 8, roof: 'spire', roofH: 0.52, highlightWhite: true });
        }
        for (let b = 0; b < 4; b++) {
          const by = 0.04 + b * 0.17;
          for (const dir of [-1, 1]) items.push({ kind: 'buttress', x1: -0.18 + dir * 0.28, y1: by, z1: acropH + 0.32, x2: -0.18 + dir * 0.17, y2: by, z2: acropH + 0.52, lod: 1 });
        }
        // Alagadda Ambassador Spire (SCP-2264)
        addPrism({ x: 0.52, y: 0.32, z0: acropH, w: 0.20, d: 0.20, h: 1.25, sides: 6, tiltX: 0.12, windows: 6, clockFace: true, roof: 'spire', roofH: 0.45, highlightWhite: true });
        addHillsideUrbanBlocks(48, 'gothic');

      } else if (style === 'cairo') {
        addStepped({ x: -0.38, y: 0.26, z0: acropH, w: 0.82, d: 0.82, h: 0.88, tiers: 7, stairs: true, whiteCap: true });
        addStepped({ x: 0.38, y: 0.34, z0: acropH, w: 0.68, d: 0.68, h: 0.74, tiers: 6, stairs: true, whiteCap: true });
        // Amoni-Ram Mekhanite Brass/Blueprint Gear Dome
        addDome({ x: 0.92, y: 0.05, z0: 0.06, r: 0.22, drumH: 0.24, domeH: 0.26 });
        addHillsideUrbanBlocks(40, 'hermetic');

      } else if (style === 'elder') {
        items.push({ kind: 'star_tower', x: 0, y: 0.18, z0: acropH, r: 0.30, h: 1.62, tiers: 7 });
        const rt = [];
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI * 0.5, tx = Math.cos(a) * 0.88, ty = 0.18 + Math.sin(a) * 0.82;
          rt.push({ x: tx, y: ty });
          items.push({ kind: 'star_tower', x: tx, y: ty, z0: 0.04, r: 0.20, h: 1.15, tiers: 5 });
          addArch({ x1: 0, y1: 0.18, x2: tx, y2: ty, zBase: 0.78, h: 0.08, arches: 3, lod: 1 });
        }
        addHillsideUrbanBlocks(36, 'abyss');

      } else if (style === 'pagoda') {
        items.push({ kind: 'pagoda', x: 0, y: 0.20, z0: acropH, w: 0.44, stories: 7, storyH: 0.19 });
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI * 0.25;
          const px = Math.cos(a) * 0.88, py = 0.20 + Math.sin(a) * 0.78;
          if (py < -0.22 && py > -0.68) continue;
          items.push({ kind: 'pagoda', x: px, y: py, z0: zGround(px, py), w: 0.26, stories: 3, storyH: 0.16 });
        }
        addHillsideUrbanBlocks(44, 'hermetic');

      } else if (style === 'leng') {
        // Leng Double-Ring Gate + SCP-2317's 7 Pillars & Chains (6 Broken, 1 Taut Glowing Chain!)
        items.push({ kind: 'ring_gate', x: 0, y: 0.32, z0: acropH, r: 0.64 });
        items.push({ kind: 'scp2317_chains', x: 0, y: -0.62, z0: 0.02, r: 0.42 });
        for (const sx of [-0.85, 0.85]) addPrism({ x: sx, y: 0.28, z0: 0.08, w: 0.36, d: 0.42, h: 0.66, tiltX: -sx * 0.08, windows: 2, portal: true });
        addHillsideUrbanBlocks(32, 'abyss');

      } else {
        // Arkham & Innsmouth
        addPrism({ x: 0, y: 0.22, z0: acropH, w: 0.36, d: 0.50, h: 0.52, windows: 3, portal: true, roseWindow: true, roof: 'gable', roofH: 0.22, highlightWhite: true });
        addPrism({ x: 0, y: -0.06, z0: acropH, w: 0.16, d: 0.16, h: 1.08, windows: 5, clockFace: true, roof: 'spire', roofH: 0.46, highlightWhite: true });
        for (let s = 0; s < 6; s++) {
          const a = (s / 6) * Math.PI * 2 + 0.4, r = 1.05;
          const bx = Math.cos(a) * r, by = Math.sin(a) * r;
          if (by < -0.22 && by > -0.68) continue;
          addPrism({ x: bx, y: by, z0: 0, w: 0.15, d: 0.15, h: 0.75, sides: 6, tiltX: 0.10, windows: 4, roof: 'spire', roofH: 0.35 });
          if (s % 2 === 0) items.push({ kind: 'tentacle_coil', x: bx, y: by, r: 0.12, h: 0.9, phase: s });
        }
        addHillsideUrbanBlocks(46, 'gothic');
      }

      city.structures = items;
      city.crowdPaths = paths;
    }

    

    // Continental Secondary Towns & Planetary Pilgrim/MTF Routes
    export const MINOR_TOWNS = [
      [41.9,12.5],[37.9,23.7],[48.8,2.3],[40.4,-3.7],[41.0,28.9],[52.5,13.4],[59.9,30.3],[55.7,37.6],
      [33.3,44.4],[35.7,51.4],[31.7,35.2],[39.6,66.9],[28.6,77.2],[19.0,72.8],[13.7,100.5],[39.9,116.4],
      [34.3,108.9],[31.2,121.5],[23.1,113.2],[37.5,127.0],[35.0,135.7],[-6.2,106.8],[14.6,121.0],
      [15.6,32.5],[9.0,38.7],[16.7,-3.0],[6.5,3.4],[-1.3,36.8],[-33.9,18.4],[40.7,-74.0],[38.9,-77.0],
      [41.8,-87.6],[29.9,-90.0],[37.7,-122.4],[4.7,-74.0],[-12.0,-77.0],[-13.5,-71.9],[-22.9,-43.1],
      [-34.6,-58.4],[-33.8,151.2],[-37.8,144.9],[-41.3,174.7],[51.5,-0.12],[19.4,-99.1],[28.5,-42.5]
    ];

    export const MACRO_ROUTES = [
      ['alexandria', 'gate001'], ['alexandria', 'prague'], ['gate001', 'leng'], ['leng', 'baikal'],
      ['baikal', 'penglai'], ['prague', 'arkham'], ['arkham', 'site2000'], ['site2000', 'site13'],
      ['alexandria', 'cairo'], ['rlyeh', 'penglai'], ['rlyeh', 'antarctica']
    ];

    export const MARITIME_ROUTES = [
      [[31.2, 29.9], [36.5, 15.0], [36.0, -5.5], [42.6, -70.7]],
      [[-47.1, -126.7], [-25.0, -105.0], [8.0, -82.0]],
      [[-47.1, -126.7], [-32.0, 165.0], [18.0, 138.0], [33.8, 136.5]],
      [[12.0, 88.0], [-5.0, 82.0], [-35.0, 76.0], [-72.0, 72.0]],
      [[29.9, 32.5], [14.0, 43.0], [12.0, 62.0], [26.0, 56.0], [30.5, 48.0]]
    ];

    export const ORBITAL_SATS = [
      { code: 'AIC-SAT-I', inc: 0.62, asc: 0.4, speed: 0.22, alt: 1.22 },
      { code: 'SRA-ORB-II', inc: -0.78, asc: 2.3, speed: -0.18, alt: 1.27 },
      { code: 'O5-EYE-III', inc: 1.12, asc: 4.1, speed: 0.15, alt: 1.31 }
    ];

    // =========================================================================
    // 5. STATE & CAMERA GEOMETRY
    // =========================================================================
    
