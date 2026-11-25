# Roadmap: Zapette

## Overview

Du catalogue vérifié à l'app installée : d'abord des données fiables, puis l'interface, le
lecteur, le cast/partage, les films/séries, et enfin la mise en ligne automatique.

## Phases

- [ ] **Phase 1: Données vérifiées** - pipeline iptv-org + fork ITAnt, vérificateur de liens, sorties compactes
- [ ] **Phase 2: Interface** - PWA React façon Netflix, navigation, recherche, favoris, réglages
- [ ] **Phase 3: Lecteur** - HLS, bascule auto, vérification sur l'appareil, VLC
- [ ] **Phase 4: Cast & partage** - Chromecast, AirPlay, partage natif, QR, M3U
- [ ] **Phase 5: Films, séries, nouveautés** - rangées thématiques + TMDB / où regarder
- [ ] **Phase 6: Mise en ligne** - GitHub Actions 6 h + Pages, proxy optionnel, README, tests navigateur

## Phase Details

### Phase 1: Données vérifiées
**Goal**: Un channels.json ne contenant que des flux qui répondent vraiment
**Requirements**: DATA-01..05
**Success Criteria**:
  1. Un flux 404, en timeout, non-HLS ou au segment absent est écarté
  2. Un flux 403 est gardé avec le drapeau « restreint »
  3. https / CORS sont détectés sur manifeste, variante et segment
**Plans**: 1

### Phase 2: Interface
**Goal**: On trouve une chaîne en deux gestes sur téléphone comme sur ordinateur
**Requirements**: UI-01..07
**Success Criteria**:
  1. Accueil avec bandeau + rangées rendues depuis channels.json
  2. Recherche, filtres, favoris et historique fonctionnent et persistent
  3. Lighthouse : installable (manifest + service worker)
**Plans**: 1

### Phase 3: Lecteur
**Goal**: Appuyer = regarder, même si la première source est morte
**Requirements**: PLAY-01..06
**Success Criteria**:
  1. Un flux HLS réel se lit dans Chrome (temps qui avance)
  2. Source 1 morte → lecture de la source 2 sans action
  3. Toutes mortes → message + chaîne masquée 6 h
**Plans**: 1

### Phase 4: Cast & partage
**Requirements**: CAST-01..04
**Plans**: 1

### Phase 5: Films, séries, nouveautés
**Requirements**: MEDIA-01..03
**Plans**: 1

### Phase 6: Mise en ligne
**Requirements**: DATA-06
**Success Criteria**:
  1. Le workflow vérifie, construit et déploie sur Pages
  2. Tests de bout en bout verts dans Chrome
**Plans**: 1

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Données vérifiées | 0/1 | Not started | - |
| 2. Interface | 0/1 | Not started | - |
| 3. Lecteur | 0/1 | Not started | - |
| 4. Cast & partage | 0/1 | Not started | - |
| 5. Films, séries, nouveautés | 0/1 | Not started | - |
| 6. Mise en ligne | 0/1 | Not started | - |
