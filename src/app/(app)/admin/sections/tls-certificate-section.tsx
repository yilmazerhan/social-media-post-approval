"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/app/confirmation-dialog";
import { ErrorState } from "@/components/app/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ApiError,
  CSRF_COOKIE_NAME,
  getCsrfToken,
  getJson,
} from "@/lib/api-client";

interface UploadHistory {
  lastUploadedAt: string | null;
  lastUploadedBy: string | null;
}

type CertificateInfoDto =
  | ({ present: true } & UploadHistory & {
        subject: string;
        issuer: string;
        validFrom: string;
        validTo: string;
        fingerprint: string;
        isSelfSigned: boolean;
      })
  | ({ present: false } & UploadHistory);

function expiryBadge(validTo: string) {
  const daysLeft = Math.floor(
    (new Date(validTo).getTime() - Date.now()) / 86_400_000,
  );
  if (daysLeft < 0) return <Badge variant="destructive">Expired</Badge>;
  if (daysLeft <= 30)
    return <Badge variant="warning">Expires in {daysLeft} days</Badge>;
  return <Badge variant="success">Valid</Badge>;
}

/**
 * Administration -> TLS Certificate. `scripts/install.sh` puts a
 * self-signed placeholder in place on first install so HTTPS works
 * immediately; this is where an admin replaces it with a real one. nginx
 * picks up the new file within its own poll interval (DEPLOYMENT.md §6)
 * — no restart, no other action needed here.
 */
export function TlsCertificateSection() {
  const { toast } = useToast();
  const [info, setInfo] = useState<CertificateInfoDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [keystorePassword, setKeystorePassword] = useState("");
  const [keyPassword, setKeyPassword] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setError(null);
    try {
      const data = await getJson<CertificateInfoDto>(
        "/api/v1/admin/certificate",
      );
      setInfo(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function confirmUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("keystorePassword", keystorePassword);
      if (keyPassword) formData.append("keyPassword", keyPassword);

      const token = getCsrfToken(CSRF_COOKIE_NAME);
      const response = await fetch("/api/v1/admin/certificate", {
        method: "POST",
        credentials: "same-origin",
        headers: token ? { "X-CSRF-Token": token } : undefined,
        body: formData,
      });
      const json = await response.json();
      if (!response.ok) throw new ApiError(json.error);

      setInfo(json.data as CertificateInfoDto);
      toast({ title: "Certificate uploaded." });
      setConfirmOpen(false);
      setFile(null);
      setKeystorePassword("");
      setKeyPassword("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      toast({
        title:
          err instanceof ApiError
            ? err.message
            : "Couldn't upload the certificate.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!info) return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">TLS certificate</h2>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" aria-hidden />
            Current certificate
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {info.present ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {expiryBadge(info.validTo)}
                {info.isSelfSigned && (
                  <Badge variant="secondary">Self-signed</Badge>
                )}
              </div>
              <p>
                <span className="text-muted-foreground">Subject: </span>
                {info.subject}
              </p>
              <p>
                <span className="text-muted-foreground">Issuer: </span>
                {info.issuer}
              </p>
              <p>
                <span className="text-muted-foreground">Valid: </span>
                {format(new Date(info.validFrom), "d MMM yyyy")} –{" "}
                {format(new Date(info.validTo), "d MMM yyyy")}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              No certificate found on disk.
            </p>
          )}
          {info.lastUploadedAt && (
            <p className="text-muted-foreground text-xs">
              Last uploaded{" "}
              {format(new Date(info.lastUploadedAt), "d MMM yyyy, HH:mm")}
              {info.lastUploadedBy ? ` by ${info.lastUploadedBy}` : ""}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload a new certificate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Upload a Java KeyStore (.jks) containing exactly one private key
            entry — the server certificate and its private key. This replaces
            the certificate nginx serves for every user; a bad upload is
            rejected before anything changes.
          </p>
          <div className="space-y-2">
            <Label htmlFor="jks-file">Keystore file (.jks)</Label>
            <Input
              id="jks-file"
              type="file"
              accept=".jks"
              ref={fileInputRef}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="keystore-password">Keystore password</Label>
            <Input
              id="keystore-password"
              type="password"
              value={keystorePassword}
              onChange={(e) => setKeystorePassword(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="key-password">
              Private key password (leave blank if the same as the keystore
              password)
            </Label>
            <Input
              id="key-password"
              type="password"
              value={keyPassword}
              onChange={(e) => setKeyPassword(e.target.value)}
              autoComplete="off"
            />
          </div>
          <Button
            type="button"
            disabled={!file || !keystorePassword}
            onClick={() => setConfirmOpen(true)}
          >
            Upload certificate
          </Button>
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={(open) => !uploading && setConfirmOpen(open)}
        title="Replace the TLS certificate?"
        description="This replaces the certificate every user's browser sees over HTTPS. It's validated before anything changes, but double-check you have the right file."
        confirmLabel="Upload"
        variant="destructive"
        isConfirming={uploading}
        onConfirm={confirmUpload}
      />
    </div>
  );
}
