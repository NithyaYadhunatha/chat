import Link from 'next/link';
import { LiveCount, StartPanel } from '@/components/landing';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';

/** Attract mode: what a match looks like, with Pong playing underneath. */
function Cabinet() {
  return (
    <div className="relative border-2 border-fg" aria-label="Example match">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center border-b-2 border-line px-5 py-4">
        <span className="pixel text-2xl">03</span>
        <span className="label">rally 06 · 01:12</span>
        <span className="pixel justify-self-end text-2xl text-ball">04</span>
      </div>

      <div className="relative px-5 py-6">
        <span aria-hidden className="court-net absolute inset-y-2 left-1/2 -translate-x-1/2" />
        <div className="relative mb-5 flex justify-center">
          <div className="max-w-[16rem] bg-fg px-4 py-3 text-center text-bg">
            <p className="pixel mb-1.5 text-[8px]">serve</p>
            <p className="text-sm font-semibold leading-snug">What’s the most overrated movie of all time?</p>
          </div>
        </div>
        <div className="relative space-y-2.5 text-sm">
          <p className="w-fit max-w-[46%] border-l-4 border-fg bg-bg py-0.5 pl-3">ok settle this. best film of the 2000s</p>
          <p className="ml-auto w-fit max-w-[46%] border-r-4 border-ball bg-bg py-0.5 pr-3 text-right">spirited away. not taking questions</p>
          <p className="w-fit max-w-[46%] border-l-4 border-fg bg-bg py-0.5 pl-3">respectable. add me on snap?</p>
          <p className="relative flex justify-center py-1">
            <span className="bg-bg px-2 text-[11px] uppercase tracking-[0.12em] text-danger">— blocked: contact details —</span>
          </p>
        </div>

        <div className="relative mt-6 h-24" aria-hidden>
          <span className="absolute left-0 h-8 w-1.5 bg-fg" style={{ animation: 'paddle 1.9s linear infinite alternate' }} />
          <span className="absolute right-0 h-8 w-1.5 bg-ball" style={{ animation: 'paddle 1.6s linear infinite alternate-reverse' }} />
          <span className="absolute h-2 w-2 bg-fg" style={{ animation: 'pong-x 1.3s linear infinite alternate, pong-y 0.9s linear infinite alternate' }} />
        </div>
      </div>
    </div>
  );
}

const HOW = [
  ['Press start', 'Add a few interests or none. We pair you with a random adult — no names, no camera.'],
  ['Rally', 'Text back and forth. Stuck? Hit Serve for a question you both see.'],
  ['Next player', 'Esc Esc skips. If you both press Add, you become friends and can keep talking.'],
  ['Quiet table?', 'If nobody’s around, the CPU — a clearly-labelled AI practice bot — will play you until a human shows up.'],
];

const RULES = [
  'Adults only. Say you’re under 18 and you’re off the table.',
  'Nothing sexual. It’s blocked before it’s delivered.',
  'No numbers, socials or links with strangers.',
  'No slurs, threats or harassment.',
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8">
        <section className="grid items-center gap-14 pb-20 pt-8 sm:pt-14 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div className="space-y-8">
            <LiveCount />
            <h1 className="pixel text-[26px] leading-[1.4] sm:text-[38px]">
              Text a<br />stranger.<br /><span className="text-ball">Keep the<br />rally going.</span>
            </h1>
            <p className="max-w-[46ch] text-[15px] leading-7 text-muted">
              One-on-one text chat with a random adult. No profiles, no camera — just a good back-and-forth.
              Skip whenever you like.
            </p>
            <StartPanel />
          </div>
          <Cabinet />
        </section>

        <section id="how" className="grid scroll-mt-8 gap-10 border-t-2 border-line py-16 lg:grid-cols-2">
          <div>
            <h2 className="pixel mb-8 text-sm">how to play</h2>
            <ol className="space-y-6">
              {HOW.map(([title, body], i) => (
                <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-2">
                  <span className="pixel pt-0.5 text-xs text-ball">{i + 1}.</span>
                  <div>
                    <p className="mb-1 font-bold uppercase tracking-wide">{title}</p>
                    <p className="text-sm leading-6 text-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="pixel mb-8 text-sm">house rules</h2>
            <ul className="border-2 border-line">
              {RULES.map((r, i) => (
                <li key={r} className={`flex gap-4 px-5 py-4 text-sm leading-6 ${i > 0 ? 'border-t-2 border-line' : ''}`}>
                  <span className="mt-2 h-2 w-2 shrink-0 bg-fg" />
                  {r}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-6 text-muted">
              Every message is checked before it’s delivered, reports come with the real transcript, and everything is
              free — no paid filters. <Link href="/rules" className="text-fg underline underline-offset-4 hover:text-ball">Full rules →</Link>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
