/**
 * Central registry for all program registrations
 * Add new programs here to register their IDLs, summaries, and tags
 */

import { registry } from './lib/registry';
import { XntTransferSummary } from './components/instructions/summaries/XntTransferSummary';
import { SplTransferSummary } from './components/instructions/summaries/SplTransferSummary';
import { MemoSummary } from './components/instructions/summaries/MemoSummary';
import { StakePoolDepositSummary } from './components/instructions/summaries/StakePoolDepositSummary';
import { StakePoolWithdrawSummary } from './components/instructions/summaries/StakePoolWithdrawSummary';
import { DelegateStakeSummary } from './components/instructions/summaries/DelegateStakeSummary';
import { DeactivateStakeSummary } from './components/instructions/summaries/DeactivateStakeSummary';
import { WithdrawStakeSummary } from './components/instructions/summaries/WithdrawStakeSummary';
import { SplitStakeSummary } from './components/instructions/summaries/SplitStakeSummary';
import { MergeStakeSummary } from './components/instructions/summaries/MergeStakeSummary';
import { InitializeStakeSummary } from './components/instructions/summaries/InitializeStakeSummary';
import { CreateAccountWithSeedSummary } from './components/instructions/summaries/CreateAccountWithSeedSummary';
import { UpdateCommissionSummary } from './components/instructions/summaries/UpdateCommissionSummary';
import { VoteWithdrawSummary } from './components/instructions/summaries/VoteWithdrawSummary';
import { VoteAuthorizeSummary } from './components/instructions/summaries/VoteAuthorizeSummary';
import { BridgeOutSummary } from './components/instructions/summaries/BridgeOutSummary';
import { BridgeInSummary } from './components/instructions/summaries/BridgeInSummary';
import { BridgeClaimSummary } from './components/instructions/summaries/BridgeClaimSummary';
import { BridgePauseSummary } from './components/instructions/summaries/BridgePauseSummary';
import { BridgeUnpauseSummary } from './components/instructions/summaries/BridgeUnpauseSummary';
import {
  BridgeInitializeSummary,
  BridgeTransferAdminSummary,
  BridgeSetGuardiansSummary,
  BridgeSetRoleSummary,
  BridgeSetFeesSummary,
  BridgeRegisterTokenSummary,
  BridgeDeregisterTokenSummary,
  BridgeUpdateTokenRegistrySummary,
  BridgeSetTokenFeesSummary,
  BridgeSetWhaleLimitsSummary,
  BridgeInitializeVaultSummary,
  BridgeInitializeRolesSummary,
  BridgeSetVaultBalanceSummary,
  BridgeMigrateConfigSummary,
  BridgeMigrateTokenRegistrySummary,
  BridgeTransferMintAuthoritySummary,
} from './components/instructions/summaries/warp-bridge';

// Import IDLs
import squadsV4Idl from './lib/idls/squads-v4.json';
import delegationProgramIdl from './lib/idls/delegation_program.json';
import tokenProgramIdl from './lib/idls/token_program.json';
import stakePoolIdl from './lib/idls/stake_pool.json';
import warpBridgeIdl from './lib/idls/warp_bridge.json';
// Stake program IDL is registered but uses custom parsing

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
    'Create Account With Seed': {
      summary: CreateAccountWithSeedSummary,
      tags: { label: 'Create Account', color: 'blue', variant: 'subtle' },
    },
    Allocate: {
      tags: { label: 'Allocate', color: 'gray', variant: 'subtle' },
    },
  },
});

registry.register({
  programId: 'Vote111111111111111111111111111111111111111',
  name: 'Vote Program',
  instructions: {
    updateCommission: {
      summary: UpdateCommissionSummary,
      tags: { label: 'Update Commission', color: 'purple', variant: 'subtle' },
    },
    withdraw: {
      summary: VoteWithdrawSummary,
      tags: { label: 'Withdraw Rewards', color: 'green', variant: 'subtle' },
    },
    authorize: {
      summary: VoteAuthorizeSummary,
      tags: { label: 'Change Authority', color: 'blue', variant: 'subtle' },
    },
  },
});

