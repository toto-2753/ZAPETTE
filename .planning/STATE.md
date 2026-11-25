# State: Zapette

## Current Position

Phase: 6 of 6 (Mise en ligne) — code terminé, en attente du dépôt GitHub de l'utilisateur
Status: v1 prête ; première vérification réelle des flux à faire dans GitHub Actions
Last activity: 2026-11-25 — v1 construite et testée

## Vérifications faites

- 35 tests unitaires (vérificateur HLS, catalogue, M3U, tri/numérotation, proxy)
- 23 vérifications de bout en bout dans Chrome 153 avec de vrais flux HLS locaux
  (bascule de source, chaîne morte masquée, vérification en arrière-plan, zapping, recherche,
  Ma liste, TMDB simulé, partage, PWA)
- Pipeline CLI complet contre serveurs locaux vivant / 404 / muet / 403
- Catalogue réel non vérifié (16 324 chaînes) : accueil en ~1 s (bureau), ~3 s (mobile CPU ÷4)

## Accumulated Context

- Le bac à sable de développement n'a pas accès aux serveurs de flux ni à TMDB : la vérification
  réelle tourne dans GitHub Actions ; TMDB testé avec des réponses simulées.
- Chrome 153 bureau lit le HLS nativement (canPlayType « maybe ») : les flux sans CORS y sont
  lisibles en mode natif, sans proxy.

## Next

- Dépôt GitHub public + Pages (Source : GitHub Actions), lancer le workflow
- Vérifier sur appareils réels : AirPlay (iPhone/Apple TV), Chromecast (Chrome), installation PWA
- v2 : guide des programmes (EPG), synchro des favoris
