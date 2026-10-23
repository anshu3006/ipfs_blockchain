// App component
import { useCallback, useEffect, useState } from "react";
import Navbar from "./components/Navbar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import UploadFile from "./pages/UploadFile";
import MyFiles from "./pages/MyFiles";
import SharedFiles from "./pages/SharedFiles";
import AuditLog from "./pages/AuditLog";
import Admin from "./pages/Admin";
import { api, setToken } from "./services/api";
import { contractInfo, setSigner } from "./services/blockchain";
import { connectWallet, connectedAccount, onWalletChange } from "./utils/wallet";

const STORAGE_KEY = "ipfs-share-session";

function loadSaved() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function persist(session) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ address: session.address, token: session.token }));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export default function App() {
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [restoring, setRestoring] = useState(true);

  const logout = useCallback(() => {
    setSession(null);
    setToken(null);
    setSigner(null);
    persist(null);
    setPage("dashboard");
  }, []);

  function login({ signer, token, address, isAdmin, attributes }) {
    setSigner(signer);
    setToken(token);
    const next = { address, token, isAdmin, attributes };
    setSession(next);
    persist(next);
    setPage("dashboard");
  }

  const refreshProfile = useCallback(async () => {
    const me = await api.me();
    setSession((s) => (s ? { ...s, isAdmin: me.isAdmin, attributes: me.attributes } : s));
  }, []);

  // Restore a login after a page reload if MetaMask is still on the same account.
  useEffect(() => {
    (async () => {
      const saved = loadSaved();
      try {
        const account = await connectedAccount();
        if (saved && account && account.toLowerCase() === saved.address.toLowerCase()) {
          const { signer } = await connectWallet(contractInfo?.chainId);
          setSigner(signer);
          setToken(saved.token);
          const me = await api.me();
          setSession({ ...saved, isAdmin: me.isAdmin, attributes: me.attributes });
        }
      } catch {
        persist(null);
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  // Switching account or network in MetaMask ends the session.
  useEffect(() => onWalletChange(() => logout()), [logout]);

  if (restoring) return <div className="splash">Loading…</div>;
  if (!session) return <Login onLogin={login} />;

  const props = { session, onNavigate: setPage, onProfileChanged: refreshProfile };
  const pages = {
    dashboard: <Dashboard {...props} />,
    upload: <UploadFile {...props} />,
    mine: <MyFiles {...props} />,
    shared: <SharedFiles {...props} />,
    audit: <AuditLog {...props} />,
    admin: session.isAdmin ? <Admin {...props} /> : <Dashboard {...props} />,
  };

  return (
    <>
      <Navbar session={session} page={page} onNavigate={setPage} onLogout={logout} />
      <main className="container">{pages[page]}</main>
    </>
  );
}
