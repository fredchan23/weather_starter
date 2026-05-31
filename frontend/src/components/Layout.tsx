import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Hero } from './Hero';
import { ThemeSelector } from './ThemeSelector';
import { MenuIcon } from './icons';

export function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden lg:flex lg:h-screen lg:overflow-hidden">
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close locations panel"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-white/10 bg-black/35 px-4 py-3 backdrop-blur-2xl lg:hidden">
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          aria-label="Open locations panel"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-2 text-sm font-medium text-white/85 backdrop-blur-xl hover:bg-white/[0.14]"
        >
          <MenuIcon className="h-4 w-4" />
          <span>Locations</span>
        </button>
        <ThemeSelector />
      </div>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex min-h-screen min-w-0 flex-1 pt-[4.5rem] lg:min-h-0 lg:pt-0">
        <Hero />
      </div>

      <div className="fixed right-4 top-4 z-50 hidden lg:block">
        <ThemeSelector />
      </div>
    </div>
  );
}
