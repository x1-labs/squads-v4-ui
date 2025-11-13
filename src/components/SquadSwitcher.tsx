import { useSquadConfig } from '@/hooks/useSquadConfig';
import { useMultisigAddress } from '@/hooks/useMultisigAddress';
import { useMultisigData } from '@/hooks/useMultisigData';
import { SavedSquad } from '../types/squad';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { ChevronDown, Plus, Check, Trash2, Copy, Users } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { VaultSelector } from './VaultSelector';
import { toast } from 'sonner';

export const SquadSwitcher = () => {
  const { squads, selectedSquad, removeSquad, selectSquad } = useSquadConfig();
  const { setMultisigAddress } = useMultisigAddress();
  const { multisigVault } = useMultisigData();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSelectSquad = (address: string) => {
    selectSquad.mutate(address);
    setMultisigAddress.mutate(address);
    
    // Get the current path segments
    const pathSegments = location.pathname.split('/').filter(Boolean);
    
    // If we're on a page with a multisig address, replace it
    if (pathSegments.length > 0 && pathSegments[0].length > 20) { // Likely a multisig address
      // Replace the first segment (multisig address) with the new one
      pathSegments[0] = address;
      navigate(`/${pathSegments.join('/')}`);
    } else if (pathSegments.length > 0) {
      // We're on a page like /settings or /create, just go to the squad home
      navigate(`/${address}`);
    } else {
      // We're on the root page
      navigate(`/${address}`);
    }
  };

  const handleRemoveSquad = (address: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to remove this squad?')) {
      removeSquad.mutate(address);
    }
  };

  const handleNewSquad = () => {
    setMultisigAddress.mutate(null);
    selectSquad.mutate(null);
    navigate('/');
  };

  // Display label or address
  const getDisplayText = () => {
    if (!selectedSquad) return 'Select Squad';
    // If squad has a custom name, show it, otherwise show truncated address
    if (selectedSquad.name && !selectedSquad.name.startsWith('Squad ')) {
      return selectedSquad.name;
    }
    return `${selectedSquad.address.slice(0, 6)}...${selectedSquad.address.slice(-6)}`;
  };

  const handleCopyVaultAddress = () => {
    if (multisigVault) {
      navigator.clipboard.writeText(multisigVault.toBase58());
      toast.success('Vault address copied to clipboard');
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="flex items-center gap-2 px-3 text-xs font-medium text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          Multisig Account
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between bg-background/50 hover:bg-accent">
              <span
                className={`truncate ${!selectedSquad || selectedSquad.name?.startsWith('Squad ') ? 'font-mono text-sm' : ''}`}
              >
                {getDisplayText()}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[250px]">
        {squads.length > 0 && (
          <>
            {squads.map((squad: SavedSquad) => (
              <DropdownMenuItem
                key={squad.address}
                onClick={() => handleSelectSquad(squad.address)}
                className="group flex items-center justify-between"
              >
                <div className="flex min-w-0 flex-1 items-center">
                  {selectedSquad?.address === squad.address && (
                    <Check className="mr-2 h-4 w-4 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    {squad.name && !squad.name.startsWith('Squad ') ? (
                      <>
                        <div className="truncate font-medium">{squad.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {squad.address.slice(0, 4)}...{squad.address.slice(-4)}
                        </div>
                      </>
                    ) : (
                      <div className="truncate font-mono text-sm">
                        {squad.address.slice(0, 6)}...{squad.address.slice(-6)}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  onClick={(e) => handleRemoveSquad(squad.address, e)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={handleNewSquad}>
          <Plus className="mr-2 h-4 w-4" />
          Enter New Squad
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
      </div>
      {selectedSquad && <VaultSelector />}
      {selectedSquad && multisigVault && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 px-3 text-xs font-medium text-muted-foreground">
            <Copy className="h-3.5 w-3.5" />
            Vault Address
          </label>
          <div className="rounded-lg border bg-muted/50 p-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs">
                {multisigVault.toBase58().slice(0, 6)}...{multisigVault.toBase58().slice(-6)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={handleCopyVaultAddress}
                title="Copy vault address"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
