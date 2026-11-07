import { Github } from "lucide-react";
import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { backupToGithub, restoreFromGithub, saveGithubConfig, useGithubConfig } from "@/lib/github-backup";
import { useT } from "@/lib/i18n";

export function BackupDialog() {
  const { t } = useT();
  const cfg = useGithubConfig();
  const [busy, setBusy] = useState<null | "backup" | "restore">(null);

  const run = async (kind: "backup" | "restore") => {
    if (kind === "restore" && !window.confirm(t("ข้อมูลในเครื่องจะถูกแทนที่ด้วยไฟล์สำรอง ดำเนินการต่อ?", "Local data will be replaced by the backup. Continue?"))) return;
    setBusy(kind);
    try {
      if (kind === "backup") await backupToGithub();
      else await restoreFromGithub();
      toast.success(kind === "backup" ? t("สำรองขึ้น GitHub แล้ว", "Backed up to GitHub") : t("กู้คืนข้อมูลแล้ว", "Data restored"));
    } catch (e) {
      toast.error(t("ไม่สำเร็จ", "Failed"), { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("สำรองข้อมูล GitHub", "GitHub backup")}>
          <Github />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("สำรองข้อมูลขึ้น GitHub", "Back up to GitHub")}</DialogTitle>
          <DialogDescription>
            {t(
              "ส่งไฟล์สำรองจากเบราว์เซอร์ไปยัง repo ของคุณโดยตรง โทเคนเก็บไว้ในเครื่องนี้เท่านั้น แนะนำใช้ repo แบบ private และโทเคนที่มีสิทธิ์ Contents: Read & write",
              "Sends a backup file from your browser straight to your own repo. The token stays on this device. Use a private repo and a token with Contents: Read & write.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="gh-repo">Repository (owner/repo)</Label>
            <Input id="gh-repo" placeholder="yourname/my-backups" value={cfg.repo} onChange={(e) => saveGithubConfig({ repo: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="gh-token">Personal access token</Label>
            <Input id="gh-token" type="password" placeholder="github_pat_…" value={cfg.token} onChange={(e) => saveGithubConfig({ token: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="gh-branch">Branch</Label>
              <Input id="gh-branch" value={cfg.branch} onChange={(e) => saveGithubConfig({ branch: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gh-path">{t("ชื่อไฟล์", "File path")}</Label>
              <Input id="gh-path" value={cfg.path} onChange={(e) => saveGithubConfig({ path: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            {t("สำรองอัตโนมัติทุก 10 นาที (ขณะเปิดแอป)", "Auto back up every 10 min (while open)")}
            <Switch checked={cfg.auto} onCheckedChange={(v) => saveGithubConfig({ auto: v })} />
          </label>
          {cfg.lastBackupAt && (
            <p className="text-xs text-muted-foreground">
              {t("สำรองล่าสุด", "Last backup")}: {new Date(cfg.lastBackupAt).toLocaleString()}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={!!busy} onClick={() => run("restore")}>
            {busy === "restore" ? t("กำลังกู้คืน…", "Restoring…") : t("กู้คืนจาก GitHub", "Restore")}
          </Button>
          <Button disabled={!!busy || !cfg.repo || !cfg.token} onClick={() => run("backup")}>
            {busy === "backup" ? t("กำลังสำรอง…", "Backing up…") : t("สำรองตอนนี้", "Back up now")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
