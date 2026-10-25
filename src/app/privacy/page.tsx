import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { CONTACT_EMAIL, Doc, Sec, UPDATED } from "@/components/LegalDoc";

export const metadata: Metadata = { title: "Privacy Policy", description: "What Portal Juice collects, why, and how to delete it." };

export default function Page() {
  return (
    <>
      <PageHeader title="Privacy Policy" sub="What Portal Juice collects, why, and how to delete it." note={`Last updated ${UPDATED}`} />
      <Doc>
        <Sec title="The short version">
          <p>
            Portal Juice is a sports scores, odds information and pick-tracking app. It does not take bets, hold money or process wagers. You can use it without an account. Picks, notes and settings you log are stored on your
            device first. We don&apos;t sell your data, we don&apos;t run ads, and we don&apos;t use third-party analytics or tracking.
          </p>
        </Sec>

        <Sec title="What we collect">
          <ul>
            <li>
              <b>On your device only</b> (unless you sign in): picks, parlays, notes, favorite team, quests and display settings, saved in your browser or app storage.
            </li>
            <li>
              <b>Account</b> (optional): a random account ID, and, if you choose a sign-in method that has one, your email address, name and profile photo from that provider (email code, Google or Sign in with Apple, when offered). A
              private account needs no email at all. We keep a hashed session token in a secure cookie to keep you signed in.
            </li>
            <li>
              <b>Synced data</b> (signed in): a cloud copy of your picks, notes, stats and quests so they follow you across devices.
            </li>
            <li>
              <b>Squads and social</b> (if you use them): your handle, squad memberships, friends, invites, messages and reactions you post in threads, picks you share or tail, your shared live position, and Leaders standings.
              Friends can see your open picks unless you turn that off in Account.
            </li>
            <li>
              <b>Notifications</b> (if you turn them on): a push subscription or device token and your alert preferences, so we can send game and pick alerts.
            </li>
            <li>
              <b>Widget</b> (if you set it up): a revocable device token that reads your live progress.
            </li>
            <li>
              <b>Photo slip reads and Ask Portal</b>: a slip photo or question you send is processed to read the legs or answer you, then discarded. We don&apos;t store the photo.
            </li>
            <li>
              <b>VIP</b> (if you join on the web): your plan status. Payments are handled by Stripe; we never see or store your payment details. If you join the VIP waitlist, we keep your email or account to tell you when it opens.
            </li>
            <li>
              <b>Safety and abuse prevention</b>: short-lived rate-limit counters keyed by account or IP address, and reports you make in threads.
            </li>
            <li>
              <b>Server logs</b>: our host keeps standard request logs (IP address, device and browser type, time) for a short period for security and debugging.
            </li>
          </ul>
        </Sec>

        <Sec title="How we use it">
          <ul>
            <li>To run the app: show your picks, grade them against final scores, sync devices, power squads and Leaders, and send alerts you asked for.</li>
            <li>To keep it safe: limit spam and abuse, and act on reports.</li>
            <li>To run VIP for members who joined on the web.</li>
          </ul>
          <p>We don&apos;t sell or rent personal data, share it for advertising, or track you across other companies&apos; apps and websites.</p>
        </Sec>

        <Sec title="Who processes it for us">
          <ul>
            <li>Vercel: hosting, and the AI Gateway that routes photo slip reads and Ask Portal questions to an AI model provider. Content is processed to answer the request.</li>
            <li>Upstash: the database for accounts, synced data, squads and alerts.</li>
            <li>Apple and Google push services: delivering notifications. Google and Apple: sign-in, when you choose them.</li>
            <li>Resend: sending sign-in codes by email, when email sign-in is offered.</li>
            <li>Stripe: VIP payments on the web.</li>
          </ul>
          <p>Scores, stats and lines come from public sports data feeds (ESPN and DraftKings). We send them no personal data about you.</p>
        </Sec>

        <Sec title="How long we keep it">
          <p>Account and synced data stay until you delete them. Sign-in codes expire in 10 minutes. Sessions end after 180 days. Rate-limit counters expire within hours. Server logs roll off after a short period.</p>
        </Sec>

        <Sec title="Delete your account">
          <p>
            In the app, go to <Link href="/account">More → Account and settings</Link> and tap <b>Delete account and cloud data</b>. That deletes your account, sign-ins, synced picks and notes, squads and social data, push
            subscriptions, widget tokens and VIP status right away. A copy saved on your own device stays until you clear it there (Account → reset, or delete the app). You can also email us to delete it for you.
          </p>
        </Sec>

        <Sec title="Your choices">
          <ul>
            <li>Use the app without an account.</li>
            <li>Turn off notifications any time in Account or your phone&apos;s settings.</li>
            <li>Turn off &quot;Friends can see all my open picks&quot; in Account.</li>
            <li>Ask for a copy, correction or deletion of your data by email. We answer within 30 days.</li>
          </ul>
        </Sec>

        <Sec title="Age">
          <p>Portal Juice is for adults 18 and older. It isn&apos;t directed to children, and we don&apos;t knowingly collect data from anyone under 18.</p>
        </Sec>

        <Sec title="Changes and contact">
          <p>
            If this policy changes, we&apos;ll update the date above. Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </Sec>
      </Doc>
    </>
  );
}
