// Variables globales
let currentArticle = null;
let correctionHistory = JSON.parse(localStorage.getItem('correctionHistory')) || [];
let savedPrompts = JSON.parse(localStorage.getItem('savedPrompts')) || {};
let isConnected = false;

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    console.log('🚀 Initialisation de l\'application...');
    
    // Vérification de la connexion à Claude
    await testConnection();
    
    // Configuration des événements
    setupFileUpload();
    setupEventListeners();
    
    // Chargement des données sauvegardées
    loadSavedPrompts();
    updateHistoryDisplay();
    
    // Mise à jour des statistiques de contenu
    updateContentStats();
    
    console.log('✅ Application initialisée');
}

// ================================
// GESTION DE LA CONNEXION
// ================================

async function testConnection() {
    try {
        updateConnectionStatus('🔄 Test de connexion...', 'testing');
        
        const response = await fetch('/api/correction/test-connection');
        const data = await response.json();
        
        if (response.ok && data.status === 'success') {
            isConnected = true;
            updateConnectionStatus('🟢 Connecté à Claude', 'connected');
            console.log('✅ Connexion à Claude opérationnelle');
        } else {
            isConnected = false;
            updateConnectionStatus('🔴 Connexion échouée', 'disconnected');
            console.warn('⚠️ Impossible de se connecter à Claude');
        }
    } catch (error) {
        isConnected = false;
        updateConnectionStatus('🔴 Erreur de connexion', 'disconnected');
        console.error('❌ Erreur test connexion:', error);
    }
}

function updateConnectionStatus(text, status) {
    const statusEl = document.getElementById('connection-status');
    statusEl.textContent = text;
    statusEl.className = `status-indicator ${status}`;
}

// ================================
// GESTION DES FICHIERS
// ================================

function setupFileUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');

    // Click pour sélectionner fichier
    uploadArea.addEventListener('click', () => fileInput.click());

    // Gestion drag & drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults);
        document.body.addEventListener(eventName, preventDefaults);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => {
            uploadArea.classList.remove('dragover');
        });
    });

    uploadArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDrop(e) {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

async function processFile(file) {
    showStatus('📁 Lecture du fichier en cours...', 'info');
    
    // Vérification de la taille
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
        showStatus(`❌ Fichier trop volumineux: ${Math.round(file.size / (1024 * 1024))}MB. Maximum: 50MB`, 'error');
        return;
    }

    // Vérification du format
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
        showStatus(`❌ Format non supporté: ${fileExtension}. Formats autorisés: ${allowedExtensions.join(', ')}`, 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        console.log(`📄 Processing file: ${file.name} (${file.size} bytes)`);
        
        const response = await fetch('/api/files/parse', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.details || data.error || 'Erreur lors de la lecture du fichier');
        }

        // Mise à jour du contenu
        document.getElementById('text-input').value = data.content;
        updateContentStats();
        
        // Affichage des informations du fichier
        const fileInfo = data.fileInfo;
        showStatus(
            `✅ Fichier "${fileInfo.name}" chargé avec succès (${fileInfo.sizeFormatted}, ${data.metadata.wordCount} mots)`,
            'success'
        );
        
        console.log('✅ File processed successfully:', data.metadata);

    } catch (error) {
        console.error('❌ Erreur processing file:', error);
        showStatus(`❌ Erreur: ${error.message}`, 'error');
    }
}

// ================================
// GESTION DES PROMPTS
// ================================

function loadSavedPrompts() {
    const select = document.getElementById('saved-prompts');
    select.innerHTML = '<option value="">Sélectionner un prompt sauvegardé</option>';
    
    Object.keys(savedPrompts).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
    
    console.log(`📋 ${Object.keys(savedPrompts).length} prompts sauvegardés chargés`);
}

function savePrompt() {
    const name = document.getElementById('prompt-name').value.trim();
    const content = document.getElementById('custom-prompt').value.trim();
    
    if (!name || !content) {
        showStatus('⚠️ Veuillez saisir un nom et un contenu pour le prompt', 'warning');
        return;
    }

    if (savedPrompts[name]) {
        if (!confirm(`Un prompt avec le nom "${name}" existe déjà. Le remplacer ?`)) {
            return;
        }
    }

    savedPrompts[name] = content;
    localStorage.setItem('savedPrompts', JSON.stringify(savedPrompts));
    loadSavedPrompts();
    document.getElementById('prompt-name').value = '';
    showStatus(`💾 Prompt "${name}" sauvegardé avec succès`, 'success');
    
    console.log(`💾 Prompt saved: ${name}`);
}

