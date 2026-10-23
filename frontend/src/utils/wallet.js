// Wallet utility
// MetaMask connection and network switching (Hardhat local chain by default).
import { ethers } from "ethers";

export function hasWallet() {
  return typeof window !== "undefined" && !!window.ethereum;
}

/** Make sure MetaMask is on the chain the contract was deployed to; add it if missing. */
export async function ensureNetwork(chainId) {
  const hex = "0x" + Number(chainId).toString(16);
  const current = await window.ethereum.request({ method: "eth_chainId" });
  if (current === hex) return;
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (err) {
    const code = err?.code ?? err?.data?.originalError?.code;
    if (code !== 4902) throw err;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: hex,
        chainName: "Hardhat Local",
        rpcUrls: ["http://127.0.0.1:8545"],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      }],
    });
  }
}

export async function connectWallet(chainId) {
  if (!hasWallet()) throw new Error("MetaMask not found. Install the MetaMask browser extension.");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  if (chainId) await ensureNetwork(chainId);
  // Create the provider after switching so ethers doesn't see a network change.
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}

export async function connectedAccount() {
  if (!hasWallet()) return null;
  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  return accounts[0] || null;
}

/** Calls `cb` when the user switches account or network in MetaMask. Returns an unsubscribe fn. */
export function onWalletChange(cb) {
  if (!hasWallet() || !window.ethereum.on) return () => {};
  window.ethereum.on("accountsChanged", cb);
  window.ethereum.on("chainChanged", cb);
  return () => {
    window.ethereum.removeListener?.("accountsChanged", cb);
    window.ethereum.removeListener?.("chainChanged", cb);
  };
}

export function shortAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}
