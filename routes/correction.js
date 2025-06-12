const express = require('express');
const router = express.Router();
const ClaudeService = require('../services/claudeService');

const claudeService = new ClaudeService();

// Route pour corriger un article
router.post('/correct', async (req, res) => {
    try {
        const { content, options, customPrompt } = req.body;
        
        // Validation des données d'entrée
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return res.status(400).json({ 
                error: 'Contenu manquant ou invalide',
                details: 'Le contenu à corriger est requis et doit être une chaîne non vide'
            });
        }

        // Vérification de la longueur (approximation 100k tokens = ~400k caractères)
        if (content.length > 400000) {
            return res.status(400).json({ 
                error: 'Contenu trop long',
                details: `Le contenu fait ${content.length} caractères. Maximum autorisé: 400,000 caractères (~100k tokens)`
            });
        }

        // Validation des options
        const validOptions = [
            'orthographe', 'grammaire', 'syntaxe', 'ponctuation',
            'formulation', 'clarte', 'transitions', 'repetitions',
            'sources', 'chiffres', 'dates', 'noms',
            'structure', 'titres', 'conclusion'
        ];

        const selectedOptions = Array.isArray(options) ? options : [];
        const invalidOptions = selectedOptions.filter(opt => !validOptions.includes(opt));
        
        if (invalidOptions.length > 0) {
            return res.status(400).json({
                error: 'Options invalides',
                details: `Options non reconnues: ${invalidOptions.join(', ')}`,
                validOptions: validOptions
            });
        }

        console.log(`🚀 Démarrage correction - Longueur: ${content.length} caractères, Options: ${selectedOptions.join(', ')}`);

        // Appel au service Claude
        const result = await claudeService.correctArticle(content, selectedOptions, customPrompt);
        
        // Ajout d'informations supplémentaires
        const response = {
            ...result,
            processing: {
                optionsUsed: selectedOptions,
                customPromptUsed: !!customPrompt,
                processingTime: new Date().toISOString(),
                contentStats: {
                    originalLength: content.length,
                    originalWords: content.split(/\s+/).length,
                    correctedLength: result.correctedText.length,
                    correctedWords: result.correctedText.split(/\s+/).length
                }
            }
        };

        console.log(`✅ Correction terminée - ${response.processing.contentStats.correctedLength} caractères`);
        
        res.json(response);

    } catch (error) {
        console.error('❌ Erreur lors de la correction:', error);
        
        // Gestion des erreurs spécifiques
        if (error.message.includes('API')) {
            return res.status(502).json({ 
                error: 'Erreur de l\'API Claude',
                details: error.message,
                suggestion: 'Vérifiez votre clé API et votre connexion internet'
            });
        }
        
        if (error.message.includes('timeout')) {
            return res.status(504).json({ 
                error: 'Timeout de l\'API',
                details: 'La correction a pris trop de temps',
                suggestion: 'Essayez avec un texte plus court ou réessayez plus tard'
            });
        }

        res.status(500).json({ 
            error: 'Erreur interne lors de la correction',
            details: error.message
        });
    }
});

// Route pour tester la connexion à Claude
router.get('/test-connection', async (req, res) => {
    try {
        console.log('🔍 Test de connexion à Claude...');
        
        const isConnected = await claudeService.testConnection();
        
        if (isConnected) {
            console.log('✅ Connexion à Claude réussie');
            res.json({ 
                status: 'success',
                message: 'Connexion à Claude opérationnelle',
                timestamp: new Date().toISOString()
            });
        } else {
            console.log('❌ Connexion à Claude échouée');
            res.status(503).json({ 
                status: 'error',
                message: 'Impossible de se connecter à Claude',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('❌ Erreur test connexion:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Erreur lors du test de connexion',
            details: error.message
        });
    }
});

// Route pour obtenir les options disponibles
router.get('/options', (req, res) => {
    const options = {
        linguistiques: [
            { id: 'orthographe', label: 'Orthographe', description: 'Correction des fautes d\'orthographe' },
            { id: 'grammaire', label: 'Grammaire', description: 'Vérification de la grammaire et conjugaison' },
            { id: 'syntaxe', label: 'Syntaxe', description: 'Amélioration de la syntaxe des phrases' },
            { id: 'ponctuation', label: 'Ponctuation', description: 'Correction de la ponctuation' }
        ],
        stylistiques: [
            { id: 'formulation', label: 'Reformulation', description: 'Amélioration de la formulation des phrases' },
            { id: 'clarte', label: 'Clarté', description: 'Amélioration de la clarté et lisibilité' },
            { id: 'transitions', label: 'Transitions', description: 'Amélioration des transitions entre paragraphes' },
            { id: 'repetitions', label: 'Répétitions', description: 'Élimination des répétitions inutiles' }
        ],
        factuelles: [
            { id: 'sources', label: 'Sources', description: 'Identification des sources manquantes' },
            { id: 'chiffres', label: 'Données chiffrées', description: 'Vérification des chiffres et statistiques' },
            { id: 'dates', label: 'Dates', description: 'Vérification de l\'exactitude des dates' },
            { id: 'noms', label: 'Noms propres', description: 'Vérification des noms, lieux, entreprises' }
        ],
        structurelles: [
            { id: 'structure', label: 'Structure', description: 'Amélioration de la structure générale' },
            { id: 'titres', label: 'Titres', description: 'Optimisation des titres et sous-titres' },
            { id: 'conclusion', label: 'Conclusion', description: 'Renforcement de la conclusion' }
        ]
    };

    res.json(options);
});

// Route pour obtenir des statistiques de correction
router.post('/analyze', async (req, res) => {
    try {
        const { content } = req.body;
        
        if (!content || typeof content !== 'string') {
            return res.status(400).json({ error: 'Contenu manquant' });
        }

        const stats = {
            characters: content.length,
            charactersNoSpaces: content.replace(/\s/g, '').length,
            words: content.split(/\s+/).filter(word => word.length > 0).length,
            sentences: content.split(/[.!?]+/).filter(s => s.trim().length > 0).length,
            paragraphs: content.split(/\n\s*\n/).filter(p => p.trim().length > 0).length,
            averageWordsPerSentence: 0,
            readabilityScore: 0,
            estimatedTokens: Math.ceil(content.length / 4), // Approximation
            estimatedCost: 0
        };

        if (stats.sentences > 0) {
            stats.averageWordsPerSentence = Math.round(stats.words / stats.sentences);
        }

        // Calcul approximatif du score de lisibilité (simplifié)
        if (stats.sentences > 0 && stats.words > 0) {
            const avgWordsPerSentence = stats.words / stats.sentences;
            const avgSyllablesPerWord = 1.5; // Approximation pour le français
            stats.readabilityScore = Math.max(0, Math.min(100, 
                206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord)
            ));
        }

        res.json(stats);

    } catch (error) {
        console.error('Erreur analyse:', error);
        res.status(500).json({ error: 'Erreur lors de l\'analyse' });
    }
});

module.exports = router;