import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Music Room',
  description: 'Listen to YouTube music personally or together in synchronized rooms.',
  icons: {
    icon: '/icon.svg'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
