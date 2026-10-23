import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { CONTACT_EMAIL, Doc, Sec, UPDATED } from "@/components/LegalDoc";
import { FOOTER_LINE } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Use", description: "The rules for using Portal Juice." };

export default function Page() {
  return (
    <>
      <PageHeader title="Terms of Use" sub="The rules for using Portal Juice." note={`Last updated ${UPDATED}`} />
      <Doc>
        <Sec title="What Portal Juice is">
          <p>
            Portal Juice shows sports scores, stats, odds information and lets you track your own picks. {FOOTER_LINE} You can&apos;t place a bet, deposit or win money in Portal Juice. Picks are graded win, loss or push only.
          </p>
        </Sec>
        <Sec title="Information, not advice">
          <p>
            Lines, stats, hit rates, Portal Pick, VIP picks and Ask Portal answers are information from public data. They are not a guarantee, a promise of results, or financial advice. Data can be late or wrong. If you choose to
            bet anywhere, that&apos;s your decision and must follow the laws where you are. Past hits are not a pick.
          </p>
        </Sec>
        <Sec title="Who can use it">
          <p>You must be 18 or older, or older if your local law requires it for sports betting information.</p>
        </Sec>
        <Sec title="Your account and content">
          <ul>
            <li>Keep your sign-in secure. You&apos;re responsible for what happens on your account.</li>
            <li>Handles, messages and shared picks you post must not be abusive, hateful, sexual, spammy, impersonating, or illegal, and must not promote or sell betting services. You can report or hide messages in threads.</li>
            <li>We can remove content and suspend accounts that break these rules.</li>
            <li>You can delete your account any time in <Link href="/account">Account</Link>.</li>
          </ul>
        </Sec>
        <Sec title="VIP">
          <p>
            VIP is an optional subscription for extra picks and tools. Where it&apos;s sold, the price, renewal and cancel terms are shown before you pay, and it renews until you cancel. VIP picks are not a guarantee.
          </p>
        </Sec>
        <Sec title="Responsible play">
          <p>
            If betting stops being fun, take a break. Help is free and confidential: call or text 1-800-GAMBLER (US), or visit <a href="https://www.ncpgambling.org">ncpgambling.org</a>.
          </p>
        </Sec>
        <Sec title="The legal part">
          <p>
            Portal Juice is provided as is, without warranties. To the extent the law allows, we aren&apos;t liable for losses from using it, including any bets you place elsewhere. Team names and logos belong to their owners;
            Portal Juice isn&apos;t affiliated with any league, team or sportsbook. We may update these terms; continuing to use the app means you accept the update.
          </p>
          <p>
            Contact: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also the <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </Sec>
      </Doc>
    </>
  );
}
