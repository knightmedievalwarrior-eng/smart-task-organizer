import { ArrowLeft, Check, Crown, Info } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCredits } from "@/lib/credits";
import { PACKAGES, PROMPTPAY_ID, promptPayPayload, type PackageId } from "@/lib/payment";
import { cn } from "@/lib/utils";

const PRO_PERKS = ["25,000 เครดิตทุกเดือน", "ดาวน์โหลดรายงานสรุปเป็น Excel", "ตั้งเวลาทำงานล่วงหน้า", "ปลดล็อกธีมพิเศษ"];
const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

export function UpgradeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [step, setStep] = useState<"plan" | "pay">("plan");
  const [pick, setPick] = useState<PackageId>("pack");
  const PLAN = PACKAGES[pick];
  const credits = useCredits();
  const sample = !PROMPTPAY_ID;
  const qrValue = sample ? "ตัวอย่าง QR — ยังไม่ใช่บัญชีรับเงินจริง" : promptPayPayload(PROMPTPAY_ID, PLAN.price);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setStep("plan");
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        {step === "plan" ? (
          <>
            <DialogHeader>
              <DialogTitle>เติมเครดิต / อัปเกรด</DialogTitle>
              <DialogDescription>
                ใช้ฟรีทุกวัน 250 เครดิต (รีเฟรชเวลา 00:00) · สั่งงาน 1 ครั้ง = 20 เครดิต
                {credits && <> · ตอนนี้เหลือ {credits.total.toLocaleString("th-TH")} เครดิต</>}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              {(Object.keys(PACKAGES) as PackageId[]).map((id) => {
                const p = PACKAGES[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPick(id)}
                    aria-pressed={pick === id}
                    className={cn(
                      "w-full rounded-xl border bg-card p-4 text-left transition-colors",
                      pick === id ? "border-signal ring-1 ring-signal" : "border-border hover:border-signal/50",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-2 font-medium">
                        <Crown className="size-4 text-signal" /> {p.name}
                      </span>
                      <span>
                        <span className="font-mono text-2xl font-semibold">{baht(p.price)}</span>
                        {id === "pro" && <span className="text-sm text-muted-foreground"> / เดือน</span>}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {p.credits.toLocaleString("th-TH")} เครดิต · {p.note}
                    </p>
                    {id === "pro" && (
                      <ul className="mt-2 space-y-1 text-sm">
                        {PRO_PERKS.map((x) => (
                          <li key={x} className="flex items-center gap-2">
                            <Check className="size-4 text-success" /> {x}
                          </li>
                        ))}
                      </ul>
                    )}
                  </button>
                );
              })}
            </div>

            <DialogFooter className="gap-2 sm:flex-col sm:space-x-0">
              <Button
                size="lg"
                className="w-full bg-signal text-signal-foreground hover:bg-signal/90"
                onClick={() => setStep("pay")}
              >
                ชำระเงิน {baht(PLAN.price)}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
                ไว้ทีหลัง
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>สแกนชำระเงินผ่านพร้อมเพย์</DialogTitle>
              <DialogDescription>
                เปิดแอปธนาคารแล้วสแกน QR ด้านล่าง ยอด {baht(PLAN.price)} จะถูกกรอกให้อัตโนมัติ
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-3">
              <div className="relative rounded-xl border border-border bg-card p-4 text-foreground">
                <QRCodeSVG
                  value={qrValue}
                  size={196}
                  level="M"
                  bgColor="transparent"
                  fgColor="currentColor"
                  className={cn(sample && "opacity-30 blur-[1.5px]")}
                  aria-label={sample ? "QR ตัวอย่าง สแกนจ่ายไม่ได้" : "QR พร้อมเพย์สำหรับชำระเงิน"}
                />
                {sample && (
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="-rotate-12 rounded-md border-2 border-destructive bg-card px-3 py-1 text-lg font-semibold text-destructive">
                      ตัวอย่าง
                    </span>
                  </span>
                )}
              </div>
              <div className="text-center">
                <p className="font-mono text-xl font-semibold">{baht(PLAN.price)}</p>
                <p className="text-xs text-muted-foreground">
                  {PLAN.name} · {PLAN.credits.toLocaleString("th-TH")} เครดิต
                </p>
              </div>
            </div>

            <p className="flex gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {sample
                ? "QR นี้เป็นตัวอย่างเท่านั้น ยังสแกนจ่ายไม่ได้ จนกว่าจะตั้งค่าบัญชีพร้อมเพย์สำหรับรับเงิน"
                : "หลังโอนแล้ว กรุณาส่งสลิปให้ผู้ดูแลระบบเพื่อเพิ่มเครดิตให้ ระบบจะไม่เพิ่มให้อัตโนมัติ"}
            </p>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("plan")}>
                <ArrowLeft /> ย้อนกลับ
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
