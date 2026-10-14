"use client";

import Link from "next/link";
import { NAV_ITEMS } from "@/components/admin/admin-nav";
import { BottomSheet } from "@/components/ui/bottom-sheet";

/**
 * The Founder's whole menu ("All sections") as a sheet, so it can be opened from any screen, including the calling workspace where
 * the dashboard's own bottom bar is not shown. Only ever rendered for a Founder; the pages it links to check the Founder themselves.
 */
export function FounderMoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="All sections">
      <ul className="grid grid-cols-1 gap-1" onClick={onClose}>
        {NAV_ITEMS.map((n) => (
          <li key={n.href}>
            <Link href={n.href} className="flex min-h-12 items-center rounded-md px-3 text-base text-foreground hover:bg-muted">
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
