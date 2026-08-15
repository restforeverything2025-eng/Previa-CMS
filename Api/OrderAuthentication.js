const ORDER_AUTH_VERSION = "v1";
const ORDER_AUTH_KEY_ID = "core-v1";
const ORDER_AUTH_TOLERANCE_MS = 5 * 60 * 1000;
const ORDER_AUTH_SECRET_KEY = "PREVIA_CORE_HMAC_SECRET";

function bytesToHex(byteArray) {
  if (!byteArray) {
    return "";
  }

  const values = Array.isArray(byteArray) ? byteArray : Array.from(byteArray);

  return values
    .map(value => (value & 0xff).toString(16).padStart(2, "0"))
    .join("")
    .toLowerCase();
}

function normalizeSecretValue(secret) {
  return typeof secret === "string" ? secret : "";
}

function getOrderAuthSecret() {
  if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
    const scriptProperties = PropertiesService.getScriptProperties();
    if (scriptProperties && typeof scriptProperties.getProperty === "function") {
      return normalizeSecretValue(scriptProperties.getProperty(ORDER_AUTH_SECRET_KEY));
    }
  }

  return "";
}

function computeOrderAuthSignature(secret, action, timestamp, nonce, payload) {
  const effectiveSecret = normalizeSecretValue(secret);

  if (!effectiveSecret || !action || !timestamp || !nonce || !payload) {
    return "";
  }

  const signingString = [
    ORDER_AUTH_VERSION,
    action,
    String(timestamp),
    String(nonce),
    payload
  ].join("\n");

  if (typeof Utilities !== "undefined" && typeof Utilities.computeHmacSha256Signature === "function") {
    const signatureBytes = Utilities.computeHmacSha256Signature(signingString, effectiveSecret);
    return bytesToHex(signatureBytes);
  }

  if (typeof require === "function") {
    const crypto = require("node:crypto");
    const signature = crypto.createHmac("sha256", effectiveSecret).update(signingString).digest("hex");
    return signature;
  }

  return "";
}

function parseTimestamp(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const asNumber = Number(value);

  if (Number.isFinite(asNumber)) {
    return new Date(asNumber > 1e12 ? asNumber : asNumber * 1000);
  }

  const asDate = new Date(value);

  if (!Number.isNaN(asDate.getTime())) {
    return asDate;
  }

  return null;
}

function verifyOrderAuthEnvelope(request, nowTimestamp) {
  if (!request || !request.auth || !request.action || !request.payload) {
    return false;
  }

  const auth = request.auth;
  const secret = getOrderAuthSecret();

  if (!secret) {
    return false;
  }

  if (auth.version !== ORDER_AUTH_VERSION) {
    return false;
  }

  if (auth.key_id !== ORDER_AUTH_KEY_ID) {
    return false;
  }

  if (!auth.timestamp || !auth.nonce || !auth.signature) {
    return false;
  }

  const timestampDate = parseTimestamp(auth.timestamp);

  if (!timestampDate) {
    return false;
  }

  const now = nowTimestamp ? new Date(nowTimestamp) : new Date();

  if (Math.abs(now.getTime() - timestampDate.getTime()) > ORDER_AUTH_TOLERANCE_MS) {
    return false;
  }

  const expectedSignature = computeOrderAuthSignature(
    secret,
    request.action,
    auth.timestamp,
    auth.nonce,
    request.payload
  );

  return typeof auth.signature === "string" && auth.signature.toLowerCase() === expectedSignature;
}

function buildSignedEnvelope(action, payload, secret, timestamp, nonce) {
  const effectivePayload = typeof payload === "string" ? payload : JSON.stringify(payload);
  const effectiveSecret = normalizeSecretValue(secret);
  const effectiveTimestamp = timestamp || new Date().toISOString();
  const effectiveNonce = nonce || (Math.random().toString(36).slice(2) + Date.now().toString(36));

  return {
    action: action,
    payload: effectivePayload,
    auth: {
      version: ORDER_AUTH_VERSION,
      key_id: ORDER_AUTH_KEY_ID,
      timestamp: effectiveTimestamp,
      nonce: effectiveNonce,
      signature: computeOrderAuthSignature(effectiveSecret, action, effectiveTimestamp, effectiveNonce, effectivePayload)
    }
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ORDER_AUTH_VERSION,
    ORDER_AUTH_KEY_ID,
    ORDER_AUTH_TOLERANCE_MS,
    ORDER_AUTH_SECRET_KEY,
    bytesToHex,
    getOrderAuthSecret,
    computeOrderAuthSignature,
    parseTimestamp,
    verifyOrderAuthEnvelope,
    buildSignedEnvelope
  };
}
