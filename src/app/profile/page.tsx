import Image from "next/image";
import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { ProfileCompletionSummary } from "@/components/profile-completion-summary";
import { requireUserId } from "@/lib/auth";
import { createPostgresProfileRepository } from "@/lib/profile/db/postgres-repository";
import { getOrCreateProfile } from "@/lib/profile/profile-service";
import { PROFILE_FIELD_CONFIG } from "@/lib/profile/field-config";
import { postgresAnalyticsSink } from "@/lib/developer-connect/db/postgres-analytics-sink";
import { getOrCreateSessionId, getDeviceType } from "@/lib/session";

export const metadata: Metadata = {
  title: "Your profile | Developer Connect",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  // proxy.ts already redirects signed-out visitors before this renders;
  // requireUserId is the defense-in-depth backstop.
  const userId = await requireUserId();
  const user = await currentUser();

  const repo = createPostgresProfileRepository();
  const sessionId = await getOrCreateSessionId();
  const deviceType = await getDeviceType();

  const { completion } = await getOrCreateProfile(repo, userId, {
    sink: postgresAnalyticsSink,
    sessionId,
    deviceType,
  });

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex-1">
        <Container className="py-12 sm:py-16">
          <div className="mx-auto max-w-xl">
            <div className="flex items-center gap-4">
              {user?.imageUrl && (
                <Image
                  src={user.imageUrl}
                  alt=""
                  width={56}
                  height={56}
                  unoptimized
                  className="h-14 w-14 rounded-full"
                />
              )}
              <div>
                <h1 className="text-2xl font-semibold text-foreground">
                  {user?.fullName || "Your profile"}
                </h1>
                {user?.primaryEmailAddress && (
                  <p className="text-sm text-muted-foreground">
                    {user.primaryEmailAddress.emailAddress}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-8 rounded-lg border border-border bg-muted p-6">
              {PROFILE_FIELD_CONFIG.length === 0 ? (
                <>
                  <p className="font-medium text-foreground">Nothing to complete yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Developer Connect doesn&apos;t have any profile information to add yet. When
                    it does, you&apos;ll be able to fill it in here — a little at a time, at your
                    own pace. Nothing here is ever required to keep using Developer Connect.
                  </p>
                </>
              ) : (
                <ProfileCompletionSummary completion={completion} />
              )}
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Your profile is private. It&apos;s never shown to other visitors and never appears
              on any developer page.
            </p>
          </div>
        </Container>
      </main>
    </div>
  );
}
