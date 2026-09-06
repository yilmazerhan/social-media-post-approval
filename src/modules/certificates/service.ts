/**
 * TLS certificate management — Administration -> TLS Certificate.
 * `scripts/install.sh` generates a self-signed placeholder certificate on
 * first install so HTTPS works immediately; this module is how an admin
 * later replaces it with a real one, without touching the server. See
 * DEPLOYMENT.md §6 for how nginx picks up the new files.
 */
import * as crypto from "node:crypto";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "@/server/config";
import { prisma } from "@/server/db";
import { FileRejectedError } from "@/server/http/handler";
import { writeAudit } from "@/modules/audit";
import { parseServerCertificateJks } from "./jks";

const CERT_FILENAME = "server.crt";
const KEY_FILENAME = "server.key";
const AUDIT_ACTION = "TLS_CERTIFICATE_UPLOADED";

interface UploadHistory {
  lastUploadedAt: string | null;
  lastUploadedBy: string | null;
}

export type CertificateInfoDto =
  | ({ present: true } & UploadHistory & {
        subject: string;
        issuer: string;
        validFrom: string;
        validTo: string;
        fingerprint: string;
        isSelfSigned: boolean;
      })
  | ({ present: false } & UploadHistory);

async function readCurrentX509(): Promise<crypto.X509Certificate | null> {
  try {
    const pem = await readFile(
      path.join(config.TLS_CERT_DIR, CERT_FILENAME),
      "utf8",
    );
    return new crypto.X509Certificate(pem);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function getCurrentCertificate(): Promise<CertificateInfoDto> {
  const x509 = await readCurrentX509();
  const lastUpload = await prisma.auditLog.findFirst({
    where: { action: AUDIT_ACTION },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, actorEmail: true },
  });

  if (!x509) {
    return {
      present: false,
      lastUploadedAt: lastUpload?.createdAt.toISOString() ?? null,
      lastUploadedBy: lastUpload?.actorEmail ?? null,
    };
  }

  return {
    present: true,
    subject: x509.subject,
    issuer: x509.issuer,
    validFrom: new Date(x509.validFrom).toISOString(),
    validTo: new Date(x509.validTo).toISOString(),
    fingerprint: x509.fingerprint256,
    isSelfSigned: x509.subject === x509.issuer,
    lastUploadedAt: lastUpload?.createdAt.toISOString() ?? null,
    lastUploadedBy: lastUpload?.actorEmail ?? null,
  };
}

export async function uploadCertificate(params: {
  fileBuffer: Buffer;
  keystorePassword: string;
  keyPassword?: string;
  actorId: string;
  actorEmail: string;
}): Promise<CertificateInfoDto> {
  const { certPem, keyPem, alias } = parseServerCertificateJks(
    params.fileBuffer,
    params.keystorePassword,
    params.keyPassword,
  );

  const certPath = path.join(config.TLS_CERT_DIR, CERT_FILENAME);
  const keyPath = path.join(config.TLS_CERT_DIR, KEY_FILENAME);
  const certTmp = `${certPath}.tmp`;
  const keyTmp = `${keyPath}.tmp`;

  // Write both to temp files first, then rename into place (same
  // filesystem, so `rename` is atomic) — nginx's reload watcher
  // (DEPLOYMENT.md §6) must never see a half-written key or a key that
  // doesn't match the certificate it reloaded.
  // `mode` on writeFile only applies when the file didn't already exist —
  // a leftover .tmp from a previous crashed attempt could otherwise carry
  // the wrong permissions into the renamed server.key. chmod explicitly
  // regardless of that history.
  await writeFile(certTmp, certPem);
  await chmod(certTmp, 0o644);
  await writeFile(keyTmp, keyPem);
  await chmod(keyTmp, 0o600);
  try {
    await rename(certTmp, certPath);
    await rename(keyTmp, keyPath);
  } catch (error) {
    throw new FileRejectedError(
      `Could not write the certificate to ${config.TLS_CERT_DIR}: ${(error as Error).message}`,
      "UPLOAD_FAILED",
    );
  }

  await writeAudit({
    actorId: params.actorId,
    actorEmail: params.actorEmail,
    action: AUDIT_ACTION,
    entityType: "SystemSetting",
    entityId: "tls.certificate",
    metadata: { alias },
  });

  return getCurrentCertificate();
}
