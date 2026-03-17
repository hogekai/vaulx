export function confirmPage(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>vaulx — Confirm Transaction</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 60px auto; padding: 0 20px; background: #0a0a0a; color: #e0e0e0; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; text-align: center; }
    .subtitle { color: #999; text-align: center; margin-bottom: 24px; }
    .details { background: #1a1a2e; padding: 20px; border-radius: 8px; border: 1px solid #333; margin-bottom: 24px; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #222; }
    .row:last-child { border-bottom: none; }
    .label { color: #999; }
    .value { font-family: monospace; word-break: break-all; text-align: right; max-width: 60%; }
    .actions { display: flex; gap: 12px; }
    button { flex: 1; padding: 14px; border-radius: 8px; font-size: 1rem; cursor: pointer; border: none; }
    .confirm-btn { background: #4ade80; color: #000; }
    .confirm-btn:hover { background: #3dc972; }
    .reject-btn { background: #333; color: #e0e0e0; }
    .reject-btn:hover { background: #444; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .status { margin-top: 16px; text-align: center; color: #999; font-size: 0.9rem; }
    .success { color: #4ade80; }
    .error { color: #f87171; }
    .loading { text-align: center; padding: 40px; color: #999; }
  </style>
</head>
<body>
  <h1>vaulx</h1>
  <p class="subtitle">Confirm Transaction</p>

  <div id="loading" class="loading">Loading transaction details...</div>
  <div id="content" style="display:none">
    <div class="details">
      <div class="row"><span class="label">To</span><span class="value" id="txTo"></span></div>
      <div class="row"><span class="label">Amount</span><span class="value" id="txAmount"></span></div>
      <div class="row"><span class="label">Chain</span><span class="value" id="txChain"></span></div>
    </div>
    <div class="actions">
      <button class="reject-btn" id="rejectBtn" onclick="rejectTx()">Reject</button>
      <button class="confirm-btn" id="confirmBtn" onclick="confirmTx()">Confirm in Wallet</button>
    </div>
  </div>
  <p id="status" class="status"></p>

  <script>
    const nonce = ${JSON.stringify(nonce)};
    let txData = null;

    async function loadTx() {
      try {
        const res = await fetch("/api/pending/" + nonce);
        if (!res.ok) throw new Error("Transaction not found or expired");
        txData = await res.json();

        document.getElementById("txTo").textContent = txData.to;
        document.getElementById("txAmount").textContent = txData.displayValue;
        document.getElementById("txChain").textContent = txData.chainName + " (" + txData.chainId + ")";
        document.getElementById("loading").style.display = "none";
        document.getElementById("content").style.display = "block";
      } catch (err) {
        document.getElementById("loading").textContent = err.message || "Failed to load";
      }
    }

    async function confirmTx() {
      const status = document.getElementById("status");
      const btn = document.getElementById("confirmBtn");
      btn.disabled = true;

      if (!window.ethereum) {
        status.textContent = "No wallet detected.";
        status.className = "status error";
        btn.disabled = false;
        return;
      }

      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });

        // Switch chain if needed
        const targetChainHex = "0x" + txData.chainId.toString(16);
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: targetChainHex }],
          });
        } catch (switchErr) {
          status.textContent = "Please switch to the correct chain.";
          status.className = "status error";
          btn.disabled = false;
          return;
        }

        status.textContent = "Waiting for wallet confirmation...";
        status.className = "status";

        const txParams = {
          from: accounts[0],
          to: txData.to,
          value: "0x" + BigInt(txData.value).toString(16),
          chainId: targetChainHex,
        };
        if (txData.data) txParams.data = txData.data;

        const hash = await window.ethereum.request({
          method: "eth_sendTransaction",
          params: [txParams],
        });

        await fetch("/api/confirm/" + nonce, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hash }),
        });

        status.textContent = "Transaction sent! You can close this tab.";
        status.className = "status success";
        document.getElementById("content").querySelector(".actions").style.display = "none";
      } catch (err) {
        btn.disabled = false;
        status.textContent = err.message || "Transaction failed";
        status.className = "status error";
      }
    }

    async function rejectTx() {
      await fetch("/api/reject/" + nonce, { method: "POST" });
      document.getElementById("status").textContent = "Transaction rejected.";
      document.getElementById("status").className = "status error";
      document.getElementById("content").querySelector(".actions").style.display = "none";
    }

    loadTx();
  </script>
</body>
</html>`;
}
