import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Search, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useSquadConfig } from '@/hooks/useSquadConfig';
import { useMultisigAddress } from '@/hooks/useMultisigAddress';
import { useMultisigData } from '@/hooks/useMultisigData';
import { validateSquadAddress } from '@/lib/utils';
import { getEnvSquadLabel } from '@/lib/envSquads';

export const NoSquadSelected = () => {
  const navigate = useNavigate();
  const [squadAddress, setSquadAddress] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const { selectSquad } = useSquadConfig();
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

      // Select the squad and navigate to its URL
      selectSquad.mutate(squadAddress);
      setMultisigAddress.mutate(squadAddress);
      navigate(`/${squadAddress}`);
    } finally {
      setIsValidating(false);
    }
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

            <Button
              onClick={() => navigate('/create')}
              className="h-11 w-full"
              variant="outline"
              size="lg"
            >
              <Plus className="mr-2 h-5 w-5" />
              Create New Squad
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
