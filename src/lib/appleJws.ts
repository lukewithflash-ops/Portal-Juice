import "server-only";
import { createHash, createVerify, X509Certificate } from "node:crypto";

/**
 * Verifies Apple's signed JWS (StoreKit 2 transactions, renewal info, App Store Server Notifications v2).
 * The x5c chain in the header must end at Apple Root CA - G3 (embedded below, sha256 63:34:3A:BF...:91:79),
 * every cert must be in date, and the leaf must carry Apple's receipt-signing OID. Then ES256 is checked.
 */
const APPLE_ROOT_G3 = new X509Certificate(Buffer.from("MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==", "base64"));
const LEAF_OID = "1.2.840.113635.100.6.11.1";

export function verifyAppleJws<T = Record<string, unknown>>(jws: string): T | null {
  try {
    const [h, p, s] = jws.split(".");
    if (!h || !p || !s) return null;
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8")) as { alg?: string; x5c?: string[] };
    if (header.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length < 2) return null;
    const chain = header.x5c.map((c) => new X509Certificate(Buffer.from(c, "base64")));
    const now = Date.now();
    for (const c of chain) if (Date.parse(c.validFrom) > now || Date.parse(c.validTo) < now) return null;
    for (let i = 0; i < chain.length - 1; i++) if (!chain[i].verify(chain[i + 1].publicKey) || !chain[i].checkIssued(chain[i + 1])) return null;
    const top = chain[chain.length - 1];
    const rootFp = createHash("sha256").update(APPLE_ROOT_G3.raw).digest("hex");
    const topIsRoot = createHash("sha256").update(top.raw).digest("hex") === rootFp;
    if (!topIsRoot && !(top.verify(APPLE_ROOT_G3.publicKey) && top.checkIssued(APPLE_ROOT_G3))) return null;
    // Leaf must be Apple's App Store receipt signer (OID shows up in the DER).
    if (!chain[0].raw.includes(oidDer(LEAF_OID))) return null;
    const ok = createVerify("SHA256").update(`${h}.${p}`).verify({ key: chain[0].publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
    if (!ok) return null;
    return JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function oidDer(oid: string): Buffer {
  const parts = oid.split(".").map(Number);
  const out = [40 * parts[0] + parts[1]];
  for (const n of parts.slice(2)) {
    const b: number[] = [];
    let v = n;
    b.unshift(v & 0x7f);
    while ((v >>= 7)) b.unshift((v & 0x7f) | 0x80);
    out.push(...b);
  }
  return Buffer.from([0x06, out.length, ...out]);
}

export type AppleTx = {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  expiresDate?: number;
  revocationDate?: number;
  appAccountToken?: string;
  environment?: "Production" | "Sandbox";
  type?: string;
};
export type AppleNotification = {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  data?: { bundleId?: string; environment?: string; signedTransactionInfo?: string; signedRenewalInfo?: string; status?: number };
};
