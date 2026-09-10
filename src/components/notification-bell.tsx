"use client";

import { useEffect, useState, useTransition, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getNotificationsAction,
  getUnreadNotificationCountAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/app/_actions/notification-actions";
import type { Notification } from "@/lib/notifications/types";

/**
 * Near-real-time via polling (Part 16's explicit guidance: no WebSockets
 * for this). The unread badge refreshes on this interval and immediately
 * after any read action — "database → server → UI" with a small, bounded
 * delay, never a fabricated instant update.
 */
const POLL_INTERVAL_MS = 45_000;

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshUnreadCount = useCallback(() => {
    getUnreadNotificationCountAction()
      .then(setUnreadCount)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshUnreadCount]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      startTransition(async () => {
        const result = await getNotificationsAction();
        setNotifications(result.notifications);
        setUnreadCount(result.unreadCount);
      });
    }
  }

  function handleNotificationClick(notification: Notification) {
    if (!notification.read) {
      startTransition(async () => {
        await markNotificationReadAction(notification.id);
        refreshUnreadCount();
        setNotifications(
          (prev) =>
            prev?.map((n) => (n.id === notification.id ? { ...n, read: true } : n)) ?? prev,
        );
      });
    }
    setOpen(false);
    if (notification.targetRoute) {
      router.push(notification.targetRoute);
    }
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      setUnreadCount(0);
      setNotifications((prev) => prev?.map((n) => ({ ...n, read: true })) ?? prev);
    });
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="relative flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-20 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="text-xs font-medium text-accent-hover hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications === null ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing here yet.
              </p>
            ) : (
              <ul>
                {notifications.map((notification) => (
                  <li key={notification.id} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-muted ${
                        notification.read ? "" : "bg-accent-soft/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{notification.title}</p>
                        {!notification.read && (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{notification.body}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {timeAgo(notification.createdAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
