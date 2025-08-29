import { useSquadConfig } from '@/hooks/useSquadConfig';
import { useMultisigAddress } from '@/hooks/useMultisigAddress';
import { SavedSquad } from '../types/squad';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { ChevronDown, Plus, Check, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { isEnvSquad } from '@/lib/envSquads';

export const SquadSwitcher = () => {
  const { squads, selectedSquad, removeSquad, selectSquad } = useSquadConfig();
  const { setMultisigAddress } = useMultisigAddress();
  const navigate = useNavigate();

  const handleSelectSquad = (address: string) => {
    selectSquad.mutate(address);
    setMultisigAddress.mutate(address);
    navigate('/');
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

  // Separate env squads from user squads
  const envSquads = squads.filter((squad) => isEnvSquad(squad));
  const userSquads = squads.filter((squad) => !isEnvSquad(squad));

  // Display label for env squads, address for user squads
  const getDisplayText = () => {
    if (!selectedSquad) return 'Select Squad';
    if (isEnvSquad(selectedSquad)) {
      return selectedSquad.name;
    }
    return `${selectedSquad.address.slice(0, 6)}...${selectedSquad.address.slice(-6)}`;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="mb-2 w-full justify-between">
          <span
            className={`truncate ${!selectedSquad || !isEnvSquad(selectedSquad) ? 'font-mono text-sm' : ''}`}
          >
            {getDisplayText()}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[250px]">
        {envSquads.length > 0 && (
          <>
            {envSquads.map((squad: SavedSquad) => (
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
                    <div className="truncate font-medium">{squad.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {squad.address.slice(0, 4)}...{squad.address.slice(-4)}
                    </div>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        {userSquads.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              User Defined
            </div>
            {userSquads.map((squad: SavedSquad) => (
              <DropdownMenuItem
                key={squad.address}
                onClick={() => handleSelectSquad(squad.address)}
                className="group flex items-center justify-between"
              >
                <div className="flex min-w-0 flex-1 items-center">
                  {selectedSquad?.address === squad.address && (
                    <Check className="mr-2 h-4 w-4 shrink-0" />
                  )}
                  <div className="truncate font-mono text-sm">
                    {squad.address.slice(0, 6)}...{squad.address.slice(-6)}
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
  );
};
