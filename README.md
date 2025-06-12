# 🚀 Outil de Correction d'Articles avec IA

Un outil professionnel de correction automatique d'articles de presse utilisant l'API Claude d'Anthropic. Conçu pour les journalistes et les rédacteurs qui souhaitent améliorer la qualité de leurs textes avec l'aide de l'intelligence artificielle.

## ✨ Fonctionnalités

### 🔤 Corrections linguistiques
- **Orthographe** : Détection et correction des fautes d'orthographe
- **Grammaire** : Vérification de la grammaire et conjugaison
- **Syntaxe** : Amélioration de la structure des phrases
- **Ponctuation** : Correction de la ponctuation

### ✍️ Améliorations stylistiques
- **Reformulation** : Amélioration des phrases maladroites
- **Clarté** : Optimisation de la lisibilité
- **Transitions** : Amélioration des liaisons entre paragraphes
- **Répétitions** : Élimination des redondances

### 🔍 Vérifications factuelles
- **Sources** : Identification des affirmations nécessitant des sources
- **Données chiffrées** : Vérification de la cohérence des chiffres
- **Dates** : Contrôle de l'exactitude des dates
- **Noms propres** : Vérification des noms, lieux, entreprises

### 📝 Structure et organisation
- **Structure** : Amélioration de l'organisation générale
- **Titres** : Optimisation des titres et sous-titres
- **Conclusion** : Renforcement de la conclusion

## 🛠️ Technologies utilisées

### Backend
- **Node.js** avec Express.js
- **Claude API** (Anthropic) pour l'IA
- **Multer** pour l'upload de fichiers
- **Mammoth** pour les documents Word
- **pdf-parse** pour les fichiers PDF
- **docx** pour l'export Word

### Frontend
- **HTML5** sémantique
- **CSS3** moderne avec variables et grid
- **JavaScript ES6+** vanilla
- **Interface responsive** mobile-first

## 📋 Prérequis

- **Node.js** 18.x ou supérieur
- **npm** ou **yarn**
- **Clé API Claude** d'Anthropic

## 🚀 Installation

### 1. Cloner le projet
```bash
git clone <repository-url>
cd article-corrector
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Configuration
Créer un fichier `.env` à la racine :
```env
CLAUDE_API_KEY=votre_cle_api_claude
PORT=3000
NODE_ENV=development
```

### 4. Lancer l'application
```bash
# Mode développement
npm run dev

# Mode production
npm start
```

L'application sera accessible sur `http://localhost:3000`

## 🌐 Déploiement sur Heroku

### 1. Préparer Heroku
```bash
# Installer Heroku CLI si nécessaire
# Créer une nouvelle app
heroku create article-corrector-[nom-unique]
```

### 2. Configurer les variables d'environnement
```bash
heroku config:set CLAUDE_API_KEY=votre_cle_api_claude
heroku config:set NODE_ENV=production
```

### 3. Déployer
```bash
git add .
git commit -m "Initial deployment"
git push heroku main
```

### 4. Ouvrir l'application
```bash
heroku open
```

## 📖 Guide d'utilisation

### 1. Configuration des options
- Sélectionnez les types de corrections désirées
- Utilisez les préréglages rapides (Basique, Complet, Fact-checking)
- Personnalisez le prompt pour des instructions spécifiques

### 2. Import du contenu
- **Glisser-déposer** : Faites glisser votre fichier dans la zone prévue
- **Sélection manuelle** : Cliquez pour parcourir vos fichiers
- **Copier-coller** : Collez directement le texte dans la zone de texte

Formats supportés : PDF, Word (.doc, .docx), Texte (.txt)

### 3. Lancement de la correction
- Cliquez sur "🚀 Corriger l'article"
- Attendez le traitement (quelques secondes à quelques minutes)
- Consultez les résultats dans la comparaison côte à côte

