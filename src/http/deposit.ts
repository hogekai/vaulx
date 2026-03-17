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
    h2 { font-size: 1.1rem; color: #999; margin-top: 32px; border-top: 1px solid #222; padding-top: 16px; }
    .address { font-family: monospace; font-size: 1.1rem; background: #1a1a2e; padding: 16px; border-radius: 8px; word-break: break-all; cursor: pointer; border: 1px solid #333; }
    .address:hover { border-color: #666; }
    .balance { font-size: 0.95rem; color: #999; margin-top: 8px; }
    .info { margin-top: 24px; color: #999; font-size: 0.9rem; }
    a { color: #7c8aff; }
    .faucets { margin-top: 16px; }
    .faucets a { display: inline-block; margin-right: 16px; }
    .deposit-form { margin-top: 16px; }
    .deposit-form input { background: #1a1a2e; border: 1px solid #333; color: #e0e0e0; padding: 12px; border-radius: 8px; font-size: 1rem; width: 120px; margin-right: 8px; }
    .deposit-form input:focus { outline: none; border-color: #7c8aff; }
    button { background: #7c8aff; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #6b79ee; }
    button:disabled { background: #333; cursor: not-allowed; }
    .status { margin-top: 12px; font-size: 0.9rem; }
    .success { color: #4ade80; }
    .error { color: #f87171; }
  </style>
</head>
<body>
  <h1>vaulx Deposit</h1>
  <p>Agent wallet address:</p>
  <div class="address" id="walletAddress" onclick="copyAddress()" title="Click to copy">${address}</div>
  <p class="info">Chain ID: ${chainId}</p>

  <h2>Send from your wallet</h2>
  <div class="deposit-form">
    <input type="text" id="depositAmount" placeholder="0.1" value="0.1" />
    <span>ETH</span>
    <br /><br />
    <button id="depositBtn" onclick="deposit()">Connect Wallet & Deposit</button>
  </div>
  <p id="depositStatus" class="status"></p>

  <h2>Testnet Faucets</h2>
  <div class="faucets">
    <a href="https://www.alchemy.com/faucets/base-sepolia" target="_blank">Base Sepolia Faucet</a>
    <a href="https://sepoliafaucet.com" target="_blank">Sepolia Faucet</a>
  </div>

  <script>
    const agentAddress = ${JSON.stringify(address)};
    const chainId = ${chainId};

    function copyAddress() {
      navigator.clipboard.writeText(agentAddress);
      const el = document.getElementById("walletAddress");
      const orig = el.textContent;
      el.textContent = "Copied!";
      setTimeout(() => el.textContent = orig, 1500);
    }

    async function deposit() {
      const status = document.getElementById("depositStatus");
      const btn = document.getElementById("depositBtn");
      const amount = document.getElementById("depositAmount").value;

      if (!window.ethereum) {
        status.textContent = "No wallet detected. Install MetaMask or Rabby.";
        status.className = "status error";
        return;
      }

      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        status.textContent = "Enter a valid amount.";
        status.className = "status error";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Connecting...";

      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });

        // Switch chain
        const chainHex = "0x" + chainId.toString(16);
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: chainHex }],
          });
        } catch (switchErr) {
          status.textContent = "Please switch to the correct chain in your wallet.";
          status.className = "status error";
          btn.disabled = false;
          btn.textContent = "Connect Wallet & Deposit";
          return;
        }

        btn.textContent = "Confirm in wallet...";
        status.textContent = "Waiting for wallet confirmation...";
        status.className = "status";

        // Convert ETH to wei hex
        const wei = BigInt(Math.floor(Number(amount) * 1e18));
        const valueHex = "0x" + wei.toString(16);

        const hash = await window.ethereum.request({
          method: "eth_sendTransaction",
          params: [{
            from: accounts[0],
            to: agentAddress,
            value: valueHex,
            chainId: chainHex,
          }],
        });

        status.innerHTML = 'Deposit sent! Tx: <a href="https://sepolia.basescan.org/tx/' + hash + '" target="_blank" style="color:#4ade80">' + hash.slice(0, 10) + '...</a>';
        status.className = "status success";
        btn.textContent = "Deposit Sent!";
      } catch (err) {
        status.textContent = err.message || "Deposit failed";
        status.className = "status error";
        btn.disabled = false;
        btn.textContent = "Connect Wallet & Deposit";
      }
    }
  </script>
</body>
</html>`;
}
