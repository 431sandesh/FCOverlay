// overlay.js - OBS Broadcast Stream Overlay Sync Controller

document.addEventListener('DOMContentLoaded', () => {

    // ── GET USER ID FROM URL (?uid=5) ─────────────────────────
    // OBS opens: https://bhakundofx.up.railway.app/overlay.html?uid=5
    const urlParams = new URLSearchParams(window.location.search);
    const OVERLAY_UID = urlParams.get('uid'); // null if opened in same browser

    // Core database keys mapping (shared from db.js)
    const DB_KEYS = {
        DATABASE: 'bfx_database',
        MATCH_STATE: 'bfx_match_state',
        OVERLAY_CONFIG: 'bfx_overlay_config',
        OVERLAY_TRIGGER: 'bfx_overlay_trigger'
    };

    // ── REAL-TIME SYNC ────────────────────────────────────────
    // Two polling methods run together:
    // 1. localStorage poll — works when control + overlay in same browser
    // 2. Server poll — works in OBS (different browser, uses ?uid= param)

    let lastMatchStateStr = '';
    let lastTriggerStr = '';

    // Method 1: Poll localStorage directly every second
    // Catches changes even when storage events don't fire (same window)
    function pollLocalStorage() {
        try {
            const state = DB.getMatchState();
            const stateStr = JSON.stringify(state);
            if (stateStr !== lastMatchStateStr) {
                lastMatchStateStr = stateStr;
                loadBroadcastStateGraphics();
            }

            // Check for overlay trigger events (goals, cards etc)
            const trigger = DB.getLatestTrigger();
            if (trigger) {
                const trigStr = JSON.stringify(trigger);
                if (trigStr !== lastTriggerStr) {
                    lastTriggerStr = trigStr;
                    processLiveBroadcastAnnouncements(trigger);
                }
            }
        } catch(e) {}
    }

    // Method 2: Poll server when opened with ?uid= (OBS browser source)
    async function pollServer() {
        if (!OVERLAY_UID) return;
        try {
            const res = await fetch('/api/public/match/' + OVERLAY_UID);
            const json = await res.json();
            if (!json.data) return;
            const newStr = JSON.stringify(json.data);
            if (newStr !== lastMatchStateStr) {
                lastMatchStateStr = newStr;
                localStorage.setItem(DB_KEYS.MATCH_STATE, newStr);
                loadBroadcastStateGraphics();
            }
        } catch(e) {}
    }

    // Start both pollers
    setInterval(pollLocalStorage, 1000);  // 1s for same-browser
    if (OVERLAY_UID) {
        pollServer();
        setInterval(pollServer, 1500);    // 1.5s for OBS
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
        document.getElementById('obs-lbl-clock').textContent = DB.formatMatchTime(state.currentTime);
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
        } else if (state.activeGraphic === 'playerDisplay') {
            renderPlayerDisplayCard(state);
        } else if (state.activeGraphic === 'penalty' || state.activeGraphic === 'penaltyTaker') {
            renderPenaltyShootout(state);
        }

        // Player Display card visibility
        const pdCard = document.getElementById('obs-player-display-card');
        if (pdCard) {
            if (state.activeGraphic === 'playerDisplay' && state.playerDisplay?.active) {
                pdCard.classList.add('active');
            } else {
                pdCard.classList.remove('active');
            }
        }

        // Penalty scoreboard card visibility (always show during penalty/penaltyTaker)
        const pkCard = document.getElementById('obs-penalty-card');
        if (pkCard) {
            if (state.activeGraphic === 'penalty' || state.activeGraphic === 'penaltyTaker') {
                pkCard.style.opacity = '1';
                pkCard.style.transform = 'translate(-50%,-50%) scale(1)';
                pkCard.style.pointerEvents = 'auto';
            } else {
                pkCard.style.opacity = '0';
                pkCard.style.transform = 'translate(-50%,-50%) scale(0.9)';
                pkCard.style.pointerEvents = 'none';
            }
        }

        // Penalty taker "preparing" preview card
        const takerCard = document.getElementById('obs-pk-taker-card');
        if (takerCard) {
            const tp = state.penaltyTakerPreview;
            if (state.activeGraphic === 'penaltyTaker' && tp) {
                document.getElementById('obs-pk-taker-name').textContent = '#' + (tp.number||'') + ' ' + (tp.name||'');
                document.getElementById('obs-pk-taker-team').textContent = tp.teamName || '';
                const photoEl = document.getElementById('obs-pk-taker-photo');
                photoEl.innerHTML = tp.photoUrl ? `<img src="${tp.photoUrl}" style="width:100%;height:100%;object-fit:cover;">` : '';
                takerCard.style.opacity = '1';
                takerCard.style.transform = 'translateX(-50%) translateY(0)';
                takerCard.style.pointerEvents = 'auto';
            } else {
                takerCard.style.opacity = '0';
                takerCard.style.transform = 'translateX(-50%) translateY(40px)';
                takerCard.style.pointerEvents = 'none';
            }
        }

        // Penalty result announcement (Goal! / Missed!)
        const resultCard = document.getElementById('obs-pk-result-card');
        if (resultCard) {
            const ra = state.penaltyResultAnnounce;
            const isNew = ra && ra.ts && ra.ts !== lastPenaltyResultTs;
            if (isNew) {
                lastPenaltyResultTs = ra.ts;
                const isGoal = ra.result === 'goal';
                resultCard.style.background = isGoal
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(15,23,42,0.97))'
                    : 'linear-gradient(135deg, rgba(239,68,68,0.25), rgba(15,23,42,0.97))';
                resultCard.style.border = isGoal ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(239,68,68,0.5)';
                document.getElementById('obs-pk-result-icon').textContent = isGoal ? '⚽ GOAL!' : '❌ MISSED!';
                document.getElementById('obs-pk-result-icon').style.color = isGoal ? '#10b981' : '#ef4444';
                document.getElementById('obs-pk-result-photo').innerHTML = ra.photoUrl
                    ? `<img src="${ra.photoUrl}" style="width:100%;height:100%;object-fit:cover;">` : '';
                document.getElementById('obs-pk-result-text').textContent =
                    `${ra.name} from ${ra.teamName} ${isGoal ? 'scored' : 'missed'} the penalty!`;

                // Show then auto-hide after 3.5s
                resultCard.style.opacity = '1';
                resultCard.style.transform = 'translate(-50%,-50%) scale(1)';
                resultCard.style.pointerEvents = 'auto';
                clearTimeout(window._pkResultTimeout);
                window._pkResultTimeout = setTimeout(() => {
                    resultCard.style.opacity = '0';
                    resultCard.style.transform = 'translate(-50%,-50%) scale(0.85)';
                    resultCard.style.pointerEvents = 'none';
                }, 3500);
            }
        }
    };

    let lastPenaltyResultTs = null;

    // Penalty Shootout Renderer — 2 columns, expands for sudden death
    const renderPenaltyShootout = (state) => {
        const p = state.penalties;
        if (!p) return;

        document.getElementById('obs-pk-team-a').textContent = state.teamA?.name || 'Home';
        document.getElementById('obs-pk-team-b').textContent = state.teamB?.name || 'Away';

        const scoreA = p.roundsA.filter(r => r && r.result === 'goal').length;
        const scoreB = p.roundsB.filter(r => r && r.result === 'goal').length;
        document.getElementById('obs-pk-score').textContent = scoreA + ' — ' + scoreB;

        const maxRounds = Math.max(5, p.roundsA.length, p.roundsB.length);
        const colA = document.getElementById('obs-pk-rounds-a');
        const colB = document.getElementById('obs-pk-rounds-b');
        colA.innerHTML = ''; colB.innerHTML = '';

        const renderIcon = (entry) => {
            if (!entry) {
                // Empty pending slot — grey circle outline
                return `<div style="width:32px;height:32px;border-radius:50%;border:2px dashed rgba(255,255,255,0.2);flex-shrink:0;"></div>`;
            }
            if (entry.result === 'goal') {
                // Green ball
                return `<div style="width:32px;height:32px;border-radius:50%;background:#10b981;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;box-shadow:0 0 10px rgba(16,185,129,0.5);">⚽</div>`;
            }
            // Red goalpost with cross (miss)
            return `<div style="width:32px;height:32px;border-radius:6px;background:rgba(239,68,68,0.2);border:2px solid #ef4444;display:flex;align-items:center;justify-content:center;font-size:0.95rem;flex-shrink:0;color:#ef4444;font-weight:900;box-shadow:0 0 10px rgba(239,68,68,0.4);">✕</div>`;
        };

        for (let i = 0; i < maxRounds; i++) {
            const a = p.roundsA[i], b = p.roundsB[i];
            const rowA = document.createElement('div');
            rowA.style.cssText = 'display:flex;align-items:center;gap:8px;';
            rowA.innerHTML = renderIcon(a) + `<span style="color:#fff;font-size:0.78rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a?.player || ''}</span>`;
            colA.appendChild(rowA);

            const rowB = document.createElement('div');
            rowB.style.cssText = 'display:flex;align-items:center;gap:8px;flex-direction:row-reverse;';
            rowB.innerHTML = renderIcon(b) + `<span style="color:#fff;font-size:0.78rem;flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${b?.player || ''}</span>`;
            colB.appendChild(rowB);
        }

        // Status message
        const n = Math.min(p.roundsA.length, p.roundsB.length);
        let status = '';
        if (n < 5) {
            status = `Round ${Math.max(p.roundsA.length, p.roundsB.length, 1)} of 5`;
        } else if (scoreA !== scoreB) {
            status = `🏆 ${scoreA > scoreB ? (state.teamA?.name||'Home') : (state.teamB?.name||'Away')} WIN!`;
        } else {
            status = 'SUDDEN DEATH';
        }
        document.getElementById('obs-pk-status').textContent = status;
    };

    // Player Display Card Populator (MVP / Best GK / Hat-trick etc)
    const renderPlayerDisplayCard = (state) => {
        const pd = state.playerDisplay;
        if (!pd || !pd.active) return;
        const card = document.getElementById('obs-player-display-card');
        if (!card) return;

        document.getElementById('obs-pd-award').textContent = pd.award || 'Featured Player';
        document.getElementById('obs-pd-name').textContent = pd.playerName || '';
        document.getElementById('obs-pd-details').textContent =
            `${pd.teamName || ''} • #${pd.playerNumber || ''} • ${pd.playerPosition || ''}`;
        const photoEl = document.getElementById('obs-pd-photo');
        if (photoEl && pd.photoUrl) {
            photoEl.innerHTML = `<img src="${pd.photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
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
    // Storage events work when control + overlay open in SAME browser
    // For OBS (different browser), server polling above handles updates
    window.addEventListener('storage', (e) => {
        if (!e.key) return;
        if (e.key.includes('overlay_config') || e.key === DB_KEYS.OVERLAY_CONFIG) {
            loadOverlayCustomizerStyles();
        } else if (e.key.includes('match_state') || e.key === DB_KEYS.MATCH_STATE) {
            loadBroadcastStateGraphics();
        } else if (e.key.includes('overlay_trigger') || e.key === DB_KEYS.OVERLAY_TRIGGER) {
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
