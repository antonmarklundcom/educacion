import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {/* The skip link in the root layout targets this (PR-34). `tabIndex`
          is what actually moves focus here rather than just the viewport. */}
      <div id="contenido" tabIndex={-1} className="flex-1">
        {children}
      </div>
      <Footer />
    </div>
  );
}
