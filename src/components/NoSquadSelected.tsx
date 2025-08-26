import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Search, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Input } from './ui/input';
import { useSquadConfig } from '@/hooks/useSquadConfig';
import { useMultisigAddress } from '@/hooks/useMultisigAddress';
import { useMultisigData } from '@/hooks/useMultisigData';
import { PublicKey } from '@solana/web3.js';
import { validateSquadAddress } from '@/lib/utils';

export const NoSquadSelected = () => {
  const navigate = useNavigate();
  const [squadAddress, setSquadAddress] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const { addSquad, selectSquad } = useSquadConfig();
  const { setMultisigAddress } = useMultisigAddress();
  const { connection } = useMultisigData();

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

      // Add to saved squads and select it
      addSquad.mutate({
        address: squadAddress,
        name: `Squad ${squadAddress.slice(0, 4)}...${squadAddress.slice(-4)}`,
      });
      selectSquad.mutate(squadAddress);
      setMultisigAddress.mutate(squadAddress);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <Users className="h-12 w-12 text-muted-foreground" />
          </div>
          <CardTitle>Welcome to Squads</CardTitle>
          <CardDescription>
            Enter a squad address or create a new one to get started
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Enter squad address:</p>
            <div className="flex gap-2">
              <Input
                placeholder="Squad address..."
                value={squadAddress}
                onChange={(e) => {
                  setSquadAddress(e.target.value);
                  setError('');
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleEnterSquad();
                  }
                }}
              />
              <Button onClick={handleEnterSquad} disabled={!squadAddress.trim() || isValidating}>
                {isValidating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <Button onClick={() => navigate('/create')} className="w-full" variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Create New Squad
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
