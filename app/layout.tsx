import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kër Ndar — Cuisine sénégalaise à Dakar',
  description: 'Une table sénégalaise généreuse à Dakar. Consultez la carte et commandez vos plats préférés.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="antialiased font-body bg-background text-foreground min-h-screen relative" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
