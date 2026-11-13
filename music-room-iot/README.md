# Réflexion sur l'IoT (bonus VI.2)

Le sujet propose un mécanisme comme iBeacon : quand quelqu'un s'approche d'un événement
public, il reçoit tout seul des informations sur l'événement (comment y accéder, le style
de musique…).

## Ce que fait Sonora : le lieu d'une salle sert de balise

Les salles « Location & time » ont déjà un lieu (latitude, longitude, rayon) et des
horaires. Le téléphone surveille lui-même ces cercles, comme il détecterait une balise :

```
① « quelles salles publiques près de moi ? »    GET /parties/nearby
   Téléphone  ──────────────────────────────►  Serveur
              ◄──────────────────────────────  nom, lieu, rayon, horaires (10 au plus, 5 km)
② le téléphone surveille ces cercles (géorepérage du système, même app fermée)
③ on entre dans un cercle → « Friday night is near you · Voting until 23:00 · Tap to join »
④ on touche la notification → l'app ouvre la salle
```

- **Choisi par l'utilisateur** : l'interrupteur « Nearby room alerts » sur Discover est éteint
  par défaut. L'allumer demande, dans l'ordre, la position pendant l'utilisation, la
  position « Toujours autoriser », puis les notifications (Android 13 et plus). Un refus
  laisse l'interrupteur éteint, avec une phrase qui dit quoi autoriser.
- **Salles prises en compte** : publiques, avec un lieu, dont les horaires ne sont pas
  finis, à 5 km au plus ; les 10 plus proches.
- **Une notification par salle** : rentrer dans un cercle (le GPS hésite au bord) remplace
  la notification au lieu d'en ajouter une. Aucune notification si les horaires sont finis.
- **La liste est relue** à chaque ouverture de l'app ; une déconnexion arrête la surveillance.

## Pourquoi le GPS plutôt qu'une vraie balise

| | Balise Bluetooth (iBeacon) | Lieu de la salle (notre choix) | QR code ou NFC sur place |
|---|---|---|---|
| Matériel | une balise par lieu | aucun | une affiche ou une puce |
| Automatique | oui | oui | non : il faut scanner |
| En intérieur | précis (quelques mètres) | moins précis (souvent 20 à 100 m) | précis |
| Prouve la présence | oui, avec un code qui change | non : une position peut être falsifiée | oui, avec un code qui change |
| Démo à l'évaluation | il faut la balise sur place | une app de position fictive suffit | il faut l'affiche |

Le GPS donne le comportement demandé (être prévenu tout seul en s'approchant) sans
matériel, pour toutes les salles qui ont déjà un lieu.

## Vie privée

- La surveillance des cercles se fait **dans le téléphone**, par le système, pas sur le
  serveur. Le serveur ne suit personne.
- Le serveur ne reçoit une position que quand le téléphone demande la liste (à
  l'activation et à l'ouverture de l'app). Il ne la stocke pas : le journal d'actions
  n'enregistre que le modèle de la route, jamais la query string.
- Seules les salles **publiques** sont proposées. Une déconnexion arrête tout.

## Batterie, précision et limites

- Le géorepérage du système consomme peu : le téléphone est réveillé quand on change de
  zone, pas en continu. La notification arrive donc avec un peu de retard : d'après la
  documentation Android, souvent moins de 2 minutes, 2 à 3 minutes app en arrière-plan,
  jusqu'à 6 minutes si le téléphone est resté immobile longtemps.
- Cercles de 100 m au minimum : en dessous, les téléphones les surveillent mal.
- 10 salles au plus (iOS limite une app à 20 zones).
- Une salle créée après la dernière ouverture de l'app n'est surveillée qu'à la prochaine.

## Et avec une vraie balise ?

Une balise Bluetooth posée sur le lieu, qui diffuse un code changeant toutes les minutes,
permettrait d'envoyer ce code avec le vote : le serveur aurait alors une **preuve de
présence**. Cela corrigerait la limite décrite dans
[SECURITY-MUSIC.md](../music-room-api/docs/SECURITY-MUSIC.md) (une position GPS peut être
falsifiée), au prix d'un matériel par lieu et d'un module Bluetooth dans l'app.

## Démo sans bouger

1. Avec un compte, créer une salle **publique** « Location & time » dont les horaires ne
   sont pas finis, et noter son lieu.
2. Sur un téléphone Android (avec le build de développement de l'app) : Options pour les
   développeurs → « Sélectionner une application de position fictive » → choisir une app
   gratuite de fausse position (par exemple « Fake GPS Location »).
3. Placer la fausse position **à environ 1 km du lieu** (dans les 5 km, mais hors du
   cercle), ouvrir Sonora, allumer « Nearby room alerts » et tout autoriser.
4. Déplacer la fausse position **dans le cercle** : la notification arrive, même app
   fermée (après quelques minutes au plus).
5. Toucher la notification : la salle s'ouvre.

## Où est le code

- Serveur : `GET /parties/nearby` dans `music-room-api/src/parties/` (`findNearby`,
  `NearbyPartiesDto`), tests e2e « Rooms near a position » dans
  `music-room-api/test/parties-room-data.e2e-spec.ts`.
- App : `music-room-mobile/src/nearby/` (`rules.ts` : les zones et le texte ; `nearby.ts` :
  permissions, surveillance et tâche de fond ; `useNearbyAlerts.ts` : ouvrir la salle,
  relire la liste, arrêter à la déconnexion ; `NearbySwitch.tsx` : l'interrupteur), chargé
  en premier par `index.ts`. Réglages dans `app.json`. Tests : `test/nearby.test.ts`.
