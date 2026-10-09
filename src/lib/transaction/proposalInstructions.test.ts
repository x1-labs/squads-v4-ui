import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey, SystemProgram, TransactionMessage } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { proposedMessage, withProposal } from './proposalInstructions.ts';

describe('withProposal', () => {
  const multisigPda = Keypair.generate().publicKey;
  const creator = Keypair.generate().publicKey;
  const programId = new PublicKey('DDL3Xp6ie85DXgiPkXJ7abUyS2tGv4CGEod2DeQXQ941');
  const transactionIndex = 7n;
  const args = { multisigPda, creator, transactionIndex, programId };

  const configCreateIx = multisig.instructions.configTransactionCreate({
    multisigPda,
    actions: [{ __kind: 'ChangeThreshold', newThreshold: 2 }],
    creator,
    transactionIndex,
    rentPayer: creator,
    programId,
  });
  const vault = multisig.getVaultPda({ multisigPda, index: 0, programId })[0];
  const vaultCreateIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    creator,
    ephemeralSigners: 0,
    // @ts-ignore
    transactionMessage: new TransactionMessage({
      payerKey: vault,
      recentBlockhash: PublicKey.default.toBase58(),
      instructions: [SystemProgram.transfer({ fromPubkey: vault, toPubkey: creator, lamports: 1 })],
    }),
    transactionIndex,
    addressLookupTableAccounts: [],
    rentPayer: creator,
    vaultIndex: 0,
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
  const approveIx = multisig.instructions.proposalApprove({
    multisigPda,
    member: creator,
    transactionIndex,
    programId,
  });

  for (const [kind, createIx] of [
    ['config', configCreateIx],
    ['vault', vaultCreateIx],
  ] as const) {
    test(`${kind}: with Vote, the creator also approves`, () => {
      const ixs = withProposal(createIx, { ...args, approve: true });
      assert.equal(ixs.length, 3);
      assert.equal(ixs[0], createIx);
      assert.deepEqual(ixs[1].data, proposalCreateIx.data);
      assert.deepEqual(ixs[2].data, approveIx.data);
    });

    test(`${kind}: without Vote, there is no approve instruction`, () => {
      const ixs = withProposal(createIx, { ...args, approve: false });
      assert.equal(ixs.length, 2);
      assert.equal(ixs[0], createIx);
      assert.deepEqual(ixs[1].data, proposalCreateIx.data);
      assert.ok(ixs.every((ix) => !ix.data.equals(approveIx.data)));
    });
  }

  test('the proposal and approve use the creator and go to the configured program', () => {
    const [, proposalIx, approve] = withProposal(configCreateIx, { ...args, approve: true });
    for (const ix of [proposalIx, approve]) {
      assert.ok(ix.programId.equals(programId));
      assert.ok(ix.keys.some((key) => key.pubkey.equals(creator) && key.isSigner));
    }
  });
});

describe('proposedMessage', () => {
  test('approved by the creator: the message is unchanged', () => {
    assert.equal(proposedMessage('Transfer proposed.', true), 'Transfer proposed.');
  });

  test('not approved: it says that it still needs approvals', () => {
    assert.equal(
      proposedMessage('Transfer proposed.', false),
      'Transfer proposed. It still needs approvals.'
    );
  });
});
