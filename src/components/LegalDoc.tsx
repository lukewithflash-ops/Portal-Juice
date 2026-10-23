/** Plain reading layout for Privacy, Terms and Support. */
export function Doc({ children }: { children: React.ReactNode }) {
  return <article className="mx-auto max-w-2xl space-y-5 text-[14px] leading-relaxed text-zinc-300 [&_a]:font-bold [&_a]:text-purple-200 [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_ul]:space-y-1.5">{children}</article>;
}

export function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="mb-2 text-[15px] font-black text-white">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export const CONTACT_EMAIL = "lukewithflash@gmail.com";
export const UPDATED = "October 23, 2026";
