export interface SavedSquad {
  address: string;
  name: string;
  network?: 'mainnet' | 'devnet' | 'testnet';
  addedAt: number;
}

export interface SquadConfig {
  squads: SavedSquad[];
  selectedSquad: string | null;
}