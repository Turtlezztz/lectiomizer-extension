import React, { useEffect, useState } from 'react';
import { ArrowUpRight, MessagesSquare } from 'lucide-react';
import { api } from '../settings.js';
import { ACCOUNT_DEFAULTS, CHAT_DATA, CHAT_ORIGINS, USAGE_URL, loadAccount } from './store.js';

// Keeps the ChatGPT account state in sync with storage.
export function useAccount() {
  const [account, setAccount] = useState(null);
  useEffect(() => {
    loadAccount().then(setAccount);
    const onChange = (changes, area) => {
      if (area === 'local' && changes.chatAccount) setAccount({ ...ACCOUNT_DEFAULTS, ...changes.chatAccount.newValue });
    };
    api?.storage.onChanged.addListener(onChange);
    return () => api?.storage.onChanged.removeListener(onChange);
  }, []);
  return account;
}

// Starts Sign in with ChatGPT. Extension pages ask for data consent and the
// OpenAI and loopback hosts inside the click first (Firefox only shows that
// prompt there); Lectio pages let the background script decide, which opens
// this panel in a small window when something is still missing. Resolves to
// the background's answer.
export function connectChatGPT({ extensionPage, consent = false }) {
  const send = () => api.runtime.sendMessage({ type: 'chat:connect', consent });
  if (!extensionPage) return send();
  let granted;
  try { granted = api.permissions.request({ origins: CHAT_ORIGINS, data_collection: CHAT_DATA }); }
  catch {
    try { granted = api.permissions.request({ origins: CHAT_ORIGINS }); } // Firefox without built-in data consent.
    catch { granted = Promise.resolve(true); }
  }
  return granted.catch(() => true).then(ok => ok ? send() : { ok: false, message: 'Uden din tilladelse sendes intet fra Lectio til ChatGPT.' });
}

// While a sign-in is open: cancel it, or finish it from a callback page that
// wouldn't load ("Kan ikke oprette forbindelse" on 127.0.0.1).
export function PendingSignIn({ className = 'lx-integration-text' }) {
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const finish = async event => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await api.runtime.sendMessage({ type: 'chat:callback', url: address });
      if (!result?.ok) setMessage(result?.message || 'Login kunne ikke gøres færdigt.');
    } catch {
      setMessage('Lectiomizer svarede ikke. Prøv igen.');
    } finally {
      setBusy(false);
    }
  };
  return <>
    <p className={className}>Log ind i fanen fra ChatGPT, der åbnede. Den lukker af sig selv bagefter. <button type="button" className="lx-text-button" onClick={() => api.runtime.sendMessage({ type: 'chat:cancel' })}>Annullér</button></p>
    <details className="lx-chatgpt-paste">
      <summary>Endte fanen på en side, der ikke kan indlæses?</summary>
      <form onSubmit={finish}>
        <label htmlFor="lx-chatgpt-paste">Kopiér adressen fra den fane (den starter med http://127.0.0.1) og indsæt den her:</label>
        <span><input id="lx-chatgpt-paste" type="url" value={address} onChange={e => setAddress(e.target.value)} placeholder="http://127.0.0.1:…/auth/callback?code=…" autoComplete="off" spellCheck={false} /><button type="submit" className="lx-button lx-button-secondary" disabled={busy || !address.trim()}>Fortsæt</button></span>
        {message && <p role="alert">{message}</p>}
      </form>
    </details>
  </>;
}

// ChatGPT account in the popup and the settings card in Lectio pages.
export function ChatPanel({ embedded = false }) {
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  if (!account) return null;
  const run = async action => {
    setBusy(true);
    setNotice('');
    try {
      const result = await action();
      if (!result?.ok && result?.message) setNotice(result.message);
      else if (embedded && !result?.started && action === connect) setNotice('Fortsæt i Lectiomizer-vinduet, der åbnede.');
    } catch {
      setNotice('Noget gik galt. Prøv igen.');
    } finally {
      setBusy(false);
    }
  };
  const connect = () => connectChatGPT({ extensionPage: !embedded });
  const allowPlan = () => connectChatGPT({ extensionPage: !embedded, consent: true });
  const signOut = () => api.runtime.sendMessage({ type: 'chat:disconnect' });
  const Heading = embedded ? 'h3' : 'h2';

  let body;
  if (account.pending) {
    body = <PendingSignIn />;
  } else if (!account.connected) {
    body = <>
      <p className="lx-integration-text">Chat med en assistent, der kan læse dine Lectio-sider og dokumenter fra opgaver og lektioner. Svarene bruger din ChatGPT-plan.{embedded && ' Første gang giver du tilladelse i et lille Lectiomizer-vindue.'}</p>
      <button type="button" className="lx-button lx-chatgpt-button" onClick={() => run(connect)} disabled={busy}>Fortsæt med ChatGPT</button>
    </>;
  } else if (!account.planEnabled) {
    body = <>
      <p className="lx-integration-text">Du har ikke givet Lectiomizer lov til at bruge din ChatGPT-plan, så chatten kan ikke svare.</p>
      <button type="button" className="lx-button lx-chatgpt-button" onClick={() => run(allowPlan)} disabled={busy}>Tillad brug af din ChatGPT-plan</button>
    </>;
  } else {
    body = <p className="lx-integration-text">Chatten bruger din ChatGPT-plan. <a href={USAGE_URL} target="_blank" rel="noopener noreferrer">Administrer forbrug <ArrowUpRight size={12} aria-hidden="true" /></a></p>;
  }
  return <section className="lx-integration" aria-labelledby="lx-chatgpt-title">
    <div className="lx-integration-head">
      <MessagesSquare size={18} aria-hidden="true" />
      <div className="lx-integration-heading">
        <Heading id="lx-chatgpt-title" className="lx-integration-title">ChatGPT</Heading>
        {account.connected && <p className="lx-integration-account" title={account.email}>{account.email || 'Logget ind'}</p>}
      </div>
      {account.connected && <button type="button" className="lx-text-button" onClick={() => run(signOut)} disabled={busy}>Log ud</button>}
    </div>
    {body}
    {(notice || account.message) && <p className="lx-integration-notice" role="alert">{notice || account.message}</p>}
  </section>;
}
