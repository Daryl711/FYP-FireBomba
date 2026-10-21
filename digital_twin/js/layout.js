/* layout.js — floor layout for Live mode, read from the FireBomba backend.
 *
 * GET <API_URL>/api/twin/layout returns the bilik and rooms tables (ids, names
 * and grouping only). Each bilik is drawn with three slots (dapur, bilik tidur,
 * ruang): a database room fills the slot its name suggests, and a slot with no
 * room is drawn as "no sensor". The RUAI and TANJU rows feed the two communal
 * spaces. The result has the shape sim.js's defaultLayout() describes.
 *
 * Set the backend address in API_URL below, or open the page with
 * ?api=http://<host>:3000 to override it for one session.
 */
var FB = FB || {};

(function (FB) {
  "use strict";

  var API_URL = "https://firebomba-mobile-backend.duckdns.org/";
  // var API_URL = "http://localhost:3000";
  var SLOTS = ["dapur", "tidur", "ruang"];
  var FALLBACK_ORDER = ["tidur", "ruang", "dapur"];

  function apiUrl() {
    var q = null;
    try { q = new URLSearchParams(window.location.search).get("api"); } catch (e) {}
    return (q || API_URL).replace(/\/+$/, "");
  }

  /* Which slot a room name belongs in, or null when it says nothing. */
  function slotFor(name) {
    var n = String(name || "").toLowerCase();
    if (/kitchen|dapur|cook/.test(n)) return "dapur";
    if (/bed|tidur|sleep/.test(n)) return "tidur";
    if (/living|ruang|lounge|hall|family/.test(n)) return "ruang";
    return null;
  }

  function byId(a, b) { return a.roomId - b.roomId; }

  /* Turn the API payload into a layout. Throws if there is nothing to draw. */
  function build(data) {
    var bilikRows = (data && data.bilik) || [], rooms = (data && data.rooms) || [];
    if (!bilikRows.length) throw new Error("no bilik in the database");

    var warnings = [], ruai = null, tanju = null;
    var bilik = bilikRows.slice().sort(function (a, b) { return a.bilikId - b.bilikId; })
      .map(function (b, i) {
        var mine = rooms.filter(function (r) {
          return (r.spaceType === "BILIK_ROOM" || r.spaceType === "DAPUR") && r.bilikId === b.bilikId;
        }).sort(byId);
        var slots = {}, spare = [];

        mine.forEach(function (r) {
          var want = r.spaceType === "DAPUR" ? "dapur" : slotFor(r.name);
          if (want && !slots[want]) slots[want] = { roomId: r.roomId, name: r.name };
          else spare.push(r);
        });
        spare.forEach(function (r) {
          var free = FALLBACK_ORDER.filter(function (k) { return !slots[k]; })[0];
          if (free) slots[free] = { roomId: r.roomId, name: r.name };
          else warnings.push(b.bilikNumber + ": room " + r.roomId + " (" + r.name + ") has no free slot");
        });

        return {
          /* numbered by position, so the labels stay 1..N whatever bilik_number says */
          number: "Bilik " + (i + 1),
          short: "B" + (i + 1),
          rooms: { dapur: slots.dapur || null, tidur: slots.tidur || null, ruang: slots.ruang || null }
        };
      });

    rooms.slice().sort(byId).forEach(function (r) {
      if (r.spaceType === "RUAI" && !ruai) ruai = { roomId: r.roomId, name: r.name };
      if (r.spaceType === "TANJU" && !tanju) tanju = { roomId: r.roomId, name: r.name };
    });

    var ids = [];
    bilik.forEach(function (b) {
      SLOTS.forEach(function (k) { if (b.rooms[k]) ids.push(b.rooms[k].roomId); });
    });
    if (ruai) ids.push(ruai.roomId);
    if (tanju) ids.push(tanju.roomId);

    return { source: "database", bilik: bilik, ruai: ruai, tanju: tanju, roomIds: ids, warnings: warnings };
  }

  /* Resolves with a layout, rejects with an Error. */
  function load() {
    var url = apiUrl() + "/api/twin/layout";
    return fetch(url, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("backend answered " + res.status);
      return res.json();
    }).then(build);
  }

  FB.Layout = { load: load, apiUrl: apiUrl, _build: build, _slotFor: slotFor };

})(FB);

if (typeof module !== "undefined") module.exports = FB.Layout;
