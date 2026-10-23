import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', weight: ['600', '700'] });

export const metadata: Metadata = {
  title: 'Chess Coach',
  description:
    'Play Stockfish in the browser and learn from every move: live evaluation, move classification, game review and an AI coach grounded in engine facts.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#0b0d14',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
