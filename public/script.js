// Variables globales
let currentArticle = null;
let correctionHistory = JSON.parse(localStorage.getItem('correctionHistory')) || [];
let translationHistory = JSON.parse(localStorage.getItem('translationHistory')) || [];
let savedPrompts = {};
let isConnected = false;
let currentMode = 'correction'; // 'correction' ou 'translation'

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
    await loadServerPrompts();
    updateHistoryDisplay();
    updateHistoryDisplay('translation');
    
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
// GESTION DES ONGLETS
// ================================

function switchTab(tabName) {
    // Mettre à jour les boutons d'onglets
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
    
    // Mettre à jour le contenu des onglets
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Mettre à jour le mode courant
    currentMode = tabName;
    
    // Mettre à jour les statistiques de contenu pour l'onglet actuel
    updateContentStats(tabName);
    
    console.log(`📑 Onglet basculé vers: ${tabName}`);
}

// ================================
// GESTION DES PROMPTS SERVEUR
// ================================

async function loadServerPrompts() {
    try {
        const response = await fetch('/api/files/prompts');
        const prompts = await response.json();
        savedPrompts = prompts;
        
        // Charger les prompts dans les deux sélecteurs
        loadSavedPrompts();
        loadSavedPrompts('translation');
        
        console.log('📁 Prompts chargés depuis le serveur');
    } catch (error) {
        console.error('❌ Erreur chargement prompts:', error);
        showStatus('⚠️ Impossible de charger les prompts sauvegardés', 'warning');
    }
}

async function savePromptToServer(name, content) {
    try {
        const response = await fetch('/api/files/prompts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, content })
        });
        
        if (response.ok) {
            await loadServerPrompts(); // Recharger la liste
            return true;
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Erreur sauvegarde');
        }
    } catch (error) {
        console.error('❌ Erreur sauvegarde prompt:', error);
        showStatus(`❌ Erreur sauvegarde: ${error.message}`, 'error');
        return false;
    }
}

