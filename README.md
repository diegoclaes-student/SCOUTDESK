# Outil de Gestion Scout – Authentification & Rôles

Cette version ajoute:
- Comptes utilisateurs sécurisés (bcrypt + JWT)
- Super admin (créé via script de seed)
- Rôles: SUPERADMIN, CHEF_UNITE, CHEF_SECTION
- Accès par section: trésorerie, inventaire et planning
- Workflow d’approbation des comptes:
  - Approbateurs: Super Admin, Chef d’unité, Chef de section (pour sa section)
- Fiche d’inscription: Nom, Prénom, Totem, Date de naissance, Téléphone, Email, Mot de passe, Section

## Installation backend

1. Prérequis: Node 18+
2. Installer:
   ```bash
   cd backend
   npm i
   cp .env.example .env
   # Modifiez .env: PORT, JWT_SECRET, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD
   npm run seed
   npm start
   ```
   L’API tourne sur http://localhost:3000

3. Ouvrir le frontend
   - Ouvrez `index.html` dans votre navigateur
   - CORS est activé côté API

## Sécurité
- Les mots de passe sont hachés (bcrypt).
- Ne commitez pas votre `.env`.
- Changez le mot de passe du superadmin après première connexion.

## Notes
- Les modules Chefs et Enfants restent locaux dans cette itération. Je peux les migrer côté API avec permissions par section si souhaité.
- Les événements communs sont visibles par tous; les événements de section sont filtrés côté client ET protégés côté serveur.

## Flux d’inscription
1. Un chef crée un compte (status = PENDING).
2. Un approbateur (SUPERADMIN, CHEF_UNITE, CHEF_SECTION de la même section) approuve.
3. Après approbation, l’utilisateur peut gérer la trésorerie, l’inventaire et les événements de sa section.
# Scout_gestion
# SCOUTDESK
