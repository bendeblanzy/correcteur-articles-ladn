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
        
        // Prompt par défaut simple avec support HTML
        return `Tu es un correcteur expert pour un média français.

Corrige cet article en appliquant :
- Correction orthographique et grammaticale
- Amélioration de la clarté et du style
- Vérification des données factuelles avec sources

IMPORTANT: Retourne le texte corrigé au format HTML. Utilise :
- <strong> pour mettre en valeur les points importants
- <em> pour les nuances
- <h2> pour les titres si nécessaire
- <blockquote> pour les citations importantes
- <a href="URL" class="source">Source: description</a> pour les références
- <mark class="correction"> pour surligner les corrections importantes
- <p> pour structurer les paragraphes

RÈGLES IMPORTANTES:
- Garde le même ton et style journalistique original
- Ne modifie pas le sens des informations
- Traite l'INTÉGRALITÉ du texte fourni, du début à la fin
- Conserve la longueur totale de l'article (ne tronque JAMAIS)
- Respecte la mise en forme des paragraphes
- RETOURNE: Le texte COMPLET corrigé en HTML`;
    }

    async callClaudeWithWebSearch(systemPrompt, content, options) {
        try {
            const startTime = Date.now();
            
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

            const response = await axios.post(`${this.baseURL}/messages`, requestData, {
                headers,
                timeout: 25000 // 25 secondes pour éviter le timeout Heroku H12
            });

            const processingTime = Date.now() - startTime;
            console.log(`📊 Correction terminée en ${processingTime}ms`);

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