export enum InstructionType {
  XNT_TRANSFER = 'XNT_TRANSFER',
  SPL_TRANSFER = 'SPL_TRANSFER',
  SPL_TRANSFER_CHECKED = 'SPL_TRANSFER_CHECKED',
  MINT_TO = 'MINT_TO',
  BURN = 'BURN',
  CREATE_ACCOUNT = 'CREATE_ACCOUNT',
  CONFIG_TRANSACTION = 'CONFIG_TRANSACTION',
  BATCH_TRANSACTION = 'BATCH_TRANSACTION',
  COMPUTE_BUDGET = 'COMPUTE_BUDGET',
  MEMO = 'MEMO',
  UNKNOWN = 'UNKNOWN',
}

export interface XntTransferData {
  from: string;
  to: string;
  lamports: bigint;
}

export interface SplTransferData {
  mint?: string; // For regular transfer, mint might not be in accounts
  fromTokenAccount: string;
  toTokenAccount: string;
  fromOwner?: string; // Owner of the source token account (if available)
  toOwner?: string; // Owner of the destination token account (if available)
  authority: string; // The account that authorized the transfer
  amount: bigint;
  decimals: number;
}

export interface MintToData {
  mint: string;
  destination: string;
  authority: string;
  amount: bigint;
  decimals?: number;
}

export interface BurnData {
  account: string;
  mint?: string;
  authority: string;
  amount: bigint;
  decimals?: number;
}

export interface CreateAccountData {
  from: string;
  newAccount: string;
  lamports: bigint;
  space: bigint;
  owner: string;
}

export interface ConfigTransactionData {
  actions: any[];
  multisig: string;
}

export interface BatchTransactionData {
  size: number;
  multisig: string;
  batchIndex: number;
  vaultIndex: number;
}

export interface ComputeBudgetData {
  units?: number;
  microLamports?: number;
  additionalFee?: number;
}

export interface MemoData {
  memo: string;
}

// Union type for all instruction data types
export type InstructionData =
  | XntTransferData
  | SplTransferData
  | MintToData
  | BurnData
  | CreateAccountData
  | ConfigTransactionData
  | BatchTransactionData
  | ComputeBudgetData
  | MemoData;
