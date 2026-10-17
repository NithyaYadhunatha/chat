'use client';

// Last-resort boundary (root layout crashed) — must render its own <html>.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: '#000', color: '#fff', fontFamily: 'system-ui, sans-serif', padding: '4rem 1.5rem' }}>
        <h1 style={{ fontSize: 28, marginBottom: 16 }}>PingPong dropped the ball.</h1>
        <button
          onClick={reset}
          style={{ background: '#FFD600', color: '#000', border: 0, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace', textTransform: 'uppercase' }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
