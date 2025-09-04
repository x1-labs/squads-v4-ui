#!/bin/bash

echo "Testing Squads Transaction Decoder CLI"
echo "======================================="
echo ""

# Test 1: Decode a Squads VaultTransaction proposal
echo "Test 1: Decoding Squads VaultTransaction Proposal"
echo "--------------------------------------------------"
npx tsx src/cli/decode-transaction.ts hash \
  -s 8A3GnoFcsn4zFAu3psZtJ5pqneBSNWiyGkCAXfFdaMJv \
  --rpc https://rpc.testnet.x1.xyz \
  -p DDL3Xp6ie85DXgiPkXJ7abUyS2tGv4CGEod2DeQXQ941 \
  --json | jq '.instructions[0]' 2>/dev/null || echo "Test 1 completed"

echo ""

# Test 2: Decode a Squads ConfigTransaction proposal  
echo "Test 2: Decoding Squads ConfigTransaction Proposal"
echo "--------------------------------------------------"
npx tsx src/cli/decode-transaction.ts hash \
  -s CDWZQUWmKSUps5yyfiQN9EsXheb95H934P6DxzsVtUrs \
  --rpc https://rpc.testnet.x1.xyz \
  -p DDL3Xp6ie85DXgiPkXJ7abUyS2tGv4CGEod2DeQXQ941 \
  --json | jq '.instructions[0].args.actions' 2>/dev/null || echo "Test 2 completed"

echo ""

# Test 3: Get multisig info
echo "Test 3: Getting Multisig Info"
echo "------------------------------"
npx tsx src/cli/decode-transaction.ts info \
  -m Eu2AYLo3USjePZA7PyscUtY8vmsP6G2UHBGbDBPGfRgb \
  --rpc https://rpc.testnet.x1.xyz \
  -p DDL3Xp6ie85DXgiPkXJ7abUyS2tGv4CGEod2DeQXQ941 2>&1 | grep -E "(Address|Threshold|Members)" | head -5

echo ""
echo "All tests completed!"