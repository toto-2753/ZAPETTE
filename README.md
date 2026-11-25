# Zapette

La télé gratuite en streaming, avec une interface à la Netflix. Une seule app pour iPhone, Android,
iPad, Mac et PC (app web installable). Elle diffuse les chaînes publiques recensées par
[iptv-org](https://github.com/iptv-org/iptv). Tous les liens sont vérifiés automatiquement toutes les
6 heures, et une chaîne qui tombe entre deux vérifications disparaît d'elle-même de tes listes.

## Ce que fait l'app

- **Accueil façon Netflix** : un grand bandeau « télé » (avec l'aperçu en direct sur ordinateur) et des
  rangées par thème : la TNT, info, films, séries, sport, enfants, documentaires, musique, régions, monde.
- **Numéros de chaîne** : en France, les chaînes de la TNT gardent leur numéro habituel (France 2 sur
  le 2, Arte sur le 7, franceinfo sur le 16…). Dans le lecteur, on zappe avec ↑ ↓, en glissant le
  doigt vers le haut ou le bas, ou en tapant le numéro.
- **Liens vérifiés deux fois** :
  1. toutes les 6 h, un robot (GitHub Actions) teste chaque flux en entier (playlist → variante →
     morceau de vidéo) et écarte les liens morts ;
  2. sur ton appareil, les chaînes affichées sont testées en arrière-plan. Si une source ne démarre
     pas, le lecteur passe tout seul à la suivante. Si toutes échouent, la chaîne est masquée 6 h.
- **Films et séries** : chaînes ciné et séries en direct, et avec une clé TMDB gratuite, les
  nouveautés (à l'affiche, à venir, séries du moment), les bandes-annonces et **où les regarder
  légalement en France** : gratuit, avec pub, abonnement ou location.
- **Sur la télé** : Chromecast depuis Chrome ou Edge, AirPlay depuis Safari (iPhone, iPad, Mac), ou
  playlists vérifiées à charger dans une app IPTV de smart TV.
- **Partage** : partage natif du téléphone, lien direct vers une chaîne, QR code, ouverture dans VLC,
  export de « Ma liste » en playlist M3U.
- Recherche instantanée, Ma liste, historique, filtres par pays / langue / catégorie, mode hors-ligne
  pour l'interface.

## Ce que l'app ne fait pas

- **Pas de torrents.** Aller chercher des films et séries récents par torrent, c'est télécharger des
  œuvres protégées sans droits. La rubrique Nouveautés indique à la place où chaque titre est
  disponible légalement, y compris gratuitement (Arte, france.tv, chaînes gratuites avec pub…).
- Pas de chaînes payantes ou chiffrées (DRM) : uniquement des flux diffusés publiquement.
- Certains serveurs bloquent la lecture dans un navigateur. Ces chaînes s'ouvrent dans VLC, ou
  deviennent lisibles avec le proxy facultatif (voir plus bas).

## Mettre l'app en ligne (gratuit, une seule fois, depuis un ordinateur)

L'app est un site statique hébergé gratuitement par GitHub Pages ; la vérification des liens tourne
gratuitement sur GitHub Actions.

1. Crée un compte sur [github.com](https://github.com/signup) si tu n'en as pas.
2. Crée un dépôt **public** vide nommé `zapette` (bouton « New repository », sans README).
3. Envoie le code :
   - avec git : dans le dossier du projet,
     `git remote add origin https://github.com/TON-PSEUDO/zapette.git` puis `git push -u origin main` ;
   - sans git : sur la page du dépôt, « uploading an existing file », puis glisse tout le contenu du
     dossier (sauf `node_modules` s'il existe).
4. Dans le dépôt : **Settings → Pages → Source : GitHub Actions**.
5. Onglet **Actions → « Vérifier les chaînes et publier » → Run workflow**. La première vérification
   prend 10 à 20 minutes.

L'app est alors en ligne sur `https://TON-PSEUDO.github.io/zapette/` et se met à jour toute seule
toutes les 6 heures.

> Tu peux aussi connecter GitHub à Claude (Réglages → Connecteurs) et créer le dépôt vide : Claude
> pourra pousser le code et tu n'auras plus que l'étape 4 à faire.

## L'installer sur tes appareils

| Appareil | Comment |
|---|---|
| iPhone, iPad | Ouvre l'adresse dans **Safari**, bouton Partager → « Sur l'écran d'accueil » |
| Android | Ouvre l'adresse dans **Chrome**, menu ⋮ → « Installer l'application » |
| PC (Windows) | **Chrome** ou **Edge** : icône d'installation à droite de la barre d'adresse |
| Mac | **Safari** : Fichier → « Ajouter au Dock » (ou Chrome, comme sur PC) |
| Smart TV | Ouvre l'adresse dans le navigateur de la TV, ou utilise une playlist (ci-dessous) |

## Regarder sur la télé

- **Chromecast / Google TV** : depuis Chrome ou Edge (ordinateur ou Android), bouton Cast du lecteur.
  Quand tu zappes sur le téléphone, la télé suit.
- **AirPlay** : depuis Safari, vers une Apple TV ou une TV compatible AirPlay 2 (Samsung, LG, Sony,
  Philips récentes…).
- **Apps IPTV** (TiviMate, IPTV Smarters, VLC, Kodi…) : charge l'une des playlists vérifiées,
  régénérées toutes les 6 h :
  - `https://TON-PSEUDO.github.io/zapette/playlists/zapette-fr.m3u` (France et francophone)
  - `https://TON-PSEUDO.github.io/zapette/playlists/zapette.m3u` (tout)

## Activer les nouveautés films et séries (2 minutes)

1. Crée un compte gratuit sur [themoviedb.org](https://www.themoviedb.org/signup).
2. Va dans [Paramètres → API](https://www.themoviedb.org/settings/api) et demande une clé (usage
   personnel).
3. Dans Zapette : **Nouveautés** (ou Réglages), colle la clé, « Enregistrer ».

La clé reste sur ton appareil (à saisir une fois par appareil).

## Proxy facultatif (plus de chaînes sur PC et Android)

Les navigateurs ne savent pas tous lire un flux dont le serveur interdit la lecture « depuis un autre
site » ou qui est en http. Safari et les Chrome récents lisent le HLS eux-mêmes et sont peu concernés.
Pour les autres, un petit proxy gratuit sur Cloudflare lève ces blocages : voir
[proxy/README.md](proxy/README.md). Une fois déployé, colle son adresse et son jeton dans
**Réglages → Proxy**.

## Développement

```bash
npm install
bash e2e/make-streams.sh                     # flux HLS de test (ffmpeg)
npm run data                                 # catalogue complet avec vérification (≈ 10-20 min)
npm run data -- --limit 2000                 # ne vérifie que les 2 000 premiers liens (rapide)
npm run data -- --no-check                   # catalogue hors-ligne, non vérifié
npm run dev                                  # http://localhost:5173
npm test                                     # tests unitaires (pipeline, vérificateur, lecteur, proxy)
npm run build && npm run e2e                 # tests dans un vrai Chrome avec de vrais flux HLS
```

Options utiles de `scripts/update-data.mjs` : `--extra-dir <dossier de .m3u>`, `--extra-url <url>`,
`--concurrency`, `--per-host`, `--timeout`, `--origin`.

### Sources

- **iptv-org** (API officielle, mise à jour chaque jour) : source principale.
- **Fork [ITAnt/iptv-org](https://github.com/ITAnt/iptv-org)** : ajouté en source complémentaire.
  C'est une copie d'iptv-org figée au 31 octobre 2024 ; sur ses 13 680 liens, 9 075 ne sont plus dans
  l'original. Il passe donc par le même vérificateur, qui ne garde que ce qui répond encore.

### Organisation

```
scripts/update-data.mjs   récupère, vérifie et compacte le catalogue → public/data, public/playlists
scripts/lib/              lecture M3U, vérificateur HLS, construction du catalogue
src/                      l'app (React + TypeScript + Vite, PWA)
  data/                   catalogue, numérotation, tri, recherche
  player/                 moteur de lecture (hls.js / natif), Chromecast, AirPlay
  lib/                    stockage local, vérification sur l'appareil, partage, TMDB
proxy/                    proxy Cloudflare facultatif
e2e/                      tests de bout en bout (Chrome + flux HLS locaux)
.github/workflows/        vérification toutes les 6 h + publication
.planning/                suivi du projet (Get Shit Done)
```

### Continuer avec Claude Code et Get Shit Done

Le dossier `.planning/` contient le cadrage du projet (exigences, feuille de route, état). Pour
continuer : `npx get-shit-done-cc@latest --claude --local`, puis `/gsd-progress` dans Claude Code.

## Mentions

Chaînes : liste publique [iptv-org](https://github.com/iptv-org/iptv) (Zapette n'héberge aucune vidéo ;
une chaîne peut être signalée à iptv-org qui la retire). Films et séries : [TMDB](https://www.themoviedb.org)
(ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB). Disponibilités : JustWatch.