function loadPrompt() {
    const selectedName = document.getElementById('saved-prompts').value;
    if (!selectedName) {
        showStatus('⚠️ Veuillez sélectionner un prompt', 'warning');
        return;
    }

    document.getElementById('custom-prompt').value = savedPrompts[selectedName];
    showStatus(`📁 Prompt "${selectedName}" chargé`, 'success');
    
    console.log(`📁 Prompt loaded: ${selectedName}`);
}

function deletePrompt() {
    const selectedName = document.getElementById('saved-prompts').value;
    if (!selectedName) {
        showStatus('⚠️ Veuillez sélectionner un prompt à supprimer', 'warning');
        return;
    }

    if (confirm(`Êtes-vous sûr de vouloir supprimer le prompt "${selectedName}" ?`)) {
        delete savedPrompts[selectedName];
        localStorage.setItem('savedPrompts', JSON.stringify(savedPrompts));
        loadSavedPrompts();
        document.getElementById('custom-prompt').value = '';
        showStatus(`🗑️ Prompt "${selectedName}" supprimé`, 'success');
        
        console.log(`🗑️ Prompt deleted: ${selectedName}`);
    }
}

// ================================
// PRÉRÉGLAGES DE PROMPTS
// ================================

function applyPromptPreset(presetType) {
    const prompts = {
        'correction-simple': `Tu es un correcteur expert pour un média français.

Corrige cet article en appliquant uniquement :
- Correction orthographique et grammaticale
- Amélioration de la ponctuation

IMPORTANT: Retourne le texte corrigé au format HTML. Utilise :
- <strong> pour mettre en valeur les éléments importants
- <em> pour les nuances ou précisions
- <mark class="correction"> pour surligner les corrections apportées
- <del> et <ins> pour montrer les modifications importantes
- Structure avec des <h2> si nécessaire

Retourne uniquement le texte corrigé en HTML, sans commentaires.`,

        'correction-complete': `Tu es un correcteur expert pour un média français.

Corrige cet article en appliquant :
- Correction orthographique et grammaticale complète
- Amélioration de la clarté et du style journalistique
- Optimisation des transitions entre paragraphes
- Renforcement de la structure générale
- Élimination des répétitions

IMPORTANT: Retourne le texte corrigé au format HTML. Utilise :
- <strong> pour mettre en valeur les points clés
- <em> pour les nuances
- <h2> pour structurer l'article
- <blockquote> pour les citations ou points importants
- <ul><li> pour les listes à puces si approprié
- <mark class="improvement"> pour surligner les améliorations de style
- <span class="enhanced"> pour les transitions optimisées

Retourne uniquement le texte corrigé en HTML, sans commentaires.`,

        'fact-checking': `Tu es un correcteur expert pour un média français avec vérification factuelle.

Corrige cet article en appliquant :
- Correction orthographique et grammaticale
- Vérification des données factuelles avec recherche web automatique
- Vérification des dates, chiffres, noms propres
- Ajout de sources fiables
- Signalement des informations douteuses

IMPORTANT: Retourne le texte corrigé au format HTML. Utilise :
- <strong class="verified"> pour les faits vérifiés
- <em> pour les nuances
- <a href="URL" class="source">Source: description</a> pour les références
- <blockquote class="verified"> pour les citations vérifiées
- <div class="warning">⚠️ <strong>À vérifier</strong>: information</div> pour les informations douteuses
- <mark class="fact-check"> pour surligner les vérifications factuelles

Retourne uniquement le texte corrigé en HTML avec sources.`,

        'style-journalistique': `Tu es un correcteur expert pour un média français spécialisé en style.

Corrige cet article en appliquant :
- Correction linguistique complète
- Amélioration du style journalistique français
- Optimisation des titres et accroches
- Renforcement de la conclusion
- Adaptation du ton professionnel

IMPORTANT: Retourne le texte corrigé au format HTML. Utilise :
- <h1 class="optimized"> pour le titre principal optimisé
- <h2 class="enhanced"> pour les sous-titres améliorés
- <strong> pour les points clés
- <em class="style"> pour le style
- <blockquote class="highlight"> pour les citations marquantes
- <mark class="style-improvement"> pour surligner les améliorations de style
- Structure professionnelle avec des <p> clairs

Retourne uniquement le texte corrigé en HTML professionnel.`
    };
    
    const prompt = prompts[presetType];
    if (prompt) {
        document.getElementById('custom-prompt').value = prompt;
        
        const presetNames = {
            'correction-simple': 'Correction simple',
            'correction-complete': 'Correction complète',
            'fact-checking': 'Fact-checking',
            'style-journalistique': 'Style journalistique'
        };
        
        showStatus(`⚡ Prompt "${presetNames[presetType]}" appliqué`, 'info');
        console.log(`⚡ Prompt preset applied: ${presetType}`);
    }
}

