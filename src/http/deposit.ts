export function depositPage(address: string, chainId: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>vaulx — Deposit</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; background: #0a0a0a; color: #e0e0e0; }
    h1 { font-size: 1.5rem; }
    .address { font-family: monospace; font-size: 1.1rem; background: #1a1a2e; padding: 16px; border-radius: 8px; word-break: break-all; cursor: pointer; border: 1px solid #333; }
    .address:hover { border-color: #666; }
    .info { margin-top: 24px; color: #999; font-size: 0.9rem; }
    a { color: #7c8aff; }
    .faucets { margin-top: 16px; }
    .faucets a { display: inline-block; margin-right: 16px; }
  </style>
</head>
<body>
  <h1>vaulx Deposit</h1>
  <p>Send testnet ETH to this address:</p>
  <div class="address" onclick="navigator.clipboard.writeText('${address}')" title="Click to copy">${address}</div>
  <p class="info">Chain ID: ${chainId}</p>
  <div class="faucets">
    <p>Faucets:</p>
    <a href="https://www.alchemy.com/faucets/base-sepolia" target="_blank">Base Sepolia Faucet</a>
    <a href="https://sepoliafaucet.com" target="_blank">Sepolia Faucet</a>
  </div>
  <script>
    document.querySelector('.address').addEventListener('click', () => {
      navigator.clipboard.writeText('${address}');
      const el = document.querySelector('.address');
      const orig = el.textContent;
      el.textContent = 'Copied!';
      setTimeout(() => el.textContent = orig, 1500);
    });
  </script>
</body>
</html>`;
}
