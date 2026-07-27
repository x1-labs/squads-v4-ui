import React from 'react';
import { PublicKey } from '@solana/web3.js';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { DelegationConfigAccount } from '@/lib/delegation/accounts';
import { DetailBlock, Field, SummaryShell, Tone, accountByName } from './shared';
import { useDelegationConfig } from './hooks';

const SYSTEM_PROGRAM = '11111111111111111111111111111111';

function readPubkey(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof PublicKey) return value.toBase58();
  if (typeof value === 'string') return value;
  try {
    return new PublicKey(value as any).toBase58();
  } catch {
    return undefined;
  }
}

/** An all-zero pubkey means the role is unset rather than assigned. */
function isUnset(address?: string): boolean {
  return !address || address === SYSTEM_PROGRAM;
}

interface AuthorityChangeProps extends InstructionSummaryProps {
  icon: string;
  title: string;
  /** Human name for the role being reassigned. */
  role: string;
  /** What the role is allowed to do, shown as a hint. */
  roleDescription: string;
  /** Instruction argument holding the new authority. */
  argKey: string;
  /** Field on `DelegationConfig` holding the current authority. */
  configKey: keyof DelegationConfigAccount & string;
  tone: Tone;
}

/**
 * Shared body for the authority-reassignment instructions. Each one hands a
 * privileged role to a new key, so the summary leads with the current holder.
 */
const AuthorityChangeSummary: React.FC<AuthorityChangeProps> = ({
  instruction,
  connection,
  icon,
  title,
  role,
  roleDescription,
  argKey,
  configKey,
  tone,
}) => {
  const { config, loading } = useDelegationConfig(instruction, connection);

  const newAuthority = readPubkey(instruction.args?.[argKey]);
  const currentAuthority = readPubkey(config?.[configKey]);
  const signer = accountByName(instruction, 'authority', 1);
  const isNoop = Boolean(newAuthority && currentAuthority && newAuthority === currentAuthority);

  const subtitle = loading
    ? `Reassigns the ${role} role…`
    : isNoop
      ? `Already the ${role} — this proposal changes nothing`
      : isUnset(currentAuthority) && config
        ? `Assigns the ${role} role, which is currently unset`
        : `Hands the ${role} role to a new key`;

  return (
    <SummaryShell icon={icon} title={title} subtitle={subtitle} tone={isNoop ? 'gray' : tone}>
      <DetailBlock>
        {config && (
          <Field
            label={`Current ${role}`}
            value={
              isUnset(currentAuthority) ? (
                <span className="text-muted-foreground">Unset</span>
              ) : (
                <span className="break-all text-xs">{currentAuthority}</span>
              )
            }
          />
        )}
        {newAuthority && <AddressWithButtons address={newAuthority} label={`New ${role}`} />}
        <div className="text-xs text-muted-foreground">{roleDescription}</div>
        {signer && <AddressWithButtons address={signer} label="Signer" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `transfer_authority` — hands over full admin control of the program. */
export const DelegationTransferAuthoritySummary: React.FC<InstructionSummaryProps> = (props) => (
  <AuthorityChangeSummary
    {...props}
    icon="🔑"
    title="Transfer Admin Authority"
    role="admin authority"
    roleDescription="The admin can change every config parameter, approve or reject validators, and reassign these roles. Transferring it is irreversible without the new key's cooperation."
    argKey="new_authority"
    configKey="authority"
    tone="red"
  />
);

/** `update_bot_authority` — sets the key the delegation bot signs with. */
export const DelegationUpdateBotAuthoritySummary: React.FC<InstructionSummaryProps> = (props) => (
  <AuthorityChangeSummary
    {...props}
    icon="🤖"
    title="Update Bot Authority"
    role="bot authority"
    roleDescription="The bot authority records validator criteria and drives the per-epoch stake changes. It cannot change config parameters or validator statuses."
    argKey="new_bot_authority"
    configKey="bot_authority"
    tone="purple"
  />
);

/** `update_reviewer_authority` — sets the key allowed to change validator statuses. */
export const DelegationUpdateReviewerAuthoritySummary: React.FC<InstructionSummaryProps> = (
  props
) => (
  <AuthorityChangeSummary
    {...props}
    icon="🧑‍⚖️"
    title="Update Reviewer Authority"
    role="reviewer authority"
    roleDescription="The reviewer can approve, reject and change validator statuses alongside the admin. Setting it to the system program address disables the role."
    argKey="new_reviewer_authority"
    configKey="reviewer_authority"
    tone="blue"
  />
);

/**
 * `initialize_config` — one-time creation of the global config PDA with its
 * default parameters and initial admin/bot authorities.
 */
export const DelegationInitializeConfigSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  const adminAuthority = readPubkey(instruction.args?.admin_authority);
  const botAuthority = readPubkey(instruction.args?.bot_authority);
  const config = accountByName(instruction, 'config', 0);
  const payer = accountByName(instruction, 'payer', 1);

  return (
    <SummaryShell
      icon="🚀"
      title="Initialize Delegation Config"
      subtitle="Creates the program's global config with default parameters — run once per deployment"
      tone="purple"
    >
      <DetailBlock>
        {config && <AddressWithButtons address={config} label="Config" />}
        {adminAuthority && <AddressWithButtons address={adminAuthority} label="Admin" />}
        {botAuthority && <AddressWithButtons address={botAuthority} label="Bot" />}
        {payer && <AddressWithButtons address={payer} label="Payer" />}
      </DetailBlock>
    </SummaryShell>
  );
};