// Fonctions legacy pour compatibilité
function applyPreset(presetType) {
    applyPromptPreset(presetType);
}

function clearOptions() {
    // Plus nécessaire avec les prompts, mais on garde pour compatibilité
    document.getElementById('custom-prompt').value = '';
}

// ================================
// STATISTIQUES DE CONTENU
// ================================

function updateContentStats() {
    const content = document.getElementById('text-input').value;
    const statsSection = document.getElementById('content-stats');
    
    if (!content || content.trim().length === 0) {
        statsSection.style.display = 'none';
        return;
    }

    const stats = analyzeContent(content);
    
    document.getElementById('char-count').textContent = stats.characters.toLocaleString();
    document.getElementById('word-count').textContent = stats.words.toLocaleString();
    document.getElementById('token-count').textContent = stats.tokens.toLocaleString();
    
    // Alerte si le contenu est trop long
    if (stats.characters > 400000) {
        document.getElementById('char-count').style.color = 'var(--danger-color)';
        showStatus('⚠️ Contenu trop long pour Claude (max 400k caractères)', 'warning');
    } else {
        document.getElementById('char-count').style.color = 'var(--primary-color)';
    }
    
    statsSection.style.display = 'flex';
}

function analyzeContent(content) {
    return {
        characters: content.length,
        charactersNoSpaces: content.replace(/\s/g, '').length,
        words: content.split(/\s+/).filter(word => word.length > 0).length,
        sentences: content.split(/[.!?]+/).filter(s => s.trim().length > 0).length,
        paragraphs: content.split(/\n\s*\n/).filter(p => p.trim().length > 0).length,
        tokens: Math.ceil(content.length / 4) // Approximation
    };
}

// ================================
// CORRECTION PRINCIPALE
// ================================

async function correctArticle() {
    if (!isConnected) {
        showStatus('❌ Pas de connexion à Claude. Vérifiez votre configuration.', 'error');
        return;
    }

    const content = document.getElementById('text-input').value.trim();
    if (!content) {
        showStatus('⚠️ Veuillez saisir ou importer du contenu à corriger', 'warning');
        return;
    }

    // Vérification de la longueur
    if (content.length > 400000) {
        showStatus('❌ Le contenu est trop long (maximum 400,000 caractères)', 'error');
        return;
    }

    const customPrompt = document.getElementById('custom-prompt').value.trim();
    
    if (!customPrompt) {
        showStatus('⚠️ Veuillez sélectionner un prompt ou saisir des instructions personnalisées', 'warning');
        return;
    }

    console.log(`🚀 Starting correction - Length: ${content.length} chars, Prompt: ${customPrompt.substring(0, 100)}...`);

    // Utiliser SSE pour les textes longs (>5000 caractères) pour éviter le timeout Heroku
    if (content.length > 5000) {
        console.log('📡 Utilisation SSE pour texte long');
        await correctArticleSSE(content, customPrompt);
    } else {
        console.log('🔄 Utilisation méthode synchrone pour texte court');
        await correctArticleSync(content, customPrompt);
    }
}

// ================================
// CORRECTION SYNCHRONE (TEXTES COURTS)
// ================================

async function correctArticleSync(content, customPrompt) {
    showProcessing(true);
    updateProcessingDetails('Envoi de la demande à Claude...');

    try {
        const startTime = Date.now();
        
        const response = await fetch('/api/correction/correct', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: content,
                options: [], // Plus utilisé, mais gardé pour compatibilité API
                customPrompt: customPrompt
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || errorData.error || `Erreur HTTP ${response.status}`);
        }

        updateProcessingDetails('Traitement de la réponse...');
        const result = await response.json();
        
        const processingTime = Date.now() - startTime;
        console.log(`✅ Correction completed in ${processingTime}ms`);

        currentArticle = {
            original: content,
            corrected: result.correctedText,
            changes: result.changes,
            factChecks: result.factChecks,
            processing: result.processing,
            timestamp: new Date(),
            processingTime: processingTime,
            promptUsed: customPrompt.substring(0, 200),
            customPromptUsed: true
        };

        displayResults(currentArticle);
        addToHistory(currentArticle);
        showProcessing(false);
        showStatus(`✅ Correction terminée en ${Math.round(processingTime / 1000)}s`, 'success');

    } catch (error) {
        console.error('❌ Correction error:', error);
        showProcessing(false);
        
        let errorMessage = 'Erreur lors de la correction';
        if (error.message.includes('timeout')) {
            errorMessage = 'Délai d\'attente dépassé. Essayez avec un texte plus court.';
        } else if (error.message.includes('API')) {
            errorMessage = 'Problème avec l\'API Claude. Vérifiez votre connexion.';
        }
        
        showStatus(`❌ ${errorMessage}: ${error.message}`, 'error');
    }
}

