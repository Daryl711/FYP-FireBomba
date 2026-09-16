require("dotenv").config();

const fs = require("fs");
const path = require("path");

const resolveCertificatePath = (filePath) => {
  if (!filePath) {
    throw new Error("Missing required AWS IoT certificate path configuration");
  }
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(__dirname, "..", filePath);
};

const rootCertificate = process.env.AWS_IOT_ROOT_CA_PATH;
const clientCertificate = process.env.AWS_IOT_CERTIFICATE_PATH;
const privateKey = process.env.AWS_IOT_PRIVATE_KEY_PATH;

module.exports = {
  host: process.env.AWS_IOT_ENDPOINT,
  port: Number(process.env.AWS_IOT_PORT || 8883),
  protocol: "mqtts",
  clientId: process.env.AWS_IOT_CLIENT_ID || `firebomba-backend-${process.pid}`,
  ca: fs.readFileSync(resolveCertificatePath(rootCertificate)),
  cert: fs.readFileSync(resolveCertificatePath(clientCertificate)),
  key: fs.readFileSync(resolveCertificatePath(privateKey)),
};
