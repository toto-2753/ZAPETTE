# Zapette

## What This Is

Une application de télé en streaming gratuite, au look Netflix / Popcorn Time, qui marche sur
iPhone, Android, iPad, Mac et PC (une seule app web installable, PWA). Elle diffuse les chaînes
publiques recensées par iptv-org, dont les liens sont vérifiés automatiquement plusieurs fois par
jour, et propose des rubriques Films, Séries et Nouveautés. On peut caster sur la télé
(Chromecast, AirPlay) et partager une chaîne depuis le téléphone.

## Core Value

Quand on appuie sur une chaîne, elle se lance. Les liens morts ne doivent jamais être montrés
(ou être écartés automatiquement dès qu'ils tombent).

## Requirements

### Validated

(Rien encore — à valider à l'usage)

### Active

Voir REQUIREMENTS.md.

### Out of Scope

- Recherche / lecture de torrents pour les films et séries — ce serait de la diffusion de
  contenus protégés sans droits. La rubrique Nouveautés indique à la place où regarder
  légalement (dont les offres gratuites).
- Apps natives signées App Store / Play Store — demande un compte développeur Apple payant et
  un Mac pour compiler ; la PWA couvre tous les appareils.
- Flux nécessitant un Referer ou un User-Agent particulier — un navigateur ne peut pas les envoyer.
- Flux DASH (.mpd) et RTMP — non lisibles par hls.js, < 2 % du catalogue.

## Context

- Source demandée : https://github.com/ITAnt/iptv-org — c'est un fork de iptv-org/iptv figé au
  31/10/2024 (13 680 liens, dont 9 075 ne figurent plus dans l'original). L'original iptv-org est
  mis à jour quotidiennement (≈19 300 flux, 31 900 chaînes) : il sert de source principale, le fork
  est ajouté comme source complémentaire et passe par le même vérificateur.
- Un navigateur ne lit un flux HLS via hls.js que si le serveur envoie des en-têtes CORS ; Safari
  (iOS, iPadOS, macOS) et Chrome Android lisent le HLS nativement sans CORS. Une page https ne
  peut pas charger de flux http (contenu mixte).
- Les serveurs GitHub Actions sont aux États-Unis : un flux géo-bloqué France y répond 403. Ces
  flux sont gardés (marqués « restreint ») et revérifiés sur l'appareil de l'utilisateur.
- Utilisateur : Antoine, en France, francophone, ingénieur de formation.

## Constraints

- **Hébergement** : 100 % statique (GitHub Pages) + GitHub Actions pour la vérification — gratuit.
- **Compatibilité** : Safari iOS 16+, Chrome/Edge/Firefox récents.
- **Légalité** : uniquement des flux publics (iptv-org) et des métadonnées (TMDB) ; pas de torrents.
- **Taille** : données compactes (< 1 Mo gzip) pour un démarrage rapide sur mobile.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| PWA unique (Vite + React + TS) | Un seul code pour tous les appareils, installable, pas de store | — Pending |
| Vérification en 2 temps : CI toutes les 6 h + sur l'appareil | La CI élimine les liens morts, l'appareil gère géo-blocage et pannes récentes | — Pending |
| iptv-org original en source principale, fork ITAnt en complément | Le fork date d'oct. 2024, 2/3 de ses liens ont disparu | — Pending |
| TMDB (clé gratuite saisie dans Réglages) pour les nouveautés | Données à jour films + séries + où regarder en France (JustWatch) | — Pending |
| Proxy Cloudflare optionnel | Rend lisibles sur PC/Android les flux sans CORS ou en http | — Pending |
| Routage par hash | Fonctionne sur GitHub Pages sans réécriture serveur | — Pending |

---
*Last updated: 2026-11-25 after initialization*
