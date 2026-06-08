const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve all static files
app.use(express.static(path.join(__dirname)));

// Future backend routes go here:
// app.get('/api/match', (req, res) => { res.json({ status: 'ok' }) });

app.listen(PORT, () => {
    console.log(`BhakundoFX running on port ${PORT}`);
});
