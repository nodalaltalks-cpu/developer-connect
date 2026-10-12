import type { Metadata } from "next";
import { EnquiryForm } from "@/components/social/enquiry-form";

export const metadata: Metadata = {
  title: "Tell us what you need | Developer Connects",
  description: "A one-minute, tap-to-select property enquiry for Mumbai and Dubai. No typing: just tap your requirements and leave your number.",
  alternates: { canonical: "/enquire" },
};

export default function EnquirePage() {
  return (
    <main className="min-h-dvh bg-background">
      <EnquiryForm />
    </main>
  );
}
