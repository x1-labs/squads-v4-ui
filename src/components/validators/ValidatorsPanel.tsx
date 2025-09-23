import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { useValidators } from '@/hooks/useValidators';
import { useValidatorsOptimized, useAddValidator } from '@/hooks/useValidatorsOptimized';
import { useKnownValidators } from '@/hooks/useKnownValidators';
import { Skeleton } from '../ui/skeleton';
import { ValidatorsList } from './ValidatorsList';
import { AlertCircle, Search, Plus, X, Loader2 } from 'lucide-react';
import { useMultisigData } from '@/hooks/useMultisigData';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { toast } from 'sonner';

export function ValidatorsPanel() {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [votePubkey, setVotePubkey] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  
  const { multisigAddress } = useMultisigData();
  const { knownValidators, addKnownValidator } = useKnownValidators();
  const { addValidator } = useAddValidator();
  
  // Always use optimized for display
  const { data: validators, isLoading, error } = useValidatorsOptimized();
  
  // Full scan hook - only enabled when scanning
  const fullScanResult = useValidators(isScanning);

  const handleAddValidator = async () => {
    if (!votePubkey) {
      toast.error('Please enter a vote account address');
      return;
    }
    
    setIsAdding(true);
    try {
      await addValidator(votePubkey);
      toast.success('Validator added successfully');
      setVotePubkey('');
      setAddDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to add validator');
    } finally {
      setIsAdding(false);
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    toast.info('Scanning network for validators...');
  };

  // Watch for scan results and add them to saved validators
  React.useEffect(() => {
    if (fullScanResult.data && fullScanResult.data.length > 0 && isScanning) {
      let newCount = 0;
      fullScanResult.data.forEach(validator => {
        const votePubkey = validator.votePubkey.toBase58();
        // Check if not already in known validators
        if (!knownValidators.some((kv: any) => kv.votePubkey === votePubkey)) {
          addKnownValidator(votePubkey);
          newCount++;
        }
      });
      if (newCount > 0) {
        toast.success(`Found ${newCount} new validator(s)`);
      } else {
        toast.info('No new validators found');
      }
      setIsScanning(false);
    } else if (fullScanResult.isSuccess && fullScanResult.data?.length === 0 && isScanning) {
      toast.info('No validators found');
      setIsScanning(false);
    }
  }, [fullScanResult.data, fullScanResult.isSuccess, isScanning, knownValidators, addKnownValidator]);

  if (!multisigAddress) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">Please select a Squad to view and manage validators.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Squad Validators</CardTitle>
            <CardDescription>
              Validators where your Squad is the withdraw authority
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1 sm:flex-initial">
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Add Validator</span>
                  <span className="sm:hidden">Add</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Validator</DialogTitle>
                  <DialogDescription>
                    Enter the vote account address of a validator controlled by your Squad
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="vote-pubkey">Vote Account Address</Label>
                    <Input
                      id="vote-pubkey"
                      placeholder="Enter vote account public key"
                      value={votePubkey}
                      onChange={(e) => setVotePubkey(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddValidator()}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={isAdding}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddValidator} disabled={isAdding}>
                    {isAdding ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      'Add Validator'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-initial"
              onClick={handleScan}
              disabled={isScanning || fullScanResult.isLoading}
            >
              {isScanning || fullScanResult.isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
                  <span className="hidden sm:inline">Scanning...</span>
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 sm:mr-2" />
                  <span>Scan</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-4">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">Error</p>
              <p className="text-sm text-muted-foreground">Failed to load validators. Please try again.</p>
            </div>
          </div>
        ) : validators && validators.length > 0 ? (
          <ValidatorsList validators={validators} />
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No validators found</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Add validators by their vote account address or scan the network
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}