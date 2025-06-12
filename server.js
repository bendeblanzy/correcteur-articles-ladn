const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const correctionRoutes = require('./routes/correction');
const correctionSSERoutes = require('./routes/correctionSSE');
const fileRoutes = require('./routes/files');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Routes API
app.use('/api/correction', correctionRoutes);
app.use('/api/correction-sse', correctionSSERoutes);
app.use('/api/files', fileRoutes);

// Servir le frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
    console.error('Erreur serveur:', err.stack);
    res.status(500).json({ error: 'Erreur interne du serveur' });
});

app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📱 Application disponible sur: http://localhost:${PORT}`);
});