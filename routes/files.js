const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink } = require('docx');
const fs = require('fs');
const path = require('path');
const FileParser = require('../services/fileParser');

// Configuration Multer pour l'upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const tempDir = path.join(__dirname, '../temp');
        
        // Créer le dossier temp s'il n'existe pas
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        cb(null, tempDir);
    },
    filename: function (req, file, cb) {
        // Nom unique avec timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, `upload-${uniqueSuffix}${extension}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 50 * 1024 * 1024, // 50MB max
        files: 1 // Un seul fichier à la fois
    },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt'];
        const fileExtension = path.extname(file.originalname).toLowerCase();
        
        if (allowedExtensions.includes(fileExtension)) {
            cb(null, true);
        } else {
            cb(new Error(`Format non supporté: ${fileExtension}. Formats autorisés: ${allowedExtensions.join(', ')}`));
        }
    }
});

const fileParser = new FileParser();

// Route pour parser un fichier uploadé
router.post('/parse', upload.single('file'), async (req, res) => {
    let tempFilePath = null;
    
    try {
        if (!req.file) {
            return res.status(400).json({ 
                error: 'Aucun fichier fourni',
                supportedFormats: ['PDF', 'Word (.doc, .docx)', 'Texte (.txt)']
            });
        }

        tempFilePath = req.file.path;
        console.log(`📁 Fichier reçu: ${req.file.originalname} (${req.file.size} bytes)`);

        // Validation du fichier
        const validationErrors = fileParser.validateFile(req.file);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: 'Fichier invalide',
                details: validationErrors
            });
        }

        // Lecture du fichier
        const buffer = fs.readFileSync(tempFilePath);
        
        // Parsing du contenu
        const result = await fileParser.parseFile(req.file, buffer);
        
        console.log(`✅ Parsing réussi: ${result.content.length} caractères extraits`);
        
        res.json({
            success: true,
            content: result.content,
            metadata: result.metadata,
            fileInfo: fileParser.getFileInfo(req.file)
        });

    } catch (error) {
        console.error('❌ Erreur parsing fichier:', error);
        
        let statusCode = 500;
        let errorMessage = 'Erreur lors du parsing du fichier';
        
        if (error.message.includes('trop volumineux')) {
            statusCode = 413;
        } else if (error.message.includes('Format non supporté')) {
            statusCode = 415;
        } else if (error.message.includes('vide')) {
            statusCode = 422;
        }
        
        res.status(statusCode).json({
            error: errorMessage,
            details: error.message
        });
        
    } finally {
        // Nettoyage du fichier temporaire
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
                console.log(`🗑️ Fichier temporaire supprimé: ${tempFilePath}`);
            } catch (cleanupError) {
                console.warn('⚠️ Erreur suppression fichier temporaire:', cleanupError);
            }
        }
    }
});