// ============================================
// Stake Program
// ============================================
registry.register({
  programId: 'Stake11111111111111111111111111111111111111',
  name: 'Stake Program',
  // Note: Stake program uses custom parsing in simpleDecoder.ts
  defaultTags: { label: 'Stake Program', color: 'gray', variant: 'subtle' },
  instructions: {
    Initialize: {
      summary: InitializeStakeSummary,
    },
    'Delegate Stake': {
      summary: DelegateStakeSummary,
      tags: { label: 'Delegate Stake', color: 'green', variant: 'subtle' },
    },
    Deactivate: {
      summary: DeactivateStakeSummary,
      tags: { label: 'Deactivate Stake', color: 'orange', variant: 'subtle' },
    },
    Withdraw: {
      summary: WithdrawStakeSummary,
      tags: { label: 'Withdraw Stake', color: 'blue', variant: 'subtle' },
    },
    Split: {
      summary: SplitStakeSummary,
      tags: { label: 'Split Stake', color: 'indigo', variant: 'subtle' },
    },
    Authorize: {
      tags: { label: 'Authorize Stake', color: 'purple', variant: 'subtle' },
    },
    'Set Lockup': {
      tags: { label: 'Set Lockup', color: 'gray', variant: 'subtle' },
    },
    Merge: {
      summary: MergeStakeSummary,
      tags: { label: 'Merge Stake', color: 'cyan', variant: 'subtle' },
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
// Memo Program
// ============================================
registry.register({
  programId: [
    'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', // Memo Program
    'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo', // Legacy Memo Program
  ],
  name: 'Memo Program',
  instructions: {
    Memo: {
      summary: MemoSummary,
      tags: { label: 'Memo', color: 'blue', variant: 'subtle' },
    },
  },
});

// ============================================
// X1 SPL Stake Pool Program (Fork)
// ============================================
registry.register({
  programId: process.env.APP_STAKE_POOL_PROGRAM_ID || 'XPoo1Fx6KNgeAzFcq2dPTo95bWGUSj5KdPVqYj9CZux',
  name: 'X1 Stake Pool',
  idl: stakePoolIdl,
  instructions: {
    depositSol: {
      summary: StakePoolDepositSummary,
      tags: { label: 'Stake Deposit', color: 'green', variant: 'subtle' },
    },
    withdrawSol: {
      summary: StakePoolWithdrawSummary,
      tags: { label: 'Stake Withdraw', color: 'orange', variant: 'subtle' },
    },
  },
});

// ============================================
// Warp Bridge
// ============================================
registry.register({
  programId: '6JbPTuxVuoTgyQeXFb9MH8C8nUY8NBbLP1Lu4B13JfMD',
  name: 'Warp Bridge',
  idl: warpBridgeIdl,
  instructions: {
    // Core bridge operations
    bridge_out: {
      summary: BridgeOutSummary,
      tags: { label: 'Bridge Out', color: 'orange', variant: 'subtle' },
    },
    bridge_in: {
      summary: BridgeInSummary,
      tags: { label: 'Bridge In', color: 'green', variant: 'subtle' },
    },
    claim: {
      summary: BridgeClaimSummary,
      tags: { label: 'Claim', color: 'blue', variant: 'subtle' },
    },
    // Token management
    register_token: {
      summary: BridgeRegisterTokenSummary,
      tags: { label: 'Register Token', color: 'cyan', variant: 'subtle' },
    },
    deregister_token: {
      summary: BridgeDeregisterTokenSummary,
      tags: { label: 'Deregister Token', color: 'red', variant: 'subtle' },
    },
    update_token_registry: {
      summary: BridgeUpdateTokenRegistrySummary,
      tags: { label: 'Update Token', color: 'blue', variant: 'subtle' },
    },
    set_token_fees: {
      summary: BridgeSetTokenFeesSummary,
      tags: { label: 'Set Token Fees', color: 'gray', variant: 'subtle' },
    },
    set_whale_limits: {
      summary: BridgeSetWhaleLimitsSummary,
      tags: { label: 'Set Whale Limits', color: 'amber', variant: 'subtle' },
    },
    // Admin operations
    initialize: {
      summary: BridgeInitializeSummary,
      tags: { label: 'Initialize', color: 'purple', variant: 'subtle' },
    },
    initialize_roles: {
      summary: BridgeInitializeRolesSummary,
      tags: { label: 'Initialize Roles', color: 'indigo', variant: 'subtle' },
    },
    initialize_vault: {
      summary: BridgeInitializeVaultSummary,
      tags: { label: 'Initialize Vault', color: 'teal', variant: 'subtle' },
    },
    pause: {
      summary: BridgePauseSummary,
      tags: { label: 'Pause Bridge', color: 'red', variant: 'subtle' },
    },
    unpause: {
      summary: BridgeUnpauseSummary,
      tags: { label: 'Unpause Bridge', color: 'green', variant: 'subtle' },
    },
    set_fees: {
      summary: BridgeSetFeesSummary,
      tags: { label: 'Set Fees', color: 'gray', variant: 'subtle' },
    },
    set_guardians: {
      summary: BridgeSetGuardiansSummary,
      tags: { label: 'Set Guardians', color: 'blue', variant: 'subtle' },
    },
    set_role: {
      summary: BridgeSetRoleSummary,
      tags: { label: 'Set Role', color: 'indigo', variant: 'subtle' },
    },
    set_vault_balance: {
      summary: BridgeSetVaultBalanceSummary,
      tags: { label: 'Set Vault Balance', color: 'teal', variant: 'subtle' },
    },
    transfer_admin: {
      summary: BridgeTransferAdminSummary,
      tags: { label: 'Transfer Admin', color: 'purple', variant: 'subtle' },
    },
    transfer_mint_authority: {
      summary: BridgeTransferMintAuthoritySummary,
      tags: { label: 'Transfer Mint Auth', color: 'red', variant: 'subtle' },
    },
    // Migration operations
    migrate_config: {
      summary: BridgeMigrateConfigSummary,
      tags: { label: 'Migrate Config', color: 'yellow', variant: 'subtle' },
    },
    migrate_token_registry: {
      summary: BridgeMigrateTokenRegistrySummary,
      tags: { label: 'Migrate Token', color: 'yellow', variant: 'subtle' },
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
