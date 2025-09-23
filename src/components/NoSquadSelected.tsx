import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Search, Loader2, Radar, Check } from 'lucide-react';
import { useState } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useSquadConfig } from '@/hooks/useSquadConfig';
import { useMultisigAddress } from '@/hooks/useMultisigAddress';
import { useMultisigData } from '@/hooks/useMultisigData';
import { validateSquadAddress } from '@/lib/utils';
import { getEnvSquadLabel } from '@/lib/envSquads';
import { useDiscoverSquads } from '@/hooks/useDiscoverSquads';
import { useWallet } from '@solana/wallet-adapter-react';
import { Alert, AlertDescription } from './ui/alert';

export const NoSquadSelected = () => {
  const navigate = useNavigate();
  const [squadAddress, setSquadAddress] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [addedSquads, setAddedSquads] = useState<Set<string>>(new Set());
  const { selectSquad, addSquad } = useSquadConfig();
  const { setMultisigAddress } = useMultisigAddress();
  const { connection } = useMultisigData();
  const { publicKey } = useWallet();
  const { scanForSquads, isScanning, discoveredSquads, error: scanError } = useDiscoverSquads();

  const handleEnterSquad = async () => {
    setError('');
    setIsValidating(true);

    try {
      // Validate that the address is actually a squad
      const validation = await validateSquadAddress(connection, squadAddress);

      if (!validation.isValid) {
        setError(validation.error || 'Invalid address');
        return;
      }

      // Select the squad and navigate to its URL
      selectSquad.mutate(squadAddress);
      setMultisigAddress.mutate(squadAddress);
      navigate(`/${squadAddress}`);
    } finally {
      setIsValidating(false);
    }
  };

  const handleAddDiscoveredSquad = (address: string) => {
    // Get environment label if available
    const envLabel = getEnvSquadLabel(address);
    
    // Add the squad to saved squads
    addSquad.mutate({
      address,
      name: envLabel || `Squad ${address.slice(0, 4)}...${address.slice(-4)}`,
    });
    
    // Track that we've added this squad
    setAddedSquads(prev => new Set(prev).add(address));
    
    // Don't navigate away - let user add multiple squads
    // They can select a squad from the switcher when ready
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="space-y-2 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Squads</h1>
          <p className="text-lg text-muted-foreground">
            Enter a squad address or create a new one to get started
          </p>
        </div>

        <Card className="border-2">
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-2">
              <Label htmlFor="squad-address" className="text-sm font-medium">
                Squad Address
              </Label>
              <div className="flex gap-2">
                <Input
                  id="squad-address"
                  placeholder="Enter Solana address..."
                  value={squadAddress}
                  onChange={(e) => {
                    setSquadAddress(e.target.value);
                    setError('');
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && squadAddress.trim()) {
                      handleEnterSquad();
                    }
                  }}
                  className="h-11"
                />
                <Button
                  onClick={handleEnterSquad}
                  disabled={!squadAddress.trim() || isValidating}
                  size="lg"
                  className="px-4"
                >
                  {isValidating ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Search className="h-5 w-5" />
                  )}
                </Button>
              </div>
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-3 font-medium text-muted-foreground">Or</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => navigate('/create')}
                className="h-11"
                variant="outline"
                size="lg"
              >
                <Plus className="mr-2 h-5 w-5" />
                Create New
              </Button>
              
              <Button
                onClick={scanForSquads}
                disabled={!publicKey || isScanning}
                className="h-11"
                variant="outline"
                size="lg"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Radar className="mr-2 h-5 w-5" />
                    Scan for Squads
                  </>
                )}
              </Button>
            </div>
            
            {!publicKey && (
              <p className="text-center text-sm text-muted-foreground">
                Connect wallet to scan for existing squads
              </p>
            )}
          </CardContent>
        </Card>
        
        {/* Display discovered squads */}
        {(discoveredSquads.length > 0 || scanError) && (
          <Card>
            <CardContent className="pt-6">
              {scanError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{scanError}</AlertDescription>
                </Alert>
              )}
              
              {discoveredSquads.length > 0 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">
                      Found {discoveredSquads.length} Squad{discoveredSquads.length !== 1 ? 's' : ''}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Select a squad to add it to your saved list
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    {discoveredSquads.map((squad) => {
                      const envLabel = getEnvSquadLabel(squad.address);
                      const isAdded = addedSquads.has(squad.address);
                      
                      return (
                        <div
                          key={squad.address}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="min-w-0 flex-1">
                            {envLabel && (
                              <div className="font-medium">{envLabel}</div>
                            )}
                            <div className="font-mono text-sm text-muted-foreground">
                              {squad.address.slice(0, 8)}...{squad.address.slice(-8)}
                            </div>
                            <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                              <span>{squad.memberCount} members</span>
                              <span>Threshold: {squad.threshold}/{squad.memberCount}</span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleAddDiscoveredSquad(squad.address)}
                            disabled={isAdded}
                            variant={isAdded ? "ghost" : "default"}
                            className={isAdded ? "text-green-600" : ""}
                          >
                            {isAdded ? (
                              <>
                                <Check className="mr-1 h-4 w-4" />
                                Added
                              </>
                            ) : (
                              'Add'
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
