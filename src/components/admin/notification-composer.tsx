"use client";

import { useState, useTransition } from "react";
import { PROFILE_SECTIONS } from "@/lib/profile/field-config";
import { buttonClassName } from "@/components/ui/button";
import {
  previewFounderNotificationAction,
  sendFounderNotificationAction,
  type PreviewNotificationResult,
} from "@/app/admin/_actions/notification-actions";
import type { FounderAudience, FounderMessageInput } from "@/lib/notifications/founder-notification-service";

type Purpose = "COMPLETE_PROFILE" | "COMPLETE_SECTION" | "GENERAL";
type AudienceKind = "ALL" | "INCOMPLETE" | "BELOW_PERCENT" | "MISSING_SECTION" | "INDIVIDUAL";

const inputClassName =
  "mt-1.5 w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClassName = "block text-sm font-medium text-foreground";

/**
 * Founder-only composer (Phase 4B). Two explicit steps, never one — the
 * founder must Preview (which computes a real recipient count and a real
 * sample from the first matching user) before Send becomes available, and
 * any change to the form invalidates the preview so a send can never go
 * out for an audience/message the founder didn't actually see.
 */
export function NotificationComposer({
  preselectedUser,
}: {
  preselectedUser?: { userId: string; displayName: string } | null;
}) {
  const [purpose, setPurpose] = useState<Purpose>("COMPLETE_PROFILE");
  const [audienceKind, setAudienceKind] = useState<AudienceKind>(
    preselectedUser ? "INDIVIDUAL" : "ALL",
  );
  const [percent, setPercent] = useState(50);
  const [sectionId, setSectionId] = useState(PROFILE_SECTIONS[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const [preview, setPreview] = useState<PreviewNotificationResult | null>(null);
  const [sendResult, setSendResult] = useState<{ ok: boolean; error?: string; sentCount?: number; skippedDuplicateCount?: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  function buildAudience(): FounderAudience {
    if (preselectedUser) return { kind: "INDIVIDUAL", userId: preselectedUser.userId };
    switch (audienceKind) {
      case "ALL":
        return { kind: "ALL" };
      case "INCOMPLETE":
        return { kind: "INCOMPLETE" };
      case "BELOW_PERCENT":
        return { kind: "BELOW_PERCENT", percent };
      case "MISSING_SECTION":
        return { kind: "MISSING_SECTION", sectionId };
      case "INDIVIDUAL":
        // Only reachable with a preselected user in this UI.
        return { kind: "ALL" };
    }
  }

  function buildMessage(): FounderMessageInput {
    if (purpose === "GENERAL") return { purpose: "GENERAL", title, body };
    if (purpose === "COMPLETE_SECTION") return { purpose: "COMPLETE_SECTION", sectionId };
    return { purpose: "COMPLETE_PROFILE" };
  }

  function invalidatePreview() {
    setPreview(null);
    setSendResult(null);
  }

  function handlePreview() {
    startTransition(async () => {
      const result = await previewFounderNotificationAction(buildAudience(), buildMessage());
      setPreview(result);
      setSendResult(null);
    });
  }

  function handleSend() {
    if (!preview || preview.recipientCount === 0) return;
    startTransition(async () => {
      const result = await sendFounderNotificationAction(buildAudience(), buildMessage());
      setSendResult(result);
      if (result.ok) {
        setPreview(null);
      }
    });
  }

  const messageValid = purpose !== "GENERAL" || (title.trim().length > 0 && body.trim().length > 0);

  return (
    <div className="max-w-xl space-y-6">
      {preselectedUser ? (
        <div>
          <p className={labelClassName}>Recipient</p>
          <p className="mt-1.5 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
            {preselectedUser.displayName}
          </p>
        </div>
      ) : (
        <div>
          <label className={labelClassName} htmlFor="audience">
            Who should receive this?
          </label>
          <select
            id="audience"
            value={audienceKind}
            onChange={(e) => {
              setAudienceKind(e.target.value as AudienceKind);
              invalidatePreview();
            }}
            className={inputClassName}
          >
            <option value="ALL">All users</option>
            <option value="INCOMPLETE">Users with incomplete profiles</option>
            <option value="BELOW_PERCENT">Users below a completion percentage</option>
            <option value="MISSING_SECTION">Users missing a specific section</option>
          </select>

          {audienceKind === "BELOW_PERCENT" && (
            <div className="mt-3">
              <label className={labelClassName} htmlFor="percent">
                Below this percentage
              </label>
              <input
                id="percent"
                type="number"
                min={1}
                max={99}
                value={percent}
                onChange={(e) => {
                  setPercent(Number(e.target.value));
                  invalidatePreview();
                }}
                className={inputClassName}
              />
            </div>
          )}

          {audienceKind === "MISSING_SECTION" && (
            <div className="mt-3">
              <label className={labelClassName} htmlFor="audienceSection">
                Missing this section
              </label>
              <select
                id="audienceSection"
                value={sectionId}
                onChange={(e) => {
                  setSectionId(e.target.value);
                  invalidatePreview();
                }}
                className={inputClassName}
              >
                {PROFILE_SECTIONS.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div>
        <label className={labelClassName} htmlFor="purpose">
          Purpose
        </label>
        <select
          id="purpose"
          value={purpose}
          onChange={(e) => {
            setPurpose(e.target.value as Purpose);
            invalidatePreview();
          }}
          className={inputClassName}
        >
          <option value="COMPLETE_PROFILE">Complete your profile</option>
          <option value="COMPLETE_SECTION">Complete a profile section</option>
          <option value="GENERAL">General notification</option>
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          {purpose === "COMPLETE_PROFILE" &&
            "Each person is nudged toward their own next incomplete section — the title and message are generated from their real, current progress."}
          {purpose === "COMPLETE_SECTION" &&
            "Every recipient is nudged toward the exact section you choose below."}
          {purpose === "GENERAL" && "You write the exact title and message."}
        </p>
      </div>

      {purpose === "COMPLETE_SECTION" && (
        <div>
          <label className={labelClassName} htmlFor="messageSection">
            Section
          </label>
          <select
            id="messageSection"
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              invalidatePreview();
            }}
            className={inputClassName}
          >
            {PROFILE_SECTIONS.map((section) => (
              <option key={section.id} value={section.id}>
                {section.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {purpose === "GENERAL" && (
        <div className="space-y-4">
          <div>
            <label className={labelClassName} htmlFor="title">
              Title
            </label>
            <input
              id="title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                invalidatePreview();
              }}
              placeholder="e.g. Complete your profile"
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName} htmlFor="body">
              Message
            </label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                invalidatePreview();
              }}
              rows={3}
              placeholder="Keep it human and concise."
              className={inputClassName}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handlePreview}
          disabled={isPending || !messageValid}
          className={buttonClassName("secondary")}
        >
          {isPending && !preview ? "Checking…" : "Preview"}
        </button>
        {preview && preview.recipientCount > 0 && (
          <button type="button" onClick={handleSend} disabled={isPending} className={buttonClassName("primary")}>
            {isPending ? "Sending…" : "Send notification"}
          </button>
        )}
      </div>

      {preview && (
        <div className="rounded-lg border border-border p-4">
          {preview.recipientCount === 0 ? (
            <p className="text-sm font-medium text-foreground">No users match this audience.</p>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">
                {preview.recipientCount} user{preview.recipientCount === 1 ? "" : "s"} will receive this
                notification.
              </p>
              {preview.sample && (
                <div className="mt-3 rounded-lg border border-border bg-muted p-4">
                  <p className="text-xs text-muted-foreground">
                    Example, as {preview.sample.recipientName} will see it:
                  </p>
                  <div className="mt-2 rounded-md border border-border bg-background p-3">
                    <p className="text-sm font-medium text-foreground">🔔 {preview.sample.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{preview.sample.body}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Destination: {preview.sample.targetRoute ?? "None — informational only"}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {sendResult && (
        <div
          className={`rounded-md border p-3 text-sm ${
            sendResult.ok ? "border-accent-soft bg-accent-soft text-accent-hover" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {sendResult.ok ? (
            <>
              Sent to {sendResult.sentCount} user{sendResult.sentCount === 1 ? "" : "s"}.
              {sendResult.skippedDuplicateCount ? (
                <> {sendResult.skippedDuplicateCount} already had this notification unread and were skipped.</>
              ) : null}
            </>
          ) : (
            sendResult.error
          )}
        </div>
      )}
    </div>
  );
}
