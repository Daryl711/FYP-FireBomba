/* app.js — application shell.
 *
 * Owns the simulation instance and the view state, wires the control panel,
 * draws the comparison chart, and runs the animation loop. Both renderers read
 * the same Sim object, so switching views mid-run does not interrupt anything.
 *
 * Load order matters: sim.js, render2d.js, render3d.js, then this file.
 */
var FB = FB || {};

(function (FB) {
  "use strict";

  var cfg = FB.config;
  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------- state */
  var scenario = {
    ignition: "b2-dapur", fire: "A", nozzle: "direct", wind: 1, system: true
  };
  var sim = new FB.Sim(scenario);
  var base = FB.baseline(scenario);

  var running = false, speed = 1, selected = "b2-dapur", view = "2d", mode = "sim";
  var place = "bilik-2";                  // which place the 2D plan shows
  var layoutNote = "";                    // Live mode: where the layout came from
  var modeToken = 0;                      // drops a layout fetch that lost a mode switch
  var lastFrame = performance.now(), flashUntil = 0, serieT = 0, lastAlert = -1;

  /* ------------------------------------------------------------ helpers */
  function mmss(s) {
    if (s < 0) return "—";
    var m = Math.floor(s / 60), x = Math.floor(s % 60);
    return (m < 10 ? "0" : "") + m + ":" + (x < 10 ? "0" : "") + x;
  }

  /* ------------------------------------------------------------- chart */
  var chart = $("chart"), xc = chart.getContext("2d");

  function drawChart() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = chart.clientWidth, H = chart.clientHeight;
    if (chart.width !== W * dpr || chart.height !== H * dpr) {
      chart.width = W * dpr; chart.height = H * dpr;
    }
    xc.setTransform(dpr, 0, 0, dpr, 0, 0);
    xc.clearRect(0, 0, W, H);

    var pl = 26, pr = 8, pt = 10, pb = 18;
    var iw = W - pl - pr, ih = H - pt - pb, maxV = 24;

    xc.strokeStyle = "#2C2826";
    xc.lineWidth = 1;
    for (var g = 0; g <= 2; g++) {
      var yy = pt + ih - (g / 2) * ih;
      xc.beginPath(); xc.moveTo(pl, yy); xc.lineTo(W - pr, yy); xc.stroke();
      xc.fillStyle = "#6E6560";
      xc.font = '9px "JetBrains Mono", monospace';
      xc.textAlign = "right";
      xc.fillText(Math.round(g / 2 * maxV), pl - 5, yy + 3);
    }

    function line(data, color, dashed) {
      xc.save();
      xc.strokeStyle = color;
      xc.lineWidth = 2;
      if (dashed) xc.setLineDash([4, 3]);
      xc.beginPath();
      for (var i = 0; i < data.length; i++) {
        var X = pl + (data[i].t / cfg.HORIZON) * iw;
        var Y = pt + ih - (Math.min(data[i].v, maxV) / maxV) * ih;
        if (i) xc.lineTo(X, Y); else xc.moveTo(X, Y);
      }
      xc.stroke();
      xc.restore();
    }
    line(base, "#6E6560", true);
    line(sim.series, "#E8312A", false);

    xc.fillStyle = "#6E6560";
    xc.font = '9px "JetBrains Mono", monospace';
    xc.textAlign = "center";
    xc.fillText("0", pl, H - 5);
    xc.fillText("5m", pl + iw / 2, H - 5);
    xc.fillText("10m", W - pr, H - 5);
  }

  /* ---------------------------------------------------------- panel sync */
  function syncTelemetry() {
    var c = sim.cellAt(selected);
    $("telName").textContent = c.name;
    if (c.noData) {
      $("telState").textContent = c.unmonitored ? "NO SENSOR" : "NO DATA";
      $("telState").style.color = "#6E6560";
      $("gT").innerHTML = "—"; $("gS").innerHTML = "—"; $("gC").innerHTML = "—";
      $("gF").textContent = "—"; $("gF").style.color = "#6E6560";
      $("bT").style.width = $("bS").style.width = $("bC").style.width = $("bF").style.width = "0%";
      return;
    }
    $("telState").textContent = c.state.toUpperCase();
    $("telState").style.color =
      c.state === "burning" ? "#E8312A" :
      c.state === "burnt" ? "#6E6560" :
      c.state === "suppressed" ? "#2ED08A" : "#A8A09B";

    $("gT").innerHTML = Math.round(c.temp) + "<span> °C</span>";
    $("gS").innerHTML = Math.round(c.smoke) + "<span> %</span>";
    $("gC").innerHTML = Math.round(c.co) + "<span> ppm</span>";

    var flame = c.state === "burning";
    $("gF").textContent = flame ? "DETECTED" : "Clear";
    $("gF").style.color = flame ? "#E8312A" : "#2ED08A";

    $("bT").style.width = Math.min(100, (c.temp - cfg.AMBIENT) / 8.7) + "%";
    $("bT").style.background = c.temp > cfg.TEMP_TH ? "#E8312A" : "#2ED08A";
    $("bS").style.width = c.smoke + "%";
    $("bS").style.background = c.smoke > cfg.SMOKE_TH ? "#E8312A" : "#4A9BFF";
    $("bC").style.width = Math.min(100, c.co / 3) + "%";
    $("bC").style.background = c.co > 60 ? "#E8312A" : "#F5A623";
    $("bF").style.width = (flame ? 100 : 0) + "%";
    $("bF").style.background = "#E8312A";
  }

  function syncMetrics() {
    var s = sim.stats();
    $("mDet").textContent = mmss(sim.detectT);
    $("mAlert").textContent = mmss(sim.alertT);
    $("mPump").textContent = sim.pumpOn ? mmss(sim.pumpT) : "—";
    $("mRooms").textContent = s.involved + " / " + s.total;
    $("mBilik").textContent = s.bilik + " / " + s.bilikTotal;

    /* time gained = how much later we reach this involvement than the
       no-system baseline. Negative means the system made things worse. */
    var gain = "—", col = "var(--green)";
    if (sim.t > 20) {
      var bt = null;
      for (var i = 0; i < base.length; i++) {
        if (base[i].v >= s.involved) { bt = base[i].t; break; }
      }
      if (bt !== null) {
        var d = sim.t - bt;
        if (d > 2) { gain = "+" + mmss(d); }
        else if (d < -2) { gain = "−" + mmss(-d); col = "var(--red)"; }
        else { gain = "≈ 0:00"; col = "var(--ink-2)"; }
      }
    }
    $("mGain").textContent = gain;
    $("mGain").style.color = col;

    var html = "";
    for (var j = sim.events.length - 1; j >= 0; j--) {
      var e = sim.events[j];
      html += '<div class="ev ' + e.tone + '"><span class="ts">' + mmss(e.t) +
              '</span><span class="tx">' + e.text + "</span></div>";
    }
    $("log").innerHTML = html;
  }

  function syncNotes() {
    var f = FB.FIRE[scenario.fire];
    $("fireNote").className = "note " + f.tone;
    $("fireNote").innerHTML = "<b>" + f.cls + " — " + f.label + ".</b> " + f.note;
  }

  function rebuild() {
    sim = new FB.Sim(scenario);
    base = FB.baseline(scenario);
    running = false;
    serieT = 0;
    lastAlert = -1;
    $("playBtn").textContent = "▶ Run";
    $("playBtn").classList.add("primary");
    buildPlaceBar();
    syncTelemetry();
    syncMetrics();
    drawChart();
  }

  /* ---------------------------------------------------- place selector */
  function buildPlaceBar() {
    var bar = $("places");
    bar.innerHTML = "";
    sim.places.forEach(function (p) {
      var b = document.createElement("button");
      b.textContent = p.short;
      b.dataset.place = p.id;
      if (p.kind !== "bilik") b.className = "communal";
      b.onclick = function () { setPlace(p.id); };
      bar.appendChild(b);
    });
    markPlaceBar();
  }
  function markPlaceBar() {
    var st;
    document.querySelectorAll("#places button").forEach(function (b) {
      b.classList.toggle("on", b.dataset.place === place);
      st = sim.placeStatus(b.dataset.place);
      var dot = b.querySelector(".dot");
      if (st.involved && !dot) {
        dot = document.createElement("span");
        dot.className = "dot";
        b.appendChild(dot);
      } else if (!st.involved && dot) {
        b.removeChild(dot);
      }
    });
  }
  function setPlace(id) {
    place = id;
    markPlaceBar();
    /* keep telemetry on something inside the place being viewed */
    var cs = sim.cellsOfPlace(id);
    if (cs.length && sim.cellAt(selected).place !== id) selected = cs[0].id;
    syncTelemetry();
  }

  /* --------------------------------------------------------- selection */
  function pick(id) {
    selected = id;
    var pc = sim.cellAt(id);
    if (pc.place !== place) { place = pc.place; markPlaceBar(); }
    /* before the clock starts, clicking also moves the ignition point */
    if (mode === "sim" && !running && sim.t === 0) {
      /* ruai and tanju are one communal space: the whole area ignites */
      scenario.ignition = (pc.kind === "ruai" || pc.kind === "tanju") ? pc.place : id;
      rebuild();
    }
    syncTelemetry();
  }

  /* -------------------------------------------------------- live / sim mode */
  var LIVE_TEXT = {
    setup: ["SET BROKER", "No broker address yet. Edit BROKER_URL in js/live.js " +
            "(or open the page with ?broker=ws://host:9001)."],
    connecting: ["CONNECTING", "Connecting to the broker. Showing real sensor data only; nothing is simulated or sent."],
    connected: ["CONNECTED", "Read-only live feed. Cells show real sensor readings; nothing is simulated or sent."],
    offline: ["OFFLINE", "Cannot reach the broker. Check the address, that Mosquitto has a websockets listener, and that the page is not on https."],
    idle: ["", ""]
  };

  function syncLiveStatus() {
    var st = FB.Live.status(), txt = LIVE_TEXT[st] || LIVE_TEXT.idle, now = Date.now();
    $("livePill").className = "livepill " + st;
    $("livePill").textContent = txt[0];
    $("liveNote").className = "note" + (st === "connected" ? " ok" : st === "offline" || st === "setup" ? " danger" : "");
    $("liveNote").textContent = txt[1];
    $("liveBroker").textContent = FB.Live.brokerUrl();
    var ids = monitoredIds();
    $("liveLayout").textContent = layoutNote || "—";
    $("liveRooms").textContent = FB.Live.liveCount(now, ids) + " / " + ids.length;
    var last = FB.Live.lastAt();
    $("liveLast").textContent = last ? Math.round((now - last) / 1000) + " s ago" : "—";
  }

  /* Distinct database room ids shown by the current layout. */
  function monitoredIds() {
    var seen = {}, out = [];
    sim.cells.forEach(function (c) {
      if (c.roomId != null && !seen[c.roomId]) { seen[c.roomId] = 1; out.push(c.roomId); }
    });
    return out;
  }

  /* Make `next` the running sim and point every view at its layout. */
  function adopt(next) {
    sim = next;
    FB.useLayout(sim.layout);
    FB.Render3D.rebuild(sim.cells);
    place = sim.places[0].id;
    var first = sim.cells.filter(function (c) { return !c.unmonitored; })[0] || sim.cells[0];
    selected = first.id;
    buildPlaceBar();
    stageTitle();
    syncTelemetry();
  }

  function stageTitle() {
    if (view === "3d") {
      $("stageTag").textContent = "3D LONGHOUSE · " + cfg.BILIK_COUNT + " BILIK ON STILTS";
    }
  }

  /* Live mode draws the floor plan stored in the database. If the backend
     cannot be reached the default six-bilik plan stays, and the panel says so. */
  function loadLiveLayout() {
    var token = ++modeToken;
    layoutNote = "loading…";
    FB.Layout.load().then(function (layout) {
      if (token !== modeToken || mode !== "live") return;
      var n = layout.bilik.length, r = layout.roomIds.length;
      layoutNote = "Database · " + n + " bilik, " + r + " rooms";
      if (layout.warnings.length) layoutNote += " (" + layout.warnings.length + " skipped)";
      adopt(new FB.Sim({ ignition: "b0-dapur", fire: "A", nozzle: "direct", wind: 1, system: false }, layout));
    }).catch(function (err) {
      if (token !== modeToken || mode !== "live") return;
      layoutNote = "Default plan · " + (err && err.message ? err.message : "backend unreachable");
    });
  }

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    document.body.classList.toggle("live", mode === "live");
    $("mLive").classList.toggle("on", mode === "live");
    $("mSim").classList.toggle("on", mode === "sim");
    if (mode === "live") {
      running = false;
      $("playBtn").textContent = "▶ Run";
      $("playBtn").classList.add("primary");
      FB.Live.onStatus(syncLiveStatus);
      FB.Live.connect();
      loadLiveLayout();
      syncLiveStatus();
    } else {
      modeToken++;                        // abandon any layout still loading
      FB.Live.disconnect();
      adopt(new FB.Sim(scenario));        // default plan again
      var ig = scenario.ignition;
      var home = sim.cells.filter(function (c) { return c.id === ig; })[0] ||
                 sim.cellsOfPlace(ig)[0] || sim.cells[0];
      selected = home.id; place = home.place;
      rebuild();                          // back to a fresh simulation
    }
  }

  /* ------------------------------------------------------------- views */
  function setView(next) {
    if (next === "3d") {
      if (!FB.Render3D.init($("gl"), sim.cells)) {
        $("glmsg").classList.add("show");
        $("v3d").classList.add("on");
        $("v2d").classList.remove("on");
        $("c2d").style.display = "none";
        $("gl").style.display = "none";
        return;
      }
      view = "3d";
      $("v3d").classList.add("on");
      $("v2d").classList.remove("on");
      $("c2d").style.display = "none";
      $("gl").style.display = "block";
      $("cams").classList.add("show");
      $("roofBtn").classList.add("show");
      $("wallBtn").classList.add("show");
      $("places").style.display = "none";
      stageTitle();
      $("hint").textContent = "Drag to orbit · scroll to zoom · click a room to select";
    } else {
      view = "2d";
      $("glmsg").classList.remove("show");
      $("v2d").classList.add("on");
      $("v3d").classList.remove("on");
      $("gl").style.display = "none";
      $("c2d").style.display = "block";
      $("cams").classList.remove("show");
      $("roofBtn").classList.remove("show");
      $("wallBtn").classList.remove("show");
      $("places").style.display = "flex";
      $("stageTag").textContent = "FLOOR PLAN";
      $("hint").textContent = "Click a room to set the ignition point";
    }
  }

  /* ---------------------------------------------------------- controls */
  function group(attr, apply) {
    document.querySelectorAll("[" + attr + "]").forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll("[" + attr + "]").forEach(function (o) {
          o.classList.remove("on", "warn");
        });
        b.classList.add("on");
        apply(b);
      };
    });
  }

  function wireControls() {
    $("playBtn").onclick = function () {
      running = !running;
      this.textContent = running ? "❚❚ Pause" : "▶ Run";
      this.classList.toggle("primary", !running);
    };
    $("resetBtn").onclick = rebuild;
    $("mSim").onclick = function () { setMode("sim"); };
    $("mLive").onclick = function () { setMode("live"); };

    $("sysBtn").onclick = function () {
      scenario.system = !scenario.system;
      this.className = "sysbtn " + (scenario.system ? "on" : "off");
      $("sysTxt").textContent = scenario.system ? "System ON" : "System OFF";
      rebuild();
    };

    group("data-fire", function (b) {
      if (b.dataset.fire !== "A") b.classList.add("warn");
      scenario.fire = b.dataset.fire;
      syncNotes();
      rebuild();
    });
    group("data-sp", function (b) { speed = +b.dataset.sp; });

    $("v2d").onclick = function () { setView("2d"); };
    $("v3d").onclick = function () { setView("3d"); };
    $("glback").onclick = function () { setView("2d"); };

    $("roofBtn").onclick = function () {
      this.classList.toggle("on");
      FB.Render3D.setRoof(this.classList.contains("on"));
    };
    $("wallBtn").onclick = function () {
      this.classList.toggle("on");
      FB.Render3D.setWalls(this.classList.contains("on"));
    };

    document.querySelectorAll("[data-cam]").forEach(function (b) {
      b.onclick = function () { FB.Render3D.setCamera(b.dataset.cam); };
    });

    $("c2d").addEventListener("click", function (e) {
      if (view !== "2d") return;
      var hit = FB.Render2D.hitTest(sim, e.clientX, e.clientY, place);
      if (!hit) return;
      if (hit.place) setPlace(hit.place);
      else if (hit.cell) pick(hit.cell);
    });

    FB.Render3D.attachControls($("gl"), pick, function () { return view === "3d"; });

    window.addEventListener("resize", drawChart);
  }

  /* ------------------------------------------------------------- loop */
  function frame(now) {
    var dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    if (mode === "live") {
      sim.applyLive(function (c) { return FB.Live.readingFor(c, Date.now()); });
      syncLiveStatus();
    } else if (running && sim.t < cfg.HORIZON) {
      var sub = dt * speed, chunks = Math.ceil(sub / 0.12);
      for (var i = 0; i < chunks; i++) sim.step(sub / chunks);

      serieT += sub;
      if (serieT >= 5) {
        serieT = 0;
        sim.series.push({ t: sim.t, v: sim.stats().involved });
        drawChart();
      }
      if (sim.alertT >= 0 && lastAlert !== sim.alertT) {
        lastAlert = sim.alertT;
        flashUntil = now + 900;
      }
    }

    $("clock").textContent = mode === "live" ? "LIVE" : mmss(sim.t);
    $("trackFill").style.width = Math.min(100, (sim.t / cfg.HORIZON) * 100) + "%";
    $("flash").style.opacity =
      now < flashUntil ? (Math.sin(now / 90) * 0.5 + 0.5) * 0.17 : 0;

    if (view === "2d") { FB.Render2D.draw(sim, selected, place); markPlaceBar(); }
    else FB.Render3D.draw(sim, selected);

    syncTelemetry();
    syncMetrics();
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------- boot */
  function start() {
    FB.Render2D.init($("c2d"));
    buildPlaceBar();
    wireControls();
    syncNotes();
    syncTelemetry();
    syncMetrics();
    drawChart();
    setView("2d");
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

})(FB);
