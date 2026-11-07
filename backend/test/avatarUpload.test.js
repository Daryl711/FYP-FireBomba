const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load, plain, response } = require("./helpers/load");

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const GIF = Buffer.from("GIF89a-not-allowed");
const MAX = 5 * 1024 * 1024;

// ---------- Upload checks (settingsController) ----------

function settings({ uploadError = null, url = "https://signed/u1" } = {}) {
  const uploads = [];
  const Avatar = {
    MAX_BYTES: MAX,
    getUrl: async () => url,
    upload: async (userId, buffer, mimeType) => { if (uploadError) throw uploadError; uploads.push([userId, buffer.length, mimeType]); return url; },
  };
  const api = load("controller/settingsController.js", {
    "../models/Room": {}, "../models/Bilik": {}, "../models/SensorReading": {}, "../models/Actuator": {},
    "../models/AlertNotification": {}, "../config/thresholds": {}, "../services/mqttService": { client: {} },
    "../models/auditLog": {}, "../models/Avatar": Avatar, "../models/PushToken": {}, "../services/pushService": {},
  });
  const call = async (name, body) => { const res = response(); await api[name]({ body, user: { userId: "u1" } }, res); return res; };
  return { call, uploads };
}

test("an upload with no image is refused", async () => {
  for (const body of [undefined, {}, { imageBase64: "" }, { imageBase64: 123 }]) {
    const { call, uploads } = settings();
    const res = await call("updateAvatar", body);
    assert.deepEqual([res.code, res.body.error], [400, "No image provided."]);
    assert.equal(uploads.length, 0);
  }
});

test("images over 5 MB are refused with 413; exactly 5 MB is allowed", async () => {
  const over = Buffer.concat([JPEG, Buffer.alloc(MAX - JPEG.length + 1)]);
  const exact = Buffer.concat([JPEG, Buffer.alloc(MAX - JPEG.length)]);
  let { call, uploads } = settings();
  let res = await call("updateAvatar", { imageBase64: over.toString("base64") });
  assert.deepEqual([res.code, res.body.error], [413, "Image is too large (max 5 MB)."]);
  assert.equal(uploads.length, 0);
  ({ call, uploads } = settings());
  res = await call("updateAvatar", { imageBase64: exact.toString("base64") });
  assert.equal(res.code, 200);
});

test("only real JPEG or PNG files are accepted, judged by their content not their name", async () => {
  for (const bytes of [GIF, Buffer.from("hello"), Buffer.from([0xff, 0xd8])]) {
    const { call, uploads } = settings();
    const res = await call("updateAvatar", { imageBase64: bytes.toString("base64") });
    assert.deepEqual([res.code, res.body.error], [415, "Only JPEG or PNG images are allowed."]);
    assert.equal(uploads.length, 0);
  }
});

test("a JPEG or PNG is saved under the user's id with the right type", async () => {
  for (const [bytes, type] of [[JPEG, "image/jpeg"], [PNG, "image/png"]]) {
    const { call, uploads } = settings();
    const res = await call("updateAvatar", { imageBase64: bytes.toString("base64") });
    assert.deepEqual(res.body, { message: "Profile picture updated.", avatarUrl: "https://signed/u1" });
    assert.deepEqual(uploads, [["u1", bytes.length, type]]);
  }
});

test("storage failures return 500, and the current picture can be read back", async () => {
  assert.equal((await settings({ uploadError: new Error("storage down") }).call("updateAvatar", { imageBase64: JPEG.toString("base64") })).code, 500);
  assert.deepEqual((await settings({ url: null }).call("getAvatar")).body, { avatarUrl: null });
});

// ---------- Storage (Avatar model) ----------

function storage({ bucketExists = true, signedUrlError = null } = {}) {
  const log = [];
  const supabase = { storage: {
    getBucket: async (name) => { log.push(["getBucket", name]); return { data: bucketExists ? {} : null }; },
    createBucket: async (name, options) => { log.push(["createBucket", name, plain(options)]); bucketExists = true; return { error: null }; },
    from: (bucket) => ({
      createSignedUrl: async (file, seconds) => { log.push(["sign", bucket, file, seconds]); return signedUrlError ? { error: signedUrlError } : { data: { signedUrl: `https://signed/${file}` } }; },
      upload: async (file, _buffer, options) => { log.push(["upload", bucket, file, plain(options)]); return { error: null }; },
    }),
  } };
  return { Avatar: load("models/Avatar.js", { "../config/supabase": supabase }), log };
}

test("the avatars bucket is made private with the size and type limits, only once", async () => {
  const { Avatar, log } = storage({ bucketExists: false });
  await Avatar.getUrl("u1");
  await Avatar.getUrl("u1");
  assert.deepEqual(log.filter(([kind]) => kind === "createBucket"), [
    ["createBucket", "avatars", { public: false, fileSizeLimit: MAX, allowedMimeTypes: ["image/jpeg", "image/png"] }],
  ]);
  assert.equal(log.filter(([kind]) => kind === "getBucket").length, 1);
});

test("uploads replace the user's single file and return a 1-day signed link", async () => {
  const { Avatar, log } = storage();
  assert.equal(await Avatar.upload("u1", JPEG, "image/jpeg"), "https://signed/u1");
  assert.deepEqual(log.find(([kind]) => kind === "upload"), ["upload", "avatars", "u1", { contentType: "image/jpeg", upsert: true }]);
  assert.deepEqual(log.find(([kind]) => kind === "sign"), ["sign", "avatars", "u1", 86400]);
});

test("a user with no picture gets null, but other storage errors are thrown", async () => {
  assert.equal(await storage({ signedUrlError: new Error("Object not found") }).Avatar.getUrl("u1"), null);
  await assert.rejects(storage({ signedUrlError: new Error("permission denied") }).Avatar.getUrl("u1"), /permission denied/);
});
