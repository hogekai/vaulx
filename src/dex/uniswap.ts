import { encodeFunctionData, parseAbi } from "viem";

// Uniswap V3 SwapRouter02 addresses
export const SWAP_ROUTER: Record<string, `0x${string}`> = {
	"1": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
	"8453": "0x2626664c2603336E57B271c5C0b26F421741e481",
};

// Uniswap V3 QuoterV2 addresses
export const QUOTER_V2: Record<string, `0x${string}`> = {
	"1": "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
	"8453": "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
};

// WETH addresses (for wrapping ETH in Uniswap)
export const WETH: Record<string, `0x${string}`> = {
	"1": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
	"8453": "0x4200000000000000000000000000000000000006",
};

const swapRouterAbi = parseAbi([
	"function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
]);

const quoterAbi = parseAbi([
	"function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

export function isSwapSupported(chainId: string): boolean {
	return chainId in SWAP_ROUTER;
}

export function encodeExactInputSingle(params: {
	tokenIn: `0x${string}`;
	tokenOut: `0x${string}`;
	fee: number;
	recipient: `0x${string}`;
	amountIn: bigint;
	amountOutMinimum: bigint;
}): `0x${string}` {
	return encodeFunctionData({
		abi: swapRouterAbi,
		functionName: "exactInputSingle",
		args: [
			{
				tokenIn: params.tokenIn,
				tokenOut: params.tokenOut,
				fee: params.fee,
				recipient: params.recipient,
				amountIn: params.amountIn,
				amountOutMinimum: params.amountOutMinimum,
				sqrtPriceLimitX96: 0n,
			},
		],
	});
}

export function encodeQuoteExactInputSingle(params: {
	tokenIn: `0x${string}`;
	tokenOut: `0x${string}`;
	amountIn: bigint;
	fee: number;
}): `0x${string}` {
	return encodeFunctionData({
		abi: quoterAbi,
		functionName: "quoteExactInputSingle",
		args: [
			{
				tokenIn: params.tokenIn,
				tokenOut: params.tokenOut,
				amountIn: params.amountIn,
				fee: params.fee,
				sqrtPriceLimitX96: 0n,
			},
		],
	});
}

export { quoterAbi };
