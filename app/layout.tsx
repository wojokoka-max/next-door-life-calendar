import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Next Door Callendar',
  description: 'Kalendarz całego życia — wydarzenia, zadania i oś czasu w jednym miejscu.',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Callendar' },
};

export const viewport: Viewport = {
  themeColor: '#0C1521',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" data-theme="granat">
        <head>
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          />
        </head>
        <body>{children}</body>
    </html>
  );
}
