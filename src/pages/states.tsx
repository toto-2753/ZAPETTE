import { EmptyState } from '../components/ui';

export function Skeleton({ hero = false }: { hero?: boolean }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Chargement des chaînes">
      {hero && <div className="sk-hero" />}
      {[0, 1, 2].map((r) => (
        <div className="sk-row" key={r}>
          <div className="sk-title" />
          <div className="sk-track">
            {Array.from({ length: 7 }, (_, i) => (
              <div className="sk-tile" key={i} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoadError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <EmptyState icon="alert" title="Impossible de charger les chaînes">
      <p>{message || 'Vérifie ta connexion internet.'}</p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Réessayer
      </button>
    </EmptyState>
  );
}
