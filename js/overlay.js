// overlay.js - OBS Broadcast Stream Overlay Sync Controller

document.addEventListener('DOMContentLoaded', () => {
    
    // Core database keys mapping (shared from db.js)
    const DB_KEYS = {
        DATABASE: 'bfx_database',
        MATCH_STATE: 'bfx_match_state',
        OVERLAY_CONFIG: 'bfx_overlay_config',
        OVERLAY_TRIGGER: 'bfx_overlay_trigger'
    };

    // ── FIX: Resolve user namespace so overlay reads the right localStorage keys ──
    // overlay.html has no auth-guard, so BFX_USER must be set manually.
    // Without this, DB reads from 'bfx_guest_*' instead of 'bfx_1_*'
    const urlParams = new URLSearchParams(window.location.search);
    const OVERLAY_UID = urlParams.get('uid');

    if (!window.BFX_USER) {
        if (OVERLAY_UID) {
            window.BFX_USER = { id: OVERLAY_UID }; // OBS mode: ?uid=1
        } else {
            try {
                const stored = localStorage.getItem('bfx_user');
                if (stored) window.BFX_USER = JSON.parse(stored); // Same browser mode
            } catch(e) {}
        }
    }

    // ── SERVER POLLING: Fetch live match state from Railway every 1.5s (for OBS) ──
    let lastServerStr = '';
    let lastTriggerStr = '';

    async function pollServer() {
        if (!OVERLAY_UID) return;
        try {
            const res = await fetch('/api/public/match/' + OVERLAY_UID);
            const json = await res.json();
            if (!json.data) return;
            const newStr = JSON.stringify(json.data);
            if (newStr !== lastServerStr) {
                lastServerStr = newStr;
                // Write to namespaced key so DB.getMatchState() finds it
                const namespacedKey = 'bfx_' + OVERLAY_UID + '_' + DB_KEYS.MATCH_STATE;
                localStorage.setItem(namespacedKey, newStr);
                loadBroadcastStateGraphics();
            }
        } catch(e) {}
    }

    // ── LOCAL POLLING: Check localStorage every second (same browser mode) ──
    let lastLocalStr = '';
    function pollLocal() {
        try {
            const state = DB.getMatchState();
            const str = JSON.stringify(state);
            if (str !== lastLocalStr) {
                lastLocalStr = str;
                loadBroadcastStateGraphics();
            }
            // Also check triggers
            const trigger = DB.getLatestTrigger();
            if (trigger) {
                const tStr = JSON.stringify(trigger);
                if (tStr !== lastTriggerStr) {
                    lastTriggerStr = tStr;
                    processLiveBroadcastAnnouncements(trigger);
                }
            }
        } catch(e) {}
    }

    // Start both pollers
    setInterval(pollLocal, 1000);
    if (OVERLAY_UID) {
        pollServer(); // Immediate first fetch
        setInterval(pollServer, 1500);
    }

    // Cache DOM Overlay Elements
    const bodyEl = document.body;
    const graphicContainer = document.getElementById('obs-graphic-container');
    const obsScoreboard = document.getElementById('obs-scoreboard');
    const obsVsCard = document.getElementById('obs-vs-card');
    const obsLineups = document.getElementById('obs-lineups-board');
    const obsStatsBoard = document.getElementById('obs-stats-board');

    // Announcers
    const obsGoalAnnouncer = document.getElementById('obs-goal-announcer');
    const obsCardAnnouncer = document.getElementById('obs-card-announcer');
    const obsSubAnnouncer = document.getElementById('obs-sub-announcer');

    // -------------------------------------------------------------
    // 1. RENDER OVERLAY STYLE CONFIGURATION
    // -------------------------------------------------------------
    const loadOverlayCustomizerStyles = () => {
        const config = DB.getOverlayConfig();

        // A. Apply theme class to body
        bodyEl.className = '';
        bodyEl.classList.add('theme-' + config.theme);

        // B. Apply typography font style class
        graphicContainer.className = 'simulated-overlay';
        if (config.fontFamily === 'Space Grotesk') {
            graphicContainer.classList.add('font-grotesk');
        } else if (config.fontFamily === 'Outfit') {
            graphicContainer.classList.add('font-outfit');
        } else if (config.fontFamily === 'Teko') {
            graphicContainer.classList.add('font-teko');
        } else {
            graphicContainer.classList.add('font-mono');
        }

        // C. Apply Scoreboard Alignment
        obsScoreboard.className = 'overlay-scoreboard';
        obsScoreboard.classList.add('pos-' + config.scoreboardPos);

        // D. Apply Global Scale scaling
        const scaleVal = config.overlayScale / 100;
        graphicContainer.style.transform = `scale(${scaleVal})`;
        graphicContainer.style.transformOrigin = 'top left';

        // E. Sync scoreboard active state concurrently
        const matchState = DB.getMatchState();
        if (matchState.activeGraphic === 'scoreboard') {
            obsScoreboard.classList.add('active');
        } else {
            obsScoreboard.classList.remove('active');
        }
    };

    // -------------------------------------------------------------
    // 2. RENDER MATCH STATE GRAPHICAL SLIDES
    // -------------------------------------------------------------
    const loadBroadcastStateGraphics = () => {
        const state = DB.getMatchState();
        if (!state || !state.teamA || !state.teamB) return;

        // A. Render Top Scoreboard Ribbon Values
        document.getElementById('obs-lbl-team-a').textContent = state.teamA.shortName;
        document.getElementById('obs-lbl-team-b').textContent = state.teamB.shortName;
        document.getElementById('obs-lbl-score-a').textContent = state.scoreA;
        document.getElementById('obs-lbl-score-b').textContent = state.scoreB;
        document.getElementById('obs-lbl-clock').textContent = state.clockDisplay || DB.formatMatchTime(state.currentTime || 0);
        document.getElementById('obs-lbl-half').textContent = (state.currentTime >= state.duration * 60) ? '2ND' : '1ST';

        document.getElementById('obs-crest-a').style.background = state.teamA.primaryColor;
        document.getElementById('obs-crest-b').style.background = state.teamB.primaryColor;

        // B. Dynamic Graphics Slide Switcher
        // Turn off all layouts initially
        obsScoreboard.classList.remove('active');
        obsVsCard.classList.remove('active');
        obsLineups.classList.remove('active');
        obsStatsBoard.classList.remove('active');

        if (state.activeGraphic === 'scoreboard') {
            obsScoreboard.classList.add('active');
        } else if (state.activeGraphic === 'vs') {
            obsVsCard.classList.add('active');
            renderVsMatchupPlate(state);
        } else if (state.activeGraphic === 'lineups') {
            obsLineups.classList.add('active');
            renderSquadLineupsBoard(state);
        } else if (state.activeGraphic === 'stats') {
            obsStatsBoard.classList.add('active');
            renderComparativeStatsBoard(state);
        }
    };

    // C. VS Plate Details Populator
    const renderVsMatchupPlate = (state) => {
        const db = DB.getDb();
        const tournament = db.tournaments.find(t => t.id === state.tournamentId);
        if (tournament) {
            const tLogo = DB.getTournamentLogo(tournament);
            document.getElementById('obs-vs-t-logo').innerHTML = `<img src="${tLogo}" style="width:100%; height:100%; object-fit:cover;"/>`;
        } else {
            document.getElementById('obs-vs-t-logo').innerHTML = '';
        }

        document.getElementById('obs-vs-name-a').textContent = state.teamA.name;
        document.getElementById('obs-vs-name-b').textContent = state.teamB.name;
        document.getElementById('obs-vs-badge-a').innerHTML = `<img src="${DB.getTeamLogo(state.teamA)}" style="width:100%; height:100%; object-fit:contain;"/>`;
        document.getElementById('obs-vs-badge-b').innerHTML = `<img src="${DB.getTeamLogo(state.teamB)}" style="width:100%; height:100%; object-fit:contain;"/>`;
        
        document.getElementById('obs-vs-stadium').textContent = state.stadium || 'Santiago Bernabéu';
        document.getElementById('obs-vs-casters').textContent = state.casters || 'TBD Commentators';
        document.getElementById('obs-vs-referee').textContent = state.referee || 'Szymon Marciniak';
    };

    // D. Squad Lineup Lists Renderer
    const renderSquadLineupsBoard = (state) => {
        // Headers & colors
        document.getElementById('obs-lineup-title-a').textContent = state.teamA.name;
        document.getElementById('obs-lineup-coach-a').textContent = `Coach: ${state.teamA.coach.name}`;
        document.getElementById('obs-lineup-badge-a').innerHTML = `<img src="${DB.getTeamLogo(state.teamA)}" style="width:100%; height:100%; object-fit:contain;"/>`;
        document.getElementById('obs-lineup-col-a').style.setProperty('--team-color', state.teamA.primaryColor);

        document.getElementById('obs-lineup-title-b').textContent = state.teamB.name;
        document.getElementById('obs-lineup-coach-b').textContent = `Coach: ${state.teamB.coach.name}`;
        document.getElementById('obs-lineup-badge-b').innerHTML = `<img src="${DB.getTeamLogo(state.teamB)}" style="width:100%; height:100%; object-fit:contain;"/>`;
        document.getElementById('obs-lineup-col-b').style.setProperty('--team-color', state.teamB.primaryColor);

        // Fetch squad players rosters ordered by position GK -> DF -> MF -> FW
        const listA = document.getElementById('obs-lineup-list-a');
        const listB = document.getElementById('obs-lineup-list-b');

        listA.innerHTML = '';
        listB.innerHTML = '';

        const orderPos = { GK: 1, DF: 2, MF: 3, FW: 4 };
        const sortSquad = (x, y) => orderPos[x.position] - orderPos[y.position];

        const playersA = DB.getPlayers(state.teamA.id).sort(sortSquad);
        const playersB = DB.getPlayers(state.teamB.id).sort(sortSquad);

        playersA.forEach(p => {
            listA.innerHTML += `
                <li class="overlay-lineup-item">
                    <span class="overlay-lineup-num">${p.number}</span>
                    <span class="overlay-lineup-name">${p.name}</span>
                    <span class="overlay-lineup-pos">${p.position}</span>
                </li>
            `;
        });

        playersB.forEach(p => {
            listB.innerHTML += `
                <li class="overlay-lineup-item">
                    <span class="overlay-lineup-num">${p.number}</span>
                    <span class="overlay-lineup-name">${p.name}</span>
                    <span class="overlay-lineup-pos">${p.position}</span>
                </li>
            `;
        });
    };

    // E. Comparative Stats board chart bars populator
    const renderComparativeStatsBoard = (state) => {
        const listContainer = document.getElementById('obs-stats-rows-list');
        listContainer.innerHTML = '';

        const db = DB.getDb();
        const tournament = db.tournaments.find(t => t.id === state.tournamentId);
        document.getElementById('obs-stats-subheading').textContent = tournament ? tournament.name : 'Champions Elite League';

        // Dynamic comparative variables mapping
        const statsMap = [
            { name: 'Goals Scored', a: state.scoreA, b: state.scoreB },
            { name: 'Total Shots', a: state.stats.shotsA, b: state.stats.shotsB },
            { name: 'Shots On Target', a: state.stats.sotA, b: state.stats.sotB },
            { name: 'Fouls Committed', a: state.stats.foulsA, b: state.stats.foulsB },
            { name: 'Corners Awarded', a: state.stats.cornersA, b: state.stats.cornersB },
            { name: 'Offsides Flagged', a: state.stats.offsidesA, b: state.stats.offsidesB },
            { name: 'Yellow Cards', a: state.stats.ycA, b: state.stats.ycB },
            { name: 'Red Cards', a: state.stats.rcA, b: state.stats.rcB }
        ];

        statsMap.forEach(item => {
            const sum = item.a + item.b;
            let percentA = 50;
            let percentB = 50;

            if (sum > 0) {
                percentA = (item.a / sum) * 100;
                percentB = (item.b / sum) * 100;
            } else {
                percentA = 0;
                percentB = 0;
            }

            const row = document.createElement('div');
            row.className = 'overlay-stat-row';
            row.style.setProperty('--color-left', state.teamA.primaryColor);
            row.style.setProperty('--color-right', state.teamB.primaryColor);

            row.innerHTML = `
                <div class="overlay-stat-labels">
                    <span style="font-family: var(--font-display); font-weight:700;">${item.a}</span>
                    <span class="overlay-stat-name">${item.name}</span>
                    <span style="font-family: var(--font-display); font-weight:700;">${item.b}</span>
                </div>
                <div class="overlay-stat-bar-container">
                    <div class="overlay-stat-bar-left" style="width: ${percentA}%;"></div>
                    <div class="overlay-stat-bar-right" style="width: ${percentB}%;"></div>
                </div>
            `;

            listContainer.appendChild(row);
        });
    };

    // -------------------------------------------------------------
    // 3. REAL-TIME STORAGE EVENTS SYNC PROCESSOR
    // -------------------------------------------------------------
    window.addEventListener('storage', (e) => {
        if (!e.key) return;
        // Handle both namespaced (bfx_1_bfx_match_state) and plain keys
        if (e.key.includes('overlay_config')) {
            loadOverlayCustomizerStyles();
        } else if (e.key.includes('match_state')) {
            loadBroadcastStateGraphics();
        } else if (e.key.includes('overlay_trigger')) {
            const trigger = DB.getLatestTrigger();
            if (trigger) processLiveBroadcastAnnouncements(trigger);
        }
    });

    // -------------------------------------------------------------
    // 4. ANNOUNCERS: GOALS & CARDS POPUPS PLAYERS ENGINE
    // -------------------------------------------------------------
    let activeGoalTimer = null;
    let activeCardTimer = null;
    let activeSubTimer = null;

    const processLiveBroadcastAnnouncements = (trigger) => {
        const payload = trigger.payload;

        if (trigger.type === 'goal') {
            // ⚽ GOAL SPLASH ANNOUNCEMENT
            if (activeGoalTimer) clearTimeout(activeGoalTimer);

            // Pop goal celebratory sound
            try {
                // Generates high pitch whistle or audio
                const hornAudio = new Audio('data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
                hornAudio.play();
            } catch(e) {}

            document.getElementById('obs-goal-photo').innerHTML = `<img src="${payload.photo}" style="width:100%; height:100%;" />`;
            document.getElementById('obs-goal-name').textContent = payload.player;
            document.getElementById('obs-goal-details').textContent = `${payload.teamName} • Squad #${payload.number} (${payload.minute}')`;

            // Entrance Slide Up keyframes
            obsGoalAnnouncer.style.display = 'flex';
            setTimeout(() => {
                obsGoalAnnouncer.classList.add('active');
            }, 50);

            // Close goal card after 6 seconds
            activeGoalTimer = setTimeout(() => {
                obsGoalAnnouncer.classList.remove('active');
                setTimeout(() => {
                    obsGoalAnnouncer.style.display = 'none';
                }, 500);
            }, 6000);

        } else if (trigger.type === 'yellow_card' || trigger.type === 'red_card') {
            // 🟨🟥 CARD PENALTIES ANNOUNCEMENT
            if (activeCardTimer) clearTimeout(activeCardTimer);

            const isRed = trigger.type === 'red_card';
            const titleBox = document.getElementById('obs-card-title');
            
            titleBox.textContent = isRed ? 'RED CARD 🟥' : 'YELLOW CARD 🟨';
            titleBox.style.color = isRed ? 'var(--color-red)' : 'var(--color-yellow)';

            obsCardAnnouncer.className = 'announcer-card';
            obsCardAnnouncer.classList.add(isRed ? 'announcer-red-card' : 'announcer-yellow-card');

            document.getElementById('obs-card-photo').innerHTML = `<img src="${payload.photo}" style="width:100%; height:100%;" />`;
            document.getElementById('obs-card-name').textContent = payload.player;
            document.getElementById('obs-card-details').textContent = `Squad #${payload.number} (${payload.minute}')`;

            obsCardAnnouncer.style.display = 'flex';
            setTimeout(() => {
                obsCardAnnouncer.classList.add('active');
            }, 50);

            activeCardTimer = setTimeout(() => {
                obsCardAnnouncer.classList.remove('active');
                setTimeout(() => {
                    obsCardAnnouncer.style.display = 'none';
                }, 500);
            }, 5000);

        } else if (trigger.type === 'substitution') {
            // 🔄 SUBSTITUTION PANEL ANNOUNCEMENT
            if (activeSubTimer) clearTimeout(activeSubTimer);

            document.getElementById('obs-sub-photo').innerHTML = `<img src="${payload.photoIn}" style="width:100%; height:100%;" />`;
            document.getElementById('obs-sub-name-in').innerHTML = `🔄 ${payload.playerIn} (IN)`;
            document.getElementById('obs-sub-name-out').innerHTML = `Out: <span style="color:#fca5a5;">${payload.playerOut}</span>`;

            obsSubAnnouncer.style.display = 'flex';
            setTimeout(() => {
                obsSubAnnouncer.classList.add('active');
            }, 50);

            activeSubTimer = setTimeout(() => {
                obsSubAnnouncer.classList.remove('active');
                setTimeout(() => {
                    obsSubAnnouncer.style.display = 'none';
                }, 500);
            }, 5000);
        }
    };

    // -------------------------------------------------------------
    // INITIAL LOAD RENDERS
    // -------------------------------------------------------------
    loadOverlayCustomizerStyles();
    loadBroadcastStateGraphics();
});
