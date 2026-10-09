import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { configProposalInstructions } from './configProposal.ts';

describe('configProposalInstructions', () => {
  const multisigPda = Keypair.generate().publicKey;
  const creator = Keypair.generate().publicKey;
  const programId = new PublicKey('DDL3Xp6ie85DXgiPkXJ7abUyS2tGv4CGEod2DeQXQ941');
  const transactionIndex = 7n;
  const args = {
    multisigPda,
    actions: [
      { __kind: 'RemoveSpendingLimit' as const, spendingLimit: Keypair.generate().publicKey },
    ],
    creator,
    transactionIndex,
    programId,
  };
  const approveIx = multisig.instructions.proposalApprove({
    multisigPda,
    member: creator,
    transactionIndex,
    programId,
  });
  const proposalCreateIx = multisig.instructions.proposalCreate({
    multisigPda,
    creator,
    isDraft: false,
    transactionIndex,
    rentPayer: creator,
    programId,
  });

  test('with Vote, the creator also approves', () => {
    const ixs = configProposalInstructions({ ...args, approve: true });
    assert.equal(ixs.length, 3);
    assert.deepEqual(ixs[1].data, proposalCreateIx.data);
    assert.deepEqual(ixs[2].data, approveIx.data);
  });

  test('without Vote, there is no approve instruction', () => {
    const ixs = configProposalInstructions({ ...args, approve: false });
    assert.equal(ixs.length, 2);
    assert.deepEqual(ixs[1].data, proposalCreateIx.data);
    assert.ok(ixs.every((ix) => !ix.data.equals(approveIx.data)));
  });

  test('every instruction goes to the configured program', () => {
    for (const ix of configProposalInstructions({ ...args, approve: true })) {
      assert.ok(ix.programId.equals(programId));
    }
  });
});