// ================================
// CORRECTION ASYNCHRONE SSE (TEXTES LONGS)
// ================================

async function correctArticleSSE(content, customPrompt) {
    showProcessing(true);
    updateProcessingDetails('🚀 Démarrage correction asynchrone...');

    try {
        // 1. Démarrer la correction asynchrone
        const startResponse = await fetch('/api/correction-sse/start-async', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: content,
                customPrompt: customPrompt
            })
        });

        if (!startResponse.ok) {
            const errorData = await startResponse.json();
            throw new Error(errorData.error || `Erreur HTTP ${startResponse.status}`);
        }

        const startData = await startResponse.json();
        const { correctionId, sseUrl } = startData;

        console.log(`📡 SSE démarré: ${correctionId}`);
        updateProcessingDetails('📡 Connexion en temps réel établie...');

        // 2. Se connecter au flux SSE
        const eventSource = new EventSource(sseUrl);
        const startTime = Date.now();
        let isComplete = false;

        eventSource.addEventListener('start', (event) => {
            const data = JSON.parse(event.data);
            console.log('📡 SSE Start:', data);
            updateProcessingDetails('⚡ Correction démarrée en arrière-plan...');
        });

        eventSource.addEventListener('progress', (event) => {
            const data = JSON.parse(event.data);
            console.log('📡 SSE Progress:', data);
            updateProcessingDetails(`📊 ${data.stage}: ${data.details}`);
        });

        eventSource.addEventListener('complete', (event) => {
            const data = JSON.parse(event.data);
            console.log('📡 SSE Complete:', data);
            
            const processingTime = Date.now() - startTime;

            currentArticle = {
                original: content,
                corrected: data.correctedText,
                changes: data.changes,
                factChecks: data.factChecks,
                processing: data.processing,
                timestamp: new Date(),
                processingTime: processingTime,
                promptUsed: customPrompt.substring(0, 200),
                customPromptUsed: true
            };

            displayResults(currentArticle);
            addToHistory(currentArticle);
            showProcessing(false);
            showStatus(`✅ Correction SSE terminée en ${Math.round(processingTime / 1000)}s`, 'success');
            
            isComplete = true;
            eventSource.close();
        });

        eventSource.addEventListener('error', (event) => {
            const data = JSON.parse(event.data);
            console.error('📡 SSE Error:', data);
            
            showProcessing(false);
            showStatus(`❌ Erreur SSE: ${data.error}`, 'error');
            
            isComplete = true;
            eventSource.close();
        });

        // Gérer les erreurs de connexion SSE
        eventSource.onerror = (error) => {
            console.error('📡 SSE Connection Error:', error);
            
            if (!isComplete) {
                showProcessing(false);
                showStatus('❌ Erreur de connexion SSE. Rechargez la page.', 'error');
                eventSource.close();
            }
        };

        // Timeout de sécurité (5 minutes max)
        setTimeout(() => {
            if (!isComplete) {
                console.warn('📡 SSE Timeout - fermeture forcée');
                showProcessing(false);
                showStatus('⏱️ Timeout SSE - correction trop longue', 'warning');
                eventSource.close();
            }
        }, 5 * 60 * 1000);

    } catch (error) {
        console.error('❌ SSE Setup Error:', error);
        showProcessing(false);
        showStatus(`❌ Erreur démarrage SSE: ${error.message}`, 'error');
    }
}
        console.log('📡 Utilisation SSE pour texte long');
        await correctArticleSSE(content, customPrompt);
    } else {
        console.log('🔄 Utilisation méthode synchrone pour texte court');
        await correctArticleSync(content, customPrompt);
    }
    }
}

function getSelectedOptions() {
    // Plus de cases à cocher, on retourne un tableau vide
    // La logique est maintenant entièrement dans le prompt personnalisé
    return [];
}

function updateProcessingDetails(message) {
    const detailsEl = document.getElementById('processing-details');
    if (detailsEl) {
        detailsEl.textContent = message;
    }
}

// ================================
// AFFICHAGE DES RÉSULTATS
// ================================

