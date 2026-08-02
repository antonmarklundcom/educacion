import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'educacion.com.py',
  description: 'El índice completo, buscable y comparable de la educación superior en Paraguay.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-PY">
      <body className="antialiased">{children}</body>
    </html>
  );
}
