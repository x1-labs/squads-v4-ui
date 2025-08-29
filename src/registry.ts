/**
 * Central registry for all program registrations
 * Add new programs here to register their IDLs, summaries, and tags
 */

import { registry } from './lib/registry';
import { XntTransferSummary } from './components/instructions/summaries/XntTransferSummary';
import { SplTransferSummary } from './components/instructions/summaries/SplTransferSummary';

// Import IDLs
import squadsV4Idl from './lib/idls/squads-v4.json';
import delegationProgramIdl from './lib/idls/delegation_program.json';
import stakePoolIdl from './lib/idls/stake_pool.json';
import tokenProgramIdl from './lib/idls/token_program.json';

// ============================================
// System Program
// ============================================
registry.register({
  programId: '11111111111111111111111111111111',
  name: 'System Program',
  instructions: {
    Transfer: {
      summary: XntTransferSummary,
      tags: { label: 'XNT Transfer', color: 'purple', variant: 'subtle' },
    },
    CreateAccount: {
      tags: { label: 'Create Account', color: 'blue', variant: 'subtle' },
    },
    Allocate: {
      tags: { label: 'Allocate', color: 'gray', variant: 'subtle' },
    },
  },
});

// ============================================
// SPL Token Programs
// ============================================
registry.register({
  programId: [
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
    'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022 Program
  ],
  name: 'SPL Token Program',
  idl: tokenProgramIdl,
  instructions: {
    Transfer: {
      summary: SplTransferSummary,
      tags: { label: 'Token Transfer', color: 'purple', variant: 'subtle' },
    },
    TransferChecked: {
      summary: SplTransferSummary,
      tags: { label: 'Token Transfer', color: 'purple', variant: 'subtle' },
    },
    MintTo: {
      tags: { label: 'Mint Tokens', color: 'green', variant: 'subtle' },
    },
    Burn: {
      tags: { label: 'Burn Tokens', color: 'red', variant: 'subtle' },
    },
    Approve: {
      tags: { label: 'Approve', color: 'blue', variant: 'subtle' },
    },
    Revoke: {
      tags: { label: 'Revoke', color: 'orange', variant: 'subtle' },
    },
    InitializeMint: {
      tags: { label: 'Create Token', color: 'cyan', variant: 'subtle' },
    },
    InitializeAccount: {
      tags: { label: 'Create Token Account', color: 'indigo', variant: 'subtle' },
    },
    CloseAccount: {
      tags: { label: 'Close Account', color: 'gray', variant: 'subtle' },
    },
  },
});

// ============================================
// Squads Multisig V4
// ============================================
registry.register({
  programId: 'DDL3Xp6ie85DXgiPkXJ7abUyS2tGv4CGEod2DeQXQ941',
  name: 'Squads Multisig V4',
  idl: squadsV4Idl,
  instructions: {
    ConfigTransaction: {
      tags: { label: 'Config Transaction', color: 'blue', variant: 'subtle' },
    },
  },
});

// ============================================
// Delegation Program
// ============================================
registry.register({
  programId: 'X1DPvnLXekvd6EtDsPVqahzhziKx3Zj1z8WkD93xebg',
  name: 'Delegation Program',
  idl: delegationProgramIdl,
  instructions: {
    UpdateConfig: {
      tags: { label: 'Update Config', color: 'blue', variant: 'subtle' },
    },
    CreateValidator: {
      tags: { label: 'Create Validator', color: 'blue', variant: 'subtle' },
    },
    RemoveValidator: {
      tags: { label: 'Remove Validator', color: 'blue', variant: 'subtle' },
    },
    ApproveValidator: {
      tags: { label: 'Approve Validator', color: 'blue', variant: 'subtle' },
    },
    RejectValidator: {
      tags: { label: 'Reject Validator', color: 'red', variant: 'subtle' },
    },
    UpdateValidatorStatus: {
      tags: { label: 'Update Validator Status', color: 'blue', variant: 'subtle' },
    },
  },
});

// ============================================
// Stake Pool Program
// ============================================
registry.register({
  programId: 'XPoo1Fx6KNgeAzFcq2dPTo95bWGUSj5KdPVqYj9CZux',
  name: 'Stake Pool',
  idl: stakePoolIdl,
  instructions: {
    Stake: {
      tags: { label: 'Stake', color: 'green', variant: 'subtle' },
    },
    Unstake: {
      tags: { label: 'Unstake', color: 'yellow', variant: 'subtle' },
    },
    ClaimRewards: {
      tags: { label: 'Claim Rewards', color: 'purple', variant: 'subtle' },
    },
  },
});

// ============================================
// Add your custom programs here
// ============================================
// Example:
// registry.register({
//   programId: 'YourProgramId123...',
//   name: 'Your Program Name',
//   idl: yourIdl,  // Optional
//   instructions: {
//     YourInstruction: {
//       summary: YourInstructionSummary,  // Optional React component
//       tags: { label: 'Your Action', color: 'blue', variant: 'subtle' }
//     }
//   }
// });

// Export registry for direct access if needed
export { registry } from './lib/registry';