function displayResults(article) {
    console.log('📊 Displaying results...');
    
    const resultsSection = document.getElementById('results-section');
    resultsSection.style.display = 'block';
    
    // Statistiques de correction
    displayCorrectionStats(article);
    
    // Affichage côte à côte
    displayComparison(article);
    
    // Vérifications factuelles
    displayFactChecks(article);
    
    // Scroll vers les résultats
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    console.log('✅ Results displayed');
}

function displayCorrectionStats(article) {
    const stats = article.changes || {};
    
    document.getElementById('chars-changed').textContent = Math.abs(stats.correctedLength - stats.originalLength) || 0;
    document.getElementById('words-changed').textContent = stats.wordsChanged || 0;
    document.getElementById('percent-changed').textContent = (stats.percentageChange || 0) + '%';
}

function displayComparison(article) {
    const originalEl = document.getElementById('original-text');
    const correctedEl = document.getElementById('corrected-text');
    
    // Affichage du texte original sans highlighting
    originalEl.innerHTML = formatText(article.original);
    
    // Affichage du texte corrigé avec support HTML
    correctedEl.innerHTML = formatHTML(article.corrected);
}

function formatText(text) {
    // Formatage simple en paragraphes
    return text
        .split(/\n\s*\n/)
        .filter(p => p.trim().length > 0)
        .map(paragraph => `<p>${escapeHtml(paragraph.trim().replace(/\n/g, '<br>'))}</p>`)
        .join('');
}

function formatHTML(text) {
    try {
        // Vérification basique que le texte contient du HTML
        if (text.includes('<') && text.includes('>')) {
            // Le texte contient déjà du HTML, on le retourne tel quel
            // en s'assurant qu'il est bien formaté
            return sanitizeAndFormatHTML(text);
        } else {
            console.warn('Le texte ne semble pas contenir de HTML, utilisation du formatage simple');
            return formatText(text);
        }
    } catch (error) {
        console.error('Erreur lors du traitement HTML:', error);
        // Fallback vers le formatage simple en cas d'erreur
        return formatText(text);
    }
}

function sanitizeAndFormatHTML(html) {
    // Nettoie et formate le HTML pour un affichage optimal
    try {
        // Remplace les sauts de ligne par des <br> si nécessaire
        // mais seulement en dehors des balises HTML
        let formatted = html
            .replace(/\n\s*\n/g, '</p><p>')  // Double saut de ligne = nouveau paragraphe
            .replace(/\n/g, '<br>');         // Simple saut de ligne = <br>
        
        // S'assurer que le contenu est dans des paragraphes si ce n'est pas déjà le cas
        if (!formatted.includes('<p>') && !formatted.includes('<h1>') && !formatted.includes('<h2>')) {
            formatted = `<p>${formatted}</p>`;
        }
        
        return formatted;
    } catch (error) {
        console.error('Erreur lors du formatage HTML:', error);
        return html; // Retourne le HTML original en cas d'erreur
    }
}

function formatTextWithDiff(originalText, correctedText) {
    try {
        // Approche plus simple et efficace : comparaison directe avec une libraire de diff basique
        const diff = createSimpleDiff(originalText, correctedText);
        return diff;
    } catch (error) {
        console.warn('Erreur lors de la comparaison, affichage simple:', error);
        return formatText(correctedText);
    }
}

function createSimpleDiff(original, corrected) {
    // Approche améliorée pour détecter les corrections d'orthographe
    // Diviser en paragraphes pour un meilleur affichage
    const paragraphs = corrected.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    // Toujours essayer de détecter les changements, même pour des textes similaires
    return paragraphs.map(paragraph => {
        return `<p>${highlightSpellingCorrections(original, paragraph)}</p>`;
    }).join('');
}

// Calculer la similarité entre deux textes
function calculateSimilarity(text1, text2) {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = Math.max(words1.length, words2.length);
    
    return commonWords.length / totalWords;
}

