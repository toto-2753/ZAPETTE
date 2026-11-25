import { useEffect, useRef, useState } from 'react';
import { useCatalog } from '../data/catalog';
import { Brand, Icon } from '../components/Icon';

/** Écran d'entrée d'une Zapette privée : le mot de passe n'est demandé qu'une fois par appareil. */
export default function Lock() {
  const { unlock } = useCatalog();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const submit = async () => {
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      await unlock(password);
    } catch (e) {
      setError((e as Error).message || 'Mot de passe incorrect');
      setBusy(false);
      input.current?.select();
    }
  };

  return (
    <main className="lock" id="contenu">
      <form
        className="lock-card"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Brand />
        <h1>Cette Zapette est privée</h1>
        <p>Entre le mot de passe qu’on t’a donné. Il n’est demandé qu’une fois sur cet appareil.</p>
        <label className="text">
          <span>Mot de passe</span>
          <input
            ref={input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'lock-error' : undefined}
          />
        </label>
        {error && (
          <p className="lock-error" id="lock-error" role="alert">
            <Icon name="alert" size={18} /> {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || !password}>
          {busy ? 'Ouverture…' : 'Entrer'}
        </button>
      </form>
    </main>
  );
}
