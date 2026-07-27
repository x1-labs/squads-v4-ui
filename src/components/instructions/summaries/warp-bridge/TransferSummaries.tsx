import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { formatCounterparty, formatTokenUnits, toNumber } from '@/lib/warpBridge/values';
import { BridgeTokenTarget, DetailBlock, Field, SummaryShell, accountByName } from './shared';
import { useBridgeToken } from './hooks';

/** `bridge_out` — locks or burns tokens on this chain to send them across. */
export const BridgeOutSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { localMint, symbol, decimals, registry } = useBridgeToken(instruction, connection);
  const sender = accountByName(instruction, 'sender', 3);
  const seq = toNumber(instruction.args?.seq);

  return (
    <SummaryShell
      icon="📤"
      title="Bridge Out"
      subtitle={`Sends ${formatTokenUnits(instruction.args?.amount, decimals, symbol)} to the other chain`}
      tone="orange"
    >
      <DetailBlock>
        <BridgeTokenTarget
          localMint={localMint}
          symbol={symbol}
          decimals={decimals}
          isNative={registry?.is_native ?? null}
        />
        <Field
          label="Amount"
          value={formatTokenUnits(instruction.args?.amount, decimals, symbol)}
        />
        {seq !== null && (
          <Field
            label="Sequence"
            value={seq.toLocaleString()}
            hint="Outgoing sequence number, matched by the destination chain"
          />
        )}
        {sender && <AddressWithButtons address={sender} label="Sender" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `bridge_in_v2` — releases or mints tokens for an incoming transfer, using
 * guardian signatures already staged in a signature set.
 *
 * The legacy v1 `bridge_in` path is retired and has no summary.
 */
export const BridgeInV2Summary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { localMint, symbol, decimals, registry } = useBridgeToken(instruction, connection);
  const sender = formatCounterparty(instruction.args?.sender);
  const recipient = accountByName(instruction, 'recipient', 6);
  const sourceSeq = toNumber(instruction.args?.source_seq);

  return (
    <SummaryShell
      icon="📥"
      title="Bridge In"
      subtitle="Releases or mints tokens using guardian signatures already staged in a signature set"
      tone="green"
    >
      <DetailBlock>
        <BridgeTokenTarget
          localMint={localMint}
          symbol={symbol}
          decimals={decimals}
          isNative={registry?.is_native ?? null}
        />
        <Field label="Amount" value={formatTokenUnits(instruction.args?.amount, decimals, symbol)} />
        {sourceSeq !== null && (
          <Field
            label="Source seq"
            value={sourceSeq.toLocaleString()}
            hint="Sequence number of the transfer on the originating chain"
          />
        )}
        {sender && <AddressWithButtons address={sender} label="Sender" />}
        {recipient && <AddressWithButtons address={recipient} label="Recipient" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `claim` — collects a whale transfer once its delay has elapsed. */
export const BridgeClaimSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { localMint, symbol, decimals } = useBridgeToken(instruction, connection);
  const claimer = accountByName(instruction, 'claimer', 3);
  const sourceSeq = toNumber(instruction.args?.source_seq);

  return (
    <SummaryShell
      icon="🎁"
      title="Claim Delayed Transfer"
      subtitle="Collects a transfer that was held back by the whale delay"
      tone="blue"
    >
      <DetailBlock>
        <BridgeTokenTarget localMint={localMint} symbol={symbol} decimals={decimals} />
        {sourceSeq !== null && <Field label="Source seq" value={sourceSeq.toLocaleString()} />}
        {claimer && <AddressWithButtons address={claimer} label="Claimer" />}
      </DetailBlock>
    </SummaryShell>
  );
};