// Surligner les corrections d'orthographe et de grammaire
function highlightSpellingCorrections(original, correctedParagraph) {
    const originalWords = original.toLowerCase().split(/\s+/);
    const words = correctedParagraph.split(/(\s+)/);
    
    return words.map(word => {
        // Si c'est un espace, le garder tel quel
        if (/^\s+$/.test(word)) {
            return word;
        }
        
        // Nettoyer le mot pour comparaison (garder plus de ponctuation pour détecter les changements)
        const cleanWord = word.toLowerCase().replace(/[.,!?;:«»""()]/g, '');
        const cleanWordStrict = cleanWord.replace(/[\-']/g, '');
        
        // Chercher des correspondances exactes et approximatives
        const hasExactMatch = originalWords.some(ow => {
            const cleanOriginal = ow.replace(/[.,!?;:«»""()]/g, '');
            const cleanOriginalStrict = cleanOriginal.replace(/[\-']/g, '');
            return cleanOriginal === cleanWord || cleanOriginalStrict === cleanWordStrict;
        });
        
        // Si pas de correspondance exacte, chercher des correspondances approximatives (corrections d'orthographe)
        const hasSimilarMatch = !hasExactMatch && originalWords.some(ow => {
            const cleanOriginal = ow.replace(/[.,!?;:«»""()\-']/g, '');
            // Vérifier si c'est une correction probable (même longueur +/- 2 caractères, similarité élevée)
            if (cleanOriginal.length > 1 && cleanWordStrict.length > 1) {
                const lengthDiff = Math.abs(cleanOriginal.length - cleanWordStrict.length);
                if (lengthDiff <= 2) {
                    const similarity = calculateWordSimilarity(cleanOriginal, cleanWordStrict);
                    return similarity > 0.6; // Seuil plus bas pour détecter les corrections
                }
            }
            return false;
        });
        
        // Plus de surlignage, retourner le mot tel quel
        return escapeHtml(word);
    }).join('');
}

// Calculer la similarité entre deux mots pour détecter les corrections d'orthographe
function calculateWordSimilarity(word1, word2) {
    if (word1 === word2) return 1;
    if (word1.length === 0 || word2.length === 0) return 0;
    
    // Algorithme de distance de Levenshtein simplifié
    const maxLength = Math.max(word1.length, word2.length);
    const distance = levenshteinDistance(word1, word2);
    return 1 - (distance / maxLength);
}

// Distance de Levenshtein pour mesurer la différence entre deux mots
function levenshteinDistance(str1, str2) {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1, // deletion
                matrix[j - 1][i] + 1, // insertion
                matrix[j - 1][i - 1] + indicator // substitution
            );
        }
    }
    
    return matrix[str2.length][str1.length];
}

function compareWords(originalSentence, correctedSentence) {
    const originalWords = originalSentence.split(/(\s+)/);
    const correctedWords = correctedSentence.split(/(\s+)/);
    
    // Utiliser un algorithme de Longest Common Subsequence simplifié
    const lcs = computeLCS(originalWords, correctedWords);
    
    let result = '';
    let i = 0, j = 0, lcsIndex = 0;
    
    while (j < correctedWords.length) {
        const correctedWord = correctedWords[j];
        
        // Vérifier si ce mot fait partie de la séquence commune
        if (lcsIndex < lcs.length && correctedWord === lcs[lcsIndex]) {
            // Mot inchangé
            result += escapeHtml(correctedWord);
            lcsIndex++;
        } else {
            // Mot modifié ou ajouté - plus de highlighting
            result += escapeHtml(correctedWord);
        }
        j++;
    }
    
    return result;
}

function computeLCS(arr1, arr2) {
    // Algorithme de Longest Common Subsequence simplifié pour les mots non-espaces
    const words1 = arr1.filter(w => w.trim().length > 0);
    const words2 = arr2.filter(w => w.trim().length > 0);
    
    const dp = Array(words1.length + 1).fill().map(() => Array(words2.length + 1).fill(0));
    
    for (let i = 1; i <= words1.length; i++) {
        for (let j = 1; j <= words2.length; j++) {
            if (words1[i-1] === words2[j-1]) {
                dp[i][j] = dp[i-1][j-1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
            }
        }
    }
    
    // Reconstruire la séquence commune
    const lcs = [];
    let i = words1.length, j = words2.length;
    
    while (i > 0 && j > 0) {
        if (words1[i-1] === words2[j-1]) {
            lcs.unshift(words1[i-1]);
            i--;
            j--;
        } else if (dp[i-1][j] > dp[i][j-1]) {
            i--;
        } else {
            j--;
        }
    }
    
    return lcs;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function displayFactChecks(article) {
    const factCheckSection = document.getElementById('factcheck-section');
    const factCheckContent = document.getElementById('factcheck-content');
    
    if (article.factChecks && article.factChecks.trim() && !article.factChecks.includes('Aucune vérification')) {
        factCheckContent.textContent = article.factChecks;
        factCheckSection.style.display = 'block';
    } else {
        factCheckSection.style.display = 'none';
    }
}

// ================================
// ACTIONS SUR LES RÉSULTATS
// ================================

function acceptCorrection() {
    if (!currentArticle) return;
    
    document.getElementById('text-input').value = currentArticle.corrected;
    updateContentStats();
    showStatus('✅ Correction acceptée et appliquée', 'success');
    
    console.log('✅ Correction accepted');
}

function rejectCorrection() {
    if (!currentArticle) return;
    
    showStatus('❌ Correction rejetée', 'info');
    document.getElementById('results-section').style.display = 'none';
    
    console.log('❌ Correction rejected');
}

async function downloadWord() {
    if (!currentArticle) return;

    try {
        showStatus('📄 Génération du document Word...', 'info');
        
        const response = await fetch('/api/files/export-word', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: currentArticle.corrected,
                title: 'Article corrigé',
                includeMetadata: true
            })
        });

        if (!response.ok) {
            throw new Error('Erreur lors de l\'export Word');
        }

        const blob = await response.blob();
        downloadBlob(blob, `article_corrige_${Date.now()}.docx`);
        
        showStatus('✅ Document Word téléchargé', 'success');
        console.log('📄 Word document downloaded');

    } catch (error) {
        console.error('❌ Word export error:', error);
        showStatus(`❌ Erreur téléchargement Word: ${error.message}`, 'error');
    }
}

function downloadText() {
    if (!currentArticle) return;

    const content = `ARTICLE CORRIGÉ
================

Date de correction: ${currentArticle.timestamp.toLocaleString()}
Options utilisées: ${currentArticle.options?.join(', ') || 'Aucune'}
Temps de traitement: ${Math.round(currentArticle.processingTime / 1000)}s

CONTENU:
--------

${currentArticle.corrected}

${currentArticle.factChecks ? `\nVÉRIFICATIONS FACTUELLES:\n${currentArticle.factChecks}` : ''}
`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `article_corrige_${Date.now()}.txt`);
    
    showStatus('✅ Fichier texte téléchargé', 'success');
    console.log('📝 Text file downloaded');
}

function generateReport() {
    if (!currentArticle) return;

    const stats = currentArticle.changes || {};
    const report = `RAPPORT DE CORRECTION
=====================

INFORMATIONS GÉNÉRALES:
- Date: ${currentArticle.timestamp.toLocaleString()}
- Temps de traitement: ${Math.round(currentArticle.processingTime / 1000)} secondes
- Options utilisées: ${currentArticle.options?.join(', ') || 'Aucune'}
- Prompt personnalisé: ${currentArticle.customPromptUsed ? 'Oui' : 'Non'}

STATISTIQUES:
- Longueur originale: ${stats.originalLength || 0} caractères
- Longueur corrigée: ${stats.correctedLength || 0} caractères
- Mots originaux: ${stats.originalWords || 0}
- Mots corrigés: ${stats.correctedWords || 0}
- Mots modifiés: ${stats.wordsChanged || 0}
- Pourcentage de changement: ${stats.percentageChange || 0}%

VÉRIFICATIONS FACTUELLES:
${currentArticle.factChecks || 'Aucune vérification effectuée'}

---
Généré par l'Outil de Correction d'Articles - LADN
`;

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `rapport_correction_${Date.now()}.txt`);

    showStatus('📊 Rapport généré et téléchargé', 'success');
    console.log('📊 Report generated');
}

