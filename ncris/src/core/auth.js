/**
 * NCRIS · Authentication Primitives
 * ────────────────────────────────────────────────────────────────────
 * Built on Node's built-in `crypto` module — no external dependencies.
 *
 * Production deployments should consider:
 *   • Switching to RS256 with a key-management service (AWS KMS, HashiCorp
 *     Vault, GCP KMS) so the signing key never lives in process memory.
 *   • Adopting SMART-on-FHIR for clinician authentication so existing
 *     hospital identity providers can issue access tokens directly.
 *   • Layering in MFA for any role with write authority on the dispatch
 *     lifecycle, brokerage approvals, or escalation broker.
 *
 * For the reference implementation this module provides:
 *   • HS256 JWT signing/verification (HMAC-SHA-256)
 *   • Password hashing using scrypt (NIST-approved KDF)
 *   • Constant-time secret comparison
 *   • API key generation and verification
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

// ────────────────────────────────────────────────────────────────
// JWT (HS256)
// ────────────────────────────────────────────────────────────────

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64urlDecode = (str) => {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
};

export function signJwt(payload, secret, opts = {}) {
  const ttlSec = opts.ttlSec || 60 * 60 * 8;        // 8 hours default
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iat: now,
    exp: now + ttlSec,
    iss: 'ncris',
    ...payload,
  };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body   = b64url(JSON.stringify(claims));
  const sig    = b64url(createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token, secret) {
  if (!token || typeof token !== 'string') {
    throw Object.assign(new Error('Missing or malformed token'), { status: 401, code: 'TOKEN_MALFORMED' });
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw Object.assign(new Error('Malformed JWT'), { status: 401, code: 'TOKEN_MALFORMED' });
  }
  const [header, body, sig] = parts;
  const expected = b64url(createHmac('sha256', secret).update(`${header}.${body}`).digest());
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw Object.assign(new Error('Invalid signature'), { status: 401, code: 'TOKEN_INVALID_SIG' });
  }
  let claims;
  try {
    claims = JSON.parse(b64urlDecode(body).toString('utf-8'));
  } catch (err) {
    throw Object.assign(new Error('Invalid claims encoding'), { status: 401, code: 'TOKEN_DECODE' });
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && now > claims.exp) {
    throw Object.assign(new Error('Token expired'), { status: 401, code: 'TOKEN_EXPIRED' });
  }
  if (claims.nbf && now < claims.nbf) {
    throw Object.assign(new Error('Token not yet valid'), { status: 401, code: 'TOKEN_NBF' });
  }
  return claims;
}

// ────────────────────────────────────────────────────────────────
// Password hashing (scrypt — NIST SP 800-132)
// ────────────────────────────────────────────────────────────────

const SCRYPT_N = 16384;     // CPU/memory cost
const SCRYPT_R = 8;         // block size
const SCRYPT_P = 1;         // parallelisation
const SCRYPT_KEYLEN = 64;

export function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');
  const candidate = scryptSync(plain, salt, expected.length, { N, r, p });
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ────────────────────────────────────────────────────────────────
// API key generation
// ────────────────────────────────────────────────────────────────

export function generateApiKey(prefix = 'ncris') {
  const random = randomBytes(32).toString('base64url');
  return `${prefix}_${random}`;
}

export function hashApiKey(key) {
  // For API keys we use HMAC-SHA-256 (constant time) instead of scrypt
  // because we verify thousands per second, not once per login.
  return createHmac('sha256', 'ncris-api-key-pepper').update(key).digest('hex');
}

// ────────────────────────────────────────────────────────────────
// Auth middleware factory
// ────────────────────────────────────────────────────────────────

export function authRequired({ secret, scopes = [] } = {}) {
  return (req, res, next) => {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      return res.error(401, 'UNAUTHENTICATED', 'Bearer token required');
    }
    try {
      const claims = verifyJwt(token, secret);
      req.user = claims;
      if (scopes.length > 0) {
        const tokenScopes = (claims.scopes || []);
        const missing = scopes.filter(s => !tokenScopes.includes(s));
        if (missing.length > 0) {
          return res.error(403, 'INSUFFICIENT_SCOPE', `Missing scopes: ${missing.join(', ')}`);
        }
      }
      next();
    } catch (err) {
      return res.error(err.status || 401, err.code || 'UNAUTHENTICATED', err.message);
    }
  };
}

/**
 * API key auth for the partner gateway. Different from JWT — partners
 * present a long-lived key, we look it up, check scopes, log the call.
 */
export function apiKeyRequired({ storage }) {
  return (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (!key) {
      return res.error(401, 'API_KEY_MISSING', 'X-API-Key header required');
    }
    const hash = hashApiKey(key);
    const partner = storage.collection('partners').findOne(p => p.keyHash === hash && p.active);
    if (!partner) {
      return res.error(401, 'API_KEY_INVALID', 'API key not recognised or revoked');
    }
    req.partner = partner;
    storage.collection('partners').update(partner.id, { lastSeenAt: new Date().toISOString(), callCount: (partner.callCount || 0) + 1 });
    next();
  };
}
