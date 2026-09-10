import Image from "next/image";
import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { Container } from "@/components/ui/container";
import { SiteHeader } from "@/components/site-header";
import { ProfileEditor } from "@/components/profile/profile-editor";
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

export default async function ProfilePage({
  searchParams,
}: PageProps<"/profile">) {
  // proxy.ts already redirects signed-out visitors before this renders;
  // requireUserId is the defense-in-depth backstop.
  const userId = await requireUserId();
  const user = await currentUser();
  const resolvedSearchParams = await searchParams;
  const requestedSection =
    typeof resolvedSearchParams.section === "string" ? resolvedSearchParams.section : undefined;

  const repo = createPostgresProfileRepository();
  const sessionId = await getOrCreateSessionId();
  const deviceType = await getDeviceType();

  const { profile, completion } = await getOrCreateProfile(repo, userId, {
    sink: postgresAnalyticsSink,
    sessionId,
    deviceType,
  });

  const firstName = user?.firstName?.trim();

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex-1">
        <Container className="py-8 sm:py-12">
          <div className="mx-auto max-w-2xl">
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
                  Your Developer Connect profile
                </h1>
                <p className="text-sm text-muted-foreground">
                  {firstName ? `Good to have you here, ${firstName}.` : user?.fullName}
                </p>
              </div>
            </div>

            <p className="mb-6 mt-4 text-sm text-muted-foreground">
              Tell us a little about what you&apos;re looking for. The more you share, the more
              useful your experience can become — nothing here is ever required to keep using
              Developer Connect, and it&apos;s never shown to anyone else.
            </p>

            {PROFILE_FIELD_CONFIG.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted p-6">
                <p className="font-medium text-foreground">Nothing to complete yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Developer Connect doesn&apos;t have any profile information to add yet.
                </p>
              </div>
            ) : (
              <ProfileEditor
                initialData={profile.data}
                initialCompletion={completion}
                requestedSectionId={requestedSection}
              />
            )}
          </div>
        </Container>
      </main>
    </div>
  );
}
