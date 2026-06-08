// customize.js - Overlay Customization & Simulation Controls

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------
    // 1. INITIALIZE & PERSIST SETUP DATA
    // -------------------------------------------------------------
    let config = DB.getOverlayConfig();

    // Cache DOM inputs
    const themeCards = document.querySelectorAll('.theme-card');
    const selectFont = document.getElementById('select-overlay-font');
    const selectScorePos = document.getElementById('select-scoreboard-pos');
    const rangeScale = document.getElementById('input-overlay-scale');
    const lblScalePercent = document.getElementById('lbl-scale-percent');

    // Cache simulator elements
    const simulationViewport = document.getElementById('simulation-viewport');
    const overlayLayer = document.getElementById('simulator-overlay-layer');
    const mockScoreboard = document.getElementById('mock-scoreboard');
    const mockVsCard = document.getElementById('mock-vs-card');
    const mockGoalAlert = document.getElementById('mock-goal-alert');
    const mockCardAlert = document.getElementById('mock-card-alert');

    // Roster targets for preview icons
    const db = DB.getDb();
    const teamA = db.teams[0]; // Real Madrid
    const teamB = db.teams[1]; // Man City
    const playerVini = db.players.find(p => p.name.includes('Vinicius'));
    const playerRodri = db.players.find(p => p.name.includes('Rodri'));

    // Render Vector Badges / Headshots in Mock widgets
    if (teamA && teamB) {
        document.getElementById('mock-badge-a').innerHTML = `<img src="${DB.getTeamLogo(teamA)}" style="width:100%; height:100%; object-fit:contain;"/>`;
        document.getElementById('mock-badge-b').innerHTML = `<img src="${DB.getTeamLogo(teamB)}" style="width:100%; height:100%; object-fit:contain;"/>`;
    }
    
    if (playerVini && teamA) {
        document.getElementById('mock-goal-photo').innerHTML = `<img src="${DB.getPlayerAvatar(playerVini, teamA)}" style="width:100%; height:100%;"/>`;
    }
    if (playerRodri && teamB) {
        document.getElementById('mock-card-photo').innerHTML = `<img src="${DB.getPlayerAvatar(playerRodri, teamB)}" style="width:100%; height:100%;"/>`;
    }

    // Apply config changes to UI inputs
    const applyConfigToInputs = () => {
        // Theme selection
        themeCards.forEach(card => {
            if (card.dataset.theme === config.theme) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });

        // Font
        selectFont.value = config.fontFamily;

        // Position
        selectScorePos.value = config.scoreboardPos;

        // Scale
        rangeScale.value = config.overlayScale;
        lblScalePercent.textContent = config.overlayScale + '%';
    };

    // Apply config changes in Real Time to the simulator viewport
    const applyConfigToSimulator = () => {
        // 1. Apply Theme
        // Clear all theme classes from document body so customizer styles update
        document.body.className = '';
        document.body.classList.add('theme-' + config.theme);

        // 2. Apply Font style class
        // Map Google Fonts to style.css helper classes
        overlayLayer.className = 'simulated-overlay';
        if (config.fontFamily === 'Space Grotesk') {
            overlayLayer.classList.add('font-grotesk');
        } else if (config.fontFamily === 'Outfit') {
            overlayLayer.classList.add('font-outfit');
        } else if (config.fontFamily === 'Teko') {
            overlayLayer.classList.add('font-teko');
        } else {
            overlayLayer.classList.add('font-mono');
        }

        // 3. Apply Scoreboard Alignment
        mockScoreboard.className = 'preview-scoreboard-mock';
        if (config.scoreboardPos === 'top-center') {
            mockScoreboard.style.top = '20px';
            mockScoreboard.style.left = '50%';
            mockScoreboard.style.right = 'auto';
            mockScoreboard.style.transform = 'translateX(-50%)';
        } else if (config.scoreboardPos === 'top-left') {
            mockScoreboard.style.top = '20px';
            mockScoreboard.style.left = '20px';
            mockScoreboard.style.right = 'auto';
            mockScoreboard.style.transform = 'none';
        } else {
            mockScoreboard.style.top = '20px';
            mockScoreboard.style.left = 'auto';
            mockScoreboard.style.right = '20px';
            mockScoreboard.style.transform = 'none';
        }

        // 4. Apply Scaling
        const scaleVal = config.overlayScale / 100;
        overlayLayer.style.transform = `scale(${scaleVal})`;
    };

    // Save overlay values to Local Storage database
    const saveConfig = () => {
        DB.saveOverlayConfig(config);
        applyConfigToSimulator();
        
        // Push a config synchronizer notify to active streams!
        DB.triggerOverlayAnimation('config_update', config);
    };

    // -------------------------------------------------------------
    // 2. EVENT INPUT CHANGE LISTENERS
    // -------------------------------------------------------------

    // Themes
    themeCards.forEach(card => {
        card.addEventListener('click', () => {
            themeCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            
            config.theme = card.dataset.theme;
            saveConfig();
        });
    });

    // Fonts
    selectFont.addEventListener('change', () => {
        config.fontFamily = selectFont.value;
        saveConfig();
    });

    // Scoreboard placement
    selectScorePos.addEventListener('change', () => {
        config.scoreboardPos = selectScorePos.value;
        saveConfig();
    });

    // Widget sizing slider
    rangeScale.addEventListener('input', () => {
        config.overlayScale = parseInt(rangeScale.value);
        lblScalePercent.textContent = config.overlayScale + '%';
        saveConfig();
    });

    // -------------------------------------------------------------
    // 3. SIMULATOR TRIGGERS EVENT LOGIC
    // -------------------------------------------------------------
    let goalTimeout = null;
    let cardTimeout = null;

    // A. Toggle Scoreboard mockup
    document.getElementById('btn-sim-scoreboard').addEventListener('click', (e) => {
        const btn = e.target;
        if (mockScoreboard.style.display !== 'none') {
            mockScoreboard.style.display = 'none';
            btn.classList.add('btn-secondary');
            btn.classList.remove('btn-primary');
        } else {
            mockScoreboard.style.display = 'flex';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary');
        }
    });

    // B. Toggle Match VS matchup banner
    document.getElementById('btn-sim-vs').addEventListener('click', (e) => {
        const btn = e.target;
        if (mockVsCard.style.display !== 'none') {
            mockVsCard.style.display = 'none';
            btn.classList.add('btn-secondary');
            btn.classList.remove('btn-primary');
        } else {
            mockVsCard.style.display = 'flex';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary');
        }
    });

    // C. Trigger Simulated Goal Banner
    document.getElementById('btn-sim-goal').addEventListener('click', () => {
        // Clear any active goal timers
        if (goalTimeout) clearTimeout(goalTimeout);

        // Reset display
        mockGoalAlert.style.display = 'flex';
        // Add active keyframe class
        mockGoalAlert.style.opacity = '1';
        mockGoalAlert.style.transform = 'translateY(0) scale(1)';

        // Auto collapse alert banner after 3.5s
        goalTimeout = setTimeout(() => {
            mockGoalAlert.style.opacity = '0';
            mockGoalAlert.style.transform = 'translateY(40px) scale(0.9)';
            setTimeout(() => {
                mockGoalAlert.style.display = 'none';
            }, 500);
        }, 3500);
    });

    // D. Trigger Simulated Yellow Card
    document.getElementById('btn-sim-card').addEventListener('click', () => {
        if (cardTimeout) clearTimeout(cardTimeout);

        mockCardAlert.style.display = 'flex';
        mockCardAlert.style.opacity = '1';
        mockCardAlert.style.transform = 'translateY(0) scale(1)';

        cardTimeout = setTimeout(() => {
            mockCardAlert.style.opacity = '0';
            mockCardAlert.style.transform = 'translateY(40px) scale(0.9)';
            setTimeout(() => {
                mockCardAlert.style.display = 'none';
            }, 500);
        }, 3500);
    });

    // Initial render call
    applyConfigToInputs();
    applyConfigToSimulator();
});
