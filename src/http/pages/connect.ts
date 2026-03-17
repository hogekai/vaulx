export function connectPage(nonce: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>vaulx — Connect Wallet</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 60px auto; padding: 0 20px; background: #0a0a0a; color: #e0e0e0; text-align: center; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    .subtitle { color: #999; margin-bottom: 32px; }
    button { background: #7c8aff; color: #fff; border: none; padding: 14px 28px; border-radius: 8px; font-size: 1rem; cursor: pointer; width: 100%; margin-bottom: 12px; }
    button:hover { background: #6b79ee; }
    button:disabled { background: #333; cursor: not-allowed; }
    .address { font-family: monospace; font-size: 0.95rem; background: #1a1a2e; padding: 14px; border-radius: 8px; word-break: break-all; border: 1px solid #333; margin: 20px 0; display: none; }
    .status { margin-top: 16px; color: #999; font-size: 0.9rem; }
    .success { color: #4ade80; }
    .error { color: #f87171; }
  </style>
</head>
<body>
  <h1>vaulx</h1>
  <p class="subtitle">Connect your wallet to the agent</p>

  <button id="connectBtn" onclick="connectWallet()">Connect with MetaMask</button>
  <div id="addressBox" class="address"></div>
  <button id="confirmBtn" style="display:none" onclick="confirmConnect()">Confirm Connection</button>
  <p id="status" class="status"></p>

  <script>
    let connectedAddress = null;
    const nonce = ${JSON.stringify(nonce)};

    async function connectWallet() {
      const status = document.getElementById("status");
      const btn = document.getElementById("connectBtn");

      if (!window.ethereum) {
        status.textContent = "No wallet detected. Install MetaMask or Rabby.";
        status.className = "status error";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Connecting...";

      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        connectedAddress = accounts[0];

        document.getElementById("addressBox").textContent = connectedAddress;
        document.getElementById("addressBox").style.display = "block";
        document.getElementById("confirmBtn").style.display = "block";
        btn.style.display = "none";
        status.textContent = "Wallet connected. Click Confirm to proceed.";
        status.className = "status";
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Connect with MetaMask";
        status.textContent = err.message || "Connection failed";
        status.className = "status error";
      }
    }

    async function confirmConnect() {
      const status = document.getElementById("status");
      const btn = document.getElementById("confirmBtn");
      btn.disabled = true;

      try {
        const res = await fetch("/api/connect/" + nonce, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: connectedAddress }),
        });
        if (!res.ok) throw new Error(await res.text());

        status.textContent = "Connected! You can close this tab.";
        status.className = "status success";
        btn.style.display = "none";
      } catch (err) {
        btn.disabled = false;
        status.textContent = err.message || "Failed to confirm";
        status.className = "status error";
      }
    }
  </script>
</body>
</html>`;
}
