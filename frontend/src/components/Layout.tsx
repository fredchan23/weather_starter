import { Sidebar } from './Sidebar';
import { Hero } from './Hero';
import { ThemeSelector } from './ThemeSelector';

export function Layout() {
  return (
    <div className="relative flex h-full min-h-screen w-full">
      <Sidebar />
      <Hero />
      <div className="fixed right-4 top-4 z-50">
        <ThemeSelector />
      </div>
    </div>
  );
}
