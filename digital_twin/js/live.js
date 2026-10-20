/* live.js — read-only live feed from the FireBomba MQTT broker.
 *
 * The browser subscribes to the same sensor topics the Raspberry Pi bridge
 * listens to, over MQTT-on-WebSocket. It NEVER publishes: Live mode cannot
 * trigger a pump or raise an alert on the real system.
 *
 * Mapping: the room id in the topic is the database room_id, and each cell of
 * the active layout (see layout.js / sim.js) carries the room_id it shows. The
 * ruai and tanju are single communal spaces, so one reading covers every bay
 * of that place.
 *
 * Set the broker address in BROKER_URL below, or open the page with
 * ?broker=ws://<host>:9001 to override it for one session.
 */
var FB = FB || {};

(function (FB) {
  "use strict";

  var PLACEHOLDER = "ws://[pi-ipaddress]:9001";
  var BROKER_URL = PLACEHOLDER;                 // TODO: set to the Pi's address
  /* Read-only broker account (ACL: read firebomba/room/+/sensor-data only).
   * Visible to anyone who opens the page, so never reuse a device login here.
   * Override per session with ?user=...&pass=... */
  var MQTT_USER = "firebomba";
  var MQTT_PASS = "";                           // set locally, or open with ?pass=...
  var TOPIC = "firebomba/room/+/sensor-data";
  var TOPIC_RE = /^firebomba\/room\/(\d+)\/sensor-data$/;
  var STALE_MS = 15000;                         // sensors publish every 5 s

  var latest = {};            // room_id -> { r: reading, at: ms }
  var status = "idle";        // idle | setup | connecting | connected | offline
  var client = null, listener = null, lastAt = 0;

  function setStatus(s) {
    status = s;
    if (listener) listener(s);
  }

  /* Turn one MQTT message into { key: room_id, reading }, or null if it must be ignored. */
  function parse(topic, payload) {
    var m = TOPIC_RE.exec(topic);
    if (!m) return null;
    var key = +m[1];
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

  /* Latest non-stale reading for a cell, or null. */
  function readingFor(cell, now) {
    if (cell.roomId == null) return null;
    var e = latest[cell.roomId];
    if (!e || now - e.at > STALE_MS) return null;
    return e.r;
  }

  /* Rooms with a fresh reading; with `ids`, only those room ids are counted. */
  function liveCount(now, ids) {
    var n = 0;
    (ids || Object.keys(latest)).forEach(function (k) {
      if (latest[k] && now - latest[k].at <= STALE_MS) n++;
    });
    return n;
  }

  function brokerUrl() {
    var q = null;
    try { q = new URLSearchParams(window.location.search).get("broker"); } catch (e) {}
    return q || BROKER_URL;
  }

  function credentials() {
    var u = MQTT_USER, p = MQTT_PASS;
    try {
      var qs = new URLSearchParams(window.location.search);
      if (qs.get("user") !== null) u = qs.get("user");
      if (qs.get("pass") !== null) p = qs.get("pass");
    } catch (e) {}
    return { username: u, password: p };
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
    var cred = credentials();
    client = mqtt.connect(url, {
      clientId: "firebomba-twin-live-" + Math.random().toString(16).slice(2, 8),
      username: cred.username || undefined,
      password: cred.password || undefined,
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
