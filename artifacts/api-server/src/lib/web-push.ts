import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  randomBytes,
  sign,
  hkdfSync,
} from "node:crypto";

type PushPayload = { title: string; body: string; url?: string; tag?: string };
type PushSubscriptionRecord = { endpoint: string; p256dh: string; auth: string };

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function toBase64Url(value: Buffer): string {
  return value.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function vapidToken(audience: string): string {
  const publicKey = requiredEnv("VAPID_PUBLIC_KEY");
  const privateKey = requiredEnv("VAPID_PRIVATE_KEY");
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@northstateblockchain.com";
  const publicRaw = fromBase64Url(publicKey);
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: toBase64Url(publicRaw.subarray(1, 33)),
      y: toBase64Url(publicRaw.subarray(33, 65)),
      d: privateKey,
    },
    format: "jwk",
  });
  const header = toBase64Url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = toBase64Url(Buffer.from(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  })));
  const unsigned = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${toBase64Url(signature)}`;
}

function encryptPayload(subscription: PushSubscriptionRecord, payload: PushPayload): Buffer {
  const userPublicKey = fromBase64Url(subscription.p256dh);
  const authSecret = fromBase64Url(subscription.auth);
  if (userPublicKey.length !== 65 || authSecret.length !== 16) {
    throw new Error("Invalid Web Push subscription key material.");
  }

  const ecdh = createECDH("prime256v1");
  const ephemeralPublicKey = ecdh.generateKeys();
  const sharedSecret = ecdh.computeSecret(userPublicKey);
  const authInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    userPublicKey,
    ephemeralPublicKey,
  ]);
  const inputKeyMaterial = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, authInfo, 32));
  const salt = randomBytes(16);
  const cek = Buffer.from(hkdfSync("sha256", inputKeyMaterial, salt, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", inputKeyMaterial, salt, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12));
  const plaintext = Buffer.concat([Buffer.from(JSON.stringify(payload), "utf8"), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  // RFC 8188 aes128gcm record header: salt (16), record size (4), key-id length (1), key-id.
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(ephemeralPublicKey.length, 20);
  return Buffer.concat([header, ephemeralPublicKey, ciphertext]);
}

export async function sendWebPush(subscription: PushSubscriptionRecord, payload: PushPayload): Promise<boolean> {
  const endpoint = new URL(subscription.endpoint);
  if (endpoint.protocol !== "https:") throw new Error("Push endpoint must use HTTPS.");
  const body = encryptPayload(subscription, payload);
  const token = vapidToken(endpoint.origin);
  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      Authorization: `vapid t=${token}, k=${requiredEnv("VAPID_PUBLIC_KEY")}`,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Urgency: "normal",
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404 || response.status === 410) return false;
  if (!response.ok) throw new Error(`Push service returned HTTP ${response.status}.`);
  return true;
}
