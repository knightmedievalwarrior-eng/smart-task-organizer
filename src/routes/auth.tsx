import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "เข้าสู่ระบบ — Guided Task Runner" },
      { name: "description", content: "สมัครหรือเข้าสู่ระบบด้วยอีเมลเพื่อเก็บเครดิตไว้กับบัญชี" },
      { property: "og:title", content: "เข้าสู่ระบบ — Guided Task Runner" },
      {
        property: "og:description",
        content: "สมัครหรือเข้าสู่ระบบด้วยอีเมลเพื่อเก็บเครดิตไว้กับบัญชี",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const sendMagicLink = async () => {
    if (!email.trim()) {
      toast.error(t("กรอกอีเมลก่อน", "Enter your email first"));
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      toast.success(
        t("ส่งลิงก์เข้าสู่ระบบแล้ว ตรวจสอบอีเมลของคุณ", "Magic link sent — check your email"),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success(
            t(
              "สมัครแล้ว กรุณายืนยันอีเมลจากกล่องจดหมาย",
              "Signed up — check your inbox to confirm",
            ),
          );
          setMode("signin");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      toast.success(t("เข้าสู่ระบบแล้ว", "Signed in"));
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        {mode === "signin"
          ? t("เข้าสู่ระบบ", "Sign in")
          : t("สมัครด้วยอีเมล", "Sign up with email")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          "เก็บเฉพาะบัญชีและเครดิตไว้บนระบบ ข้อมูลงานยังอยู่ในเครื่องคุณเหมือนเดิม",
          "Only your account and credits are stored online — task data stays on this device.",
        )}
      </p>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email">{t("อีเมล", "Email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">{t("รหัสผ่าน", "Password")}</Label>
          <Input
            id="password"
            type="password"
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy
            ? t("กำลังดำเนินการ…", "Working…")
            : mode === "signin"
              ? t("เข้าสู่ระบบ", "Sign in")
              : t("สมัคร", "Sign up")}
        </Button>
      </form>
      {mode === "signin" && (
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          disabled={busy}
          onClick={() => void sendMagicLink()}
        >
          {t("ส่ง Magic Link ทางอีเมล", "Send a magic link by email")}
        </Button>
      )}
      <button
        type="button"
        className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:underline"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin"
          ? t("ยังไม่มีบัญชี? สมัครด้วยอีเมล", "No account? Sign up")
          : t("มีบัญชีแล้ว? เข้าสู่ระบบ", "Have an account? Sign in")}
      </button>
    </div>
  );
}
