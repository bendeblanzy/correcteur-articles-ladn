const axios = require('axios');

class ClaudeService {
    constructor() {
        this.apiKey = process.env.CLAUDE_API_KEY;
        this.baseURL = 'https://api.anthropic.com/v1';
        this.model = 'claude-sonnet-4-20250514';
        
        if (!this.apiKey) {
            throw new Error('CLAUDE_API_KEY non définie dans les variables d\'environnement');
        }
    }

    async correctArticle(content, options = [], customPrompt = null) {
        try {
            // Validation de la longueur
            this.validateContent(content);
            
            console.log('🔄 Démarrage de la correction avec Claude...');
            
            // Construction du prompt optimisé
            const systemPrompt = this.buildSystemPrompt(options, customPrompt);
            
            // Appel unique avec recherche web intégrée
            const response = await this.callClaudeWithWebSearch(systemPrompt, content, options);
            
            const result = {
                originalText: content,
                correctedText: response.correctedText,
                factChecks: response.factChecks,
                changes: this.analyzeChanges(content, response.correctedText),
                searchesPerformed: response.searchesPerformed,
                tokensUsed: response.tokensUsed,
                timestamp: new Date().toISOString()
            };

            console.log('✅ Correction terminée');
            return result;

        } catch (error) {
            console.error('❌ Erreur dans correctArticle:', error);
            throw new Error(`Erreur lors de la correction: ${error.message}`);
        }
    }
async correctArticleWithProgress(content, options = [], customPrompt = '', progressCallback = null) {
        try {
            console.log(`🚀 Démarrage correction SSE - Longueur: ${content.length} caractères`);
            
            // Validation de la longueur
            this.validateContent(content);
            
            if (progressCallback) {
                progressCallback('init', 'Initialisation de la correction...');
            }
            
            // Construction du prompt optimisé
            const systemPrompt = this.buildSystemPrompt(options, customPrompt);
            
            if (progressCallback) {
                progressCallback('prompt_ready', 'Prompt préparé, lancement de Claude...');
            }
            
            // Appel avec callbacks de progression
            const response = await this.callClaudeWithWebSearch(systemPrompt, content, options, progressCallback);
            
            const result = {
                originalText: content,
                correctedText: response.correctedText,
                factChecks: response.factChecks,
                changes: this.analyzeChanges(content, response.correctedText),
                searchesPerformed: response.searchesPerformed,
                tokensUsed: response.tokensUsed,
                timestamp: new Date().toISOString()
            };

            console.log('✅ Correction SSE terminée');
            return result;

        } catch (error) {
            console.error('❌ Erreur dans correctArticleWithProgress:', error);
            if (progressCallback) {
                progressCallback('error', `Erreur: ${error.message}`);
            }
            throw new Error(`Erreur lors de la correction: ${error.message}`);
        }
    }

    validateContent(content) {
        const tokenCount = Math.ceil(content.length / 4); // Approximation pour le français
        if (tokenCount > 95000) {
            throw new Error(`Article trop long: ${tokenCount} tokens (max: 95000)`);
        }
        return true;
    }

