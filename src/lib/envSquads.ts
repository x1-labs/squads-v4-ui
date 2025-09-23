import { SavedSquad } from '../types/squad';

/**
 * Parse environment variables to extract pre-configured saved squads.
 * Environment variables should be in the format:
 * APP_SAVED_SQUAD_<LABEL>=<ADDRESS>
 *
 * Example:
 * APP_SAVED_SQUAD_DELEGATION_PROGRAM=X1DPvnLXekvd6EtDsPVqahzhziKx3Zj1z8WkD93xebg
 *
 * The label will be converted from UPPER_SNAKE_CASE to Title Case.
 */
export function getEnvSquads(): SavedSquad[] {
  const envSquads: SavedSquad[] = [];

  // Get the saved squads object injected by webpack
  const savedSquadsEnv = process.env.APP_SAVED_SQUADS;
  if (!savedSquadsEnv) {
    console.log('No APP_SAVED_SQUADS found in process.env');
    return envSquads;
  }

  // Parse the JSON string if needed
  const envVars = typeof savedSquadsEnv === 'string' ? JSON.parse(savedSquadsEnv) : savedSquadsEnv;
  console.log('Saved squads from env:', envVars);

  Object.entries(envVars).forEach(([key, value]) => {
    if (value && typeof value === 'string' && value.length > 0) {
      const prefix = 'APP_SAVED_SQUAD_';
      const labelPart = key.substring(prefix.length);

      // Convert UPPER_SNAKE_CASE to Title Case
      const name = labelPart
        .split('_')
        .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
        .join(' ');

      console.log(`Found env squad: ${name} = ${value}`);
      envSquads.push({
        address: value,
        name: name,
        addedAt: 0,
        fromEnv: true,
      });
    }
  });

  console.log('Total env squads found:', envSquads.length);
  return envSquads;
}

/**
 * Merge environment-based squads with user-saved squads.
 * No longer automatically adds env squads - they must be manually added.
 * This function now just returns the saved squads.
 */
export function mergeEnvSquadsWithSaved(savedSquads: SavedSquad[]): SavedSquad[] {
  // Don't automatically add env squads anymore
  // Users must manually add them
  return savedSquads;
}

/**
 * Get the default label for a squad address from environment variables.
 * Returns the label if found, otherwise returns null.
 */
export function getEnvSquadLabel(address: string): string | null {
  const envSquads = getEnvSquads();
  const envSquad = envSquads.find(squad => squad.address === address);
  return envSquad ? envSquad.name : null;
}

/**
 * Check if a squad is from environment variables (cannot be removed by user)
 */
export function isEnvSquad(squad: SavedSquad): boolean {
  return squad.fromEnv;
}