async function deletePromptFromServer(name) {
    try {
        const response = await fetch(`/api/files/prompts/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            await loadServerPrompts(); // Recharger la liste
            return true;
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Erreur suppression');
        }
    } catch (error) {
        console.error('❌ Erreur suppression prompt:', error);
        showStatus(`❌ Erreur suppression: ${error.message}`, 'error');
        return false;
    }
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

function loadSavedPrompts(mode = 'correction') {
    const suffix = mode === 'translation' ? '-translation' : '';
    const promptSelect = document.getElementById(`saved-prompts${suffix}`);
    
    if (!promptSelect) return;
    
    promptSelect.innerHTML = '<option value="">Sélectionner un prompt sauvegardé</option>';
    
    // Filtrer les prompts selon le mode
    const relevantPrompts = Object.keys(savedPrompts).filter(name => {
        if (mode === 'translation') {
            return name.includes('translation') || name.includes('traduction');
        } else {
            return name.includes('correction') || (!name.includes('translation') && !name.includes('traduction'));
        }
    });
    
    relevantPrompts.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        promptSelect.appendChild(option);
    });
    
    console.log(`📁 ${relevantPrompts.length} prompts ${mode} chargés`);
}

async function savePrompt(mode = 'correction') {
    const suffix = mode === 'translation' ? '-translation' : '';
    const name = document.getElementById(`prompt-name${suffix}`).value.trim();
    const content = document.getElementById(`custom-prompt${suffix}`).value.trim();
    
    if (!name) {
        showStatus('⚠️ Veuillez entrer un nom pour le prompt', 'warning');
        return;
    }
    
    if (!content) {
        showStatus('⚠️ Le prompt ne peut pas être vide', 'warning');
        return;
    }
    
    // Vérifier si le nom existe déjà
    if (savedPrompts[name]) {
        if (!confirm(`Le prompt "${name}" existe déjà. Le remplacer ?`)) {
            return;
        }
    }

    const success = await savePromptToServer(name, content);
    if (success) {
        document.getElementById(`prompt-name${suffix}`).value = '';
        showStatus(`💾 Prompt "${name}" sauvegardé avec succès`, 'success');
        console.log(`💾 Prompt saved: ${name}`);
    }
}

function loadPrompt(mode = 'correction') {
    const suffix = mode === 'translation' ? '-translation' : '';
    const selectedName = document.getElementById(`saved-prompts${suffix}`).value;
    
    if (!selectedName) {
        showStatus('⚠️ Veuillez sélectionner un prompt', 'warning');
        return;
    }

    document.getElementById(`custom-prompt${suffix}`).value = savedPrompts[selectedName];
    showStatus(`📁 Prompt "${selectedName}" chargé`, 'success');
    
    console.log(`📁 Prompt loaded: ${selectedName}`);
}

async function deletePrompt(mode = 'correction') {
    const suffix = mode === 'translation' ? '-translation' : '';
    const selectedName = document.getElementById(`saved-prompts${suffix}`).value;
    
    if (!selectedName) {
        showStatus('⚠️ Veuillez sélectionner un prompt à supprimer', 'warning');
        return;
    }

    if (confirm(`Êtes-vous sûr de vouloir supprimer le prompt "${selectedName}" ?`)) {
        const success = await deletePromptFromServer(selectedName);
        if (success) {
            document.getElementById(`custom-prompt${suffix}`).value = '';
            showStatus(`🗑️ Prompt "${selectedName}" supprimé`, 'success');
            console.log(`🗑️ Prompt deleted: ${selectedName}`);
        }
    }
}

// ================================
// PRÉRÉGLAGES DE PROMPTS
// ================================

// Fonctions de presets supprimées - utilisez désormais les prompts sauvegardés

function clearOptions() {
    // Fonction legacy maintenue pour compatibilité
    document.getElementById('custom-prompt').value = '';
}

// ================================
// STATISTIQUES DE CONTENU
// ================================

function updateContentStats(mode = 'correction') {
    const suffix = mode === 'translation' ? '-translation' : '';
    const content = document.getElementById(`text-input${suffix}`).value;
    const statsSection = document.getElementById(`content-stats${suffix}`);
    
    if (!content || content.trim().length === 0) {
        if (statsSection) statsSection.style.display = 'none';
        return;
    }

    const stats = analyzeContent(content);
    
    const charCountEl = document.getElementById(`char-count${suffix}`);
    const wordCountEl = document.getElementById(`word-count${suffix}`);
    const tokenCountEl = document.getElementById(`token-count${suffix}`);
    
    if (charCountEl) charCountEl.textContent = stats.characters.toLocaleString();
    if (wordCountEl) wordCountEl.textContent = stats.words.toLocaleString();
    if (tokenCountEl) tokenCountEl.textContent = stats.tokens.toLocaleString();
    
    // Alerte si le contenu est trop long
    if (stats.characters > 400000) {
        if (charCountEl) charCountEl.style.color = 'var(--danger-color)';
        showStatus('⚠️ Contenu trop long pour Claude (max 400k caractères)', 'warning');
    } else {
        if (charCountEl) charCountEl.style.color = 'var(--primary-color)';
    }
    
    if (statsSection) statsSection.style.display = 'flex';
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

    // Utiliser SSE pour les textes longs (>5000 caractères) pour éviter les timeouts
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
            try {
                const data = event.data ? JSON.parse(event.data) : {};
                console.log('📡 SSE Start:', data);
                updateProcessingDetails('⚡ Correction démarrée en arrière-plan...');
            } catch (error) {
                console.warn('📡 SSE Start parse error:', error);
            }
        });

        eventSource.addEventListener('progress', (event) => {
            try {
                const data = event.data ? JSON.parse(event.data) : {};
                console.log('📡 SSE Progress:', data);
                updateProcessingDetails(`📊 ${data.stage}: ${data.details}`);
            } catch (error) {
                console.warn('📡 SSE Progress parse error:', error);
            }
        });

        eventSource.addEventListener('complete', (event) => {
            try {
                const data = event.data ? JSON.parse(event.data) : {};
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
            } catch (error) {
                console.error('📡 SSE Complete parse error:', error);
                showProcessing(false);
                showStatus('❌ Erreur traitement résultat SSE', 'error');
                isComplete = true;
                eventSource.close();
            }
        });

        eventSource.addEventListener('error', (event) => {
            try {
                const data = event.data ? JSON.parse(event.data) : { error: 'Erreur SSE inconnue' };
                console.error('📡 SSE Error:', data);
                
                showProcessing(false);
                showStatus(`❌ Erreur SSE: ${data.error}`, 'error');
                
                isComplete = true;
                eventSource.close();
            } catch (error) {
                console.error('📡 SSE Error parse error:', error);
                showProcessing(false);
                showStatus('❌ Erreur SSE: Format de données invalide', 'error');
                isComplete = true;
                eventSource.close();
            }
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
    
    // Affichage côte à côte
    displayComparison(article);
    
    // Vérifications factuelles
    displayFactChecks(article);
    
    // Scroll vers les résultats
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    console.log('✅ Results displayed');
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
        
        // Si correction d'orthographe détectée, surligner en rouge
        if (hasSimilarMatch) {
            return `<span style="color: #dc3545; background-color: #f8d7da;">${escapeHtml(word)}</span>`;
        }
        
        // Mot normal
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
            // Mot modifié ou ajouté - surligner en orange
            result += `<span style="color: #fd7e14; background-color: #fff3cd;">${escapeHtml(correctedWord)}</span>`;
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

// Fonctions de téléchargement pour l'onglet correction
function downloadWordCorrection() {
    if (!currentArticle) {
        showStatus('❌ Aucune correction à télécharger', 'error');
        return;
    }

    const correctedTextElement = document.getElementById('corrected-text');
    if (!correctedTextElement || !correctedTextElement.innerHTML.trim()) {
        showStatus('❌ Aucun texte corrigé à exporter', 'error');
        return;
    }
    
    const content = correctedTextElement.innerHTML;
    downloadWord(content, 'correction');
}

function downloadTextCorrection() {
    if (!currentArticle) {
        showStatus('❌ Aucune correction à télécharger', 'error');
        return;
    }

    const correctedTextElement = document.getElementById('corrected-text');
    if (!correctedTextElement || !correctedTextElement.innerHTML.trim()) {
        showStatus('❌ Aucun texte corrigé à exporter', 'error');
        return;
    }
    
    const content = correctedTextElement.textContent || correctedTextElement.innerText || '';
    downloadText(content, 'correction');
}

// Fonction pour copier le contenu corrigé
function copyCorrection() {
    if (!currentArticle) {
        showStatus('❌ Aucune correction à copier', 'error');
        return;
    }

    const correctedTextElement = document.getElementById('corrected-text');
    if (!correctedTextElement || !correctedTextElement.innerHTML.trim()) {
        showStatus('❌ Aucun texte corrigé à copier', 'error');
        return;
    }

    // Copier avec le formatage HTML
    const htmlContent = correctedTextElement.innerHTML;
    copyToClipboard(htmlContent, true); // true pour inclure le formatage
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

// Fonction pour copier du texte dans le presse-papiers avec formatage
async function copyToClipboard(content, includeFormatting = false) {
    try {
        if (includeFormatting && navigator.clipboard.write) {
            // Copier avec formatage HTML (pour les corrections)
            const blob = new Blob([content], { type: 'text/html' });
            const plainText = content.replace(/<[^>]*>/g, ''); // Version texte brut
            const clipboardItem = new ClipboardItem({
                'text/html': blob,
                'text/plain': new Blob([plainText], { type: 'text/plain' })
            });
            await navigator.clipboard.write([clipboardItem]);
            showStatus('📋 Texte copié avec formatage dans le presse-papiers', 'success');
        } else {
            // Copier en texte brut seulement
            const plainText = typeof content === 'string' && content.includes('<')
                ? content.replace(/<[^>]*>/g, '')
                : content;
            await navigator.clipboard.writeText(plainText);
            showStatus('📋 Texte copié dans le presse-papiers', 'success');
        }
    } catch (error) {
        console.error('❌ Erreur copie:', error);
        // Fallback : copie en texte brut
        try {
            const plainText = typeof content === 'string' && content.includes('<')
                ? content.replace(/<[^>]*>/g, '')
                : content;
            await navigator.clipboard.writeText(plainText);
            showStatus('📋 Texte copié (sans formatage)', 'success');
        } catch (fallbackError) {
            showStatus('❌ Impossible de copier le texte', 'error');
        }
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
        copyToClipboard(currentArticle.corrected, true); // Avec formatage HTML
    }
}

// ================================
// FONCTIONS DE TRADUCTION
// ================================

async function translateArticle() {
    if (!isConnected) {
        showStatus('❌ Pas de connexion à Claude. Vérifiez votre configuration.', 'error');
        return;
    }

    const content = document.getElementById('text-input-translation').value.trim();
    if (!content) {
        showStatus('⚠️ Veuillez saisir ou importer du contenu à traduire', 'warning');
        return;
    }

    // Vérification de la longueur
    if (content.length > 400000) {
        showStatus('❌ Le contenu est trop long (maximum 400,000 caractères)', 'error');
        return;
    }

    const customPrompt = document.getElementById('custom-prompt-translation').value.trim();
    
    if (!customPrompt) {
        showStatus('⚠️ Veuillez sélectionner un prompt ou saisir des instructions personnalisées', 'warning');
        return;
    }

    console.log(`🌐 Starting translation - Length: ${content.length} chars`);

    showProcessing(true, 'translation');
    updateProcessingDetails('Envoi de la demande de traduction à Claude...', 'translation');

    try {
        const startTime = Date.now();
        
        const response = await fetch('/api/correction/correct', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: content,
                options: [],
                customPrompt: customPrompt
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || errorData.error || `Erreur HTTP ${response.status}`);
        }

        updateProcessingDetails('Traitement de la traduction...', 'translation');
        const result = await response.json();
        
        const processingTime = Date.now() - startTime;
        console.log(`✅ Translation completed in ${processingTime}ms`);

        const translation = {
            original: content,
            translated: result.correctedText,
            processing: result.processing,
            timestamp: new Date(),
            processingTime: processingTime,
            promptUsed: customPrompt.substring(0, 200),
            mode: 'translation'
        };

        // Sauvegarder dans l'historique
        translationHistory.unshift(translation);
        if (translationHistory.length > 50) translationHistory.pop();
        localStorage.setItem('translationHistory', JSON.stringify(translationHistory));

        displayTranslationResults(translation);
        showStatus(`✅ Traduction terminée en ${processingTime}ms`, 'success');

    } catch (error) {
        console.error('❌ Translation error:', error);
        showStatus(`❌ Erreur: ${error.message}`, 'error');
    } finally {
        showProcessing(false, 'translation');
    }
}

function displayTranslationResults(translation) {
    const resultsSection = document.getElementById('results-section-translation');
    
    // Afficher les textes
    document.getElementById('french-text').textContent = translation.original;
    document.getElementById('english-text').textContent = translation.translated;
    
    // Afficher la section des résultats
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });
    
    // Mettre à jour l'historique
    updateHistoryDisplay('translation');
    
    console.log('✅ Translation results displayed');
}

function acceptTranslation() {
    showStatus('✅ Traduction acceptée', 'success');
    console.log('✅ Translation accepted');
}

function downloadWordTranslation() {
    if (!document.getElementById('english-text').innerHTML) {
        showStatus('⚠️ Aucune traduction à télécharger', 'warning');
        return;
    }
    
    const content = document.getElementById('english-text').innerHTML;
    downloadWord(content, 'translation');
}

function downloadTextTranslation() {
    if (!document.getElementById('english-text').innerHTML) {
        showStatus('⚠️ Aucune traduction à télécharger', 'warning');
        return;
    }
    
    const content = document.getElementById('english-text').textContent;
    downloadText(content, 'translation');
}

// Fonction pour copier la traduction
function copyTranslation() {
    const englishTextElement = document.getElementById('english-text');
    if (!englishTextElement || !englishTextElement.innerHTML.trim()) {
        showStatus('❌ Aucune traduction à copier', 'error');
        return;
    }

    // Copier le contenu traduit (généralement en texte brut pour la traduction)
    const textContent = englishTextElement.textContent || englishTextElement.innerText || '';
    copyToClipboard(textContent, false); // false car la traduction n'a pas besoin du formatage HTML
}

// ================================
// FONCTIONS D'HISTORIQUE MISES À JOUR
// ================================

function updateHistoryDisplay(mode = 'correction') {
    const history = mode === 'translation' ? translationHistory : correctionHistory;
    const suffix = mode === 'translation' ? '-translation' : '';
    
    const historyList = document.getElementById(`history-list${suffix}`);
    const historyCount = document.getElementById(`history-count${suffix}`);
    
    if (!historyList || !historyCount) return;
    
    historyCount.textContent = history.length;
    
    if (history.length === 0) {
        historyList.innerHTML = `<p class="no-history">Aucune ${mode === 'translation' ? 'traduction' : 'correction'} effectuée</p>`;
        return;
    }
    
    const itemsHtml = history.slice(0, 10).map((item, index) => {
        const date = new Date(item.timestamp).toLocaleString('fr-FR');
        const preview = item.original.substring(0, 100) + (item.original.length > 100 ? '...' : '');
        const actionLabel = mode === 'translation' ? 'Traduction' : 'Correction';
        
        return `
            <div class="history-item" onclick="loadFromHistory(${index}, '${mode}')">
                <div class="history-header">
                    <span class="history-date">${date}</span>
                    <span class="history-stats">${item.original.length} car.</span>
                </div>
                <div class="history-preview">${escapeHtml(preview)}</div>
                <div class="history-actions">
                    <small>${actionLabel} en ${item.processingTime}ms</small>
                </div>
            </div>
        `;
    }).join('');
    
    historyList.innerHTML = itemsHtml;
}

function loadFromHistory(index, mode = 'correction') {
    const history = mode === 'translation' ? translationHistory : correctionHistory;
    const item = history[index];
    
    if (!item) return;
    
    const suffix = mode === 'translation' ? '-translation' : '';
    
    // Charger le contenu original
    document.getElementById(`text-input${suffix}`).value = item.original;
    
    // Charger le prompt utilisé si disponible
    if (item.promptUsed) {
        document.getElementById(`custom-prompt${suffix}`).value = item.promptUsed;
    }
    
    // Afficher les résultats
    if (mode === 'translation') {
        displayTranslationResults(item);
    } else {
        displayResults(item);
    }
    
    updateContentStats(mode);
    showStatus(`📁 ${mode === 'translation' ? 'Traduction' : 'Correction'} rechargée depuis l'historique`, 'success');
}

function clearHistory(mode = 'correction') {
    const actionLabel = mode === 'translation' ? 'traductions' : 'corrections';
    
    if (confirm(`Êtes-vous sûr de vouloir supprimer tout l'historique des ${actionLabel} ?`)) {
        if (mode === 'translation') {
            translationHistory = [];
            localStorage.removeItem('translationHistory');
        } else {
            correctionHistory = [];
            localStorage.removeItem('correctionHistory');
        }
        
        updateHistoryDisplay(mode);
        showStatus(`🗑️ Historique des ${actionLabel} supprimé`, 'success');
    }
}

// ================================
// FONCTIONS UTILITAIRES MISES À JOUR
// ================================

function showProcessing(show, mode = 'correction') {
    const suffix = mode === 'translation' ? '-translation' : '';
    const processingStatus = document.getElementById(`processing-status${suffix}`);
    const actionBtn = document.getElementById(mode === 'translation' ? 'translate-btn' : 'correct-btn');
    
    if (processingStatus) {
        processingStatus.style.display = show ? 'block' : 'none';
    }
    
    if (actionBtn) {
        actionBtn.disabled = show;
        actionBtn.textContent = show
            ? (mode === 'translation' ? '🔄 Traduction en cours...' : '🔄 Correction en cours...')
            : (mode === 'translation' ? '🌐 Traduire l\'article' : '🚀 Corriger l\'article');
    }
}

function updateProcessingDetails(message, mode = 'correction') {
    const suffix = mode === 'translation' ? '-translation' : '';
    const details = document.getElementById(`processing-details${suffix}`);
    if (details) {
        details.textContent = message;
    }
}

function downloadWord(content, mode = 'correction') {
    const title = mode === 'translation' ? 'Article traduit' : 'Article corrigé';
    
    fetch('/api/files/export-word', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            content: content,
            title: title,
            includeMetadata: true
        })
    })
    .then(response => {
        if (!response.ok) throw new Error('Erreur export');
        return response.blob();
    })
    .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showStatus('📄 Document Word téléchargé', 'success');
    })
    .catch(error => {
        console.error('❌ Erreur export Word:', error);
        showStatus('❌ Erreur lors de l\'export Word', 'error');
    });
}

function downloadText(content, mode = 'correction') {
    const title = mode === 'translation' ? 'article_traduit' : 'article_corrige';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStatus('📝 Fichier texte téléchargé', 'success');
}

console.log('🎉 Application de correction et traduction d\'articles chargée et prête !');