# State: Zapette

## Current Position

Phase: 6 of 6 (Mise en ligne) — terminée
Status: v1 en ligne (privée, mot de passe) sur https://toto-2753.github.io/ZAPETTE/
Last activity: 2026-11-25 — première vérification réelle : 26 556 liens testés en ~15 min,
10 576 chaînes en ligne (14 667 liens OK, 1 685 restreints gardés, 10 204 morts écartés)

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

## Leçons CI

- Node résout le DNS sur 4 fils par défaut : avec ~7 000 domaines, la file saturait (liens vivants
  comptés expirés, vérification > 45 min). UV_THREADPOOL_SIZE=128 + coupe-circuit par serveur
  (145 serveurs hors ligne, 2 410 liens non retestés) → ~15 min.

## Next

- Vérifier sur appareils réels : AirPlay (iPhone/Apple TV), Chromecast (Chrome), installation PWA
- v2 : guide des programmes (EPG), synchro des favoris
