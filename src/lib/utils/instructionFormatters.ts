/**
 * Formats an instruction name into a human-friendly title
 * @param instructionName - The raw instruction name (e.g., "createAccount", "TransferChecked", "mint_nft")
 * @returns A formatted human-readable title (e.g., "Create Account", "Transfer Checked", "Mint NFT")
 */
export function formatInstructionTitle(instructionName: string): string {
  if (!instructionName) return '';

  // Handle special cases
  const specialCases: Record<string, string> = {
    transferchecked: 'Transfer Checked',
    mintto: 'Mint To',
    burnfrom: 'Burn From',
    initializemint: 'Initialize Mint',
    initializeaccount: 'Initialize Account',
    closeaccount: 'Close Account',
    freezeaccount: 'Freeze Account',
    thawaccount: 'Thaw Account',
    syncnative: 'Sync Native',
    addmemo: 'Add Memo',
    createata: 'Create ATA',
    createidempotent: 'Create Idempotent',
    recovernested: 'Recover Nested',
    swapbasein: 'Swap Base In',
    swapbaseout: 'Swap Base Out',
    addliquidity: 'Add Liquidity',
    removeliquidity: 'Remove Liquidity',
    increaseliquidity: 'Increase Liquidity',
    decreaseliquidity: 'Decrease Liquidity',
    collectfees: 'Collect Fees',
    claimrewards: 'Claim Rewards',
    liquidunstake: 'Liquid Unstake',
    exactoutroute: 'Exact Out Route',
    createmultisig: 'Create Multisig',
    createproposal: 'Create Proposal',
    executeproposal: 'Execute Proposal',
    cancelproposal: 'Cancel Proposal',
    createmetadataaccount: 'Create Metadata Account',
    updatemetadataaccount: 'Update Metadata Account',
    createmasteredition: 'Create Master Edition',
    mintneweditionfrommastereditionviatoken: 'Mint Edition From Master',
  };

  // Check for special case first
  const lowerName = instructionName.toLowerCase();
  if (specialCases[lowerName]) {
    return specialCases[lowerName];
  }

  // Handle snake_case (e.g., "create_account" -> "Create Account")
  if (instructionName.includes('_')) {
    return instructionName
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // Handle camelCase and PascalCase
  // Insert spaces before uppercase letters that follow lowercase letters
  const withSpaces = instructionName.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Handle consecutive uppercase letters (e.g., "CreateNFT" -> "Create NFT")
  const withMoreSpaces = withSpaces.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');

  // Split by spaces and capitalize each word
  return withMoreSpaces
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => {
      // Handle all uppercase words (acronyms)
      if (word === word.toUpperCase() && word.length > 1) {
        return word;
      }
      // Regular word capitalization
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}
