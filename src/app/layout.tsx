import type { Metadata, Viewport } from 'next';
import { SUBTITULO, TITULO } from '@/lib/config';
import './globals.css';

export const metadata: Metadata = {
  title: `${TITULO} - Missão Fraternal Setor Freguesia do Ó`,
  description: `${TITULO} · ${SUBTITULO}`,
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#047857',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
