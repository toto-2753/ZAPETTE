# Requirements: Zapette

**Defined:** 2026-11-25
**Core Value:** Quand on appuie sur une chaîne, elle se lance ; les liens morts ne sont pas montrés.

## v1 Requirements

### Données & vérification (DATA)

- [x] **DATA-01**: Le catalogue est construit depuis l'API iptv-org (chaînes, flux, logos, catégories, langues) + playlists M3U complémentaires (fork ITAnt)
- [x] **DATA-02**: Chaque flux est testé : manifeste HLS valide, variante, segment vidéo réellement servi
- [x] **DATA-03**: Le test relève https, CORS, latence et résolution ; 401/403/451 = « restreint » (gardé), le reste en échec = mort (écarté)
- [x] **DATA-04**: Exclus : NSFW, liste noire iptv-org, flux exigeant Referer/User-Agent, flux non HLS
- [x] **DATA-05**: Sortie compacte channels.json + status.json + playlists M3U vérifiées (toutes / France)
- [x] **DATA-06**: Vérification automatique toutes les 6 h (GitHub Actions) puis redéploiement

### Interface (UI)

- [x] **UI-01**: Accueil façon Netflix : grand bandeau, rangées horizontales par thème
- [x] **UI-02**: Page Chaînes : filtres pays / catégorie / langue, grille à défilement infini
- [x] **UI-03**: Recherche instantanée (nom, nom alternatif, pays)
- [x] **UI-04**: Favoris (« Ma liste ») et historique (« Reprendre ») conservés sur l'appareil
- [x] **UI-05**: Réglages : pays et langue préférés, clé TMDB, proxy, vérification en arrière-plan, fraîcheur des données
- [x] **UI-06**: Installable (PWA) sur iPhone, iPad, Android, Mac, PC ; marche en mode hors-ligne pour l'interface
- [x] **UI-07**: Navigation mobile (barre du bas) et ordinateur (barre du haut, clavier)

### Lecture (PLAY)

- [x] **PLAY-01**: Lecture HLS via hls.js ou HLS natif (Safari, Chrome Android) selon l'appareil
- [x] **PLAY-02**: Si un flux échoue ou ne démarre pas en 15 s, bascule auto sur la source suivante
- [x] **PLAY-03**: Une chaîne dont toutes les sources échouent est masquée sur l'appareil pendant 6 h
- [x] **PLAY-04**: Vérification en arrière-plan des chaînes affichées (sauf mode économie de données)
- [x] **PLAY-05**: Choix de la version (langue/flux) et de la qualité ; zapping chaîne précédente/suivante
- [x] **PLAY-06**: Ouvrir le flux dans VLC (iOS, Android, ordinateur) quand le navigateur ne peut pas le lire

### Cast & partage (CAST)

- [x] **CAST-01**: Chromecast depuis Chrome / Edge (ordinateur et Android)
- [x] **CAST-02**: AirPlay depuis Safari (iPhone, iPad, Mac) vers Apple TV / TV compatibles
- [x] **CAST-03**: Partager une chaîne (partage natif du téléphone, lien direct, QR code)
- [x] **CAST-04**: Exporter ses favoris en playlist M3U ; playlists vérifiées publiées pour les apps IPTV des TV

### Films & séries (MEDIA)

- [x] **MEDIA-01**: Rubriques Films et Séries alimentées par les chaînes ciné / séries vérifiées
- [x] **MEDIA-02**: Nouveautés films et séries (TMDB) : tendances, à l'affiche en France, à venir
- [x] **MEDIA-03**: Fiche : résumé, note, bande-annonce, où regarder légalement en France (gratuit, pub, abonnement, location)

## v2 Requirements

- **EPG-01**: Guide des programmes (EPG) — ce qui passe maintenant / ensuite
- **SYNC-01**: Synchroniser favoris entre appareils
- **NATIVE-01**: Emballage natif (Capacitor / Tauri) pour lever la contrainte CORS sans proxy

## Out of Scope

| Feature | Reason |
|---------|--------|
| Torrents films/séries | Diffusion de contenus protégés sans droits |
| Apps App Store / Play Store | Compte développeur payant + Mac requis ; la PWA suffit |
| Flux DASH / RTMP / Referer imposé | Non lisibles dans un navigateur |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01..05 | Phase 1 | Done (à valider en ligne) |
| UI-01..07 | Phase 2 | Done (à valider en ligne) |
| PLAY-01..06 | Phase 3 | Done (à valider en ligne) |
| CAST-01..04 | Phase 4 | Done (à valider en ligne) |
| MEDIA-01..03 | Phase 5 | Done (à valider en ligne) |
| DATA-06 | Phase 6 | Done (à valider en ligne) |

---
*Requirements defined: 2026-11-25*
