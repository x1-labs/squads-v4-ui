## [1.0.16](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.15...v1.0.16) (2025-03-06)


### Bug Fixes

* **lockfile:** updated lockfile ([c8e1b4a](https://github.com/Squads-Protocol/public-v4-client/commit/c8e1b4a3d209b7c1c3cfc4d9e7edb8e187e22833))

## [1.3.0](https://github.com/x1-labs/squads-v4-ui/compare/v1.2.3...v1.3.0) (2026-02-10)


### Features

* add batch transaction system for multisig proposals ([#8](https://github.com/x1-labs/squads-v4-ui/issues/8)) ([50e0e2a](https://github.com/x1-labs/squads-v4-ui/commit/50e0e2a5a93276d7dfdaa7ec7df479facc7ff723))
* add comprehensive validator management system ([6186cbb](https://github.com/x1-labs/squads-v4-ui/commit/6186cbbb6493a19264009b3983b261be625a6c88))
* add memo support for asset transfers ([65b5d0f](https://github.com/x1-labs/squads-v4-ui/commit/65b5d0fb010d8b416387478c56d2f8b27c515063))
* add multisig address to URL structure ([46c003e](https://github.com/x1-labs/squads-v4-ui/commit/46c003e189a3deebd378aa0e65aa3a1d598b0e8c))
* add validator metadata display to validators page ([86bad7a](https://github.com/x1-labs/squads-v4-ui/commit/86bad7afebbb063093a095022156b801596f2e51))
* add vault address display under vault selector in left menu ([7ceb2d7](https://github.com/x1-labs/squads-v4-ui/commit/7ceb2d77b0775206613cffbfdce09d5f523ff83b))
* add XNT staking support with SPL stake pools ([1ee0304](https://github.com/x1-labs/squads-v4-ui/commit/1ee0304c3493ab1d379c6c61cac7c1c3ab6c0b68))
* auto-add env squads when wallet connects if user is member ([38dfa63](https://github.com/x1-labs/squads-v4-ui/commit/38dfa6393f1cf212068e57d97d0f25c926b88e78))
* centralize vault selector in squad switcher ([b9f7017](https://github.com/x1-labs/squads-v4-ui/commit/b9f7017424ce0413a1c32afa77056e3d383905de))
* **confimation:** insure that signature is processed ([83c5f9f](https://github.com/x1-labs/squads-v4-ui/commit/83c5f9f2c7ba71fe64904043d2dff5038795f227))
* **first:** initial setup ([22d6179](https://github.com/x1-labs/squads-v4-ui/commit/22d61794e69076609667a368b7941a2da9ffa6a0))
* improve balance formatting in asset panel ([7c04256](https://github.com/x1-labs/squads-v4-ui/commit/7c042565cc506087e78249f11235452109633c71))
* **manifest:** added build manifest.json ([f2bf41f](https://github.com/x1-labs/squads-v4-ui/commit/f2bf41fd13d7db0c161df5c9ec582e2dd3421c0b))
* move staking panels to dedicated /stake page ([264964e](https://github.com/x1-labs/squads-v4-ui/commit/264964e73694e1fdff42675e63cee8b90a10033a))
* **ms-config-lookup:** set to 300 for sig limit ([7295b1f](https://github.com/x1-labs/squads-v4-ui/commit/7295b1fcc3cb77c3046f96d92ad72ddbe83cf974))
* **ms-config-lookup:** set to 300 for sig limit ([f0d2580](https://github.com/x1-labs/squads-v4-ui/commit/f0d2580a24f33d849a0087b3bdafb331ce6da158))
* **scan-for-ms:** scan through vault sigs to find ms ([b2b64ee](https://github.com/x1-labs/squads-v4-ui/commit/b2b64eec3ae50a6b49d4b79be06380feccd76920))
* **scan-for-ms:** scan through vault sigs to find ms ([7375783](https://github.com/x1-labs/squads-v4-ui/commit/7375783a0e0fc46f95a59c4366b7b14e59e37f2f))
* simplify transaction URLs by auto-detecting squad from transaction ([a832d4b](https://github.com/x1-labs/squads-v4-ui/commit/a832d4b0b638c184d1da508a0934ff3f50527b05))
* **tx-import:** added vault selector ([881420e](https://github.com/x1-labs/squads-v4-ui/commit/881420e2e2f1e2a0c411ddfdbe7aa369bcde6b71))
* validator staking ([#3](https://github.com/x1-labs/squads-v4-ui/issues/3)) ([ff1625a](https://github.com/x1-labs/squads-v4-ui/commit/ff1625a19d98b8629e592034c28a316772c58e9e))
* **web:** Add Program Manager Page ([9df4dab](https://github.com/x1-labs/squads-v4-ui/commit/9df4dabb5128a8cf46e480f8e77e3bd26c7f69b7))


### Bug Fixes

* **access:** useAccess hook added for member check ([a738957](https://github.com/x1-labs/squads-v4-ui/commit/a738957f6cca520f4cf20a3847bcc3a0beb1c4df))
* add Vercel rewrites for client-side routing ([6b1a820](https://github.com/x1-labs/squads-v4-ui/commit/6b1a82016aa0c2b4fb4a46ea76d5e3eda4286d16))
* add wallet adapters to support Backpack and other wallets ([fdcbfc6](https://github.com/x1-labs/squads-v4-ui/commit/fdcbfc680a35bef51a47c66e21db8e55cb29695b))
* **add-member:** added check to see if already exists ([54266eb](https://github.com/x1-labs/squads-v4-ui/commit/54266ebb3f31fad0f8df562019e9919671abf017))
* allow adding multiple squads without navigation ([5627e9b](https://github.com/x1-labs/squads-v4-ui/commit/5627e9b3ea9f7eb16a95cc4e594bb714a6d63f1c))
* **babel:** dependabot alert ([e5c7392](https://github.com/x1-labs/squads-v4-ui/commit/e5c7392313bd2baacc1990284238fa2cfa8846ec))
* **cleanup:** unused directives and semver ([ee1258f](https://github.com/x1-labs/squads-v4-ui/commit/ee1258ffa741a0946475c5f2cc725869e94cead4))
* combine batch executes into single transaction like approvals ([d1cfead](https://github.com/x1-labs/squads-v4-ui/commit/d1cfead0c7592bfeb15b594e8004383632f7b204))
* **confirm:** added wait for confirmation logic in utils ([38380ff](https://github.com/x1-labs/squads-v4-ui/commit/38380ff8472faa72bc6853141db3f2148343561d))
* **confirmation:** better confirmation logic ([6a46192](https://github.com/x1-labs/squads-v4-ui/commit/6a4619246bb3d6c78e8a3798416387748d438659))
* **confirmations:** better handling in tx import ([884229b](https://github.com/x1-labs/squads-v4-ui/commit/884229bf4018bd1a51e935676bc7e27eedeb9d6d))
* **confirmations:** fixed false positives ([0aa98bc](https://github.com/x1-labs/squads-v4-ui/commit/0aa98bc49e4d4d144dc955c7d0c501d21caafb8a))
* **confirmations:** reject on missing confirmations ([c41bda5](https://github.com/x1-labs/squads-v4-ui/commit/c41bda54a266561a05821b1826ad0ed02a157336))
* eliminate console errors ([45c2c4d](https://github.com/x1-labs/squads-v4-ui/commit/45c2c4d2142e4245bb1f6b69755767885d8c6b80))
* **error-boundary:** add at page level to capture and preserve nav ([7a35c63](https://github.com/x1-labs/squads-v4-ui/commit/7a35c63e4e9a63a29420f90455218a95d1f086f0))
* **error-boundary:** include message regarding rpc ([25084e7](https://github.com/x1-labs/squads-v4-ui/commit/25084e7aa4e63573fde0bc2df3b3ef403b862501))
* **explorer:** custom explorer link support ([956fd85](https://github.com/x1-labs/squads-v4-ui/commit/956fd85033679cebaeac95abdac9b7cc01fe6c0d))
* **favicon:** added squads favicon.ico ([cec7b27](https://github.com/x1-labs/squads-v4-ui/commit/cec7b273545d9fb61f24331b271610be53794632))
* format total staked value with thousands separators ([68e7855](https://github.com/x1-labs/squads-v4-ui/commit/68e78553d3d8e5334c2ce63c1918e882e331cfa8))
* handle SDK's 12-byte format in Vote Program withdraw decoder ([8f5b068](https://github.com/x1-labs/squads-v4-ui/commit/8f5b0680fd81b4ebdfb446eb77d2495f32ac1922))
* **hash-router:** added hashrouter for routes ([bfa3f4a](https://github.com/x1-labs/squads-v4-ui/commit/bfa3f4a3499c320716a4e37e14c2fcd0c65d3b81))
* **import-tx:** check wallet status ([2a440cd](https://github.com/x1-labs/squads-v4-ui/commit/2a440cd84c32cc4129394f75e9865124057ea6da))
* improve Backpack wallet detection and initialization timing ([ab4d68d](https://github.com/x1-labs/squads-v4-ui/commit/ab4d68d18f73d05e519dfbfc0b42f8e02a0a1f8e))
* improve mobile responsiveness for validators page ([554001f](https://github.com/x1-labs/squads-v4-ui/commit/554001f5cda4a8182631a3e86a489f900ba7d53d))
* improve token metadata lookup for SPL Token and Token 2022 ([#5](https://github.com/x1-labs/squads-v4-ui/issues/5)) ([76ecfc2](https://github.com/x1-labs/squads-v4-ui/commit/76ecfc25ab473880633f15151186f1bbd990140b))
* **inputs:** added trim to the input fields ([2ef9986](https://github.com/x1-labs/squads-v4-ui/commit/2ef998612615fde26bc739be8b46a9926cabe1d1))
* keep current page when switching squads ([1e1e267](https://github.com/x1-labs/squads-v4-ui/commit/1e1e267a1158fc0f8cccc484ac079825c250f5e1))
* **lockfile:** updated lockfile ([c8e1b4a](https://github.com/x1-labs/squads-v4-ui/commit/c8e1b4a3d209b7c1c3cfc4d9e7edb8e187e22833))
* **main:** Permit T22 tokens && Fix rent payer issue in wrapped message ([#26](https://github.com/x1-labs/squads-v4-ui/issues/26)) ([0b7ffb3](https://github.com/x1-labs/squads-v4-ui/commit/0b7ffb3ea313b8641a3bf415db2cfad7759af753))
* **modal:** dismiss modal after success ([5c90919](https://github.com/x1-labs/squads-v4-ui/commit/5c909195463419e01b581d3cd62016d28def31db))
* **modals:** better modal handling ([8a344a7](https://github.com/x1-labs/squads-v4-ui/commit/8a344a704e6dac0f44826bc42b7d82aedbcc6c0e))
* **ms-search:** error handling and toast ([0132422](https://github.com/x1-labs/squads-v4-ui/commit/01324227c0d2438488e5467fc2a85a7e65c2c576))
* **ms-search:** error handling and toast ([300655d](https://github.com/x1-labs/squads-v4-ui/commit/300655dda6a90e38f2120888102d2c0889fbabfb))
* **nav-error:** updated rpc error flow and nav ([c31a697](https://github.com/x1-labs/squads-v4-ui/commit/c31a6970a60a8db6410246dde7c61c85542b8378))
* **pagination:** fixed tx pagination on search/hash ([1d3ceef](https://github.com/x1-labs/squads-v4-ui/commit/1d3ceef995fd3bd24bacd20c4e5c29677ad955c8))
* **permissions:** human readable from bitmask ([b5deca6](https://github.com/x1-labs/squads-v4-ui/commit/b5deca69dec3313f988207fc07d1e3d3f09525af))
* properly filter validators by selected vault ([5f326c4](https://github.com/x1-labs/squads-v4-ui/commit/5f326c438a1ac130ebad5fb1a3c7be9b35d20673))
* remove duplicate bottom mobile navigation menu ([3dc391c](https://github.com/x1-labs/squads-v4-ui/commit/3dc391c6317b7f080674c63e9c46ce470d16a758))
* remove signer flag from withdrawer account in Vote Program withdraw instruction for multisig execution ([9eedf0c](https://github.com/x1-labs/squads-v4-ui/commit/9eedf0c0d0f7de1526af1377e70349bf55156849))
* **remove-member:** added access hook on remove member ([3b996a5](https://github.com/x1-labs/squads-v4-ui/commit/3b996a5396565168b51bc45dd837165a5ffaece2))
* resolve blank page and infinite loop issues ([9462112](https://github.com/x1-labs/squads-v4-ui/commit/946211258394a631cdf4bd78dc95f254be3f77c7))
* resolve React hooks order issue in MembershipWarning ([0a4e553](https://github.com/x1-labs/squads-v4-ui/commit/0a4e5536f5bae9cddbe897d201fc38c69860043b))
* restore tag extraction in transaction table ([64edd48](https://github.com/x1-labs/squads-v4-ui/commit/64edd481489c0fd9628cabe54c1a3e434c5d4d3c))
* show welcome screen on root path and fix navigation highlighting ([0ada1f2](https://github.com/x1-labs/squads-v4-ui/commit/0ada1f2af5e89eb948eb45388205f974242db4cb))
* **switch-squad:** added text to switch squads ([95b9c18](https://github.com/x1-labs/squads-v4-ui/commit/95b9c18cbc9b37f6947178cc320b66805ec71359))
* **table:** removed &lt;div&gt; to resolve react warning ([60d4923](https://github.com/x1-labs/squads-v4-ui/commit/60d4923ce4d6ee372873f3c6e6f9257640bca37a))
* **threshold-input:** adjusted form display ([9bd7bf1](https://github.com/x1-labs/squads-v4-ui/commit/9bd7bf1bed3ee95759973a4868544b2d64d65d1d))
* **threshold:** threshold form cleanup ([3041073](https://github.com/x1-labs/squads-v4-ui/commit/3041073f2087b75b52beb6dab365e9b8083db1c6))
* **threshold:** updated threshold form and component props ([4ba207a](https://github.com/x1-labs/squads-v4-ui/commit/4ba207a325964effad05efa1facaa22dc34658e9))
* **transactions:** if page less than 1, set to 1 ([335551f](https://github.com/x1-labs/squads-v4-ui/commit/335551f868e7b5770e0a24763442feed033ea2d9))
* **transactions:** set page list to 10 ([f3ccd6d](https://github.com/x1-labs/squads-v4-ui/commit/f3ccd6d9313468c6334312ad289537338aa210c6))
* **transactions:** show (stale) for deprecated txs ([a4ba9eb](https://github.com/x1-labs/squads-v4-ui/commit/a4ba9ebfb902a3fc00b0ac7802351065f559cd67))
* **transactions:** stale label in status ([52b5de3](https://github.com/x1-labs/squads-v4-ui/commit/52b5de39c06b507e20115df23501703fc8334777))
* update transaction URLs to include multisig address ([04c09a7](https://github.com/x1-labs/squads-v4-ui/commit/04c09a7aa3f52780b66a4bc6443c766bcf38eb1c))
* update unstake dialog title and add max button ([a0c00d5](https://github.com/x1-labs/squads-v4-ui/commit/a0c00d56c9a2345e58272f1b5cf50285474f5faa))
* use configured network RPC for wallet adapter connection ([#9](https://github.com/x1-labs/squads-v4-ui/issues/9)) ([5f886a5](https://github.com/x1-labs/squads-v4-ui/commit/5f886a577ac52a731669db3147bdfe609ae056b1))
* use selected vault index in staking panels ([c3dbcf2](https://github.com/x1-labs/squads-v4-ui/commit/c3dbcf2ffc0475b17d3cc4cb07f42d660b185698))
* **vault-select:** added all 256 vaults ([09e8ebf](https://github.com/x1-labs/squads-v4-ui/commit/09e8ebfdae739549edf9a85a323ab47669f90cd8))
* **wallet-connect:** error handling for wallet not connected ([8e931b3](https://github.com/x1-labs/squads-v4-ui/commit/8e931b33d8e39628d8e633037aadb0140286279e))


### Reverts

* remove unreliable squad discovery feature ([0576e84](https://github.com/x1-labs/squads-v4-ui/commit/0576e84b284aaac2a0065c417d6deb352eed7f46))

## [1.2.3](https://github.com/Squads-Protocol/public-v4-client/compare/v1.2.2...v1.2.3) (2025-03-13)


### Bug Fixes

* **babel:** dependabot alert ([e5c7392](https://github.com/Squads-Protocol/public-v4-client/commit/e5c7392313bd2baacc1990284238fa2cfa8846ec))
* **threshold-input:** adjusted form display ([9bd7bf1](https://github.com/Squads-Protocol/public-v4-client/commit/9bd7bf1bed3ee95759973a4868544b2d64d65d1d))
* **threshold:** updated threshold form and component props ([4ba207a](https://github.com/Squads-Protocol/public-v4-client/commit/4ba207a325964effad05efa1facaa22dc34658e9))

## [1.2.2](https://github.com/Squads-Protocol/public-v4-client/compare/v1.2.1...v1.2.2) (2025-03-12)


### Bug Fixes

* **confirmation:** better confirmation logic ([6a46192](https://github.com/Squads-Protocol/public-v4-client/commit/6a4619246bb3d6c78e8a3798416387748d438659))
* **confirmations:** better handling in tx import ([884229b](https://github.com/Squads-Protocol/public-v4-client/commit/884229bf4018bd1a51e935676bc7e27eedeb9d6d))
* **confirmations:** fixed false positives ([0aa98bc](https://github.com/Squads-Protocol/public-v4-client/commit/0aa98bc49e4d4d144dc955c7d0c501d21caafb8a))
* **confirmations:** reject on missing confirmations ([c41bda5](https://github.com/Squads-Protocol/public-v4-client/commit/c41bda54a266561a05821b1826ad0ed02a157336))
* **modal:** dismiss modal after success ([5c90919](https://github.com/Squads-Protocol/public-v4-client/commit/5c909195463419e01b581d3cd62016d28def31db))

## [1.2.1](https://github.com/Squads-Protocol/public-v4-client/compare/v1.2.0...v1.2.1) (2025-03-11)


### Bug Fixes

* **nav-error:** updated rpc error flow and nav ([c31a697](https://github.com/Squads-Protocol/public-v4-client/commit/c31a6970a60a8db6410246dde7c61c85542b8378))

## [1.2.0](https://github.com/Squads-Protocol/public-v4-client/compare/v1.1.0...v1.2.0) (2025-03-11)


### Features

* **tx-import:** added vault selector ([881420e](https://github.com/Squads-Protocol/public-v4-client/commit/881420e2e2f1e2a0c411ddfdbe7aa369bcde6b71))

## [1.1.0](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.16...v1.1.0) (2025-03-10)


### Features

* **confimation:** insure that signature is processed ([83c5f9f](https://github.com/Squads-Protocol/public-v4-client/commit/83c5f9f2c7ba71fe64904043d2dff5038795f227))
* **ms-config-lookup:** set to 300 for sig limit ([7295b1f](https://github.com/Squads-Protocol/public-v4-client/commit/7295b1fcc3cb77c3046f96d92ad72ddbe83cf974))
* **ms-config-lookup:** set to 300 for sig limit ([f0d2580](https://github.com/Squads-Protocol/public-v4-client/commit/f0d2580a24f33d849a0087b3bdafb331ce6da158))
* **scan-for-ms:** scan through vault sigs to find ms ([b2b64ee](https://github.com/Squads-Protocol/public-v4-client/commit/b2b64eec3ae50a6b49d4b79be06380feccd76920))
* **scan-for-ms:** scan through vault sigs to find ms ([7375783](https://github.com/Squads-Protocol/public-v4-client/commit/7375783a0e0fc46f95a59c4366b7b14e59e37f2f))
* **web:** Add Program Manager Page ([9df4dab](https://github.com/Squads-Protocol/public-v4-client/commit/9df4dabb5128a8cf46e480f8e77e3bd26c7f69b7))


### Bug Fixes

* **confirm:** added wait for confirmation logic in utils ([38380ff](https://github.com/Squads-Protocol/public-v4-client/commit/38380ff8472faa72bc6853141db3f2148343561d))
* **error-boundary:** add at page level to capture and preserve nav ([7a35c63](https://github.com/Squads-Protocol/public-v4-client/commit/7a35c63e4e9a63a29420f90455218a95d1f086f0))
* **error-boundary:** include message regarding rpc ([25084e7](https://github.com/Squads-Protocol/public-v4-client/commit/25084e7aa4e63573fde0bc2df3b3ef403b862501))
* **import-tx:** check wallet status ([2a440cd](https://github.com/Squads-Protocol/public-v4-client/commit/2a440cd84c32cc4129394f75e9865124057ea6da))
* **inputs:** added trim to the input fields ([2ef9986](https://github.com/Squads-Protocol/public-v4-client/commit/2ef998612615fde26bc739be8b46a9926cabe1d1))
* **modals:** better modal handling ([8a344a7](https://github.com/Squads-Protocol/public-v4-client/commit/8a344a704e6dac0f44826bc42b7d82aedbcc6c0e))
* **ms-search:** error handling and toast ([0132422](https://github.com/Squads-Protocol/public-v4-client/commit/01324227c0d2438488e5467fc2a85a7e65c2c576))
* **ms-search:** error handling and toast ([300655d](https://github.com/Squads-Protocol/public-v4-client/commit/300655dda6a90e38f2120888102d2c0889fbabfb))

## [1.0.15](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.14...v1.0.15) (2025-03-06)


### Bug Fixes

* **favicon:** added squads favicon.ico ([cec7b27](https://github.com/Squads-Protocol/public-v4-client/commit/cec7b273545d9fb61f24331b271610be53794632))
* **table:** removed <div> to resolve react warning ([60d4923](https://github.com/Squads-Protocol/public-v4-client/commit/60d4923ce4d6ee372873f3c6e6f9257640bca37a))

## [1.0.14](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.13...v1.0.14) (2025-03-05)


### Bug Fixes

* **wallet-connect:** error handling for wallet not connected ([8e931b3](https://github.com/Squads-Protocol/public-v4-client/commit/8e931b33d8e39628d8e633037aadb0140286279e))

## [1.0.13](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.12...v1.0.13) (2025-03-05)


### Bug Fixes

* **transactions:** if page less than 1, set to 1 ([335551f](https://github.com/Squads-Protocol/public-v4-client/commit/335551f868e7b5770e0a24763442feed033ea2d9))

## [1.0.12](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.11...v1.0.12) (2025-03-05)


### Bug Fixes

* **transactions:** stale label in status ([52b5de3](https://github.com/Squads-Protocol/public-v4-client/commit/52b5de39c06b507e20115df23501703fc8334777))

## [1.0.11](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.10...v1.0.11) (2025-03-05)


### Bug Fixes

* **transactions:** show (stale) for deprecated txs ([a4ba9eb](https://github.com/Squads-Protocol/public-v4-client/commit/a4ba9ebfb902a3fc00b0ac7802351065f559cd67))

## [1.0.10](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.9...v1.0.10) (2025-03-05)


### Bug Fixes

* **transactions:** set page list to 10 ([f3ccd6d](https://github.com/Squads-Protocol/public-v4-client/commit/f3ccd6d9313468c6334312ad289537338aa210c6))

## [1.0.9](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.8...v1.0.9) (2025-03-05)


### Bug Fixes

* **vault-select:** added all 256 vaults ([09e8ebf](https://github.com/Squads-Protocol/public-v4-client/commit/09e8ebfdae739549edf9a85a323ab47669f90cd8))

## [1.0.8](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.7...v1.0.8) (2025-03-05)


### Bug Fixes

* **switch-squad:** added text to switch squads ([95b9c18](https://github.com/Squads-Protocol/public-v4-client/commit/95b9c18cbc9b37f6947178cc320b66805ec71359))

## [1.0.7](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.6...v1.0.7) (2025-03-05)


### Bug Fixes

* **add-member:** added check to see if already exists ([54266eb](https://github.com/Squads-Protocol/public-v4-client/commit/54266ebb3f31fad0f8df562019e9919671abf017))

## [1.0.6](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.5...v1.0.6) (2025-03-05)


### Bug Fixes

* **threshold:** threshold form cleanup ([3041073](https://github.com/Squads-Protocol/public-v4-client/commit/3041073f2087b75b52beb6dab365e9b8083db1c6))

## [1.0.5](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.4...v1.0.5) (2025-03-05)


### Bug Fixes

* **permissions:** human readable from bitmask ([b5deca6](https://github.com/Squads-Protocol/public-v4-client/commit/b5deca69dec3313f988207fc07d1e3d3f09525af))

## [1.0.4](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.3...v1.0.4) (2025-03-05)


### Bug Fixes

* **explorer:** custom explorer link support ([956fd85](https://github.com/Squads-Protocol/public-v4-client/commit/956fd85033679cebaeac95abdac9b7cc01fe6c0d))
* **remove-member:** added access hook on remove member ([3b996a5](https://github.com/Squads-Protocol/public-v4-client/commit/3b996a5396565168b51bc45dd837165a5ffaece2))

## [1.0.3](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.2...v1.0.3) (2025-03-05)


### Bug Fixes

* **pagination:** fixed tx pagination on search/hash ([1d3ceef](https://github.com/Squads-Protocol/public-v4-client/commit/1d3ceef995fd3bd24bacd20c4e5c29677ad955c8))

## [1.0.2](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.1...v1.0.2) (2025-03-05)


### Bug Fixes

* **access:** useAccess hook added for member check ([a738957](https://github.com/Squads-Protocol/public-v4-client/commit/a738957f6cca520f4cf20a3847bcc3a0beb1c4df))

## [1.0.1](https://github.com/Squads-Protocol/public-v4-client/compare/v1.0.0...v1.0.1) (2025-03-05)


### Bug Fixes

* **hash-router:** added hashrouter for routes ([bfa3f4a](https://github.com/Squads-Protocol/public-v4-client/commit/bfa3f4a3499c320716a4e37e14c2fcd0c65d3b81))

# 1.0.0 (2025-03-05)


### Bug Fixes

* **cleanup:** unused directives and semver ([ee1258f](https://github.com/Squads-Protocol/public-v4-client/commit/ee1258ffa741a0946475c5f2cc725869e94cead4))


### Features

* **first:** initial setup ([22d6179](https://github.com/Squads-Protocol/public-v4-client/commit/22d61794e69076609667a368b7941a2da9ffa6a0))
* **manifest:** added build manifest.json ([f2bf41f](https://github.com/Squads-Protocol/public-v4-client/commit/f2bf41fd13d7db0c161df5c9ec582e2dd3421c0b))
