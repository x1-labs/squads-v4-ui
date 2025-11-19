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

type NetworkConfig = {
  id: string;
  name: string;
  url: string;
  rpcUrl: string;
};

const NETWORKS: NetworkConfig[] = [
  {
    id: 'x1-mainnet',
    name: 'X1 Mainnet',
    url: 'https://multisig.mainnet.x1.xyz',
    rpcUrl: 'https://rpc.mainnet.x1.xyz',
  },
  {
    id: 'x1-testnet',
    name: 'X1 Testnet',
    url: 'https://multisig.testnet.x1.xyz',
    rpcUrl: 'https://rpc.testnet.x1.xyz',
  },
  {
    id: 'solana-mainnet',
    name: 'Solana Mainnet',
    url: 'https://multisig.solana-mainnet.x1.xyz',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
  },
];

const getCurrentNetwork = (currentRpcUrl: string): NetworkConfig => {
  const hostname = window.location.hostname;

  // First, try to match by RPC URL
  const networkByRpc = NETWORKS.find(
    (n) => currentRpcUrl.includes(n.rpcUrl) || n.rpcUrl.includes(currentRpcUrl.replace(/\/$/, ''))
  );
  if (networkByRpc) {
    return networkByRpc;
  }

  // Fall back to hostname matching
  const network = NETWORKS.find((n) => n.url.includes(hostname));

  // Default to X1 Mainnet for localhost/development
  return network || NETWORKS[0];
};

export const NetworkSwitcher: React.FC = () => {
  const { rpcUrl } = useRpcUrl();
  const currentNetwork = getCurrentNetwork(rpcUrl || '');

  const handleNetworkChange = (networkId: string) => {
    const network = NETWORKS.find((n) => n.id === networkId);
    if (network && network.id !== currentNetwork.id) {
      // Redirect to the selected network, preserving the current path
      const currentPath = window.location.pathname + window.location.hash;
      window.location.href = network.url + currentPath;
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
