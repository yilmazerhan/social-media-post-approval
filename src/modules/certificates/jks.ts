/**
 * JKS (Java KeyStore) -> PEM conversion for the TLS certificate upload
 * flow (Administration -> TLS Certificate). Uses `jks-js`, a pure
 * Node.js parser — deliberately not `keytool`, which would mean adding a
 * JRE to the runtime image just for this one operation (CLAUDE.md's
 * stack table has no Java anywhere in it).
 */
import * as crypto from "node:crypto";
import { toPem } from "jks-js";
import { FileRejectedError } from "@/server/http/handler";

export interface ParsedCertificate {
  certPem: string;
  keyPem: string;
  alias: string;
}

/**
 * Extracts the keystore's one private-key entry (server certificate +
 * key) as PEM. A JKS with zero or several such entries is rejected
 * outright — this screen manages a single server certificate, not a
 * general-purpose keystore, so there's no alias picker to build.
 */
export function parseServerCertificateJks(
  fileBuffer: Buffer,
  keystorePassword: string,
  keyPassword: string | undefined,
): ParsedCertificate {
  let pem: ReturnType<typeof toPem>;
  try {
    pem = toPem(fileBuffer, keystorePassword, keyPassword);
  } catch (error) {
    throw new FileRejectedError(
      `Could not read the keystore: ${(error as Error).message}`,
      "UPLOAD_FAILED",
    );
  }

  // toPem's entries are `{ cert, key }` for a private-key entry or just
  // `{ ca }` for a trust-only one — keep only the former.
  const keyEntries = Object.entries(pem).filter(
    ([, entry]) => "cert" in entry && "key" in entry,
  );
  if (keyEntries.length === 0) {
    throw new FileRejectedError(
      "This keystore has no private key entry — it must contain a server certificate and its private key.",
      "UPLOAD_FAILED",
    );
  }
  if (keyEntries.length > 1) {
    throw new FileRejectedError(
      `This keystore has ${keyEntries.length} private key entries; only a keystore with exactly one is supported.`,
      "UPLOAD_FAILED",
    );
  }
  const [alias, { cert: certPem, key: keyPem }] = keyEntries[0] as [
    string,
    { cert: string; key: string },
  ];

  let x509: crypto.X509Certificate;
  try {
    x509 = new crypto.X509Certificate(certPem);
  } catch (error) {
    throw new FileRejectedError(
      `The certificate could not be parsed: ${(error as Error).message}`,
      "UPLOAD_FAILED",
    );
  }
  if (new Date(x509.validTo).getTime() < Date.now()) {
    throw new FileRejectedError(
      `This certificate expired on ${x509.validTo}.`,
      "UPLOAD_FAILED",
    );
  }
  let keyObject: crypto.KeyObject;
  try {
    keyObject = crypto.createPrivateKey(keyPem);
  } catch (error) {
    throw new FileRejectedError(
      `The private key could not be parsed: ${(error as Error).message}`,
      "UPLOAD_FAILED",
    );
  }
  if (!x509.checkPrivateKey(keyObject)) {
    throw new FileRejectedError(
      "The private key does not match the certificate.",
      "UPLOAD_FAILED",
    );
  }

  return { certPem, keyPem, alias };
}
