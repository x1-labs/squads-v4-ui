import { ArrowDownUp, LucideHome, Settings, Users, Box, Github, Coins } from 'lucide-react';
import ConnectWallet from '@/components/ConnectWalletButton';
import { Link } from 'react-router-dom';
import { useLocation, useParams } from 'react-router-dom';
import { SquadSwitcher } from './SquadSwitcher';
import { MembershipWarning } from './MembershipWarning';
import { MobileNav } from './MobileNav';
import { useMultisigData } from '@/hooks/useMultisigData';

export default function TabNav() {
  const location = useLocation();
  const path = location.pathname;
  const params = useParams<{ multisigAddress?: string }>();
  const { multisigAddress } = useMultisigData();
  
  // Use multisig from URL or from current selection
  const currentMultisig = params.multisigAddress || multisigAddress || '';
  
  const tabs = [
    { name: 'Home', icon: <LucideHome />, route: currentMultisig ? `/${currentMultisig}` : '/' },
    { name: 'Transactions', icon: <ArrowDownUp />, route: currentMultisig ? `/${currentMultisig}/transactions` : '/' },
    { name: 'Staking', icon: <Coins />, route: currentMultisig ? `/${currentMultisig}/stake` : '/' },
    { name: 'Configuration', icon: <Users />, route: currentMultisig ? `/${currentMultisig}/config` : '/' },
    { name: 'Programs', icon: <Box />, route: currentMultisig ? `/${currentMultisig}/programs` : '/' },
    { name: 'Settings', icon: <Settings />, route: '/settings' },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        id="sidebar"
        className="z-40 hidden h-auto md:fixed md:left-0 md:top-0 md:block md:h-screen md:w-3/12 lg:w-3/12"
        aria-label="Sidebar"
      >
        <div className="flex h-auto flex-col justify-between overflow-y-auto border-border bg-muted/50 px-3 py-4 dark:bg-background md:h-full md:border-r">
          <div>
            <Link to="/">
              <div className="mb-10 flex items-center rounded-lg px-3 py-2 text-slate-900 dark:text-white">
                <img
                  src="/logo.png"
                  width="150"
                  height="auto"
                  className="dark:brightness-200 dark:invert"
                />
              </div>
            </Link>
            <ul className="space-y-2 text-sm font-medium">
              {tabs.map((tab) => (
                <li key={tab.name}>
                  <Link
                    to={tab.route}
                    className={`flex items-center rounded-lg px-4 py-3 text-foreground ${
                      (tab.name === 'Settings' ? path === tab.route : 
                       tab.name === 'Home' ? path === tab.route : 
                       path === tab.route || (path!.startsWith(`${tab.route}/`) && tab.route !== '/'))
                        ? 'bg-primary/20 dark:bg-primary/20'
                        : 'hover:bg-accent dark:hover:bg-accent'
                    }`}
                  >
                    {tab.icon}
                    <span className="ml-3 flex-1 whitespace-nowrap text-base">{tab.name}</span>
                  </Link>
                </li>
              ))}
              <li key={'github-link'}>
                <Link
                  key={`github-link`}
                  to="https://github.com/x1-labs/squads-v4-ui"
                  target="_blank"
                  rel="noreferrer"
                  className={`flex items-center rounded-lg px-4 py-3 text-foreground hover:bg-accent dark:hover:bg-accent`}
                >
                  <Github />
                  <span className="ml-3 flex-1 whitespace-nowrap text-base">GitHub Repo</span>
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <MembershipWarning />
            <SquadSwitcher />
            <ConnectWallet />
          </div>
        </div>
      </aside>

      {/* Mobile Navigation */}
      <MobileNav />
    </>
  );
}