    buildSystemPrompt(options, customPrompt) {
        // Si un prompt personnalisé est fourni, l'utiliser directement
        if (customPrompt && customPrompt.trim()) {
            return customPrompt.trim();
        }
        
        // Prompt par défaut avec système de fact-checking intelligent
        return `Tu es un correcteur expert pour un média français. Respecte le style et le ton du journaliste (familier, formel, etc.).

## PROCESSUS DE CORRECTION

### 1. Correction Linguistique
- Correction orthographique et grammaticale
- Amélioration de la clarté et du style uniquement en cas d'incohérences majeures

### 2. Fact-checking Intelligent

#### CRITÈRES DE DÉCLENCHEMENT (recherche web UNIQUEMENT si) :
- Données chiffrées récentes (< 2 ans) ET précises (statistiques, budgets, résultats)
- Événements d'actualité ou développements récents
- Citations directes et déclarations publiques
- Termes techniques spécialisés que tu ne connais pas avec certitude
- Informations qui contredisent tes connaissances établies

#### NE RECHERCHE PAS pour :
- Faits historiques établis (> 5 ans)
- Connaissances générales stables
- Informations que tu connais avec certitude
- Opinions et analyses subjectives

#### HIÉRARCHIE DES SOURCES (par ordre de priorité) :
1. **Sources officielles** : .gouv.fr, institutions publiques, organismes officiels
2. **Médias de référence** : Le Monde, Le Figaro, Libération, AFP, Reuters
3. **Sites spécialisés réputés** : organismes sectoriels reconnus
4. **Éviter** : blogs, forums, réseaux sociaux, sites d'opinion

#### PROTOCOLE DE VÉRIFICATION :
1. Si information stable et connue → NE PAS rechercher
2. Si doute légitime → UNE recherche web ciblée sur sources fiables
3. Si résultats contradictoires → recherche complémentaire avec mots-clés différents
4. Si persistance d'incertitude → signaler l'ambiguïté

#### GESTION DES CONFLITS :
- **Sources contradictoires** → indiquer l'incertitude plutôt que trancher
- **Information non confirmée** → "nécessite vérification" plutôt que "fausse"
- **Contexte manquant** → préciser les limites de la vérification

## FORMAT DE RETOUR HTML

### Système de Couleurs :
- **<span style="color: red;">Rouge</span>** : Fautes d'orthographe/grammaire corrigées
- **<span style="color: orange;">Orange</span>** : Mots remplacés pour améliorer le style
- **<span style="color: green;">Vert</span>** : Informations vérifiées et confirmées exactes
- **<span style="color: blue;">Bleu</span>** : Informations nécessitant correction ou nuance
- **<span style="color: #FFA500;">Jaune</span>** : Informations incertaines ou nécessitant vérification supplémentaire

### Exemples de Formatage :
\`\`\`html
<span style="color: green;">Le PIB français en 2023 était de 2 800 milliards d'euros</span> (source : INSEE, 2024)

<span style="color: blue;">Le taux de chômage était de 7,3% en janvier 2024 et non 8% comme indiqué</span> (source : Pôle Emploi, février 2024)

<span style="color: #FFA500;">Cette donnée nécessite une vérification avec des sources plus récentes</span>

<span style="color: red;">nécessaire</span> [correction : "nécéssaire"]
<span style="color: orange;">optimiser</span> [remplacé : "améliorer"]
\`\`\`

## INSTRUCTIONS FINALES
- Retourne UNIQUEMENT le texte corrigé en HTML
- Privilégie la prudence : en cas de doute persistant, utilise le jaune
- Cite toujours tes sources entre parenthèses pour les vérifications
- Ne fais pas de recherche web pour des évidences ou des faits établis
- Limite-toi aux éléments réellement incertains ou récents

## EXEMPLES DE DÉCLENCHEMENT

✅ **À VÉRIFIER** :
- "Le budget 2024 de la ville s'élève à 180 millions d'euros"
- "Selon Emmanuel Macron hier soir..."
- "L'inflation a atteint 3,2% ce mois-ci"

❌ **NE PAS VÉRIFIER** :
- "Paris est la capitale de la France"
- "La Révolution française a eu lieu en 1789"
- "Cette mesure pourrait avoir des conséquences importantes" (opinion)`;
    }

    async callClaudeWithWebSearch(systemPrompt, content, options, progressCallback = null) {
        try {
            const startTime = Date.now();
            
            // Callback de progression
            if (progressCallback) {
                progressCallback('preparation', 'Préparation de la requête Claude...');
            }
            
            // Configuration simple sans recherche web (non disponible dans l'API standard)
            const requestData = {
                model: this.model,
                max_tokens: 10000,
                temperature: 0.3,
                messages: [{
                    role: 'user',
                    content: `${systemPrompt}\n\nTexte à corriger:\n${content}`
                }]
            };

            const headers = {
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            };

            if (progressCallback) {
                progressCallback('api_call', 'Envoi vers l\'API Claude...');
            }

            const response = await axios.post(`${this.baseURL}/messages`, requestData, {
                headers,
                timeout: 120000 // 2 minutes pour les corrections SSE (pas de limite Heroku)
            });

            const processingTime = Date.now() - startTime;
            console.log(`📊 Correction terminée en ${processingTime}ms`);

            if (progressCallback) {
                progressCallback('processing', 'Traitement de la réponse Claude...');
            }

            return this.processClaudeResponse(response.data, processingTime, content.length);

        } catch (error) {
            console.error('❌ Erreur API Claude:', error.response?.data || error.message);
            
            if (error.response) {
                const status = error.response.status;
                const errorMessages = {
                    400: 'Format de requête invalide ou contenu trop long',
                    401: 'Clé API invalide ou expirée',
                    403: 'Accès refusé - vérifiez vos permissions',
                    429: 'Rate limit atteint - trop de requêtes',
                    500: 'Erreur serveur Anthropic',
                    502: 'Service temporairement indisponible'
                };
                
                throw new Error(errorMessages[status] || `Erreur API: ${error.response.data.error?.message || 'Erreur inconnue'}`);
            } else if (error.request) {
                throw new Error('Pas de réponse de l\'API Claude - vérifiez votre connexion');
            } else {
                throw new Error(`Erreur de configuration: ${error.message}`);
            }
        }
    }

