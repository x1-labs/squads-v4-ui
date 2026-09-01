import React from 'react';
import { Network } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRpcUrl } from '@/hooks/useSettings';
import { NETWORKS, getCurrentNetwork } from '@/lib/network';

export const NetworkSwitcher: React.FC = () => {
  const { rpcUrl } = useRpcUrl();
  const currentNetwork = getCurrentNetwork(rpcUrl || '');

  const handleNetworkChange = (networkId: string) => {
    const network = NETWORKS.find((n) => n.id === networkId);
    if (network && network.id !== currentNetwork.id) {
      // Redirect to the root of the selected network (multisigs are network-specific)
      window.location.href = network.url;
    }
  };

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 px-3 text-xs font-medium text-muted-foreground">
        <Network className="h-3.5 w-3.5" />
        Network
      </label>
      <Select value={currentNetwork.id} onValueChange={handleNetworkChange}>
        <SelectTrigger className="w-full bg-background/50 hover:bg-accent">
          <SelectValue placeholder="Select network" />
        </SelectTrigger>
        <SelectContent>
          {NETWORKS.map((network) => (
            <SelectItem key={network.id} value={network.id}>
              {network.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
