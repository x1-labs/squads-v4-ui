import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  createWithdrawSolInstruction,
  describeWithdrawSolSimulationError,
} from './withdrawSolInstruction.ts';

const key = () => Keypair.generate().publicKey;
const base = {
  programId: key(),
  stakePool: key(),
  sourcePoolAccount: key(),
  withdrawAuthority: key(),
  reserveStake: key(),
  destinationSystemAccount: key(),
  sourceTransferAuthority: key(),
  managerFeeAccount: key(),
  poolMint: key(),
};

describe('createWithdrawSolInstruction', () => {
  test('encodes pool tokens above 2^53 exactly', () => {
    const poolTokens = 244_169_440_391_520_049n;
    const ix = createWithdrawSolInstruction({
      ...base,
      poolTokens,
      tokenProgramId: TOKEN_PROGRAM_ID,
    });
    assert.equal(ix.data.length, 9);
    assert.equal(ix.data[0], 16); // WithdrawSol
    assert.equal(ix.data.readBigUInt64LE(1), poolTokens);
  });

  test("passes a Token-2022 pool's token program instead of the classic one", () => {
    const ix = createWithdrawSolInstruction({
      ...base,
      poolTokens: 1n,
      tokenProgramId: TOKEN_2022_PROGRAM_ID,
    });
    const programs = ix.keys.map((k) => k.pubkey.toBase58());
    assert.ok(programs.includes(TOKEN_2022_PROGRAM_ID.toBase58()));
    assert.ok(!programs.includes(TOKEN_PROGRAM_ID.toBase58()));
  });

  test('keeps the transfer authority as the only signer', () => {
    const ix = createWithdrawSolInstruction({
      ...base,
      poolTokens: 1n,
      tokenProgramId: TOKEN_PROGRAM_ID,
    });
    const signers = ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey);
    assert.deepEqual(signers, [base.sourceTransferAuthority as PublicKey]);
  });
});

describe('describeWithdrawSolSimulationError', () => {
  test('names the reserve when the program rejects the amount', () => {
    const message = describeWithdrawSolSimulationError({
      error: '{"InstructionError":[0,{"Custom":35}]}',
      logs: [
        'Program log: Attempting to withdraw 242652987003936114 lamports, maximum possible SOL withdrawal is 34442229437415181 lamports',
        "Program log: Error: Too much SOL withdrawn from the stake pool's reserve account",
      ],
    });
    assert.match(message, /reserve can't pay out/);
  });

  test('reads a token burn shortfall as a pool-token balance problem', () => {
    const message = describeWithdrawSolSimulationError({
      error: '{"InstructionError":[0,{"Custom":1}]}',
      logs: ['Program log: Error: insufficient funds'],
    });
    assert.match(message, /does not hold that many pool tokens/);
  });

  test('checks the fee payer before the burn', () => {
    assert.match(
      describeWithdrawSolSimulationError({ error: 'InsufficientFundsForFee' }),
      /transaction fee/
    );
  });
});
