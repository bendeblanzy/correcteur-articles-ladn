const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const fs = require('fs');

class FileParser {
    constructor() {
        this.supportedFormats = ['txt', 'pdf', 'doc', 'docx'];
        this.maxFileSize = 50 * 1024 * 1024; // 50MB
    }

    async parseFile(file, buffer) {
        try {
            console.log(`📄 Parsing du fichier: ${file.originalname}`);
            
            // Vérification de la taille
            if (buffer.length > this.maxFileSize) {
                throw new Error(`Fichier trop volumineux. Taille maximum: ${this.maxFileSize / (1024 * 1024)}MB`);
            }

            // Extraction de l'extension
            const extension = this.getFileExtension(file.originalname);
            
            // Vérification du format supporté
            if (!this.supportedFormats.includes(extension)) {
                throw new Error(`Format non supporté. Formats acceptés: ${this.supportedFormats.join(', ')}`);
            }

            let content = '';
            
            switch (extension) {
                case 'txt':
                    content = await this.parseText(buffer);
                    break;
                case 'docx':
                    content = await this.parseWordDocx(buffer);
                    break;
                case 'doc':
                    content = await this.parseWordDoc(buffer);
                    break;
                case 'pdf':
                    content = await this.parsePDF(buffer);
                    break;
                default:
                    throw new Error(`Format ${extension} non implémenté`);
            }

            // Nettoyage et validation du contenu
            content = this.cleanContent(content);
            
            if (!content || content.trim().length === 0) {
                throw new Error('Le fichier semble vide ou le contenu n\'a pas pu être extrait');
            }

            console.log(`✅ Parsing réussi: ${content.length} caractères extraits`);
            
            return {
                content: content,
                metadata: {
                    originalName: file.originalname,
                    extension: extension,
                    size: buffer.length,
                    charCount: content.length,
                    wordCount: this.countWords(content),
                    parsedAt: new Date().toISOString()
                }
            };

        } catch (error) {
            console.error(`❌ Erreur parsing ${file.originalname}:`, error.message);
            throw new Error(`Erreur lors du parsing: ${error.message}`);
        }
    }

    async parseText(buffer) {
        try {
            // Détection de l'encoding
            const content = buffer.toString('utf-8');
            
            // Vérification si c'est de l'UTF-8 valide
            if (content.includes('�')) {
                // Essayer avec d'autres encodings
                const contentLatin1 = buffer.toString('latin1');
                return contentLatin1;
            }
            
            return content;
        } catch (error) {
            throw new Error(`Erreur lecture fichier texte: ${error.message}`);
        }
    }

    async parseWordDocx(buffer) {
        try {
            const result = await mammoth.extractRawText({ buffer });
            
            if (result.messages && result.messages.length > 0) {
                console.warn('Avertissements lors du parsing Word:', result.messages);
            }
            
            return result.value;
        } catch (error) {
            throw new Error(`Erreur lecture fichier Word (.docx): ${error.message}`);
        }
    }

    async parseWordDoc(buffer) {
        try {
            // Pour les anciens formats .doc, mammoth peut aussi fonctionner
            const result = await mammoth.extractRawText({ buffer });
            return result.value;
        } catch (error) {
            throw new Error(`Erreur lecture fichier Word (.doc): ${error.message}. Essayez de sauvegarder en .docx`);
        }
    }

    async parsePDF(buffer) {
        try {
            const data = await pdfParse(buffer, {
                // Options pour améliorer l'extraction
                max: 0, // Pas de limite de pages
                version: 'v1.10.100'
            });
            
            if (!data.text || data.text.trim().length === 0) {
                throw new Error('Le PDF semble vide ou contient uniquement des images');
            }
            
            console.log(`📊 PDF info: ${data.numpages} pages, ${data.numrender} éléments rendus`);
            
            return data.text;
        } catch (error) {
            throw new Error(`Erreur lecture fichier PDF: ${error.message}`);
        }
    }

    cleanContent(content) {
        if (!content) return '';
        
        return content
            // Supprime les caractères de contrôle sauf les sauts de ligne et tabulations
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
            // Normalise les sauts de ligne
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            // Supprime les espaces en fin de ligne
            .replace(/[ \t]+$/gm, '')
            // Limite les sauts de ligne multiples à maximum 2
            .replace(/\n{3,}/g, '\n\n')
            // Supprime les espaces multiples
            .replace(/[ \t]{2,}/g, ' ')
            // Trim général
            .trim();
    }

    getFileExtension(filename) {
        if (!filename) return '';
        const parts = filename.toLowerCase().split('.');
        return parts.length > 1 ? parts.pop() : '';
    }

    countWords(text) {
        if (!text) return 0;
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    // Méthode pour valider un fichier avant parsing
    validateFile(file) {
        const errors = [];
        
        if (!file) {
            errors.push('Aucun fichier fourni');
            return errors;
        }
        
        if (!file.originalname) {
            errors.push('Nom de fichier manquant');
        }
        
        const extension = this.getFileExtension(file.originalname);
        if (!this.supportedFormats.includes(extension)) {
            errors.push(`Format non supporté: .${extension}. Formats acceptés: ${this.supportedFormats.join(', ')}`);
        }
        
        if (file.size > this.maxFileSize) {
            errors.push(`Fichier trop volumineux: ${Math.round(file.size / (1024 * 1024))}MB. Maximum: ${this.maxFileSize / (1024 * 1024)}MB`);
        }
        
        return errors;
    }

    // Méthode pour obtenir des informations sur un fichier
    getFileInfo(file) {
        const extension = this.getFileExtension(file.originalname);
        
        return {
            name: file.originalname,
            extension: extension,
            size: file.size,
            sizeFormatted: this.formatFileSize(file.size),
            type: this.getFileType(extension),
            supported: this.supportedFormats.includes(extension)
        };
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getFileType(extension) {
        const types = {
            'txt': 'Fichier texte',
            'pdf': 'Document PDF',
            'doc': 'Document Word (ancien format)',
            'docx': 'Document Word'
        };
        
        return types[extension] || 'Format inconnu';
    }
}

module.exports = FileParser;