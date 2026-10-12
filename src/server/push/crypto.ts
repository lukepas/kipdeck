// Web Push with nothing but node:crypto: the message encryption of RFC 8291 (aes128gcm, RFC 8188)
// and the VAPID signature of RFC 8292 that tells the browser's push service the office sent it.
// tests/push-crypto.test.ts checks the encryption against RFC 8291's own worked example.
import { createECDH, createHmac, createCipheriv, createPrivateKey, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

/** The record size written in the header. One record holds the whole message (at most about 4 kB). */
const RECORD_SIZE = 4096;
/** Push services take up to 4096 bytes of body; the header and the tag take 103 of them. */
export const MAX_PLAINTEXT = RECORD_SIZE - 103 - 1;

export const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
export const unb64u = (s: string) => Buffer.from(s, 'base64url');

const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();
/** HKDF (RFC 5869) for one block of output, which is all Web Push needs. */
const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, length: number) => hmac(hmac(salt, ikm), Buffer.concat([info, Buffer.from([1])])).subarray(0, length);

/** What a browser hands over when it subscribes: its public key (65 bytes, uncompressed P-256) and a 16-byte secret. */
export interface ReceiverKeys {
  p256dh: string;
  auth: string;
}

/** Tests only: the sender's key pair and salt, to reproduce a known message. */
export interface FixedSender {
  privateKey: Buffer;
  salt: Buffer;
}

/** A browser's keys look right: a 65-byte uncompressed point and a 16-byte secret. */
export function keysOk(k: Partial<ReceiverKeys> | undefined): k is ReceiverKeys {
  if (!k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string') return false;
  if (k.p256dh.length > 100 || k.auth.length > 40) return false;
  const pub = unb64u(k.p256dh);
  return pub.length === 65 && pub[0] === 4 && unb64u(k.auth).length === 16;
}

/**
 * The body of a push message for one browser: `plaintext` encrypted so only it can read it
 * (RFC 8291 section 3.4), as one aes128gcm record (RFC 8188 section 2).
 */
export function encrypt(plaintext: Buffer, keys: ReceiverKeys, fixed?: FixedSender): Buffer {
  if (plaintext.length > MAX_PLAINTEXT) throw new Error(`A push message holds at most ${MAX_PLAINTEXT} bytes`);
  const uaPublic = unb64u(keys.p256dh);
  const authSecret = unb64u(keys.auth);
  const ecdh = createECDH('prime256v1');
  if (fixed) ecdh.setPrivateKey(fixed.privateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const salt = fixed?.salt ?? randomBytes(16);
  const shared = ecdh.computeSecret(uaPublic);
  // The input key: the shared secret mixed with the browser's auth secret and both public keys.
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, shared, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  // The last (and only) record ends with a 2 delimiter.
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/** The office's VAPID key pair: the public half as browsers take it, the private half to sign with. */
export interface VapidKeys {
  /** 65 bytes, uncompressed P-256, base64url: the applicationServerKey a browser subscribes with. */
  publicKey: string;
  /** The 32-byte private scalar, base64url. */
  privateKey: string;
}

export function newVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });
  return { publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(pub.x!), unb64u(pub.y!)])), privateKey: priv.d! };
}

/** The private key as node:crypto takes it, rebuilt from the scalar and the public point. */
function signingKey(keys: VapidKeys): KeyObject {
  const pub = unb64u(keys.publicKey);
  return createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
}

/** Keys that came off disk are a working pair. */
export function vapidOk(keys: Partial<VapidKeys> | undefined): keys is VapidKeys {
  if (!keys || typeof keys.publicKey !== 'string' || typeof keys.privateKey !== 'string') return false;
  try {
    const pub = unb64u(keys.publicKey);
    const d = unb64u(keys.privateKey);
    if (pub.length !== 65 || pub[0] !== 4 || d.length !== 32) return false;
    // The private half has to be the public half's: a pair that doesn't match signs what no browser accepts.
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(d);
    return ecdh.getPublicKey().equals(pub);
  } catch {
    return false;
  }
}

/**
 * The Authorization header for a push to `endpoint` (RFC 8292): a JWT for the push service's origin,
 * good for 12 hours, signed ES256 with the office's private key, and the public key beside it.
 */
export function vapidAuth(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): string {
  const aud = new URL(endpoint).origin;
  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const signed = `${header}.${claims}`;
  const sig = sign('sha256', Buffer.from(signed), { key: signingKey(keys), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${signed}.${b64u(sig)}, k=${keys.publicKey}`;
}
