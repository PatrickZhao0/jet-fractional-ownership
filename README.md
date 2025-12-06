# Private Jet Fractional Ownership

## How to Compile

First, make sure you have `pnpm` installed. If not, run the following command:

```bash
npm install pnpm -g
```

Then, run the following command to install dependencies:

```
pnpm install
```

Then, run the following command to build the project:

```
pnpm hardhat build
```

## How to Test

```
pnpm hardhat test mocha --coverage
```

## Coverage Report

<img width="800" height="223" alt="Screenshot 2025-12-06 at 06 52 44" src="https://github.com/user-attachments/assets/c6ff9d14-7fcf-4621-88fb-1b6d9b24aed9" />

## How to Deploy

Make sure you have `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` in your `.env` file. (See `.env.example` for an example)

You can get `SEPOLIA_RPC_URL` from [Infura](https://infura.io/).
You can get `SEPOLIA_PRIVATE_KEY` from [MetaMask Wallet](https://metamask.io/). (Don't share your private key with anyone)

Then, run the following command to deploy the contracts:

```
pnpm hardhat run scripts/deploy.ts --network sepolia
```