import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Next Door Callendar',
    short_name: 'Callendar',
    description: 'Kalendarz całego życia',
    start_url: '/',
    display: 'standalone',
    background_color: '#0C1521',
    theme_color: '#0C1521',
    lang: 'pl',
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
