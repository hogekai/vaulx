export function signPage(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>vaulx — Sign Message</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 60px auto; padding: 0 20px; background: #0a0a0a; color: #e0e0e0; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; text-align: center; }
    .subtitle { color: #999; text-align: center; margin-bottom: 24px; }
    .message-box { background: #1a1a2e; padding: 20px; border-radius: 8px; border: 1px solid #333; margin-bottom: 24px; font-family: monospace; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; }
    .actions { display: flex; gap: 12px; }
    button { flex: 1; padding: 14px; border-radius: 8px; font-size: 1rem; cursor: pointer; border: none; }
    .sign-btn { background: #7c8aff; color: #fff; }
    .sign-btn:hover { background: #6b79ee; }
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
  <p class="subtitle">Sign Message</p>

  <div id="loading" class="loading">Loading message...</div>
  <div id="content" style="display:none">
    <div class="message-box" id="messageBox"></div>
    <div class="actions">
      <button class="reject-btn" onclick="rejectSign()">Reject</button>
      <button class="sign-btn" id="signBtn" onclick="signMsg()">Sign in Wallet</button>
    </div>
  </div>
  <p id="status" class="status"></p>

  <script>
    const nonce = ${JSON.stringify(nonce)};
    let messageData = null;

    async function loadMessage() {
      try {
        const res = await fetch("/api/pending-sign/" + nonce);
        if (!res.ok) throw new Error("Message not found or expired");
        messageData = await res.json();

        document.getElementById("messageBox").textContent = messageData.message;
        document.getElementById("loading").style.display = "none";
        document.getElementById("content").style.display = "block";
      } catch (err) {
        document.getElementById("loading").textContent = err.message || "Failed to load";
      }
    }

    async function signMsg() {
      const status = document.getElementById("status");
      const btn = document.getElementById("signBtn");
      btn.disabled = true;

      if (!window.ethereum) {
        status.textContent = "No wallet detected.";
        status.className = "status error";
        btn.disabled = false;
        return;
      }

      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        status.textContent = "Waiting for wallet signature...";
        status.className = "status";

        const signature = await window.ethereum.request({
          method: "personal_sign",
          params: [messageData.message, accounts[0]],
        });

        await fetch("/api/sign/" + nonce, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signature }),
        });

        status.textContent = "Message signed! You can close this tab.";
        status.className = "status success";
        document.getElementById("content").querySelector(".actions").style.display = "none";
      } catch (err) {
        btn.disabled = false;
        status.textContent = err.message || "Signing failed";
        status.className = "status error";
      }
    }

    async function rejectSign() {
      await fetch("/api/reject/" + nonce, { method: "POST" });
      document.getElementById("status").textContent = "Signing rejected.";
      document.getElementById("status").className = "status error";
      document.getElementById("content").querySelector(".actions").style.display = "none";
    }

    loadMessage();
  </script>
</body>
</html>`;
}
