import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { TRASH_DAYS, deleteForever, emptyTrash, restoreTask, useAppState, useHydrated } from "@/lib/session-store";
import { TASKS } from "@/lib/tasks/definitions";

export const Route = createFileRoute("/trash")({
  head: () => ({
    meta: [
      { title: "ถังขยะ — Guided Task Runner" },
      { name: "description", content: "งานที่ลบไว้จะเก็บ 30 วันก่อนลบถาวร กู้คืนได้ทุกเมื่อ" },
      { property: "og:title", content: "ถังขยะ — Guided Task Runner" },
      { property: "og:description", content: "งานที่ลบไว้จะเก็บ 30 วันก่อนลบถาวร กู้คืนได้ทุกเมื่อ" },
    ],
  }),
  component: TrashPage,
});

const DAY = 24 * 60 * 60 * 1000;

function TrashPage() {
  const { t, tr } = useT();
  const hydrated = useHydrated();
  const { trash } = useAppState();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("ถังขยะ", "Trash")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`งานที่ลบจะถูกเก็บไว้ ${TRASH_DAYS} วัน แล้วลบถาวรอัตโนมัติ`, `Deleted tasks are kept for ${TRASH_DAYS} days, then removed for good.`)}
          </p>
        </div>
        {trash.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => window.confirm(t("ลบทั้งหมดถาวร?", "Delete all permanently?")) && emptyTrash()}>
            {t("ล้างถังขยะ", "Empty trash")}
          </Button>
        )}
      </div>
      <ul className="mt-6 grid gap-2">
        {hydrated && trash.length === 0 && <li className="text-sm text-muted-foreground">{t("ถังขยะว่าง", "Trash is empty")}</li>}
        {hydrated &&
          trash.map(({ task, deletedAt }) => {
            const left = Math.max(0, TRASH_DAYS - Math.floor((Date.now() - deletedAt) / DAY));
            return (
              <li key={task.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tr(TASKS[task.type].title)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`ลบเมื่อ ${new Date(deletedAt).toLocaleString()} · เหลือ ${left} วัน`, `Deleted ${new Date(deletedAt).toLocaleString()} · ${left} days left`)}
                  </p>
                </div>
                <Button size="sm" variant="soft" onClick={() => restoreTask(task.id)}>
                  <RotateCcw /> {t("กู้คืน", "Restore")}
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={t("ลบถาวร", "Delete forever")} onClick={() => deleteForever(task.id)}>
                  <Trash2 />
                </Button>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
