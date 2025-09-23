import { useState } from 'react';
import { ArrowDownUp, LucideHome, Settings, Users, Box, Menu, X, Coins, Server } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import ConnectWallet from '@/components/ConnectWalletButton';
import { SquadSwitcher } from './SquadSwitcher';
import { MembershipWarning } from './MembershipWarning';
import { Button } from './ui/button';
import { useMultisigData } from '@/hooks/useMultisigData';

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const path = location.pathname;
  const params = useParams<{ multisigAddress?: string }>();
  const { multisigAddress } = useMultisigData();
  
  // Use multisig from URL or from current selection
  const currentMultisig = params.multisigAddress || multisigAddress || '';

  const tabs = [
    { name: 'Home', icon: <LucideHome className="h-5 w-5" />, route: currentMultisig ? `/${currentMultisig}` : '/' },
    { name: 'Transactions', icon: <ArrowDownUp className="h-5 w-5" />, route: currentMultisig ? `/${currentMultisig}/transactions` : '/' },
    { name: 'Staking', icon: <Coins className="h-5 w-5" />, route: currentMultisig ? `/${currentMultisig}/stake` : '/' },
    { name: 'Configuration', icon: <Users className="h-5 w-5" />, route: currentMultisig ? `/${currentMultisig}/config` : '/' },
    { name: 'Programs', icon: <Box className="h-5 w-5" />, route: currentMultisig ? `/${currentMultisig}/programs` : '/' },
    { name: 'Validators', icon: <Server className="h-5 w-5" />, route: currentMultisig ? `/${currentMultisig}/validators ` : '/' },
    { name: 'Settings', icon: <Settings className="h-5 w-5" />, route: '/settings' },
  ];

  const handleNavClick = () => {
    setIsOpen(false);
  };

  return (
    <>
      {/* Mobile Header Bar */}
      <div className="fixed top-0 z-50 w-full border-b border-border bg-background md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex items-center">
            <img
              src="/logo.png"
              width="120"
              height="auto"
              className="dark:brightness-200 dark:invert"
              alt="Logo"
            />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Slide-out Menu */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-background shadow-lg transition-transform duration-300 ease-in-out md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Menu Header */}
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <span className="text-lg font-semibold">Menu</span>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 space-y-1 p-4">
            {tabs.map((tab) => {
              const isActive =
                (currentMultisig || tab.name === 'Settings') && (
                  tab.name === 'Settings' ? path === tab.route :
                  tab.name === 'Home' ? path === tab.route :
                  (path === tab.route || (path!.startsWith(`${tab.route}/`) && tab.route !== '/'))
                );
              return (
                <Link
                  key={tab.name}
                  to={tab.route}
                  onClick={handleNavClick}
                  className={`flex items-center rounded-lg px-4 py-3 text-base transition-colors ${
                    isActive
                      ? 'bg-primary/20 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {tab.icon}
                  <span className="ml-3">{tab.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Bottom Section */}
          <div className="space-y-3 border-t border-border p-4">
            <MembershipWarning />
            <SquadSwitcher />
            <ConnectWallet />
          </div>
        </div>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Bottom Navigation (Alternative/Complementary) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background md:hidden">
        <div className="grid h-16 grid-cols-6">
          {tabs.map((tab) => {
            const isActive =
              (currentMultisig || tab.name === 'Settings') && (
                tab.name === 'Settings' ? path === tab.route :
                tab.name === 'Home' ? path === tab.route :
                (path === tab.route || (path!.startsWith(`${tab.route}/`) && tab.route !== '/'))
              );
            return (
              <Link
                key={tab.name}
                to={tab.route}
                className={`flex flex-col items-center justify-center space-y-1 ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {tab.icon}
                <span className="text-xs">{tab.name.split(' ')[0]}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
