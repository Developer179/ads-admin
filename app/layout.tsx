import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'App Ads — Admin',
  description: 'Control everything the app shows (Explore, Trade Board): live app view, conditions, rollout.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto scroll-thin">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
