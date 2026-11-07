import { Coins } from "lucide-react";

import { RUN_COST, useCredits } from "@/lib/credits";
import { openUpgrade } from "@/lib/upgrade";
import { cn } from "@/lib/utils";

/** Header badge with credits left today; opens the top-up window. */
export function CreditBadge() {
  const credits = useCredits();
  if (!credits) return null;
  const low = credits.total < RUN_COST;
  const n = credits.total.toLocaleString("th-TH");
  return (
    <button
      type="button"
      onClick={openUpgrade}
      aria-label={low ? "เครดิตไม่พอ เติมเครดิตเพื่อใช้งานต่อ" : `เหลือ ${n} เครดิต`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        low
          ? "border-destructive/40 bg-destructive/10 text-destructive hover:border-destructive"
          : "border-signal/30 bg-signal-soft text-foreground hover:border-signal",
      )}
    >
      <Coins className={cn("size-3.5", low ? "text-destructive" : "text-signal")} />
      <span className="font-mono">{n}</span>
      <span className="hidden sm:inline">เครดิต</span>
    </button>
  );
}
