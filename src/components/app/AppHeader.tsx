import { Link } from "@tanstack/react-router";
import { LogIn, LogOut, ShieldCheck, Trash, Trash2 } from "lucide-react";
import { toast } from "sonner";

import logo from "@/assets/logo-mark.png";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n";
import { signOut, useUser } from "@/lib/auth";
import { wipeAll } from "@/lib/session-store";

import { BackupDialog } from "./BackupDialog";

import { CreditBadge } from "./CreditBadge";
import { LanguageToggle } from "./LanguageToggle";
import { RunIndicator } from "./RunIndicator";
import { SupabaseSettingsDialog } from "./SupabaseSettingsDialog";
import { ThemeSwitcher } from "./ThemeSwitcher";

export function AppHeader() {
  const { t } = useT();
  const user = useUser();

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logo} alt="" width={28} height={28} className="size-7 rounded-md" />
          <span className="text-[0.95rem] font-semibold tracking-tight">
            Task Runner
            <span className="ml-1.5 hidden font-normal text-muted-foreground sm:inline">
              / Command Center
            </span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1.5">
          <LanguageToggle />
          <ThemeSwitcher />
          <RunIndicator />
          <CreditBadge />
          <SupabaseSettingsDialog />
          <BackupDialog />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon-sm" aria-label={t("ถังขยะ", "Trash")}>
                <Link to="/trash">
                  <Trash />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("ถังขยะ (30 วัน)", "Trash (30 days)")}</TooltipContent>
          </Tooltip>
          {user ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t("ออกจากระบบ", "Sign out")} onClick={() => void signOut()}>
                  <LogOut />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{user.email} · {t("ออกจากระบบ", "Sign out")}</TooltipContent>
            </Tooltip>
          ) : (
            <Button asChild variant="soft" size="sm">
              <Link to="/auth">
                <LogIn /> <span className="hidden sm:inline">{t("เข้าสู่ระบบ", "Sign in")}</span>
              </Link>
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 text-success" />
                <span className="hidden lg:inline">{t("100% ในเครื่อง · เป็นส่วนตัว", "100% Local & Private")}</span>
                <span className="hidden sm:inline lg:hidden">{t("100% Local", "100% Local")}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-xs leading-relaxed">
              {t(
                "ไฟล์ Excel/CSV และข้อมูลลูกค้าทั้งหมดถูกเปิดและประมวลผลในเบราว์เซอร์ของคุณโดยตรง ไม่มีการอัปโหลดขึ้นเซิร์ฟเวอร์ของแอป (ถ้าเชื่อม Supabase ข้อมูลจะส่งตรงไปยังโปรเจกต์ของคุณ) เก็บถาวรในเครื่องนี้ (ลบแล้วอยู่ในถังขยะ 30 วัน) ประวัติเก็บเพียงสรุปที่ไม่ระบุตัวบุคคล",
                "Excel/CSV files and customer data are opened and processed directly in your browser — nothing is uploaded to this app's server (with Supabase connected, data goes straight to your own project) and is kept on this device (deleted items stay in the trash for 30 days). History keeps only non-identifying summaries.",
              )}
            </TooltipContent>
          </Tooltip>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("ล้างข้อมูลทั้งหมด", "Wipe all data")}>
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("ล้างข้อมูลทั้งหมด?", "Wipe all data?")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    "งานค้าง ถังขยะ และประวัติการใช้งานในเบราว์เซอร์นี้จะถูกลบถาวร ไม่สามารถกู้คืนได้",
                    "All pending tasks and usage history in this browser will be permanently deleted. This cannot be undone.",
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("ยกเลิก", "Cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    wipeAll();
                    toast.success(t("ลบข้อมูลทั้งหมดแล้ว", "All data wiped"));
                  }}
                >
                  {t("ลบทั้งหมด", "Wipe everything")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </header>
  );
}
