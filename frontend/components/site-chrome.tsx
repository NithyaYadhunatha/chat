import Link from 'next/link';
import { ButtonLink, Wordmark } from '@/components/ui';

const NAV_LINK = 'px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-muted hover:text-fg';

export function SiteHeader() {
  return (
    <header className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
      <Link href="/" aria-label="PingPong home">
        <Wordmark />
      </Link>
      <nav className="flex items-center gap-1">
        <Link href="/#how" className={`hidden md:block ${NAV_LINK}`}>How to play</Link>
        <Link href="/rules" className={`hidden sm:block ${NAV_LINK}`}>Rules</Link>
        <Link href="/login" className={NAV_LINK}>Log in</Link>
        <ButtonLink href="/register" size="sm" variant="secondary" className="ml-2">Sign up</ButtonLink>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-5 pb-10 pt-16 sm:px-8">
      <div className="flex flex-col gap-4 border-t-2 border-line pt-6 text-xs uppercase tracking-[0.12em] text-faint sm:flex-row sm:items-center sm:justify-between">
        <p>© PingPong · adults only · be a good sport</p>
        <nav className="flex gap-6">
          <Link href="/rules" className="hover:text-fg">Rules</Link>
          <Link href="/rules#privacy" className="hover:text-fg">Privacy</Link>
          <Link href="/rules#help" className="hover:text-fg">Get help</Link>
        </nav>
      </div>
    </footer>
  );
}
