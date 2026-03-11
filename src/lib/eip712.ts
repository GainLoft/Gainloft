/**
 * EIP-712 typed data for Polymarket CLOB orders.
 * Matches the Polymarket CTF Exchange contract domain and types.
 */

// Polygon mainnet CTF Exchange
const EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const CHAIN_ID = 137; // Polygon

export const ORDER_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: CHAIN_ID,
  verifyingContract: EXCHANGE_ADDRESS as `0x${string}`,
} as const;

export const ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
  ],
} as const;

export interface OrderMessage {
  salt: bigint;
  maker: `0x${string}`;
  signer: `0x${string}`;
  taker: `0x${string}`;
  tokenId: bigint;
  makerAmount: bigint;
  takerAmount: bigint;
  expiration: bigint;
  nonce: bigint;
  feeRateBps: bigint;
  side: number;
  signatureType: number;
}

/**
 * Build an EIP-712 order message from trade parameters.
 */
export function buildOrderMessage({
  salt,
  maker,
  signer,
  tokenId,
  price,
  size,
  side,
}: {
  salt: string;
  maker: `0x${string}`;
  signer: `0x${string}`;
  tokenId: string;
  price: number;
  size: number;
  side: 0 | 1;
}): OrderMessage {
  // USDC has 6 decimals
  const USDC_DECIMALS = 6;
  const SHARE_DECIMALS = 6;

  const makerAmount = BigInt(Math.round(price * size * 10 ** USDC_DECIMALS));
  const takerAmount = BigInt(Math.round(size * 10 ** SHARE_DECIMALS));

  return {
    salt: BigInt(salt),
    maker,
    signer,
    taker: '0x0000000000000000000000000000000000000000',
    tokenId: BigInt(tokenId),
    makerAmount: side === 0 ? makerAmount : takerAmount,
    takerAmount: side === 0 ? takerAmount : makerAmount,
    expiration: BigInt(0), // No expiry (GTC)
    nonce: BigInt(0),
    feeRateBps: BigInt(0),
    side,
    signatureType: 0,
  };
}
