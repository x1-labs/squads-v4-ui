import { useState } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ChevronDown, Plus, X, Check, Edit2, Trash2, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PublicKey } from '@solana/web3.js';
import { validateSquadAddress } from '@/lib/utils';

export const SquadSwitcher = () => {
  const { squads, selectedSquad, addSquad, removeSquad, selectSquad, updateSquad } = useSquadConfig();
  const { setMultisigAddress } = useMultisigAddress();
  const { connection } = useMultisigData();
  const navigate = useNavigate();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSquad, setEditingSquad] = useState<string | null>(null);
  const [newSquadAddress, setNewSquadAddress] = useState('');
  const [newSquadName, setNewSquadName] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const handleSelectSquad = (address: string) => {
    selectSquad.mutate(address);
    setMultisigAddress.mutate(address);
    navigate('/');
  };

  const handleAddSquad = async () => {
    setError('');
    setIsValidating(true);

    try {
      if (!newSquadName.trim()) {
        setError('Name is required');
        return;
      }

      // Validate that the address is actually a squad
      const validation = await validateSquadAddress(connection, newSquadAddress);
      
      if (!validation.isValid) {
        setError(validation.error || 'Invalid address');
        return;
      }

      addSquad.mutate({
        address: newSquadAddress,
        name: newSquadName.trim(),
      });

      setNewSquadAddress('');
      setNewSquadName('');
      setIsAddDialogOpen(false);
    } finally {
      setIsValidating(false);
    }
  };

  const handleEditSquad = () => {
    if (!editingSquad) return;

    if (!newSquadName.trim()) {
      setError('Name is required');
      return;
    }

    updateSquad.mutate({
      address: editingSquad,
      updates: { name: newSquadName.trim() },
    });

    setEditingSquad(null);
    setNewSquadName('');
    setIsEditDialogOpen(false);
  };

  const handleRemoveSquad = (address: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to remove this squad?')) {
      removeSquad.mutate(address);
    }
  };

  const openEditDialog = (address: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSquad(address);
    setNewSquadName(name);
    setError('');
    setIsEditDialogOpen(true);
  };

  const handleNewSquad = () => {
    setMultisigAddress.mutate(null);
    selectSquad.mutate(null);
    navigate('/');
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between mb-2">
            <span className="truncate">
              {selectedSquad ? selectedSquad.name : 'Select Squad'}
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
                  className="flex items-center justify-between group"
                >
                  <div className="flex items-center flex-1 min-w-0">
                    {selectedSquad?.address === squad.address && (
                      <Check className="mr-2 h-4 w-4 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{squad.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {squad.address.slice(0, 4)}...{squad.address.slice(-4)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={(e) => openEditDialog(squad.address, squad.name, e)}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 hover:text-destructive"
                      onClick={(e) => handleRemoveSquad(squad.address, e)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={handleNewSquad}>
            <Plus className="mr-2 h-4 w-4" />
            Enter New Squad
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add to Saved Squads
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Squad</DialogTitle>
            <DialogDescription>
              Save a squad for quick access
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="squad-name">Name</Label>
              <Input
                id="squad-name"
                value={newSquadName}
                onChange={(e) => {
                  setNewSquadName(e.target.value);
                  setError('');
                }}
                placeholder="My Squad"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="squad-address">Address</Label>
              <Input
                id="squad-address"
                value={newSquadAddress}
                onChange={(e) => {
                  setNewSquadAddress(e.target.value);
                  setError('');
                }}
                placeholder="Enter Solana address"
              />
            </div>
            {error && (
              <div className="text-sm text-destructive">{error}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={isValidating}>
              Cancel
            </Button>
            <Button onClick={handleAddSquad} disabled={isValidating}>
              {isValidating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isValidating ? 'Validating...' : 'Add Squad'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Squad Name</DialogTitle>
            <DialogDescription>
              Update the name for this squad
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-squad-name">Name</Label>
              <Input
                id="edit-squad-name"
                value={newSquadName}
                onChange={(e) => {
                  setNewSquadName(e.target.value);
                  setError('');
                }}
                placeholder="Squad Name"
              />
            </div>
            {error && (
              <div className="text-sm text-destructive">{error}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSquad}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
