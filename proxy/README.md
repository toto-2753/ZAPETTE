# Proxy Zapette (facultatif)

Un mini-serveur gratuit sur Cloudflare qui rend lisibles, dans n'importe quel navigateur, les
chaînes dont le serveur bloque la lecture « depuis un autre site » (CORS) ou qui sont en http.
L'offre gratuite de Cloudflare Workers (100 000 requêtes par jour) suffit pour plusieurs heures de
télé par jour.

## Installation sans ligne de commande (5 minutes)

1. Crée un compte gratuit sur [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. **Workers & Pages → Create → Create Worker**, nomme-le `zapette-proxy`, puis **Deploy**.
3. **Edit code** : efface tout, colle le contenu de [`worker.js`](worker.js), puis **Deploy**.
4. **Settings → Variables and Secrets → Add** : type *Secret*, nom `TOKEN`, valeur : un mot de passe
   long de ton choix. Enregistre.
5. Dans Zapette, **Réglages → Proxy** : colle l'adresse du worker
   (`https://zapette-proxy.TON-COMPTE.workers.dev`) et le jeton, puis « Tester et activer ».

## Avec la ligne de commande

```bash
cd proxy
npx wrangler login
npx wrangler deploy
npx wrangler secret put TOKEN
```

## Ce que fait le proxy

- ajoute les en-têtes CORS aux réponses ;
- réécrit les playlists HLS pour que variantes, segments, clés de chiffrement AES-128 et fichiers
  d'initialisation passent aussi par lui ;
- transmet l'en-tête `Range` ;
- refuse toute requête sans le bon jeton, pour ne pas devenir un proxy ouvert.

Il ne contourne aucune protection DRM et ne change pas le pays d'où la chaîne est vue (le serveur
Cloudflare utilisé est proche de toi).
