"use server";

import { revalidatePath } from "next/cache";
import { requireFounderForAction } from "@/lib/auth";
import { createPostgresBuyerEnquiryRepository } from "@/lib/enquiries/db/postgres-repository";

/** Founder only: marks every rating as read, so the "new" markers on the ratings page clear. */
export async function markRatingsSeenAction(): Promise<{ marked: number }> {
  await requireFounderForAction();
  const marked = await createPostgresBuyerEnquiryRepository().markAllSeen(new Date());
  revalidatePath("/admin/ratings");
  revalidatePath("/admin/command-centre");
  return { marked };
}
