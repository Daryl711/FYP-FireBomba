/* sim.js — fire growth, detection and suppression model.
 *
 * JavaScript port of digital-twin/engine/simulation.py. Keep the two in step;
 * SPREAD_K and COOL_K matter most.
 *
 * LAYOUT
 *   Six bilik (family units) along one building. Each bilik is a self-contained
 *   dwelling of three rooms: dapur at the back, then bilik tidur and ruang.
 *
 *   The ruai and the tanju are COMMUNAL. They are not divided per family: the
 *   ruai is one undivided covered corridor running the full 36 m of the
 *   building, and the tanju one open drying platform. They are segmented
 *   internally only so fire can travel along them, and those segments carry a
 *   high edge weight because there is no wall between them. That corridor is
 *   what turns a one-family fire into a whole-longhouse fire.
 */
var FB = FB || {};

(function (FB) {
  "use strict";

  /* ---------------------------------------------------------- constants */
  var BILIK_COUNT = 6;        // default layout; a live layout may differ
  var BILIK_W = 6.0;          // metres across the building
  var BILIK_D = 11.0;         // metres deep (dapur + living rooms)
  var RUAI_D  = 5.0;
  var TANJU_D = 4.0;

  var AMBIENT  = 28;
  var IGNITE_T = 250;
  var SMOKE_TH = 38;
  var TEMP_TH  = 57;
  var ALERT_LAG = 2;
  var PUMP_LAG  = 9;
  var HORIZON   = 600;

  var SPREAD_K = 0.0075;
  var COOL_K   = 0.0065;

  var TOTAL_W = BILIK_COUNT * BILIK_W;              // 36 m
  var TOTAL_H = BILIK_D + RUAI_D + TANJU_D;         // 20 m
  var RUAI_Y  = BILIK_D;
  var TANJU_Y = BILIK_D + RUAI_D;

  /* Room templates inside one bilik, in local metres. */
  var BILIK_ROOMS = [
    { key: "dapur", label: "Dapur",       x: 0.0, y: 0.0, w: 6.0, h: 4.0, fuel: 1.00, couple: 1.00 },
    { key: "tidur", label: "Bilik Tidur", x: 0.0, y: 4.0, w: 3.2, h: 7.0, fuel: 0.88, couple: 0.90 },
    { key: "ruang", label: "Ruang",       x: 3.2, y: 4.0, w: 2.8, h: 7.0, fuel: 0.92, couple: 0.95 }
  ];

  var RUAI_FUEL = 0.72, RUAI_COUPLE = 1.35;
  var TANJU_FUEL = 0.30, TANJU_COUPLE = 0.55;

  /* Edge weight multipliers. An open space conducts far better than a wall. */
  var EDGE = {
    wall: 1.00,       // shared party or partition wall
    door: 1.25,       // doorway between rooms
    open: 2.40,       // no division at all, e.g. along the ruai
    eaves: 0.70       // ruai out to the open tanju
  };

  var FIRE = {
    A: { label: "Timber / ordinary combustible", cls: "Class A",
         growth: 1.00, peak: 780, water: 0.85, tone: "ok",
         note: "Water is the correct agent. Cooling and soaking the fuel works as the prototype assumes." },
    K: { label: "Cooking oil", cls: "Class K / F",
         growth: 1.55, peak: 950, water: -0.65, tone: "danger",
         note: "Water sinks under burning oil, flashes to steam and ejects the oil — a boilover. The pump makes this fire worse." },
    C: { label: "Electrical", cls: "Class C / E",
         growth: 0.80, peak: 700, water: 0.05, tone: "danger",
         note: "Water conducts. Negligible suppression and a live electrocution hazard." }
  };

  var NOZ = {
    direct: { label: "Direct spray", onSource: 1.00, onNeighbour: 0.15,
      note: "All water on the seat of the fire. Fastest knockdown when the agent suits the class." },
    perimeter: { label: "Perimeter containment", onSource: 0.45, onNeighbour: 0.80,
      note: "Client guidance: wet the sides to stop spread rather than attacking the seat." }
  };

  var WIND = [{ mult: 0.75, dir: 0 }, { mult: 1.00, dir: 1 }, { mult: 1.45, dir: 1 }];

  /* ------------------------------------------------------------- layout */
  /* A layout says how many bilik there are and which database room id sits in
     each slot. Slot -> { roomId, name } or null for a slot with no sensor.
       { source, bilik: [{ number, short, rooms: {dapur, tidur, ruang} }],
         ruai: {roomId, name} | null, tanju: {roomId, name} | null }
     The default layout is the six-bilik model the simulation was built on,
     with room ids 1-18 for the bilik, 19 for the ruai and 20 for the tanju. */
  function defaultLayout() {
    var bilik = [], n = 1, k, r;
    for (k = 0; k < BILIK_COUNT; k++) {
      var rooms = {};
      for (r = 0; r < BILIK_ROOMS.length; r++) {
        rooms[BILIK_ROOMS[r].key] = { roomId: n++, name: null };
      }
      bilik.push({ number: "Bilik " + (k + 1), short: "B" + (k + 1), rooms: rooms });
    }
    return {
      source: "default", bilik: bilik,
      ruai: { roomId: 19, name: null }, tanju: { roomId: 20, name: null }
    };
  }

  function layoutWidth(layout) { return layout.bilik.length * BILIK_W; }

  /* ------------------------------------------------------------- places */
  /* A "place" is what the user selects and the 2D plan draws: one bilik, or
     the whole ruai, or the whole tanju. */
  function buildPlaces(layout) {
    var places = [], k, total = layoutWidth(layout);
    for (k = 0; k < layout.bilik.length; k++) {
      places.push({
        id: "bilik-" + k, kind: "bilik", index: k,
        label: layout.bilik[k].number, short: layout.bilik[k].short,
        x: k * BILIK_W, y: 0, w: BILIK_W, h: BILIK_D
      });
    }
    places.push({
      id: "ruai", kind: "ruai", index: -1,
      label: "Ruai", short: "Ruai",
      sub: "Shared covered corridor",
      x: 0, y: RUAI_Y, w: total, h: RUAI_D
    });
    places.push({
      id: "tanju", kind: "tanju", index: -1,
      label: "Tanju", short: "Tanju",
      sub: "Open drying platform",
      x: 0, y: TANJU_Y, w: total, h: TANJU_D
    });
    return places;
  }

  /* -------------------------------------------------------------- cells */
  function makeCell(o) {
    return {
      id: o.id, place: o.place, kind: o.kind, label: o.label, name: o.name,
      x: o.x, y: o.y, w: o.w, h: o.h,
      fuelMax: o.fuel, fuel: o.fuel, couple: o.couple, sensors: o.sensors,
      bilik: o.bilik, roomId: o.roomId == null ? null : o.roomId,
      unmonitored: !o.sensors,
      temp: AMBIENT, smoke: 0, co: 0, state: "safe", supp: 0, nb: []
    };
  }

  function buildCells(layout) {
    var cells = [], byId = {}, k, r, t, count = layout.bilik.length;

    for (k = 0; k < count; k++) {
      for (r = 0; r < BILIK_ROOMS.length; r++) {
        t = BILIK_ROOMS[r];
        var slot = layout.bilik[k].rooms[t.key] || null;
        var label = (slot && slot.name) || t.label;
        var c = makeCell({
          id: "b" + k + "-" + t.key, place: "bilik-" + k, kind: t.key,
          label: label, name: layout.bilik[k].short + " · " + label,
          x: k * BILIK_W + t.x, y: t.y, w: t.w, h: t.h,
          fuel: t.fuel, couple: t.couple, bilik: k,
          sensors: !!slot, roomId: slot ? slot.roomId : null
        });
        cells.push(c); byId[c.id] = c;
      }
    }
    for (k = 0; k < count; k++) {
      var ru = makeCell({
        id: "ruai-" + k, place: "ruai", kind: "ruai",
        label: "Ruai", name: "Ruai · bay " + (k + 1),
        x: k * BILIK_W, y: RUAI_Y, w: BILIK_W, h: RUAI_D,
        fuel: RUAI_FUEL, couple: RUAI_COUPLE, bilik: k,
        sensors: !!layout.ruai, roomId: layout.ruai ? layout.ruai.roomId : null
      });
      cells.push(ru); byId[ru.id] = ru;
    }
    for (k = 0; k < count; k++) {
      var ta = makeCell({
        id: "tanju-" + k, place: "tanju", kind: "tanju",
        label: "Tanju", name: "Tanju · bay " + (k + 1),
        x: k * BILIK_W, y: TANJU_Y, w: BILIK_W, h: TANJU_D,
        fuel: TANJU_FUEL, couple: TANJU_COUPLE, bilik: k,
        sensors: !!layout.tanju, roomId: layout.tanju ? layout.tanju.roomId : null
      });
      cells.push(ta); byId[ta.id] = ta;
    }

    /* explicit adjacency, each edge carrying its own weight */
    function link(a, b, weight) {
      var ca = byId[a], cb = byId[b];
      if (!ca || !cb) return;
      ca.nb.push({ c: cb, k: weight });
      cb.nb.push({ c: ca, k: weight });
    }

    for (k = 0; k < count; k++) {
      /* inside one bilik */
      link("b" + k + "-dapur", "b" + k + "-tidur", EDGE.wall);
      link("b" + k + "-dapur", "b" + k + "-ruang", EDGE.door);
      link("b" + k + "-tidur", "b" + k + "-ruang", EDGE.door);

      /* bilik out to the communal corridor */
      link("b" + k + "-ruang", "ruai-" + k, EDGE.door);
      link("b" + k + "-tidur", "ruai-" + k, EDGE.wall);

      /* party walls to the next bilik along */
      if (k + 1 < count) {
        link("b" + k + "-dapur", "b" + (k + 1) + "-dapur", EDGE.wall);
        link("b" + k + "-ruang", "b" + (k + 1) + "-tidur", EDGE.wall);
      }

      /* the ruai is undivided, so its bays conduct freely */
      if (k + 1 < count) link("ruai-" + k, "ruai-" + (k + 1), EDGE.open);
      if (k + 1 < count) link("tanju-" + k, "tanju-" + (k + 1), EDGE.open);

      link("ruai-" + k, "tanju-" + k, EDGE.eaves);
    }

    return cells;
  }

  /* --------------------------------------------------------- simulation */
  function Sim(cfg, layout) {
    this.cfg = cfg;
    this.layout = layout || defaultLayout();
    this.cells = buildCells(this.layout);
    this.places = buildPlaces(this.layout);
    this.t = 0;
    this.detectT = -1;
    this.alertT = -1;
    this.pumpT = -1;
    this.pumpOn = false;
    this.boil = false;
    this.shock = false;
    this.events = [];
    this.series = [];
    if (cfg.ignition === "ruai" || cfg.ignition === "tanju") {
      /* a communal area is one space: the whole of it catches */
      var area = this.cellsOfPlace(cfg.ignition);
      for (var k = 0; k < area.length; k++) this.ignite(area[k], true, true);
      this.log("red", "Ignition — " + area[0].label + " (whole area)");
    } else {
      this.ignite(this.cellAt(cfg.ignition), true);
    }
  }

  /* Live mode: show real sensor readings instead of running the model. The
     caller supplies getReading(cell) -> {temp, smoke, co, flame} or null. A cell
     with no fresh reading is flagged noData and shown at ambient. */
  Sim.prototype.applyLive = function (getReading) {
    for (var i = 0; i < this.cells.length; i++) {
      var c = this.cells[i], r = getReading(c);
      c.supp = 0;
      if (!r) {
        c.noData = true;
        c.temp = AMBIENT; c.smoke = 0; c.co = 0; c.state = "safe";
        continue;
      }
      c.noData = false;
      c.temp = r.temp; c.smoke = r.smoke; c.co = r.co;
      c.state = r.flame ? "burning" : "safe";
    }
  };

  Sim.prototype.cellAt = function (id) {
    for (var i = 0; i < this.cells.length; i++) {
      if (this.cells[i].id === id) return this.cells[i];
    }
    return this.cells[0];
  };
  Sim.prototype.cellsOfPlace = function (placeId) {
    return this.cells.filter(function (c) { return c.place === placeId; });
  };
  Sim.prototype.placeAt = function (id) {
    for (var i = 0; i < this.places.length; i++) {
      if (this.places[i].id === id) return this.places[i];
    }
    return this.places[0];
  };

  Sim.prototype.log = function (tone, text) {
    this.events.push({ t: this.t, tone: tone, text: text });
    if (this.events.length > 60) this.events.shift();
  };

  Sim.prototype.ignite = function (c, first, quiet) {
    if (c.state !== "safe" || c.fuel <= 0) return;
    c.state = "burning";
    c.temp = Math.max(c.temp, 320);
    if (!quiet) this.log("red", (first ? "Ignition — " : "Fire spread to ") + c.name);
  };

  Sim.prototype.step = function (dt) {
    var f = FIRE[this.cfg.fire],
        nz = NOZ[this.cfg.nozzle],
        wd = WIND[this.cfg.wind],
        cells = this.cells, i, j, c, e;

    for (i = 0; i < cells.length; i++) cells[i].supp = 0;

    if (this.pumpOn) {
      var tgt = null, hot = -1;
      for (i = 0; i < cells.length; i++) {
        if (cells[i].state === "burning" && cells[i].temp > hot) {
          hot = cells[i].temp; tgt = cells[i];
        }
      }
      if (tgt) {
        tgt.supp = f.water * nz.onSource;
        for (j = 0; j < tgt.nb.length; j++) {
          tgt.nb[j].c.supp = f.water * nz.onNeighbour;
        }
        if (f.water < 0 && !this.boil) {
          this.boil = true;
          this.log("red", "BOILOVER — water on burning oil ejected fuel and spread the fire");
          for (j = 0; j < tgt.nb.length; j++) {
            if (Math.random() < 0.75) this.ignite(tgt.nb[j].c);
          }
        }
        if (this.cfg.fire === "C" && !this.shock) {
          this.shock = true;
          this.log("red", "HAZARD — water onto a live electrical fire: shock risk");
        }
      }
    }

    var gains = new Float32Array(cells.length), idx = {};
    for (i = 0; i < cells.length; i++) idx[cells[i].id] = i;
    for (i = 0; i < cells.length; i++) {
      c = cells[i];
      if (c.state !== "burning") continue;
      var boost = (f.water < 0 && c.supp < 0) ? 1.9 : 1.0;
      for (j = 0; j < c.nb.length; j++) {
        e = c.nb[j];
        if (e.c.state !== "safe") continue;
        var k = c.couple * e.c.couple * e.k * SPREAD_K * wd.mult * boost;
        if (wd.dir === 1 && e.c.x > c.x) k *= 1.45;
        gains[idx[e.c.id]] += (c.temp - e.c.temp) * k * (1 - Math.max(0, e.c.supp) * 0.85) * dt;
      }
    }

    for (i = 0; i < cells.length; i++) {
      c = cells[i];
      c.temp += gains[i];
      c.temp += (AMBIENT - c.temp) * COOL_K * dt;

      if (c.state === "burning") {
        var sup = c.supp;
        var bm = sup > 0 ? (1 - sup * 0.92) : (1 + Math.abs(sup) * 1.3);
        var peak = f.peak * (0.55 + c.fuelMax * 0.45);
        c.temp += (peak - c.temp) * 0.085 * f.growth * bm * dt;
        if (sup > 0) c.temp -= sup * 42 * dt;
        c.fuel -= 0.0115 * f.growth * bm * dt;
        c.smoke = Math.min(100, c.smoke + (7.5 * f.growth * bm - (sup > 0 ? sup * 5 : 0)) * dt);
        c.co = Math.min(300, c.co + 5.2 * f.growth * bm * dt);
        if (c.fuel <= 0) {
          c.state = "burnt"; c.fuel = 0;
          this.log("amber", c.name + " burnt out");
        } else if (sup > 0.5 && c.temp < IGNITE_T * 0.72) {
          c.state = "suppressed"; c.smoke *= 0.6;
          this.log("green", "Knocked down — " + c.name);
        }
      } else {
        var bleed = 0;
        for (j = 0; j < c.nb.length; j++) {
          if (c.nb[j].c.smoke > c.smoke) bleed += (c.nb[j].c.smoke - c.smoke) * 0.055;
        }
        c.smoke = Math.min(100, Math.max(0, c.smoke + bleed * dt - 1.1 * dt));
        c.co = Math.max(0, c.co - 1.6 * dt);
        if (c.state === "safe" && c.temp > IGNITE_T && c.fuel > 0) this.ignite(c);
      }
      if (c.temp < AMBIENT) c.temp = AMBIENT;
    }

    if (this.cfg.system) this._detect();
    this.t += dt;
  };

  Sim.prototype._detect = function () {
    var i, c;
    if (this.detectT < 0) {
      for (i = 0; i < this.cells.length; i++) {
        c = this.cells[i];
        if (!c.sensors) continue;
        if (c.state === "burning" || c.smoke > SMOKE_TH || c.temp > TEMP_TH) {
          this.detectT = this.t;
          this.log("amber", "Sensors tripped in " +
                   ((c.kind === "ruai" || c.kind === "tanju") ? c.label : c.name) + " — smoke " +
                   Math.round(c.smoke) + "%, " + Math.round(c.temp) + "°C");
          break;
        }
      }
    }
    if (this.detectT >= 0 && this.alertT < 0 && this.t >= this.detectT + ALERT_LAG) {
      this.alertT = this.t;
      this.log("blue", "Alert pushed to residents and the tuai rumah");
    }
    if (this.alertT >= 0 && !this.pumpOn && this.t >= this.alertT + PUMP_LAG) {
      this.pumpOn = true;
      this.pumpT = this.t;
      this.log("blue", "Water pump engaged — " + NOZ[this.cfg.nozzle].label.toLowerCase());
    }
  };

  Sim.prototype.stats = function () {
    var inv = 0, bil = {}, i, c;
    for (i = 0; i < this.cells.length; i++) {
      c = this.cells[i];
      if (c.state !== "safe") inv++;
      if (c.place.indexOf("bilik-") === 0 && c.state !== "safe") bil[c.bilik] = 1;
    }
    return {
      involved: inv,
      total: this.cells.length,
      bilik: Object.keys(bil).length,
      bilikTotal: this.layout.bilik.length
    };
  };

  /* Worst state across a place, for the overview strip. */
  Sim.prototype.placeStatus = function (placeId) {
    var cs = this.cellsOfPlace(placeId), hot = AMBIENT, st = "safe", any = false;
    for (var i = 0; i < cs.length; i++) {
      if (cs[i].temp > hot) hot = cs[i].temp;
      if (cs[i].state === "burning") { st = "burning"; any = true; }
      else if (cs[i].state === "burnt" && st !== "burning") { st = "burnt"; any = true; }
      else if (cs[i].state === "suppressed" && st === "safe") { st = "suppressed"; any = true; }
    }
    return { temp: hot, state: st, involved: any };
  };

  function baseline(cfg) {
    var b = new Sim({
      ignition: cfg.ignition, fire: cfg.fire,
      nozzle: cfg.nozzle, wind: cfg.wind, system: false
    });
    var out = [], dt = 0.5, t;
    for (t = 0; t <= HORIZON; t += dt) {
      if (t % 5 < dt) out.push({ t: t, v: b.stats().involved });
      b.step(dt);
    }
    return out;
  }

  /* ------------------------------------------------------------ exports */
  FB.config = {
    BILIK_COUNT: BILIK_COUNT, BILIK_W: BILIK_W, BILIK_D: BILIK_D,
    RUAI_D: RUAI_D, TANJU_D: TANJU_D, RUAI_Y: RUAI_Y, TANJU_Y: TANJU_Y,
    BILIK_ROOMS: BILIK_ROOMS,
    AMBIENT: AMBIENT, IGNITE_T: IGNITE_T,
    SMOKE_TH: SMOKE_TH, TEMP_TH: TEMP_TH,
    ALERT_LAG: ALERT_LAG, PUMP_LAG: PUMP_LAG, HORIZON: HORIZON,
    SPREAD_K: SPREAD_K, COOL_K: COOL_K,
    TOTAL_W: TOTAL_W, TOTAL_H: TOTAL_H, EDGE: EDGE
  };
  FB.FIRE = FIRE;
  FB.NOZ = NOZ;
  FB.WIND = WIND;
  FB.buildCells = buildCells;
  FB.buildPlaces = buildPlaces;
  FB.defaultLayout = defaultLayout;
  /* Point the renderers' shared dimensions at a layout. Call before drawing. */
  FB.useLayout = function (layout) {
    FB.config.BILIK_COUNT = layout.bilik.length;
    FB.config.TOTAL_W = layoutWidth(layout);
  };
  FB.Sim = Sim;
  FB.baseline = baseline;

})(FB);
