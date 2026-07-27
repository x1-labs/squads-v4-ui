import { DelegationConfigAccount } from './accounts';
import { formatXNT } from '../utils/formatters';
import { formatValidatorVersion, toBigInt, toNumber } from './values';

/**
 * Describes one `UpdateConfigParams` field: how to label it, what it controls,
 * and how to turn a raw decoded value into something readable.
 */
export interface ConfigFieldSpec {
  key: keyof DelegationConfigAccount & string;
  label: string;
  description: string;
  format: (value: unknown) => string;
}

const formatPercent = (value: unknown): string => {
  const n = toNumber(value);
  return n === null ? '—' : `${n}%`;
};

const formatCount = (value: unknown): string => {
  const n = toNumber(value);
  return n === null ? '—' : n.toLocaleString();
};

const formatLamports = (value: unknown): string => {
  const big = toBigInt(value);
  return big === null ? '—' : formatXNT(big);
};

const formatBool = (value: unknown): string => (value ? 'Enabled' : 'Disabled');

/**
 * Every field of `UpdateConfigParams`, in the order the program declares them.
 * The summary renders straight from this list, so a new config parameter only
 * needs an entry here plus a refreshed IDL.
 */
export const CONFIG_FIELDS: ConfigFieldSpec[] = [
  {
    key: 'max_commission_percent',
    label: 'Max commission',
    description: 'Highest commission a validator may charge and stay eligible for delegation',
    format: formatPercent,
  },
  {
    key: 'min_self_stake',
    label: 'Min self-stake',
    description: 'Stake a validator must put up itself to qualify for delegation',
    format: formatLamports,
  },
  {
    key: 'max_total_stake',
    label: 'Max total stake',
    description: 'Hard cap on the total stake any single validator may hold',
    format: formatLamports,
  },
  {
    key: 'max_validator_stake_pct',
    label: 'Max network share',
    description: "Cap on one validator's share of total network stake",
    format: formatPercent,
  },
  {
    key: 'skip_rate_tolerance_pct',
    label: 'Skip rate tolerance',
    description: 'How far above the cluster average skip rate a validator may drift',
    format: formatPercent,
  },
  {
    key: 'vote_credits_threshold_pct',
    label: 'Vote credits threshold',
    description: 'Minimum vote credits, as a share of the cluster average',
    format: formatPercent,
  },
  {
    key: 'min_validator_version',
    label: 'Min validator version',
    description: 'Oldest client version still eligible for delegation',
    format: (value) => formatValidatorVersion(toNumber(value)),
  },
  {
    key: 'reserve_stake_pct',
    label: 'Reserve stake',
    description: 'Share of the pool held back as reserve instead of being delegated',
    format: formatPercent,
  },
  {
    key: 'max_validators',
    label: 'Max validators',
    description: 'Maximum number of validators the program will delegate to',
    format: formatCount,
  },
  {
    key: 'emergency_pause',
    label: 'Emergency pause',
    description: 'Halts delegation activity until cleared',
    format: formatBool,
  },
  {
    key: 'stake_matching_cap',
    label: 'Stake matching cap',
    description: "Most stake the program will match 1:1 against a validator's external stake",
    format: formatLamports,
  },
  {
    key: 'base_allocation_weight',
    label: 'Base allocation weight',
    description: 'Share of delegatable stake handed out as the flat base allocation',
    format: formatPercent,
  },
  {
    key: 'match_allocation_weight',
    label: 'Match allocation weight',
    description: 'Share of delegatable stake handed out as 1:1 matching',
    format: formatPercent,
  },
  {
    key: 'min_stake_adjustment_pct',
    label: 'Min stake adjustment',
    description: "Smallest change that triggers a rebalance of a validator's stake",
    format: formatPercent,
  },
];
