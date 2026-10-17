import { ButtonLink } from '@/components/ui';
import { SiteHeader } from '@/components/site-chrome';

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-24 sm:px-8">
        <p className="label mb-4">404</p>
        <h1 className="mb-6 text-3xl font-medium tracking-tight">Nobody here.</h1>
        <ButtonLink href="/">Back to start</ButtonLink>
      </main>
    </div>
  );
}