    processClaudeResponse(responseData, processingTime, originalLength = 0) {
        const content = responseData.content[0];
        let correctedText = '';
        let factChecks = null;
        let searchesPerformed = [];

        // Traitement du contenu selon le type de réponse
        if (content.type === 'text') {
            correctedText = content.text;
        } else if (content.type === 'tool_use') {
            // Si Claude utilise des tools, la réponse peut être plus complexe
            // Pour l'instant, on extrait le texte principal
            correctedText = responseData.content.find(c => c.type === 'text')?.text || '';
        }

        // Extraire les informations de recherche web si présentes
        if (responseData.web_searches) {
            searchesPerformed = responseData.web_searches;
            console.log(`🔍 ${searchesPerformed.length} recherches web effectuées`);
        }

        // Extraire les vérifications factuelles du texte si présentes
        const factCheckRegex = /VÉRIFICATIONS FACTUELLES?:\s*(.*?)(?=\n\n|\n---|\n#|\nRETOUR|$)/is;
        const factCheckMatch = correctedText.match(factCheckRegex);
        if (factCheckMatch) {
            factChecks = factCheckMatch[1].trim();
            // Nettoyer le texte corrigé en retirant la section fact-check
            correctedText = correctedText.replace(factCheckRegex, '').trim();
        }

        // Validation de la longueur pour détecter la troncature
        if (originalLength > 0) {
            const correctedLength = correctedText.length;
            const reductionRatio = (originalLength - correctedLength) / originalLength;
            
            // Alerter si le texte a été réduit de plus de 50% (signe de troncature)
            if (reductionRatio > 0.5) {
                console.warn(`⚠️ TRONCATURE DÉTECTÉE: Texte réduit de ${Math.round(reductionRatio * 100)}% (${originalLength} → ${correctedLength} caractères)`);
                // Ajouter un avertissement dans les fact-checks
                const truncationWarning = `⚠️ ATTENTION: Le texte semble avoir été tronqué (réduction de ${Math.round(reductionRatio * 100)}%). Longueur originale: ${originalLength} caractères, corrigé: ${correctedLength} caractères.`;
                factChecks = factChecks ? `${truncationWarning}\n\n${factChecks}` : truncationWarning;
            }
        }

        return {
            correctedText,
            factChecks: factChecks || 'Aucune vérification factuelle effectuée',
            searchesPerformed,
            tokensUsed: responseData.usage || {},
            processingTime
        };
    }

    analyzeChanges(original, corrected) {
        const originalWords = original.split(/\s+/).length;
        const correctedWords = corrected.split(/\s+/).length;
        
        const originalSentences = original.split(/[.!?]+/).length;
        const correctedSentences = corrected.split(/[.!?]+/).length;

        return {
            originalLength: original.length,
            correctedLength: corrected.length,
            originalWords: originalWords,
            correctedWords: correctedWords,
            wordsChanged: Math.abs(correctedWords - originalWords),
            sentencesChanged: Math.abs(correctedSentences - originalSentences),
            percentageChange: Math.round((Math.abs(corrected.length - original.length) / original.length) * 100)
        };
    }

    // Méthode de test de connectivité avec le nouveau modèle
    async testConnection() {
        try {
            const response = await axios.post(`${this.baseURL}/messages`, {
                model: this.model,
                max_tokens: 100,
                temperature: 0,
                messages: [{
                    role: 'user',
                    content: 'Réponds simplement "Connexion réussie" pour tester l\'API.'
                }]
            }, {
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 secondes pour le test
            });

            const responseText = response.data.content[0].text;
            return responseText.includes('Connexion réussie');
        } catch (error) {
            console.error('Test de connexion échoué:', error);
            return false;
        }
    }

    // Utilitaire pour estimer les tokens
    estimateTokens(text) {
        return Math.ceil(text.length / 4); // Approximation pour le français
    }

    // Log des appels API pour monitoring
    logAPICall(content, options, response) {
        console.log({
            timestamp: new Date().toISOString(),
            contentLength: content.length,
            options: options,
            tokensUsed: response.tokensUsed,
            searchesPerformed: response.searchesPerformed?.length || 0,
            processingTime: response.processingTime
        });
    }
}

module.exports = ClaudeService;