// Fonction pour convertir HTML coloré en formatage Word
function parseHtmlToWordRuns(htmlContent) {
    const runs = [];
    
    // Regex pour capturer les spans avec style et les liens
    const htmlRegex = /<span style="color:\s*([^"]+)"[^>]*>(.*?)<\/span>|<a href="([^"]+)"[^>]*>(.*?)<\/a>|([^<]+)/gi;
    
    let match;
    while ((match = htmlRegex.exec(htmlContent)) !== null) {
        if (match[1] && match[2]) {
            // Span avec couleur
            const color = match[1].toLowerCase();
            const text = match[2].replace(/<[^>]*>/g, ''); // Nettoyer les autres balises
            
            // Conversion des couleurs HTML vers Word
            let wordColor = "000000"; // noir par défaut
            if (color === "red") wordColor = "FF0000";
            else if (color === "orange") wordColor = "FF8C00";
            else if (color === "green") wordColor = "008000";
            else if (color === "blue") wordColor = "0000FF";
            else if (color === "#ffa500") wordColor = "FFA500"; // jaune
            
            runs.push(new TextRun({
                text: text,
                color: wordColor,
                font: "Arial",
                size: 24
            }));
        } else if (match[3] && match[4]) {
            // Lien cliquable
            const url = match[3];
            const linkText = match[4].replace(/<[^>]*>/g, '');
            
            runs.push(new ExternalHyperlink({
                children: [
                    new TextRun({
                        text: linkText,
                        style: "Hyperlink",
                        font: "Arial",
                        size: 24
                    })
                ],
                link: url
            }));
        } else if (match[5]) {
            // Texte normal
            const text = match[5];
            if (text.trim()) {
                runs.push(new TextRun({
                    text: text,
                    font: "Arial",
                    size: 24
                }));
            }
        }
    }
    
    return runs;
}

// Route pour exporter en Word
router.post('/export-word', async (req, res) => {
    try {
        const { content, title, includeMetadata } = req.body;
        
        if (!content || typeof content !== 'string') {
            return res.status(400).json({ error: 'Contenu manquant pour l\'export' });
        }

        console.log(`📄 Export Word - Titre: ${title || 'Sans titre'}, Longueur: ${content.length}`);

        // Création du document Word
        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: 1440,    // 1 inch = 1440 twips
                            right: 1440,
                            bottom: 1440,
                            left: 1440
                        }
                    }
                },
                children: [
                    // Titre si fourni
                    ...(title ? [
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: title,
                                    bold: true,
                                    size: 32, // 16pt
                                    font: "Arial"
                                })
                            ],
                            heading: HeadingLevel.TITLE,
                            spacing: { after: 400 }
                        })
                    ] : []),
                    
                    // Métadonnées si demandées
                    ...(includeMetadata ? [
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `Document généré le ${new Date().toLocaleString('fr-FR')}`,
                                    italics: true,
                                    size: 20, // 10pt
                                    color: "666666"
                                })
                            ],
                            spacing: { after: 400 }
                        }),
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: `Longueur: ${content.length} caractères, ${content.split(/\s+/).length} mots`,
                                    italics: true,
                                    size: 20, // 10pt
                                    color: "666666"
                                })
                            ],
                            spacing: { after: 600 }
                        })
                    ] : []),
                    
                    // Contenu principal avec préservation du formatage HTML
                    ...content.split(/\n\s*\n/).map(paragraphText => {
                        const trimmed = paragraphText.trim();
                        if (trimmed.length === 0) return null;
                        
                        // Conversion HTML vers TextRuns avec couleurs
                        const wordRuns = parseHtmlToWordRuns(trimmed);
                        
                        return new Paragraph({
                            children: wordRuns.length > 0 ? wordRuns : [
                                new TextRun({
                                    text: trimmed,
                                    font: "Arial",
                                    size: 24
                                })
                            ],
                            spacing: {
                                after: 200,
                                line: 360 // 1.5 line spacing
                            }
                        });
                    }).filter(p => p !== null)
                ]
            }]
        });

        // Génération du buffer
        const buffer = await Packer.toBuffer(doc);
        
        // Configuration des headers de réponse
        const filename = `${title || 'article_corrige'}_${Date.now()}.docx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        
        console.log(`✅ Export Word réussi: ${filename} (${buffer.length} bytes)`);
        
        res.send(buffer);

    } catch (error) {
        console.error('❌ Erreur export Word:', error);
        res.status(500).json({ 
            error: 'Erreur lors de l\'export Word',
            details: error.message
        });
    }
});

// Route pour exporter en PDF (simple - texte brut)
router.post('/export-pdf', async (req, res) => {
    try {
        const { content, title } = req.body;
        
        if (!content) {
            return res.status(400).json({ error: 'Contenu manquant pour l\'export PDF' });
        }

        // Pour une version simple, on retourne un fichier texte
        // Une vraie conversion PDF nécessiterait une librairie comme puppeteer ou pdfkit
        const textContent = `${title ? title + '\n' + '='.repeat(title.length) + '\n\n' : ''}${content}`;
        
        const filename = `${title || 'article_corrige'}_${Date.now()}.txt`;
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        res.send(textContent);

    } catch (error) {
        console.error('❌ Erreur export PDF:', error);
        res.status(500).json({ 
            error: 'Erreur lors de l\'export PDF',
            details: error.message
        });
    }
});

// Route pour obtenir les informations sur les formats supportés
router.get('/supported-formats', (req, res) => {
    const formats = {
        input: [
            {
                extension: '.txt',
                description: 'Fichier texte brut',
                maxSize: '50MB',
                features: ['Encoding UTF-8', 'Encoding Latin-1']
            },
            {
                extension: '.pdf',
                description: 'Document PDF',
                maxSize: '50MB',
                features: ['Extraction de texte', 'Multi-pages']
            },
            {
                extension: '.docx',
                description: 'Document Word moderne',
                maxSize: '50MB',
                features: ['Texte formaté', 'Métadonnées']
            },
            {
                extension: '.doc',
                description: 'Document Word ancien format',
                maxSize: '50MB',
                features: ['Support limité', 'Conversion recommandée en .docx']
            }
        ],
        output: [
            {
                format: 'Word (.docx)',
                description: 'Document Word avec formatage',
                features: ['Mise en forme', 'Métadonnées', 'Compatible Office']
            },
            {
                format: 'Texte (.txt)',
                description: 'Fichier texte simple',
                features: ['Léger', 'Universel', 'Pas de formatage']
            }
        ]
    };

    res.json(formats);
});

// Route pour nettoyer les fichiers temporaires anciens
router.post('/cleanup-temp', (req, res) => {
    try {
        const tempDir = path.join(__dirname, '../temp');
        
        if (!fs.existsSync(tempDir)) {
            return res.json({ message: 'Dossier temporaire n\'existe pas', cleaned: 0 });
        }

        const files = fs.readdirSync(tempDir);
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 heures
        let cleaned = 0;

        files.forEach(file => {
            const filePath = path.join(tempDir, file);
            const stats = fs.statSync(filePath);
            
            if (now - stats.mtime.getTime() > maxAge) {
                fs.unlinkSync(filePath);
                cleaned++;
            }
        });

        console.log(`🧹 Nettoyage fichiers temporaires: ${cleaned} fichiers supprimés`);
        
        res.json({ 
            message: `Nettoyage terminé: ${cleaned} fichiers supprimés`,
            cleaned: cleaned
        });

    } catch (error) {
        console.error('❌ Erreur nettoyage:', error);
        res.status(500).json({ 
            error: 'Erreur lors du nettoyage',
            details: error.message
        });
    }
});

// Gestion des erreurs Multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                error: 'Fichier trop volumineux',
                details: 'Taille maximum autorisée: 50MB'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: 'Trop de fichiers',
                details: 'Un seul fichier autorisé à la fois'
            });
        }
    }
    
    res.status(400).json({
        error: 'Erreur upload',
        details: error.message
    });
});

module.exports = router;