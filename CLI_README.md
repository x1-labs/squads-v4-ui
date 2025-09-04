# Squads Transaction Decoder CLI

A command-line tool for decoding and analyzing Squads multisig transactions and general Solana transactions.

## Installation

```bash
# Install dependencies
yarn install

# The CLI is ready to use via yarn
yarn cli --help
```

## Commands

### 1. Decode Transaction by Hash or Squads Proposal

This versatile command can decode both regular Solana transactions and Squads proposal PDAs:

#### Decode by Transaction Signature
```bash
# Basic usage - transaction signature
yarn cli hash -s <transaction_signature>

# With custom RPC
yarn cli hash -s <transaction_signature> -r <rpc_url>

# Output as JSON
yarn cli hash -s <transaction_signature> --json
```

Example:
```bash
yarn cli hash -s 5qJzvED8x5nPzKjzFcJxXKP5pWJF4M7XdBGTVhPUZUrPhydkKzNQJjqCdyWXbWyBbLkZ6cMKet4FPdTAfUqF3sXh
```

#### Decode Squads Proposal PDA
```bash
# Basic usage - Squads proposal
yarn cli hash -s <proposal_pda>

# With custom RPC and program ID (for testnet/devnet)
yarn cli hash -s <proposal_pda> -r <rpc_url> -p <squads_program_id>
```

Example:
```bash
# Mainnet proposal
yarn cli hash -s CDWZQUWmKSUps5yyfiQN9EsXheb95H934P6DxzsVtUrs

# Testnet proposal with custom program
yarn cli hash -s CDWZQUWmKSUps5yyfiQN9EsXheb95H934P6DxzsVtUrs \
  --rpc https://api.testnet.solana.com \
  -p DDL3Xp6ie85DXgiPkXJ7abUyS2tGv4CGEod2DeQXQ941
```

The command automatically detects:
- **Transaction signatures** (88 characters) - fetches and decodes the transaction
- **Squads proposals** (32-44 characters) - fetches and decodes VaultTransaction or ConfigTransaction

Features:
- Automatically detects input type based on length
- Decodes VaultTransactions with full instruction details
- Decodes ConfigTransactions showing all config actions (add/remove members, threshold changes, etc.)
- Shows transaction metadata (slot, time, fee) for regular transactions
- Displays inner instructions from CPI calls
- Handles both parsed and partially decoded instructions

### 2. Decode Squads Vault Transaction

Decode a specific transaction from a Squads multisig vault:

```bash
# Basic usage
yarn cli decode -m <multisig_address> -i <transaction_index>

# With custom RPC and program
yarn cli decode -m <multisig_address> -i <transaction_index> -r <rpc_url> -p <program_id>

# Output as JSON
yarn cli decode -m <multisig_address> -i <transaction_index> --json
```

Example:
```bash
yarn cli decode -m 7EqQdEULxWcraVx3mXKFjc84LhBLVEQN265LLFGtevXP -i 42
```

### 3. Batch Decode Transactions

Decode multiple transactions from a multisig in a range:

```bash
# Decode transactions 1-10
yarn cli batch -m <multisig_address> -s 1 -e 10

# With JSON output
yarn cli batch -m <multisig_address> -s 1 -e 10 --json
```

Example:
```bash
yarn cli batch -m 7EqQdEULxWcraVx3mXKFjc84LhBLVEQN265LLFGtevXP -s 1 -e 5
```

### 4. Get Multisig Information

Display detailed information about a multisig:

```bash
yarn cli info -m <multisig_address>
```

Example:
```bash
yarn cli info -m 7EqQdEULxWcraVx3mXKFjc84LhBLVEQN265LLFGtevXP
```

Shows:
- Threshold and member count
- Transaction indices
- Member addresses and permissions
- Time lock settings
- Rent collector

## Environment Variables

You can set default RPC endpoint in a `.env` file:

```env
RPC_URL=https://your-rpc-endpoint.com
```

## Output Formats

### Human-Readable (Default)

The CLI provides formatted, easy-to-read output with:
- Color-coded icons for different elements
- Hierarchical instruction display
- Decoded arguments and account names
- Special formatting for transfers (SOL and SPL tokens)

### JSON Output

Use the `--json` flag for machine-readable output suitable for:
- Piping to other tools
- Integration with scripts
- Data analysis

## Supported Instructions

The decoder automatically recognizes and parses:

- **Squads Multisig V4**: All config and vault transactions
- **System Program**: Transfers, account creation
- **SPL Token**: All token operations (transfer, mint, burn, etc.)
- **Token-2022**: Extended token operations
- **Memo Program**: Memo instructions
- **Compute Budget**: Compute unit settings
- **Associated Token**: ATA creation
- **Address Lookup Tables**: Table operations
- **Custom Programs**: Any program with registered IDL

## Adding Custom IDLs

The CLI uses the IDL manager from the main application. To add support for a new program:

1. Add the IDL to `src/lib/idls/`
2. Register it in `src/registry.ts`
3. The CLI will automatically use it for decoding

## Examples

### Decode a Complex DeFi Transaction
```bash
yarn cli hash -s 3xJtLxqKJfACVPDfYMPQPWPQFqUQQWvWDDQHqGPSXjAR5hqGGxcVxvLnRtYPQJvHsXJ7X8X9X8X9X8X9X8X9X8X9
```

### Analyze Multisig Config Changes
```bash
yarn cli decode -m 7EqQdEULxWcraVx3mXKFjc84LhBLVEQN265LLFGtevXP -i 1 --json | jq '.instructions[0].args.actions'
```

### Export Transaction History
```bash
yarn cli batch -m 7EqQdEULxWcraVx3mXKFjc84LhBLVEQN265LLFGtevXP -s 1 -e 100 --json > transactions.json
```

## Troubleshooting

- **Transaction not found**: Ensure the signature is correct and the transaction is confirmed
- **RPC errors**: Try a different RPC endpoint or check rate limits
- **Decoding failures**: Some programs may not have IDLs available; these show as "Unknown Instruction"
- **Large batches**: Consider using smaller ranges or implementing pagination for large transaction sets