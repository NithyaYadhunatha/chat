import Link from 'next/link';
import { Wordmark } from '@/components/ui';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-5 sm:px-8">
        <Link href="/" aria-label="Home">
          <Wordmark />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-10 sm:pt-20">
        <div className="w-full max-w-[380px]">{children}</div>
      </main>
    </div>
  );
}