### 4. Analyse des résultats
- **Texte original** : À gauche, votre version initiale
- **Texte corrigé** : À droite, la version améliorée
- **Statistiques** : Nombre de modifications, pourcentage de changement
- **Vérifications factuelles** : Recommandations de vérification

### 5. Actions disponibles
- **✅ Accepter** : Remplace le texte original par la version corrigée
- **❌ Rejeter** : Annule la correction
- **📄 Télécharger Word** : Export au format .docx
- **📝 Télécharger Texte** : Export au format .txt
- **📊 Générer rapport** : Rapport détaillé de la correction

## 🎯 Fonctionnalités avancées

### Prompts personnalisés
- Sauvegardez vos instructions favorites
- Adaptez le style de correction à votre publication
- Créez des prompts spécialisés par type d'article

### Historique des corrections
- Consultez vos 10 dernières corrections
- Restaurez une version précédente
- Suivez vos statistiques d'utilisation

### Raccourcis clavier
- **Ctrl + Enter** : Lancer une correction
- **Ctrl + S** : Télécharger en Word
- **Escape** : Fermer les modales

## 🔧 API Endpoints

### Correction
- `POST /api/correction/correct` - Corriger un article
- `GET /api/correction/test-connection` - Tester la connexion Claude
- `GET /api/correction/options` - Obtenir les options disponibles
- `POST /api/correction/analyze` - Analyser un texte

### Fichiers
- `POST /api/files/parse` - Parser un fichier uploadé
- `POST /api/files/export-word` - Exporter en Word
- `GET /api/files/supported-formats` - Formats supportés

## ⚙️ Configuration avancée

### Variables d'environnement
```env
# API Claude (requis)
CLAUDE_API_KEY=sk-ant-api03-...

# Serveur
PORT=3000
NODE_ENV=production

# Limites
MAX_FILE_SIZE=50MB
SUPPORTED_FORMATS=pdf,doc,docx,txt
```

### Personnalisation CSS
Le fichier `public/style.css` utilise des variables CSS modifiables :
```css
:root {
    --primary-color: #667eea;
    --success-color: #28a745;
    --border-radius: 8px;
    /* ... autres variables */
}
```

## 🔒 Sécurité

- **Clé API** : Stockée uniquement côté serveur
- **Fichiers temporaires** : Supprimés automatiquement après traitement
- **Validation** : Vérification des types de fichiers et tailles
- **Sanitization** : Nettoyage du contenu uploadé

## 📊 Limitations

- **Taille maximum** : 400,000 caractères (~100k tokens Claude)
- **Formats supportés** : PDF, Word, Texte uniquement
- **Fichiers simultanés** : Un seul fichier à la fois
- **Historique** : 10 corrections maximum en local

## 🐛 Dépannage

### Problèmes courants

**Erreur "Connexion à Claude échouée"**
- Vérifiez votre clé API dans `.env`
- Testez la connexion internet
- Vérifiez les crédits de votre compte Anthropic

**Fichier non reconnu**
- Vérifiez le format (PDF, DOC, DOCX, TXT)
- Testez avec un fichier plus petit
- Assurez-vous que le fichier n'est pas corrompu

**Correction trop lente**
- Réduisez la taille du texte
- Désélectionnez les vérifications factuelles
- Vérifiez votre connexion internet

### Logs de débogage
```bash
# Voir les logs en temps réel
heroku logs --tail

# Logs locaux
npm run dev
```

## 🤝 Contribution

1. Fork le projet
2. Créez une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit vos changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 👥 Auteurs

- **LADN** - Développement initial

## 🙏 Remerciements

- **Anthropic** pour l'API Claude
- **Express.js** et l'écosystème Node.js
- La communauté open source

## 📞 Support

- **Documentation** : Ce README
- **Issues** : Utilisez l'onglet Issues de GitHub
- **Email** : contact@ladn.eu

---

**Version** : 1.0.0  
**Dernière mise à jour** : Décembre 2024  
**Statut** : Production ready ✅