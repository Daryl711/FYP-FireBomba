/* live.js — read-only live feed from the FireBomba MQTT broker.
 *
 * The browser subscribes to the same sensor topics the Raspberry Pi bridge
 * listens to, over MQTT-on-WebSocket. It NEVER publishes: Live mode cannot
 * trigger a pump or raise an alert on the real system.
 *
 * Mapping: topic room ids follow bridge/publisher.py's CELL_TO_ROOM. Bilik
 * rooms are 1-18, the ruai is 19 and the tanju is 20. The ruai and tanju are
 * single communal spaces, so one reading covers every bay of that place.
 *
 * Set the broker address in BROKER_URL below, or open the page with
 * ?broker=ws://<host>:9001 to override it for one session.
 */
var FB = FB || {};

(function (FB) {
  "use strict";

  var PLACEHOLDER = "ws://[pi-ipaddress]:9001";
  var BROKER_URL = PLACEHOLDER;                 // TODO: set to the Pi's address
  var TOPIC = "firebomba/room/+/sensor-data";
  var TOPIC_RE = /^firebomba\/room\/(\d+)\/sensor-data$/;
  var STALE_MS = 15000;                         // sensors publish every 5 s

  /* ---- room id -> twin key. A key is a bilik cell id, "ruai" or "tanju". */
  var ROOM_TO_KEY = {};
  (function () {
    var kinds = ["dapur", "tidur", "ruang"], n = 1, k, i;
    for (k = 0; k < 6; k++) {
      for (i = 0; i < 3; i++) ROOM_TO_KEY[n++] = "b" + k + "-" + kinds[i];
    }
    ROOM_TO_KEY[19] = "ruai";
    ROOM_TO_KEY[20] = "tanju";
  })();

  var latest = {};            // key -> { r: reading, at: ms }
  var status = "idle";        // idle | setup | connecting | connected | offline
  var client = null, listener = null, lastAt = 0;

  function setStatus(s) {
    status = s;
    if (listener) listener(s);
  }

  /* Turn one MQTT message into { key, reading }, or null if it must be ignored. */
  function parse(topic, payload) {
    var m = TOPIC_RE.exec(topic);
    if (!m) return null;
    var key = ROOM_TO_KEY[+m[1]];
    if (!key) return null;
    var d;
    try { d = JSON.parse(payload); } catch (e) { return null; }
    if (!d || typeof d !== "object") return null;
    if (d.source === "sim") return null;          // never mix in simulated data

    var t = Number(d.temperature), s = Number(d.smoke), c = Number(d.co);
    if (!isFinite(t)) return null;
    return {
      key: key,
      reading: {
        temp: t,
        smoke: isFinite(s) ? s : 0,
        co: isFinite(c) ? c : 0,
        flame: d.flame_detected === true || d.flame_detected === 1
      }
    };
  }

  function keyOf(cell) {
    return (cell.kind === "ruai" || cell.kind === "tanju") ? cell.place : cell.id;
  }

  /* Latest non-stale reading for a cell, or null. */
  function readingFor(cell, now) {
    var e = latest[keyOf(cell)];
    if (!e || now - e.at > STALE_MS) return null;
    return e.r;
  }

  function liveCount(now) {
    var n = 0;
    Object.keys(latest).forEach(function (k) {
      if (now - latest[k].at <= STALE_MS) n++;
    });
    return n;
  }

  function brokerUrl() {
    var q = null;
    try { q = new URLSearchParams(window.location.search).get("broker"); } catch (e) {}
    return q || BROKER_URL;
  }

  function ingest(topic, payload, now) {
    var p = parse(topic, payload);
    if (!p) return false;
    latest[p.key] = { r: p.reading, at: now };
    lastAt = now;
    return true;
  }

  function connect() {
    var url = brokerUrl();
    if (url === PLACEHOLDER) { setStatus("setup"); return; }
    if (typeof mqtt === "undefined") { setStatus("offline"); return; }
    if (client) return;

    setStatus("connecting");
    client = mqtt.connect(url, {
      clientId: "firebomba-twin-live-" + Math.random().toString(16).slice(2, 8),
      reconnectPeriod: 3000,
      connectTimeout: 8000,
      clean: true
    });
    client.on("connect", function () {
      /* subscribe only: this page has no publish path */
      client.subscribe(TOPIC, { qos: 0 }, function (err) {
        setStatus(err ? "offline" : "connected");
      });
    });
    client.on("message", function (topic, buf) {
      ingest(topic, buf.toString(), Date.now());
    });
    client.on("reconnect", function () { setStatus("connecting"); });
    client.on("offline", function () { setStatus("offline"); });
    client.on("close", function () { if (client) setStatus("offline"); });
    client.on("error", function () { setStatus("offline"); });
  }

  function disconnect() {
    var c = client;
    client = null;
    if (c) c.end(true);
    latest = {};
    setStatus("idle");
  }

  FB.Live = {
    connect: connect,
    disconnect: disconnect,
    readingFor: readingFor,
    liveCount: liveCount,
    status: function () { return status; },
    brokerUrl: brokerUrl,
    lastAt: function () { return lastAt; },
    onStatus: function (fn) { listener = fn; },
    PLACEHOLDER: PLACEHOLDER,
    /* exposed for testing */
    _parse: parse, _ingest: ingest, _reset: function () { latest = {}; lastAt = 0; }
  };

})(FB);

if (typeof module !== "undefined") module.exports = FB.Live;
