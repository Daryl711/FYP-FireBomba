/* render3d.js — three.js view of the longhouse on stilts.
 *
 * Depends on sim.js for FB.config and on THREE (r128 UMD build, loaded by a
 * script tag in index.html). init() returns false if WebGL is unavailable, and
 * the caller is expected to fall back to the 2D plan.
 *
 * Geometry is built once from the static cell layout; draw(sim, selected) only
 * updates materials and sprite transforms.
 */
var FB = FB || {};

(function (FB) {
  "use strict";

  var PLAT = 3.4;              // platform height above ground, metres

  var canvas, renderer, scene, cam, ray, mouse;
  var tiles = [], fires = [], smokes = [], sprays = [];
  var roofGrp = null, wallGrp = null;
  var ready = false, tried = false;

  var orb = { az: -0.95, el: 0.58, dist: 68, tx: 0, tz: 0 };

  var CAMS = {
    iso:  { az: -0.95, el: 0.58, dist: 68 },
    ruai: { az: -0.05, el: 0.20, dist: 60 },
    end:  { az: -1.57, el: 0.22, dist: 58 },
    top:  { az: -1.57, el: 1.45, dist: 62 }
  };

  /* Soft radial sprite texture, used for fire, smoke and spray. */
  function radialTex(inner, outer) {
    var cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    var x = cv.getContext("2d");
    var g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, inner);
    g.addColorStop(0.45, outer);
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  }

  function buildGround(cfg) {
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({ color: 0x100D0B, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cfg.TOTAL_W / 2, -0.02, cfg.TOTAL_H / 2);
    scene.add(ground);

    var grid = new THREE.GridHelper(260, 65, 0x221D1A, 0x18120F);
    grid.position.set(cfg.TOTAL_W / 2, 0.01, cfg.TOTAL_H / 2);
    scene.add(grid);
  }

  function buildStilts(cfg) {
    var g = new THREE.CylinderGeometry(0.2, 0.24, PLAT, 6);
    var m = new THREE.MeshStandardMaterial({ color: 0x2A221C, roughness: 0.95 });
    for (var sx = 0; sx <= cfg.TOTAL_W + 0.1; sx += cfg.BILIK_W) {
      for (var sz = 0; sz <= cfg.TOTAL_H + 0.1; sz += 5) {
        var st = new THREE.Mesh(g, m);
        st.position.set(sx, PLAT / 2, sz);
        scene.add(st);
      }
    }
    var deck = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.TOTAL_W + 1.2, 0.3, cfg.TOTAL_H + 1.2),
      new THREE.MeshStandardMaterial({ color: 0x2E2620, roughness: 0.95 })
    );
    deck.position.set(cfg.TOTAL_W / 2, PLAT, cfg.TOTAL_H / 2);
    scene.add(deck);
  }

  function buildCells(cells) {
    var fireTex  = radialTex("rgba(255,246,206,1)", "rgba(255,116,18,0.78)");
    var smokeTex = radialTex("rgba(158,158,158,0.5)", "rgba(86,86,86,0.22)");
    var sprayTex = radialTex("rgba(190,225,255,0.85)", "rgba(74,155,255,0.3)");

    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];

      var tile = new THREE.Mesh(
        new THREE.BoxGeometry(c.w * 0.96, 0.26, c.h * 0.96),
        new THREE.MeshStandardMaterial({ color: 0x3B312A, roughness: 0.88, emissive: 0x000000 })
      );
      tile.position.set(c.x + c.w / 2, PLAT + 0.28, c.y + c.h / 2);
      tile.userData.id = c.id;
      scene.add(tile);
      tiles.push(tile);

      var fs = new THREE.Sprite(new THREE.SpriteMaterial({
        map: fireTex, blending: THREE.AdditiveBlending,
        depthWrite: false, transparent: true, opacity: 0
      }));
      fs.position.set(c.x + c.w / 2, PLAT + 2.0, c.y + c.h / 2);
      fs.scale.set(5, 7, 1);
      scene.add(fs); fires.push(fs);

      var sk = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smokeTex, depthWrite: false, transparent: true, opacity: 0
      }));
      sk.position.set(c.x + c.w / 2, PLAT + 8, c.y + c.h / 2);
      sk.scale.set(10, 10, 1);
      scene.add(sk); smokes.push(sk);

      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: sprayTex, blending: THREE.AdditiveBlending,
        depthWrite: false, transparent: true, opacity: 0
      }));
      sp.position.set(c.x + c.w / 2, PLAT + 1.6, c.y + c.h / 2);
      sp.scale.set(6, 3, 1);
      scene.add(sp); sprays.push(sp);
    }
  }

  function buildWalls(cfg) {
    wallGrp = new THREE.Group();
    var mat = new THREE.MeshStandardMaterial({
      color: 0x463A30, roughness: 0.92,
      transparent: true, opacity: 0.55, side: THREE.DoubleSide
    });
    var D = cfg.BILIK_D;                       // enclosed depth, 11 m
    var yK = cfg.BILIK_ROOMS[0].h;             // dapur divider, 4 m
    var xT = cfg.BILIK_ROOMS[1].w;             // tidur divider, 3.2 m

    /* party walls between bilik, plus the two ends */
    for (var k = 0; k <= cfg.BILIK_COUNT; k++) {
      var w = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.1, D), mat);
      w.position.set(k * cfg.BILIK_W, PLAT + 1.7, D / 2);
      wallGrp.add(w);
    }
    /* external back wall */
    var back = new THREE.Mesh(new THREE.BoxGeometry(cfg.TOTAL_W, 3.1, 0.18), mat);
    back.position.set(cfg.TOTAL_W / 2, PLAT + 1.7, 0);
    wallGrp.add(back);

    /* dapur divider and the wall onto the ruai, full length */
    [yK, D].forEach(function (zz) {
      var m2 = new THREE.Mesh(new THREE.BoxGeometry(cfg.TOTAL_W, 3.1, 0.14), mat);
      m2.position.set(cfg.TOTAL_W / 2, PLAT + 1.7, zz);
      wallGrp.add(m2);
    });

    /* internal tidur / ruang partitions */
    for (var b = 0; b < cfg.BILIK_COUNT; b++) {
      var p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.1, D - yK), mat);
      p.position.set(b * cfg.BILIK_W + xT, PLAT + 1.7, yK + (D - yK) / 2);
      wallGrp.add(p);
    }

    /* the ruai is open to the tanju: posts, not a wall */
    var postG = new THREE.CylinderGeometry(0.16, 0.16, 3.0, 6);
    var postM = new THREE.MeshStandardMaterial({ color: 0x3A2F27, roughness: 0.95 });
    for (var q = 0; q <= cfg.BILIK_COUNT; q++) {
      var po = new THREE.Mesh(postG, postM);
      po.position.set(q * cfg.BILIK_W, PLAT + 1.6, cfg.TANJU_Y);
      wallGrp.add(po);
    }
    scene.add(wallGrp);
  }

  function buildRoof(cfg) {
    roofGrp = new THREE.Group();
    var mat = new THREE.MeshStandardMaterial({
      color: 0x241B15, roughness: 0.96,
      transparent: true, opacity: 0.34, side: THREE.DoubleSide
    });
    var rise = 2.6;
    var ROOF_D = cfg.TANJU_Y;
    var slope = Math.sqrt(Math.pow(ROOF_D / 2, 2) + rise * rise);

    var a = new THREE.Mesh(new THREE.BoxGeometry(cfg.TOTAL_W + 2.2, 0.22, slope), mat);
    a.position.set(cfg.TOTAL_W / 2, PLAT + 4.6, ROOF_D * 0.25);
    a.rotation.x = -Math.atan2(rise, ROOF_D / 2);
    roofGrp.add(a);

    var b = new THREE.Mesh(new THREE.BoxGeometry(cfg.TOTAL_W + 2.2, 0.22, slope), mat);
    b.position.set(cfg.TOTAL_W / 2, PLAT + 4.6, ROOF_D * 0.75);
    b.rotation.x = Math.atan2(rise, ROOF_D / 2);
    roofGrp.add(b);

    var ridge = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.TOTAL_W + 2.4, 0.2, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x1C1510, roughness: 1 })
    );
    ridge.position.set(cfg.TOTAL_W / 2, PLAT + 5.9, ROOF_D / 2);
    roofGrp.add(ridge);

    scene.add(roofGrp);
  }

  function init(glCanvas, cells) {
    if (tried) return ready;
    tried = true;
    if (typeof THREE === "undefined") return false;

    canvas = glCanvas;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    } catch (e) {
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;

    var cfg = FB.config;
    orb.tx = cfg.TOTAL_W / 2;
    orb.tz = cfg.TOTAL_H / 2;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070706);
    scene.fog = new THREE.Fog(0x070706, 80, 210);
    cam = new THREE.PerspectiveCamera(42, 1, 0.1, 600);
    ray = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    scene.add(new THREE.AmbientLight(0x443d38, 1.0));
    scene.add(new THREE.HemisphereLight(0x4a6a92, 0x120e0c, 0.6));
    var key = new THREE.DirectionalLight(0xffe9d6, 0.8);
    key.position.set(34, 60, 26);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0x5577aa, 0.35);
    rim.position.set(-30, 24, -20);
    scene.add(rim);

    buildGround(cfg);
    buildStilts(cfg);
    buildCells(cells);
    buildWalls(cfg);
    buildRoof(cfg);

    ready = true;
    return true;
  }

  function applyCam() {
    var x = orb.tx + orb.dist * Math.cos(orb.el) * Math.cos(orb.az);
    var y = Math.max(1.5, orb.dist * Math.sin(orb.el));
    var z = orb.tz + orb.dist * Math.cos(orb.el) * Math.sin(orb.az);
    cam.position.set(x, y, z);
    cam.lookAt(orb.tx, 3.2, orb.tz);
  }

  function draw(sim, selected) {
    if (!ready) return;
    var cfg = FB.config;
    var W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== W || canvas.height !== H) {
      renderer.setSize(W, H, false);
      cam.aspect = W / H || 1;
      cam.updateProjectionMatrix();
    }

    for (var i = 0; i < sim.cells.length; i++) {
      var c = sim.cells[i], m = tiles[i];
      var t = Math.max(0, Math.min(1, (c.temp - cfg.AMBIENT) / (900 - cfg.AMBIENT)));

      if (c.state === "burnt") {
        m.material.color.setHex(0x1A1614);
        m.material.emissive.setRGB(0, 0, 0);
      } else if (c.state === "suppressed") {
        m.material.color.setHex(0x1D4740);
        m.material.emissive.setRGB(0.02, 0.10, 0.08);
      } else {
        m.material.color.setRGB(0.235 + t * 0.60, 0.193 + t * 0.20, 0.165);
        m.material.emissive.setRGB(t * t * 1.0, t * t * 0.28, 0);
      }
      if (c.id === selected) {
        m.material.emissive.r = Math.max(m.material.emissive.r, 0.26);
        m.material.emissive.g = Math.max(m.material.emissive.g, 0.24);
        m.material.emissive.b = Math.max(m.material.emissive.b, 0.24);
      }

      var fo = c.state === "burning" ? Math.min(1, t * 2.0) : 0;
      fires[i].material.opacity = fo;
      if (fo > 0.01) {
        var fk = 1 + Math.sin(sim.t * 7.5 + i * 1.7) * 0.17;
        fires[i].scale.set(5.0 * fk, (5.5 + t * 7) * fk, 1);
        fires[i].position.y = PLAT + 0.4 + (5.5 + t * 7) * 0.5 * fk;
      }

      var so = Math.min(0.6, c.smoke / 160);
      smokes[i].material.opacity = so;
      if (so > 0.02) {
        var rise = 5 + ((sim.t * 0.85 + i * 0.9) % 8);
        smokes[i].position.y = PLAT + 3 + rise;
        smokes[i].scale.set(9 + rise * 0.85, 9 + rise * 0.85, 1);
      }

      var spo = (sim.pumpOn && c.supp > 0) ? Math.min(0.85, c.supp) : 0;
      sprays[i].material.opacity = spo;
      if (spo > 0.02) {
        var pk = 1 + Math.sin(sim.t * 9 + i) * 0.2;
        sprays[i].scale.set(6.5 * pk, 3.2 * pk, 1);
      }
    }

    applyCam();
    renderer.render(scene, cam);
  }

  /* Orbit, zoom and click-to-pick. onPick receives a cell id.
   * Takes the canvas explicitly: 3D initialises lazily, so this runs before
   * init() has assigned the module-level handle. */
  function attachControls(glCanvas, onPick, isActive) {
    if (!canvas) canvas = glCanvas;
    if (!canvas) return;
    var drag = null, moved = 0;

    canvas.addEventListener("pointerdown", function (e) {
      drag = { x: e.clientX, y: e.clientY };
      moved = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      moved += Math.abs(dx) + Math.abs(dy);
      orb.az += dx * 0.006;
      orb.el = Math.max(0.10, Math.min(1.50, orb.el + dy * 0.005));
      drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("pointerup", function () { drag = null; });
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      orb.dist = Math.max(24, Math.min(150, orb.dist + e.deltaY * 0.06));
    }, { passive: false });

    canvas.addEventListener("click", function (e) {
      if (!ready || moved > 6) return;
      if (isActive && !isActive()) return;
      var r = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(mouse, cam);
      var hit = ray.intersectObjects(tiles, false);
      if (hit.length) onPick(hit[0].object.userData.id);
    });
  }

  function setCamera(name) {
    var p = CAMS[name];
    if (!p) return;
    orb.az = p.az; orb.el = p.el; orb.dist = p.dist;
  }
  function setRoof(v) { if (roofGrp) roofGrp.visible = v; }
  function setWalls(v) { if (wallGrp) wallGrp.visible = v; }
  function isReady() { return ready; }

  FB.Render3D = {
    init: init, draw: draw, attachControls: attachControls,
    setCamera: setCamera, setRoof: setRoof, setWalls: setWalls,
    isReady: isReady
  };

})(FB);
