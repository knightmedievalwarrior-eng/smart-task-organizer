import { setUpgradeOpen, useUpgradeOpen } from "@/lib/upgrade";

import { UpgradeDialog } from "./UpgradeDialog";

/**
 * Mounted once in the root: renders the shared upgrade dialog whenever any
 * part of the app (e.g. locked themes) calls `openUpgrade()`.
 */
export function UpgradeDialogHost() {
  const open = useUpgradeOpen();
  if (!open) return null;
  return <UpgradeDialog open={open} onOpenChange={setUpgradeOpen} />;
}
