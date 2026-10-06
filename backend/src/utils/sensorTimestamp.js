// The Pi's MySQL datetimes are local Malaysian times without a UTC offset.
// Preserve explicit offsets, but never interpret naive times in the server's TZ.
function parseSensorTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return new Date(NaN);
  const timestamp = value.trim().replace(" ", "T");
  const naiveDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  return new Date(naiveDateTime.test(timestamp) ? `${timestamp}+08:00` : timestamp);
}

module.exports = { parseSensorTimestamp };