function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// ================================
// GESTION DE L'HISTORIQUE
// ================================

function addToHistory(article) {
    const historyItem = {
        ...article,
        id: Date.now(),
        preview: article.original.substring(0, 150) + (article.original.length > 150 ? '...' : '')
    };

    correctionHistory.unshift(historyItem);

    // Garder seulement les 10 dernières corrections
    if (correctionHistory.length > 10) {
        correctionHistory = correctionHistory.slice(0, 10);
    }

    localStorage.setItem('correctionHistory', JSON.stringify(correctionHistory));
    updateHistoryDisplay();
    
    console.log(`📚 Added to history (${correctionHistory.length} items)`);
}

function updateHistoryDisplay() {
    const historyList = document.getElementById('history-list');
    const historyCount = document.getElementById('history-count');
    
    historyCount.textContent = correctionHistory.length;
    
    if (correctionHistory.length === 0) {
        historyList.innerHTML = '<p class="no-history">Aucune correction effectuée</p>';
        return;
    }

    historyList.innerHTML = correctionHistory.map(item => `
        <div class="history-item">
            <div class="history-item-content">
                <div class="history-item-meta">
                    ${item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Date inconnue'} • 
                    ${item.options?.length || 0} options • 
                    ${Math.round((item.processingTime || 0) / 1000)}s
                </div>
                <div class="history-item-preview">${item.preview}</div>
            </div>
            <div class="history-item-actions">
                <button onclick="restoreFromHistory(${item.id})" class="secondary-btn" title="Restaurer cette version">
                    🔄 Restaurer
                </button>
                <button onclick="removeFromHistory(${item.id})" class="secondary-btn" title="Supprimer de l'historique">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');
}

function restoreFromHistory(id) {
    const item = correctionHistory.find(h => h.id === id);
    if (item) {
        currentArticle = item;
        document.getElementById('text-input').value = item.original;
        updateContentStats();
        displayResults(item);
        showStatus('🔄 Version restaurée depuis l\'historique', 'success');
        
        console.log(`🔄 Restored from history: ${id}`);
    }
}

function removeFromHistory(id) {
    correctionHistory = correctionHistory.filter(h => h.id !== id);
    localStorage.setItem('correctionHistory', JSON.stringify(correctionHistory));
    updateHistoryDisplay();
    showStatus('🗑️ Élément supprimé de l\'historique', 'info');
    
    console.log(`🗑️ Removed from history: ${id}`);
}

function clearHistory() {
    if (confirm('Êtes-vous sûr de vouloir vider tout l\'historique ?')) {
        correctionHistory = [];
        localStorage.setItem('correctionHistory', JSON.stringify(correctionHistory));
        updateHistoryDisplay();
        showStatus('🧹 Historique vidé', 'info');
        
        console.log('🧹 History cleared');
    }
}

// ================================
// UTILITAIRES
// ================================

function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('file-status');
    const statusClass = `status-${type}`;
    
    statusEl.innerHTML = `<div class="status-message ${statusClass}">${message}</div>`;
    
    // Auto-hide après 5 secondes pour certains types
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            if (statusEl.innerHTML.includes(message)) {
                statusEl.innerHTML = '';
            }
        }, 5000);
    }
    
    console.log(`📢 Status: ${type} - ${message}`);
}

function showProcessing(show) {
    const processingEl = document.getElementById('processing-status');
    const btn = document.getElementById('correct-btn');
    
    if (show) {
        processingEl.style.display = 'block';
        btn.disabled = true;
        btn.innerHTML = '⏳ Correction en cours...';
    } else {
        processingEl.style.display = 'none';
        btn.disabled = false;
        btn.innerHTML = '🚀 Corriger l\'article';
    }
}

// ================================
// MODALES
// ================================

function showModal(title, content) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
}

// ================================
// ÉVÉNEMENTS ET RACCOURCIS
// ================================

function setupEventListeners() {
    // Raccourcis clavier
    document.addEventListener('keydown', function(e) {
        // Ctrl+S : Télécharger Word
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (currentArticle) {
                downloadWord();
            }
        }
        
        // Ctrl+Enter : Lancer correction
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            correctArticle();
        }
        
        // Escape : Fermer modale
        if (e.key === 'Escape') {
            closeModal();
        }
    });

    // Auto-save du contenu dans localStorage
    const textInput = document.getElementById('text-input');
    textInput.addEventListener('input', debounce(() => {
        localStorage.setItem('currentContent', textInput.value);
    }, 1000));

    // Restaurer le contenu au chargement
    const savedContent = localStorage.getItem('currentContent');
    if (savedContent && !textInput.value) {
        textInput.value = savedContent;
        updateContentStats();
    }

    // Test de connexion périodique (réduit à 5 minutes pour éviter la surcharge)
    setInterval(testConnection, 300000); // Toutes les 5 minutes
}

// Fonction de debounce pour éviter trop d'appels
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ================================
// GESTION D'ERREUR GLOBALE
// ================================

window.addEventListener('error', function(e) {
    console.error('❌ Erreur JavaScript:', e.error);
    showStatus('❌ Une erreur inattendue s\'est produite', 'error');
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('❌ Promise rejetée:', e.reason);
    showStatus('❌ Erreur de communication avec le serveur', 'error');
});

// ================================
// FONCTIONS D'AIDE
// ================================

// Fonction pour copier du texte dans le presse-papiers
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showStatus('📋 Texte copié dans le presse-papiers', 'success');
    } catch (error) {
        console.error('❌ Erreur copie:', error);
        showStatus('❌ Impossible de copier le texte', 'error');
    }
}

// Fonction pour partager les résultats
function shareResults() {
    if (!currentArticle) return;
    
    const shareData = {
        title: 'Article corrigé',
        text: `Article corrigé avec ${currentArticle.options?.length || 0} améliorations`,
        url: window.location.href
    };
    
    if (navigator.share) {
        navigator.share(shareData);
    } else {
        copyToClipboard(currentArticle.corrected);
    }
}

console.log('🎉 Application de correction d\'articles chargée et prête !');