# Claude Local Files — Extension Chrome

Extension Chrome qui s'intègre directement dans **claude.ai** et donne accès à ton système de fichiers local — sans clé API, avec ton abonnement existant.

---

## Architecture

```
claude.ai (ta session abonnement)
┌─────────────────────────────────────┐
│  content.js injecté dans la page   │
│  ┌─────────────────────────────┐   │
│  │  Toolbar : Fichiers / Ouvrir │   │
│  │           / Sauver code      │   │
│  └─────────────────────────────┘   │
│  Panel arborescence (sidebar)      │
└──────────────┬──────────────────────┘
               │ fetch localhost:3747
    ┌──────────▼──────────────┐
    │   server.js (Node.js)    │
    │   Accès filesystem local │
    │   list / read / write    │
    │   delete / search        │
    └──────────────────────────┘
```

## Fonctionnalités

- **Toolbar** intégrée sous la zone de saisie de claude.ai
- **Arborescence** de fichiers en sidebar glissante
- **Injecter un fichier** directement dans le chat (le contenu devient le message)
- **Ouvrir un fichier** depuis ton PC via le dialog natif
- **Sauvegarder** le dernier bloc de code généré par Claude
- **Indicateur** de statut serveur en temps réel
- **Popup** de configuration du répertoire racine

## Installation

### 1. Serveur local

```bash
cd server
node server.js "C:\Dev\MonProjet"
```

Ou sans argument (configure depuis le popup) :
```bash
node server.js
```

Le serveur écoute sur `localhost:3747` uniquement.

### 2. Extension Chrome

1. Ouvre Chrome → `chrome://extensions`
2. Active le **Mode développeur** (en haut à droite)
3. Clique **Charger l'extension non empaquetée**
4. Sélectionne le dossier `extension/`
5. L'icône Claude apparaît dans la barre Chrome

### 3. Utilisation

1. Lance `node server.js` dans ton terminal
2. Va sur [claude.ai](https://claude.ai)
3. La toolbar apparaît automatiquement sous la zone de saisie
4. Clique **Fichiers** pour parcourir, **Ouvrir** pour dialog natif, **Sauver code** pour sauvegarder

## Sécurité

- Le serveur écoute uniquement sur `127.0.0.1` (jamais accessible de l'extérieur)
- Protection path traversal : Claude ne peut pas accéder hors du répertoire racine
- Aucune clé API : utilise ta session claude.ai existante
- Fichiers cachés (`.`) et `node_modules` ignorés automatiquement

## Note pour Anthropic

> Cette extension démontre qu'une intégration filesystem native dans claude.ai est faisable et utile. L'architecture serveur local + content script évite tout problème de sécurité (pas d'accès réseau externe, confiné à localhost).
>
> Une version officielle pourrait remplacer le serveur Node.js par une **Native Messaging Host** installée avec Claude Desktop, offrant une expérience encore plus fluide sans terminal visible.

---
*Proposition pour Anthropic — Arnaud, 2026*
