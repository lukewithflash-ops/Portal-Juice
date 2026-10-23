import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { CONTACT_EMAIL, Doc, Sec } from "@/components/LegalDoc";
import { FOOTER_LINE } from "@/lib/site";

export const metadata: Metadata = { title: "Support", description: "Help with Portal Juice: contact and answers." };

const FAQ: [string, React.ReactNode][] = [
  ["Can I bet in Portal Juice?", <>No. Portal Juice shows scores, stats and lines and tracks the picks you log. There&apos;s no wagering, no deposits and no money. {FOOTER_LINE}</>],
  ["Do I need an account?", <>No. Scores, lines, live games and logging picks all work without one. Sign in to sync across devices, join squads and show up on Leaders.</>],
  ["How are picks graded?", <>Automatically from the final score and box score: win, loss or push. Open picks track live with meters.</>],
  ["Where do lines come from?", <>DraftKings prices as published, labeled on each line. Scores and stats come from ESPN. If a number isn&apos;t available, we show nothing instead of guessing.</>],
  ["A slip photo read something wrong.", <>Tap the leg to fix the player, line or league before saving. Each leg shows the league it detected and you can switch it in one tap.</>],
  ["How do I join a squad?", <>Open an invite link from a friend. You join with your account name, no handle to type.</>],
  ["How do I stop notifications?", <>Turn alerts off in Account, or in your phone&apos;s Settings → Notifications → Portal Juice.</>],
  ["How do I delete my account?", <>Go to <Link href="/account">More → Account and settings</Link> and tap Delete account and cloud data. It&apos;s immediate. Or email us and we&apos;ll do it.</>],
  ["How do I report someone?", <>In any thread, tap ⋯ on a message, then Report or Hide. We review reports and remove content that breaks the <Link href="/terms">Terms</Link>.</>],
];

export default function Page() {
  return (
    <>
      <PageHeader title="Support" sub="Questions, bugs or account help." />
      <Doc>
        <Sec title="Contact">
          <p>
            Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We reply within 2 business days. Include your device and what you tapped if something broke.
          </p>
        </Sec>
        <Sec title="FAQ">
          <dl className="space-y-3">
            {FAQ.map(([q, a]) => (
              <div key={q}>
                <dt className="font-bold text-white">{q}</dt>
                <dd className="text-zinc-400">{a}</dd>
              </div>
            ))}
          </dl>
        </Sec>
        <Sec title="Responsible play">
          <p>
            If betting stops being fun, take a break. Call or text 1-800-GAMBLER (US) for free, confidential help, or visit <a href="https://www.ncpgambling.org">ncpgambling.org</a>.
          </p>
        </Sec>
        <p className="text-center text-[12px] text-zinc-500">
          <Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Use</Link>
        </p>
      </Doc>
    </>
  );
}
