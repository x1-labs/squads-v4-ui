import { ArrowDownUp, LucideHome, Settings, Users, Box, Github } from 'lucide-react';
import ConnectWallet from '@/components/ConnectWalletButton';
import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { ChangeMultisigFromNav } from './ChangeMultisigFromNav';

export default function TabNav() {
  const location = useLocation();
  const path = location.pathname;
  const tabs = [
    { name: 'Home', icon: <LucideHome />, route: '/' },
    { name: 'Transactions', icon: <ArrowDownUp />, route: '/transactions/' },
    { name: 'Configuration', icon: <Users />, route: '/config/' },
    { name: 'Programs', icon: <Box />, route: '/programs/' },
    { name: 'Settings', icon: <Settings />, route: '/settings/' },
  ];

  return (
    <>
      <aside
        id="sidebar"
        className="z-40 hidden h-auto md:fixed md:left-0 md:top-0 md:block md:h-screen md:w-3/12 lg:w-3/12"
        aria-label="Sidebar"
      >
        <div className="flex h-auto flex-col justify-between overflow-y-auto border-border bg-muted/50 px-3 py-4 md:h-full md:border-r dark:bg-background">
          <div>
            <Link to="/">
              <div className="mb-10 flex items-center rounded-lg px-3 py-2 text-slate-900 dark:text-white">
                <img src="/logo.png" width="150" height="auto" className="dark:invert dark:brightness-200" />
              </div>
            </Link>
            <ul className="space-y-2 text-sm font-medium">
              {tabs.map((tab) => (
                <li key={tab.route}>
                  <Link
                    to={tab.route}
                    className={`flex items-center rounded-lg px-4 py-3 text-foreground ${
                      (path!.startsWith(`${tab.route}/`) && tab.route !== '/') || tab.route === path
                        ? 'bg-primary/20 dark:bg-primary/20'
                        : 'hover:bg-accent dark:hover:bg-accent'
                    }`}
                  >
                    {tab.icon}
                    <span className="ml-3 flex-1 whitespace-nowrap text-base">
                      {tab.name}
                    </span>
                  </Link>
                </li>
              ))}
              <li key={'github-link'}>
                <Link
                  key={`github-link`}
                  to="https://github.com/Squads-Protocol/public-v4-client"
                  target="_blank"
                  rel="noreferrer"
                  className={`flex items-center rounded-lg px-4 py-3 text-foreground hover:bg-accent dark:hover:bg-accent`}
                >
                  <Github />
                  <span className="ml-3 flex-1 whitespace-nowrap text-base">
                    GitHub Repo
                  </span>
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <ChangeMultisigFromNav />
            <ConnectWallet />
          </div>
        </div>
      </aside>

      <aside
        id="mobile-navbar"
        className="fixed inset-x-0 bottom-0 z-50 block bg-muted/50 dark:bg-background border-t border-border p-2 md:hidden"
        aria-label="Mobile navbar"
      >
        <div className="mx-auto mt-1 grid h-full max-w-lg grid-cols-5 font-medium">
          {tabs.map((tab) => (
            <Link to={tab.route} key={tab.route} className={`flex justify-center`}>
              <button
                type="button"
                className="group inline-flex flex-col items-center justify-center rounded-md py-2 hover:bg-accent"
              >
                {tab.icon}
                <span className="flex-1 whitespace-nowrap text-sm text-foreground">{tab.name}</span>
              </button>
            </Link>
          ))}
        </div>
      </aside>
    </>
  );
}
