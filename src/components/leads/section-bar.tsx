/**
 * The coloured bar that opens each section of a lead screen and carries the section's name, so the sections are told apart at a glance.
 * It sits at the top of a card that has `p-4`: the negative margins stretch it edge to edge. The colour follows the name, so the same
 * section is the same colour on the Founder's screen and on a team member's.
 */
const TONES: Record<string, string> = {
  Contact: "bg-green-700 text-white",
  "Lead status": "bg-slate-800 text-white",
  Stage: "bg-teal-700 text-white",
  Comments: "bg-amber-700 text-white",
  Calls: "bg-sky-800 text-white",
  "Follow-up": "bg-purple-800 text-white",
  "Buyer requirement": "bg-indigo-800 text-white",
  Qualification: "bg-cyan-800 text-white",
  Owner: "bg-stone-700 text-white",
  "Return lead": "bg-rose-800 text-white",
  "Erase personal data": "bg-red-800 text-white",
};
const FALLBACK = "bg-slate-700 text-white";

export function SectionBar({ title, id }: { title: string; id?: string }) {
  return (
    <h2 id={id} className={`-mx-4 -mt-4 mb-3 rounded-t-lg px-4 py-2.5 text-sm font-bold uppercase tracking-wider ${TONES[title] ?? FALLBACK}`}>
      {title}
    </h2>
  );
}
