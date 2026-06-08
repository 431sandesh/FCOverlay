const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (css, js, assets)
app.use(express.static(path.join(__dirname)));

// Redirect /index.html → / (clean URL)
app.get('/index.html', (req, res) => res.redirect(301, '/'));

// Clean URLs for all pages (optional: /control instead of /control.html)
app.get('/control',   (req, res) => res.sendFile(path.join(__dirname, 'control.html')));
app.get('/setup',     (req, res) => res.sendFile(path.join(__dirname, 'setup.html')));
app.get('/customize', (req, res) => res.sendFile(path.join(__dirname, 'customize.html')));
app.get('/overlay',   (req, res) => res.sendFile(path.join(__dirname, 'overlay.html')));

// Root → index.html
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Future backend routes go here:
// app.get('/api/match', (req, res) => { res.json({ status: 'ok' }) });

app.listen(PORT, () => {
    console.log(`BhakundoFX running on port ${PORT}`);
});
