/**
 * The bar that opens each section of a lead screen and carries the section's name. One colour for every section, so the screen reads
 * as one system. It sits at the top of a card that has `p-4`: the negative margins stretch it edge to edge, and the title text starts
 * at the same left edge as the content below it (the card's own padding).
 */
export function SectionBar({ title, id }: { title: string; id?: string }) {
  return (
    <h2
      id={id}
      className="-mx-4 -mt-4 mb-3 rounded-t-lg bg-slate-800 px-4 py-2.5 text-sm font-bold uppercase leading-5 tracking-wider text-white"
    >
      {title}
    </h2>
  );
}
