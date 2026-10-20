/* render2d.js — detailed floor plan of ONE place at a time.
 *
 * The user picks a place (a bilik, the ruai, or the tanju) and the canvas
 * draws just that, large enough to show walls, doors, windows and fixtures the
 * way an apartment plan does.
 *
 * Because zooming into one place loses sight of the rest of the building, an
 * overview strip along the bottom shows every place at a glance with its fire
 * state, and doubles as a selector.
 *
 * Geometry is drawn in metres through a translate+scale transform; text is
 * drawn in screen space so labels stay legible at any zoom.
 */
var FB = FB || {};

(function (FB) {
  "use strict";

  var C = null, ctx = null;
  var PAD_X = 96, PAD_TOP = 100, PAD_BOT = 158;   // room for strip + scale bar
  var WALL_T = 0.24;
  var INK = "#15120F";
  var FIX_S = "rgba(255,241,233,0.26)";
  var FIX_F = "rgba(255,241,233,0.075)";

  var stripBoxes = [];      // hit areas for the overview strip

  function init(canvas) {
    C = canvas;
    ctx = canvas.getContext("2d");
  }

  /* Fit the selected place's bounding box into the canvas. */
  function layout(place) {
    var W = C.clientWidth, H = C.clientHeight;
    var availW = W - PAD_X * 2, availH = H - PAD_TOP - PAD_BOT;
    var s = Math.min(availW / place.w, availH / place.h);
    return {
      s: s, W: W, H: H, place: place,
      ox: (W - place.w * s) / 2 - place.x * s,
      oy: PAD_TOP + (availH - place.h * s) / 2 - place.y * s
    };
  }

  function heatColor(c) {
    var cfg = FB.config;
    if (c.state === "burnt") return "#241F1C";
    if (c.state === "suppressed") return "#17403A";
    var t = Math.max(0, Math.min(1, (c.temp - cfg.AMBIENT) / (900 - cfg.AMBIENT)));
    if (t < 0.02) {
      return c.kind === "tanju" ? "#231E19" : (c.kind === "ruai" ? "#272019" : "#2C261E");
    }
    var stops = [[44, 38, 30], [120, 52, 22], [200, 80, 20], [235, 120, 24], [252, 186, 70]];
    var p = t * (stops.length - 1),
        i = Math.min(stops.length - 2, Math.floor(p)),
        f = p - i, a = stops[i], b = stops[i + 1];
    return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * f) + "," +
                    Math.round(a[1] + (b[1] - a[1]) * f) + "," +
                    Math.round(a[2] + (b[2] - a[2]) * f) + ")";
  }

  /* ------------------------------------------------------------- floors */
  function drawFloor(c, lw) {
    ctx.fillStyle = heatColor(c);
    ctx.fillRect(c.x, c.y, c.w, c.h);

    ctx.save();
    ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip();
    ctx.strokeStyle = "rgba(255,240,228,0.05)";
    ctx.lineWidth = lw(1);
    for (var g = c.y + 0.6; g < c.y + c.h; g += 0.6) {
      ctx.beginPath(); ctx.moveTo(c.x, g); ctx.lineTo(c.x + c.w, g); ctx.stroke();
    }
    ctx.restore();

    if (c.smoke > 2) {
      ctx.fillStyle = "rgba(188,188,188," + Math.min(0.46, c.smoke / 200) + ")";
      ctx.fillRect(c.x, c.y, c.w, c.h);
    }
    if (c.noData) {                       // Live mode, no fresh reading
      ctx.fillStyle = "rgba(7,6,6,0.55)";
      ctx.fillRect(c.x, c.y, c.w, c.h);
    }
    if (c.state === "burning") {
      var cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      var g2 = ctx.createRadialGradient(cx, cy, 0.2, cx, cy, Math.max(c.w, c.h) * 0.8);
      g2.addColorStop(0, "rgba(255,176,48,0.5)");
      g2.addColorStop(1, "rgba(255,90,0,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(c.x - c.w * 0.3, c.y - c.h * 0.3, c.w * 1.6, c.h * 1.6);
    }
  }

  /* A communal place (ruai, tanju) is one continuous floor. The cells underneath
     still carry the heat, so their colours are blended along the length. */
  function drawCommunalFloor(cells, place, lw) {
    var cs = cells.slice().sort(function (a, b) { return a.x - b.x; });
    var fill = ctx.createLinearGradient(place.x, 0, place.x + place.w, 0);
    var smoke = ctx.createLinearGradient(place.x, 0, place.x + place.w, 0);
    cs.forEach(function (c) {
      var at = Math.max(0, Math.min(1, (c.x + c.w / 2 - place.x) / place.w));
      fill.addColorStop(at, heatColor(c));
      smoke.addColorStop(at, "rgba(188,188,188," + (c.smoke > 2 ? Math.min(0.46, c.smoke / 200) : 0) + ")");
    });
    ctx.fillStyle = fill;
    ctx.fillRect(place.x, place.y, place.w, place.h);

    ctx.save();
    ctx.beginPath(); ctx.rect(place.x, place.y, place.w, place.h); ctx.clip();
    ctx.strokeStyle = "rgba(255,240,228,0.05)";
    ctx.lineWidth = lw(1);
    for (var g = place.y + 0.6; g < place.y + place.h; g += 0.6) {
      ctx.beginPath(); ctx.moveTo(place.x, g); ctx.lineTo(place.x + place.w, g); ctx.stroke();
    }
    ctx.fillStyle = smoke;
    ctx.fillRect(place.x, place.y, place.w, place.h);
    if (cs.every(function (c) { return c.noData; })) {    // Live mode, no reading
      ctx.fillStyle = "rgba(7,6,6,0.55)";
      ctx.fillRect(place.x, place.y, place.w, place.h);
    }
    cs.forEach(function (c) {
      if (c.state !== "burning") return;
      var cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      var g2 = ctx.createRadialGradient(cx, cy, 0.2, cx, cy, Math.max(c.w, c.h) * 0.8);
      g2.addColorStop(0, "rgba(255,176,48,0.5)");
      g2.addColorStop(1, "rgba(255,90,0,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(c.x - c.w * 0.3, c.y - c.h * 0.3, c.w * 1.6, c.h * 1.6);
    });
    ctx.restore();
  }

  /* One bench along the whole ruai, or one set of drying rails across the tanju. */
  function communalFixtures(place, lw) {
    ctx.save();
    ctx.strokeStyle = FIX_S;
    ctx.fillStyle = FIX_F;
    ctx.lineWidth = lw(1.4);
    if (place.kind === "ruai") {
      ctx.fillRect(place.x + 0.4, place.y + 0.45, place.w - 0.8, 0.62);
      ctx.strokeRect(place.x + 0.4, place.y + 0.45, place.w - 0.8, 0.62);
    } else {
      for (var d = 0; d < 3; d++) {
        var ry = place.y + 0.9 + d * 0.9;
        ctx.beginPath(); ctx.moveTo(place.x + 0.4, ry); ctx.lineTo(place.x + place.w - 0.4, ry); ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------- fixtures */
  function fixturesFor(c, lw) {
    ctx.save();
    ctx.strokeStyle = FIX_S;
    ctx.fillStyle = FIX_F;
    ctx.lineWidth = lw(1.4);
    var x = c.x, y = c.y, b;

    if (c.kind === "dapur") {
      /* stove with four burners */
      ctx.fillRect(x + 0.5, y + 0.55, 2.0, 0.9);
      ctx.strokeRect(x + 0.5, y + 0.55, 2.0, 0.9);
      for (b = 0; b < 4; b++) {
        ctx.beginPath();
        ctx.arc(x + 1.0 + (b % 2) * 1.0, y + 0.8 + Math.floor(b / 2) * 0.42, 0.2, 0, 6.2832);
        ctx.stroke();
      }
      /* counter with sink */
      ctx.fillRect(x + 3.0, y + 0.55, 2.4, 0.8);
      ctx.strokeRect(x + 3.0, y + 0.55, 2.4, 0.8);
      ctx.strokeRect(x + 3.5, y + 0.75, 0.8, 0.45);
      /* table and stools */
      ctx.strokeRect(x + 1.8, y + 2.3, 2.3, 1.1);
      ctx.beginPath(); ctx.arc(x + 1.3, y + 2.85, 0.26, 0, 6.2832); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 4.6, y + 2.85, 0.26, 0, 6.2832); ctx.stroke();

    } else if (c.kind === "tidur") {
      /* two beds with pillows */
      [0, 1].forEach(function (i) {
        var by = y + 0.6 + i * 3.4;
        ctx.fillRect(x + 0.5, by, 1.5, 2.6);
        ctx.strokeRect(x + 0.5, by, 1.5, 2.6);
        ctx.strokeRect(x + 0.65, by + 0.15, 1.2, 0.55);     // pillow
        ctx.beginPath();
        ctx.moveTo(x + 0.5, by + 1.2); ctx.lineTo(x + 2.0, by + 1.2);
        ctx.stroke();                                        // turned sheet
      });
      /* wardrobe */
      ctx.fillRect(x + 2.35, y + 0.6, 0.65, 2.2);
      ctx.strokeRect(x + 2.35, y + 0.6, 0.65, 2.2);
      ctx.beginPath();
      ctx.moveTo(x + 2.35, y + 1.7); ctx.lineTo(x + 3.0, y + 1.7);
      ctx.stroke();

    } else if (c.kind === "ruang") {
      /* sofa facing a low cabinet */
      ctx.fillRect(x + 0.35, y + 1.0, 2.1, 0.85);
      ctx.strokeRect(x + 0.35, y + 1.0, 2.1, 0.85);
      ctx.strokeRect(x + 0.5, y + 1.12, 0.85, 0.6);
      ctx.strokeRect(x + 1.45, y + 1.12, 0.85, 0.6);
      ctx.strokeRect(x + 0.6, y + 2.5, 1.6, 0.6);           // coffee table
      ctx.fillRect(x + 0.35, y + 4.4, 2.1, 0.5);            // cabinet
      ctx.strokeRect(x + 0.35, y + 4.4, 2.1, 0.5);
      /* floor mat */
      ctx.save();
      ctx.setLineDash([0.22, 0.18]);
      ctx.strokeRect(x + 0.45, y + 3.3, 1.9, 1.0);
      ctx.restore();

    } else if (c.kind === "ruai") {
      /* floor mats; the bench is drawn once for the whole ruai */
      ctx.save();
      ctx.setLineDash([0.25, 0.2]);
      for (var m = 0; m < Math.max(1, Math.round(c.w / 6)); m++) {
        ctx.strokeRect(c.x + 1.2 + m * 6, y + 2.0, 3.4, 2.1);
      }
      ctx.restore();

    }
    ctx.restore();
  }

  /* -------------------------------------------------------------- walls */
  function wallRect(x, y, w, h) { ctx.fillRect(x, y, w, h); }

  function wallHGap(x0, x1, y, gaps) {
    var segs = [[x0, x1]];
    gaps.forEach(function (g) {
      var next = [];
      segs.forEach(function (s) {
        if (g[1] <= s[0] || g[0] >= s[1]) { next.push(s); return; }
        if (g[0] > s[0]) next.push([s[0], g[0]]);
        if (g[1] < s[1]) next.push([g[1], s[1]]);
      });
      segs = next;
    });
    segs.forEach(function (s) { wallRect(s[0], y - WALL_T / 2, s[1] - s[0], WALL_T); });
  }
  function wallVGap(x, y0, y1, gaps) {
    var segs = [[y0, y1]];
    gaps.forEach(function (g) {
      var next = [];
      segs.forEach(function (s) {
        if (g[1] <= s[0] || g[0] >= s[1]) { next.push(s); return; }
        if (g[0] > s[0]) next.push([s[0], g[0]]);
        if (g[1] < s[1]) next.push([g[1], s[1]]);
      });
      segs = next;
    });
    segs.forEach(function (s) { wallRect(x - WALL_T / 2, s[0], WALL_T, s[1] - s[0]); });
  }

  /* door leaf + swing arc; dir is 'h' or 'v' */
  function door(hx, hy, width, dir, into) {
    ctx.save();
    ctx.strokeStyle = "rgba(230,219,210,0.55)";
    ctx.lineWidth = Math.max(0.04, width * 0.045);
    ctx.beginPath();
    if (dir === "h") {
      ctx.moveTo(hx, hy); ctx.lineTo(hx, hy + into * width);
      ctx.stroke();
      ctx.beginPath();
      if (into > 0) ctx.arc(hx, hy, width, 0, Math.PI / 2);
      else ctx.arc(hx, hy, width, -Math.PI / 2, 0);
    } else {
      ctx.moveTo(hx, hy); ctx.lineTo(hx + into * width, hy);
      ctx.stroke();
      ctx.beginPath();
      if (into > 0) ctx.arc(hx, hy, width, -Math.PI / 2, 0);
      else ctx.arc(hx, hy, width, Math.PI / 2, Math.PI);
    }
    ctx.stroke();
    ctx.restore();
  }

  function windowMark(x0, x1, y, lw) {
    ctx.save();
    ctx.fillStyle = "#0A0908";
    ctx.fillRect(x0, y - WALL_T / 2, x1 - x0, WALL_T);
    ctx.strokeStyle = "rgba(190,205,215,0.6)";
    ctx.lineWidth = lw(1.5);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.restore();
  }

  function drawBilikShell(place, lw) {
    var cfg = FB.config;
    var X = place.x, W = place.w, D = place.h;
    var yK = cfg.BILIK_ROOMS[0].h;          // dapur / living divider, 4 m
    var xT = X + cfg.BILIK_ROOMS[1].w;      // tidur / ruang divider, 3.2 m

    ctx.fillStyle = INK;
    wallHGap(X, X + W, 0, []);                               // back wall
    wallHGap(X, X + W, yK, [[X + 4.0, X + 5.1]]);            // dapur door
    wallVGap(X, 0, D, []);                                   // party walls
    wallVGap(X + W, 0, D, []);
    wallVGap(xT, yK, D, [[yK + 1.6, yK + 2.7]]);             // tidur door
    wallHGap(X, X + W, D, [[X + 4.1, X + 5.3]]);             // out to ruai

    windowMark(X + 1.0, X + 2.3, 0, lw);
    windowMark(X + 3.5, X + 4.8, 0, lw);
    windowMark(X + 0.6, X + 1.9, D, lw);

    door(X + 4.0, yK, 1.1, "h", -1);
    door(xT, yK + 1.6, 1.1, "v", 1);
    door(X + 4.1, D, 1.2, "h", -1);
  }

  function drawRuaiShell(place, lw) {
    var cfg = FB.config;
    var y0 = place.y, y1 = place.y + place.h;
    ctx.fillStyle = INK;
    /* wall to the bilik, broken by one door per family */
    var gaps = [];
    for (var k = 0; k < cfg.BILIK_COUNT; k++) {
      gaps.push([k * cfg.BILIK_W + 4.1, k * cfg.BILIK_W + 5.3]);
    }
    wallHGap(0, cfg.TOTAL_W, y0, gaps);
    wallVGap(0, y0, y1, []);
    wallVGap(cfg.TOTAL_W, y0, y1, []);

    /* the ruai is open to the tanju: posts, no wall */
    ctx.fillStyle = "#1B1612";
    for (var q = 0; q <= cfg.BILIK_COUNT; q++) {
      ctx.beginPath(); ctx.arc(q * cfg.BILIK_W, y1, 0.22, 0, 6.2832); ctx.fill();
    }
    gaps.forEach(function (g) { door(g[0], y0, 1.2, "h", 1); });
  }

  function drawTanjuShell(place, lw) {
    var cfg = FB.config;
    ctx.save();
    ctx.setLineDash([0.55, 0.4]);
    ctx.strokeStyle = "rgba(130,116,106,0.65)";
    ctx.lineWidth = lw(2);
    ctx.strokeRect(0, place.y, cfg.TOTAL_W, place.h);
    ctx.restore();
    ctx.fillStyle = "#1B1612";
    for (var q = 0; q <= cfg.BILIK_COUNT; q++) {
      ctx.beginPath(); ctx.arc(q * cfg.BILIK_W, place.y, 0.22, 0, 6.2832); ctx.fill();
    }
  }

  /* ---------------------------------------------------- screen overlays */
  function px(L, x, y) { return { x: L.ox + x * L.s, y: L.oy + y * L.s }; }

  function roomLabels(cells, L, place, sim) {
    ctx.textAlign = "center";
    if (place.kind !== "bilik") {
      cells = [{
        x: place.x, y: place.y, w: place.w, h: place.h, label: place.label,
        temp: sim.placeStatus(place.id).temp,
        noData: cells.every(function (c) { return c.noData; }),
        unmonitored: cells.every(function (c) { return c.unmonitored; })
      }];
    }
    cells.forEach(function (c) {
      var w = c.w * L.s;
      if (w < 44) return;
      var p = px(L, c.x + c.w / 2, c.y + c.h / 2);
      var hot = c.temp > 170;
      var big = Math.max(10, Math.min(17, w * 0.085));

      ctx.fillStyle = hot ? "rgba(22,14,8,.95)" : "rgba(238,231,226,.9)";
      ctx.font = "600 " + big + "px Inter, sans-serif";
      ctx.fillText(c.label.toUpperCase(), p.x, p.y - 8);

      ctx.fillStyle = hot ? "rgba(22,14,8,.68)" : "rgba(238,231,226,.42)";
      ctx.font = "500 " + (big * 0.66) + "px Inter, sans-serif";
      ctx.fillText((c.w * c.h).toFixed(1) + " m\u00B2", p.x, p.y + 9);

      ctx.fillStyle = hot ? "rgba(22,14,8,.95)" : "rgba(238,231,226,.6)";
      ctx.font = "600 " + (big * 0.78) + 'px "JetBrains Mono", monospace';
      ctx.fillText(c.unmonitored ? "no sensor" : c.noData ? "no data" : Math.round(c.temp) + "\u00B0C", p.x, p.y + 28);
    });
  }

  function sensorMarks(cells, L, t, place) {
    var cfg = FB.config;
    function tripped(c) {
      return c.state === "burning" || c.smoke > cfg.SMOKE_TH || c.temp > cfg.TEMP_TH;
    }
    /* a communal area has a single sensor, centred on the space */
    var marks = place.kind === "bilik" ? cells : [{
      sensors: true, x: place.x + place.w / 2 + 0.7, y: place.y, w: 0, h: place.h
    }];
    var any = cells.some(tripped);
    marks.forEach(function (c) {
      if (!c.sensors) return;
      var p = px(L, c.x + c.w - 0.7, c.y + 0.7);
      var trip = place.kind === "bilik" ? tripped(c) : any;
      ctx.save();
      ctx.strokeStyle = trip ? "#E8312A" : "#2ED08A";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 6.2832); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 5, p.y); ctx.lineTo(p.x + 5, p.y);
      ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x, p.y + 5);
      ctx.stroke();
      if (trip) {
        var ph = (t * 2) % 1;
        ctx.globalAlpha = Math.max(0, 1 - ph);
        ctx.beginPath(); ctx.arc(p.x, p.y, 7 + ph * 9, 0, 6.2832); ctx.stroke();
      }
      ctx.restore();
    });
  }

  function titleBlock(place, sim, L) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.fillStyle = "#F0EAE6";
    ctx.font = "700 20px Inter, sans-serif";
    ctx.fillText(place.label.toUpperCase(), PAD_X - 24, 50);

    ctx.fillStyle = "#8C7E74";
    ctx.font = "500 11.5px Inter, sans-serif";
    var sub = place.sub || "Family unit · dapur, bilik tidur, ruang";
    ctx.fillText(sub, PAD_X - 24, 68);

    /* communal badge */
    if (place.kind !== "bilik") {
      var tw = ctx.measureText(sub).width;
      ctx.fillStyle = "#1E2B22";
      ctx.strokeStyle = "#2E5F46";
      ctx.lineWidth = 1;
      var bx = PAD_X - 24 + tw + 12;
      ctx.fillRect(bx, 57, 74, 15);
      ctx.strokeRect(bx + 0.5, 57.5, 73, 14);
      ctx.fillStyle = "#2ED08A";
      ctx.font = "700 9px Inter, sans-serif";
      ctx.fillText("COMMUNAL", bx + 9, 68);
    }
    ctx.restore();
  }

  function scaleBar(place, L) {
    var o = px(L, place.x, place.y + place.h);
    var metres = place.w > 20 ? 5 : 2;
    var x = o.x, y = o.y + 30, len = metres * L.s;
    ctx.save();
    ctx.strokeStyle = "#8C7E74"; ctx.fillStyle = "#8C7E74"; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + len, y);
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
    ctx.moveTo(x + len, y - 4); ctx.lineTo(x + len, y + 4);
    ctx.stroke();
    ctx.fillRect(x, y - 2.5, len / 2, 5);
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.textAlign = "left";
    ctx.fillText("0", x - 2, y + 16);
    ctx.fillText(metres + " m", x + len - 8, y + 16);
    ctx.restore();
  }

  /* --------------------------------------------------- overview strip */
  function overviewStrip(sim, L, currentPlaceId) {
    var places = sim.places;
    stripBoxes = [];

    var h = 52, gap = 6;
    var totalW = Math.min(L.W - 48, 880);
    var x0 = (L.W - totalW) / 2;
    var y0 = L.H - h - 36;

    /* bilik get equal share, ruai and tanju get a wider band each */
    var units = FB.config.BILIK_COUNT + 4;
    var unitW = (totalW - gap * (places.length - 1)) / units;

    ctx.save();
    ctx.font = "600 10.5px Inter, sans-serif";
    ctx.textAlign = "center";

    var x = x0;
    places.forEach(function (p) {
      var w = (p.kind === "bilik") ? unitW : unitW * 2;
      var st = sim.placeStatus(p.id);
      var active = p.id === currentPlaceId;

      var fill = "#1C1815";
      if (st.state === "burning") fill = "#8A3A12";
      else if (st.state === "burnt") fill = "#2A2420";
      else if (st.state === "suppressed") fill = "#17403A";
      else if (st.temp > FB.config.TEMP_TH) fill = "#4A3118";

      ctx.fillStyle = fill;
      ctx.fillRect(x, y0, w, h);

      ctx.strokeStyle = active ? "#F5F1EF" : "#332C28";
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(x + 0.5, y0 + 0.5, w - 1, h - 1);

      if (p.kind !== "bilik") {
        ctx.fillStyle = "rgba(46,208,138,0.10)";
        ctx.fillRect(x + 1, y0 + 1, w - 2, 3);
      }

      ctx.fillStyle = active ? "#F5F1EF" : "#A89E98";
      ctx.font = "600 11px Inter, sans-serif";
      ctx.fillText(p.short, x + w / 2, y0 + 21);

      ctx.fillStyle = st.involved ? "#F2A09B" : "#6E6560";
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillText(Math.round(st.temp) + "\u00B0", x + w / 2, y0 + 38);

      if (st.state === "burning") {
        ctx.fillStyle = "#FFB037";
        ctx.beginPath();
        ctx.arc(x + w - 9, y0 + 9, 3.2, 0, 6.2832);
        ctx.fill();
      }

      stripBoxes.push({ id: p.id, x: x, y: y0, w: w, h: h });
      x += w + gap;
    });

    ctx.fillStyle = "#5E564F";
    ctx.font = "500 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Whole longhouse — click a place to open its plan", L.W / 2, y0 - 9);
    ctx.restore();
  }

  /* ---------------------------------------------------------------- draw */
  function draw(sim, selected, placeId) {
    var place = sim.placeAt(placeId);
    var cells = sim.cellsOfPlace(placeId);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var L = layout(place);

    if (C.width !== L.W * dpr || C.height !== L.H * dpr) {
      C.width = L.W * dpr; C.height = L.H * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.W, L.H);
    ctx.fillStyle = "#0A0908";
    ctx.fillRect(0, 0, L.W, L.H);

    ctx.save();
    ctx.translate(L.ox, L.oy);
    ctx.scale(L.s, L.s);
    var lw = function (p) { return p / L.s; };

    ctx.fillStyle = "#131110";
    ctx.fillRect(place.x - 0.7, place.y - 0.7, place.w + 1.4, place.h + 1.4);

    if (place.kind === "bilik") cells.forEach(function (c) { drawFloor(c, lw); });
    else drawCommunalFloor(cells, place, lw);
    cells.forEach(function (c) { fixturesFor(c, lw); });
    if (place.kind !== "bilik") communalFixtures(place, lw);

    if (place.kind === "bilik") drawBilikShell(place, lw);
    else if (place.kind === "ruai") drawRuaiShell(place, lw);
    else drawTanjuShell(place, lw);

    /* suppression spray */
    if (sim.pumpOn) {
      ctx.save();
      cells.forEach(function (c) {
        if (c.supp === 0) return;
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = c.supp > 0 ? "#6FB4FF" : "#E8312A";
        ctx.lineWidth = lw(2.2);
        var cx = c.x + c.w / 2, cy = c.y + c.h / 2;
        var rr = Math.min(c.w, c.h) * 0.38, sw = (sim.t * 1.6) % 6.2832;
        ctx.beginPath(); ctx.arc(cx, cy, rr, sw, sw + 1.9); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, rr * 0.62, sw + 2.4, sw + 4.0); ctx.stroke();
      });
      ctx.restore();
    }

    /* selection outline */
    var sel = sim.cellAt(selected);
    if (sel.place === placeId) {
      ctx.save();
      ctx.strokeStyle = "#F5F1EF";
      ctx.lineWidth = lw(2.4);
      ctx.setLineDash([0.5, 0.35]);
      var box = place.kind === "bilik" ? sel : place;     // communal areas select whole
      ctx.strokeRect(box.x + 0.22, box.y + 0.22, box.w - 0.44, box.h - 0.44);
      ctx.restore();
    }
    ctx.restore();

    roomLabels(cells, L, place, sim);
    sensorMarks(cells, L, sim.t, place);
    titleBlock(place, sim, L);
    scaleBar(place, L);
    overviewStrip(sim, L, placeId);
  }

  /* Returns {cell:id} or {place:id} or null. */
  function hitTest(sim, clientX, clientY, placeId) {
    var rect = C.getBoundingClientRect();
    var mx = clientX - rect.left, my = clientY - rect.top;

    for (var s = 0; s < stripBoxes.length; s++) {
      var b = stripBoxes[s];
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        return { place: b.id };
      }
    }
    var place = sim.placeAt(placeId), L = layout(place);
    var wx = (mx - L.ox) / L.s, wy = (my - L.oy) / L.s;
    var cells = sim.cellsOfPlace(placeId);
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (wx >= c.x && wx <= c.x + c.w && wy >= c.y && wy <= c.y + c.h) {
        return { cell: c.id };
      }
    }
    return null;
  }

  FB.Render2D = { init: init, draw: draw, hitTest: hitTest, layout: layout };

})(FB);
