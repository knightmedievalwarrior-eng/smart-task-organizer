import { AlarmClock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/lib/i18n";
import { setSchedule, type Task } from "@/lib/session-store";

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function ScheduleButton({ task }: { task: Task }) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => toLocalInput(task.scheduledAt ?? Date.now() + 60 * 60 * 1000));

  if (task.status !== "ready") return null;

  const save = () => {
    const at = new Date(value).getTime();
    if (!Number.isFinite(at) || at <= Date.now()) {
      toast.error(t("เลือกเวลาในอนาคต", "Pick a future time"));
      return;
    }
    setSchedule(task.id, at);
    setOpen(false);
    toast.success(t("ตั้งเวลาแล้ว — เปิดแอปค้างไว้เพื่อให้งานเริ่มเอง", "Scheduled — keep the app open so it can start"));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={task.scheduledAt ? "soft" : "ghost"}
          size="sm"
          aria-label={t("ตั้งเวลา", "Schedule")}
        >
          <AlarmClock />
          {task.scheduledAt && (
            <span className="hidden text-xs sm:inline">
              {new Date(task.scheduledAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="grid w-72 gap-3">
        <p className="text-sm font-medium">{t("ตั้งเวลาให้งานเริ่มเอง", "Run automatically at")}</p>
        <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          {t("งานจะเริ่มเฉพาะตอนที่เปิดแอปค้างไว้เท่านั้น", "Runs only while the app is open in a tab.")}
        </p>
        <div className="flex justify-end gap-2">
          {task.scheduledAt && (
            <Button variant="ghost" size="sm" onClick={() => (setSchedule(task.id, undefined), setOpen(false))}>
              {t("ยกเลิกเวลา", "Clear")}
            </Button>
          )}
          <Button size="sm" onClick={save}>
            {t("บันทึก", "Save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
