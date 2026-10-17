import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';

export const metadata: Metadata = { title: 'House rules' };

const RULES = [
  ['You must be 18 or older.', 'No exceptions. If you say you’re younger, or other people report that you seem to be, stranger chat is paused for your account until a moderator checks.'],
  ['No sexual content.', 'No sexual messages, sexting, roleplay, requests for photos, or “wanna have fun?”. This is a place for conversation.'],
  ['Nothing that sexualises minors. Ever.', 'Accounts are suspended immediately and the case is escalated.'],
  ['No harassment or hate.', 'No slurs, targeted abuse, threats, or telling anyone to hurt themselves.'],
  ['Don’t move strangers elsewhere.', 'Phone numbers, emails, social handles and links are blocked in stranger chat. If you both want to keep talking, use “Add friend” — it only works if both of you press it.'],
  ['No spam or scams.', 'No ads, money requests, crypto, or bots.'],
];

const LADDER = [
  ['Private ratings', 'After a chat you can rate it. Nobody sees ratings, but people many strangers rate badly mostly get matched with each other.'],
  ['Blocked message', 'The message isn’t delivered and you see why.'],
  ['Strike', 'Clear violations add strike points. Points fade over time if you stay out of trouble.'],
  ['Chat ban', '1 hour, then 24 hours, then 7 days, then permanently, as points add up.'],
  ['Suspension', 'Content involving minors, or a moderator decision, suspends the whole account.'],
];

export default function RulesPage() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-10 pt-12 sm:px-8">
        <p className="label mb-4">house rules</p>
        <h1 className="pixel mb-6 text-2xl leading-relaxed sm:text-3xl">Be a good<br />sport.</h1>
        <p className="mb-14 max-w-[60ch] text-[15px] leading-6 text-muted">
          Talking to strangers is only fun when it’s safe. These rules apply in stranger chat and in direct messages.
        </p>

        <section className="mb-16">
          <h2 className="pixel mb-6 text-sm">The rules</h2>
          <ol className="divide-y-2 divide-line border-y-2 border-line">
            {RULES.map(([title, body], i) => (
              <li key={title} className="grid gap-1 py-5 sm:grid-cols-[3rem_1fr]">
                <span className="pixel pt-1 text-xs text-ball">{i + 1}.</span>
                <div>
                  <p className="text-[15px] font-medium">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mb-16">
          <h2 className="pixel mb-5 text-sm">How moderation works</h2>
          <div className="space-y-4 text-sm leading-6 text-muted">
            <p>
              Every message in stranger chat goes through a filter before it’s delivered. It looks past tricks like
              l33tspeak, look-alike letters and s p a c e d out words, and it considers the whole conversation — a
              compliment is fine between adults, but not after someone has said they’re 15.
            </p>
            <p>
              Conversations can also be reviewed by an automated AI monitor that looks for grooming, escalation and
              signs that someone is underage. Anything serious goes to a human moderator along with the transcript.
            </p>
          </div>
          <dl className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
            {LADDER.map(([term, desc]) => (
              <div key={term} className="bg-surface p-5">
                <dt className="mb-1 text-sm font-medium">{term}</dt>
                <dd className="text-[13px] leading-5 text-muted">{desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="privacy" className="mb-16 scroll-mt-8">
          <h2 className="pixel mb-5 text-sm">Privacy</h2>
          <ul className="space-y-3 text-sm leading-6 text-muted">
            <li>Strangers never see your username, email or photo. Only if you both press “Add friend” are usernames shown.</li>
            <li>Stranger chat messages are not saved. We keep the last part of a conversation in memory for 15 minutes so it can be reported, then it’s gone.</li>
            <li>If a chat is reported or flagged, that excerpt is saved for moderators as evidence.</li>
            <li>Direct messages with friends are stored so you can read your history. Deleting your account deletes them.</li>
            <li>We record when you were matched and how a chat ended (not what was said), to fight abuse.</li>
          </ul>
        </section>

        <section id="help" className="scroll-mt-8">
          <h2 className="pixel mb-5 text-sm">If you need help</h2>
          <p className="mb-4 text-sm leading-6 text-muted">
            If you or someone else is in danger, contact your local emergency number. If you’re struggling, free and
            confidential support is available:
          </p>
          <ul className="space-y-2 font-mono text-[13px]">
            <li className="flex justify-between border-b border-line pb-2"><span className="text-muted">India · Tele-MANAS</span><span>14416</span></li>
            <li className="flex justify-between border-b border-line pb-2"><span className="text-muted">India · KIRAN</span><span>1800-599-0019</span></li>
            <li className="flex justify-between border-b border-line pb-2"><span className="text-muted">US · Suicide &amp; Crisis Lifeline</span><span>988</span></li>
            <li className="flex justify-between border-b border-line pb-2"><span className="text-muted">Elsewhere</span><a className="underline underline-offset-4" href="https://findahelpline.com" rel="noreferrer" target="_blank">findahelpline.com</a></li>
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
