const supabase = require("../config/supabase");

// Profile pictures live in a private Supabase Storage bucket, one file per
// user named after their id, so no database column is needed. The app only
// ever gets a short-lived signed URL.
const BUCKET = "avatars";
const SIGNED_URL_SECONDS = 60 * 60 * 24; // 1 day
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png"];

// No extension: the stored content type says whether it is JPEG or PNG.
const pathFor = (userId) => String(userId);

// Created on first use so a fresh Supabase project needs no manual setup.
let bucketReady = null;
const ensureBucket = () => {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data } = await supabase.storage.getBucket(BUCKET);
      if (data) return;

      const { error } = await supabase.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: ALLOWED_TYPES,
      });
      // Another request may have created it in the meantime.
      if (error && !/already exists/i.test(error.message)) throw error;
    })().catch((error) => {
      bucketReady = null;
      throw error;
    });
  }
  return bucketReady;
};

// Signed URL for the user's picture, or null when they have not set one.
exports.getUrl = async (userId) => {
  await ensureBucket();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(pathFor(userId), SIGNED_URL_SECONDS);

  if (error) {
    if (/not found/i.test(error.message)) return null;
    throw error;
  }

  return data.signedUrl;
};

exports.upload = async (userId, buffer, mimeType) => {
  await ensureBucket();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(pathFor(userId), buffer, { contentType: mimeType, upsert: true });

  if (error) throw error;

  return exports.getUrl(userId);
};

exports.MAX_BYTES = MAX_BYTES;
exports.ALLOWED_TYPES = ALLOWED_TYPES;
