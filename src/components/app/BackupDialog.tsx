import { Github } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUser } from "@/lib/auth";
import {
  backupEncryptedRecords,
  getGithubVaultStatus,
  restoreEncryptedRecords,
  startGithubOAuth,
  type GithubVaultStatus,
} from "@/lib/github-vault";
import { useT } from "@/lib/i18n";

export function BackupDialog() {
  const { t } = useT();
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<GithubVaultStatus | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState<null | "status" | "oauth" | "backup" | "restore">(null);

  const refreshStatus = useCallback(async () => {
    if (!user) {
      setStatus(null);
      return;
    }
    setBusy("status");
    try {
      setStatus(await getGithubVaultStatus());
    } catch (error) {
      toast.error(t("ตรวจสอบ GitHub ไม่สำเร็จ", "Could not check GitHub"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  }, [user, t]);

  useEffect(() => {
    if (open) void refreshStatus();
  }, [open, refreshStatus]);

  useEffect(() => {
    const legacy = window.localStorage.getItem("gtr.github.v1");
    if (!legacy) return;
    let containedToken = false;
    try {
      containedToken = Boolean((JSON.parse(legacy) as { token?: string }).token);
    } catch {
      /* remove malformed legacy settings too */
    }
    window.localStorage.removeItem("gtr.github.v1");
    if (containedToken)
      toast.info(
        t(
          "ลบ PAT เก่าที่แอปเคยเก็บในเบราว์เซอร์แล้ว กรุณาเพิกถอนโทเคนเดิมจากการตั้งค่า GitHub",
          "Removed the old browser-stored PAT. Revoke that old token in GitHub settings.",
        ),
      );
  }, [t]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("github");
    if (!result) return;
    if (result === "connected") toast.success(t("เชื่อมต่อ GitHub สำเร็จ", "GitHub connected"));
    else
      toast.error(t("เชื่อมต่อ GitHub ไม่สำเร็จ", "GitHub connection failed"), {
        description: url.searchParams.get("reason") ?? undefined,
      });
    url.searchParams.delete("github");
    url.searchParams.delete("reason");
    window.history.replaceState(window.history.state, "", url.toString());
    if (result === "connected") void refreshStatus();
  }, [refreshStatus, t]);

  const connect = async () => {
    setBusy("oauth");
    try {
      await startGithubOAuth();
    } catch (error) {
      toast.error(t("เริ่มเชื่อมต่อไม่ได้", "Could not start GitHub connection"), {
        description: error instanceof Error ? error.message : String(error),
      });
      setBusy(null);
    }
  };

  const run = async (kind: "backup" | "restore") => {
    if (
      kind === "restore" &&
      !window.confirm(
        t(
          "ข้อมูลในเครื่องจะถูกแทนที่ด้วยข้อมูลสำรองที่ถอดรหัสแล้ว ดำเนินการต่อ?",
          "Local data will be replaced by the decrypted backup. Continue?",
        ),
      )
    )
      return;
    setBusy(kind);
    try {
      if (kind === "backup") {
        const result = await backupEncryptedRecords(passphrase);
        toast.success(
          t(
            `เข้ารหัสและสำรอง ${result.count} รายการแล้ว`,
            `Encrypted and backed up ${result.count} records`,
          ),
          { description: result.repository ?? undefined },
        );
      } else {
        const result = await restoreEncryptedRecords(passphrase);
        toast.success(t(`กู้คืน ${result.count} รายการแล้ว`, `Restored ${result.count} records`));
      }
    } catch (error) {
      toast.error(t("ไม่สำเร็จ", "Failed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("สำรองข้อมูล GitHub", "GitHub backup")}
        >
          <Github />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("สำรองข้อมูลเข้ารหัสไป GitHub", "Encrypted GitHub backup")}</DialogTitle>
          <DialogDescription>
            {t(
              "ข้อมูลถูกเข้ารหัสในเบราว์เซอร์ก่อนส่ง ไฟล์แยกตาม UUID และ backend ไม่ได้รับรหัสผ่านหรือข้อมูลที่ถอดรหัสแล้ว ต้องใช้รหัสผ่านเดิมเพื่อกู้คืน",
              "Data is encrypted in your browser before upload and split into UUID files. The backend never receives your password or plaintext. Use the same password to restore.",
            )}
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          <div className="grid gap-3 rounded-md border p-4 text-sm">
            <p>{t("เข้าสู่ระบบก่อนเพื่อเชื่อมต่อ GitHub", "Sign in before connecting GitHub")}</p>
            <Button asChild>
              <Link to="/auth">{t("ไปหน้าเข้าสู่ระบบ", "Go to sign in")}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0 text-sm">
                {busy === "status" ? (
                  <p className="text-muted-foreground">{t("กำลังตรวจสอบ…", "Checking…")}</p>
                ) : status?.connected ? (
                  <>
                    <p>
                      {t("เชื่อมต่อแล้ว", "Connected")}:{" "}
                      <span className="font-medium">@{status.login}</span>
                    </p>
                    <p className="truncate text-muted-foreground">
                      {status.repository ??
                        t(
                          "จะสร้าง private repository เมื่อสำรองครั้งแรก",
                          "A private repository will be created on first backup",
                        )}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    {t("ยังไม่ได้เชื่อมต่อ GitHub", "GitHub is not connected")}
                  </p>
                )}
              </div>
              {status?.connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!busy}
                  onClick={() => void refreshStatus()}
                >
                  {t("รีเฟรช", "Refresh")}
                </Button>
              ) : (
                <Button size="sm" disabled={!!busy} onClick={() => void connect()}>
                  {busy === "oauth"
                    ? t("กำลังไป GitHub…", "Opening GitHub…")
                    : t("เชื่อมต่อ GitHub", "Connect GitHub")}
                </Button>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="vault-passphrase">
                {t(
                  "รหัสผ่านเข้ารหัสสำรอง (อย่างน้อย 12 ตัวอักษร)",
                  "Backup encryption password (12+ characters)",
                )}
              </Label>
              <Input
                id="vault-passphrase"
                type="password"
                autoComplete="new-password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "รหัสผ่านนี้ไม่ถูกส่งหรือบันทึกไว้ หากลืมจะกู้คืนไฟล์ไม่ได้ เก็บไว้ใน password manager",
                  "This password is never sent or stored. If lost, the backup cannot be recovered. Keep it in a password manager.",
                )}
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            disabled={!user || !status?.connected || !!busy || passphrase.length < 12}
            onClick={() => void run("restore")}
          >
            {busy === "restore" ? t("กำลังกู้คืน…", "Restoring…") : t("กู้คืน", "Restore")}
          </Button>
          <Button
            disabled={!user || !status?.connected || !!busy || passphrase.length < 12}
            onClick={() => void run("backup")}
          >
            {busy === "backup"
              ? t("กำลังเข้ารหัส…", "Encrypting…")
              : t("สำรองตอนนี้", "Back up now")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
