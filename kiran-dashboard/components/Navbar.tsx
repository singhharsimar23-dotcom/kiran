'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') === 'true';

  const navLinks = [
    { href: '/forecast', label: 'Forecast' },
    { href: '/reserve', label: 'Reserve' },
    { href: '/gon', label: 'GON' },
    { href: '/cluster', label: 'Cluster' },
    { href: '/verify', label: 'Verify' },
  ];

  return (
    <nav className="border-b border-gray-200 px-6 py-3 flex items-center justify-between bg-white sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <Link href="/" className="font-bold text-lg text-blue-900 tracking-tight">
          KIRAN
        </Link>
        {isDemo && (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-wider">
            Demo Mode
          </span>
        )}
      </div>

      <div className="flex items-center gap-6">
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href + (isDemo ? '?demo=true' : '')}
              className={`text-sm font-medium transition-colors hover:text-blue-600 relative py-1 ${
                isActive ? 'text-blue-700 font-bold' : 'text-gray-600'
              }`}
            >
              {link.label}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
