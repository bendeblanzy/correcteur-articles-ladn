const express = require('express');
const ClaudeService = require('../services/claudeService');

const router = express.Router();
const claudeService = new ClaudeService();

// Store pour les corrections en cours
const activeCorrections = new Map();

/**
 * Route SSE pour correction asynchrone
 * Permet les corrections longues sans timeout
 */
router.get('/correct-async/:correctionId', async (req, res) => {
    const { correctionId } = req.params;
    
    // Configuration SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Fonction pour envoyer des messages SSE
    const sendSSE = (eventType, data) => {
        res.write(`event: ${eventType}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        // Récupérer les données de correction du store
        const correctionData = activeCorrections.get(correctionId);
        
        if (!correctionData) {
            sendSSE('error', { 
                error: 'Correction non trouvée',
                correctionId 
            });
            res.end();
            return;
        }

        const { content, customPrompt } = correctionData;
        
        // Confirmer le démarrage
        sendSSE('start', { 
            message: 'Correction démarrée en arrière-plan',
            length: content.length,
            timestamp: new Date().toISOString()
        });

        // Callbacks de progression
        const progressCallback = (stage, details) => {
            sendSSE('progress', {
                stage,
                details,
                timestamp: new Date().toISOString()
            });
        };

        // Démarrer la correction avec callbacks
        const startTime = Date.now();
        
        progressCallback('analysis', 'Analyse du contenu en cours...');
        
        const result = await claudeService.correctArticleWithProgress(
            content, 
            [], 
            customPrompt,
            progressCallback
        );

        const processingTime = Date.now() - startTime;

        // Envoyer le résultat final
        sendSSE('complete', {
            ...result,
            processingTime,
            timestamp: new Date().toISOString()
        });

        // Nettoyage
        activeCorrections.delete(correctionId);
        
    } catch (error) {
        console.error(`❌ Erreur correction SSE ${correctionId}:`, error);
        
        sendSSE('error', {
            error: error.message,
            correctionId,
            timestamp: new Date().toISOString()
        });
        
        activeCorrections.delete(correctionId);
    }

    res.end();
});

/**
 * Route pour démarrer une correction asynchrone
 */
router.post('/start-async', async (req, res) => {
    try {
        const { content, customPrompt } = req.body;
        
        // Validation
        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                status: 'error',
                error: 'Contenu requis'
            });
        }

        // Génération ID unique pour cette correction
        const correctionId = `correction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Stockage des données
        activeCorrections.set(correctionId, {
            content: content.trim(),
            customPrompt: customPrompt || '',
            startTime: Date.now()
        });

        // Retour immédiat avec l'ID
        res.json({
            status: 'started',
            correctionId,
            message: 'Correction démarrée en arrière-plan',
            sseUrl: `/api/correction-sse/correct-async/${correctionId}`
        });

        console.log(`🚀 Correction SSE démarrée: ${correctionId} (${content.length} caractères)`);

    } catch (error) {
        console.error('❌ Erreur démarrage correction SSE:', error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

/**
 * Route pour vérifier le statut des corrections actives
 */
router.get('/status', (req, res) => {
    const activeCount = activeCorrections.size;
    const activeIds = Array.from(activeCorrections.keys());
    
    res.json({
        status: 'ok',
        activeCorrections: activeCount,
        activeIds: activeIds.length > 10 ? activeIds.slice(0, 10) : activeIds
    });
});

// Nettoyage périodique des corrections anciennes (> 10 minutes)
setInterval(() => {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    
    for (const [id, data] of activeCorrections.entries()) {
        if (now - data.startTime > maxAge) {
            activeCorrections.delete(id);
            console.log(`🧹 Nettoyage correction expirée: ${id}`);
        }
    }
}, 5 * 60 * 1000); // Vérification toutes les 5 minutes

module.exports = router;