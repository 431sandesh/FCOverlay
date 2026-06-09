// control.js - Live Stream Match Control Center Logic

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------
    // WIZARD NAVIGATION & STATE LAYER
    // -------------------------------------------------------------
    let currentStep = 1;
    let matchState = DB.getMatchState();
    let selectedTournamentId = '';
    let selectedTeamA = null;
    let selectedTeamB = null;

    // Cache wizard steps
    const wizardContainer = document.getElementById('match-wizard-container');
    const liveDashboard = document.getElementById('live-dashboard-container');
    const step1 = document.getElementById('wiz-step-1');
    const step2 = document.getElementById('wiz-step-2');
    const step3 = document.getElementById('wiz-step-3');
    const step4 = document.getElementById('wiz-step-4');

    const stepNodes = [
        document.getElementById('step-node-1'),
        document.getElementById('step-node-2'),
        document.getElementById('step-node-3'),
        document.getElementById('step-node-4')
    ];

    const wizTitle = document.getElementById('wizard-title');
    const wizSubtitle = document.getElementById('wizard-subtitle');

    // Cache Live Board elements
    const lblLiveTimer = document.getElementById('lbl-live-timer');
    const lblClockHalf = document.getElementById('lbl-clock-half');
    const btnClockPlay = document.getElementById('btn-clock-play');
    const btnClockPause = document.getElementById('btn-clock-pause');
    const timelineFeed = document.getElementById('timeline-event-feed-list');

    // -------------------------------------------------------------
    // WIZARD: STEP 1 - CHOOSE TOURNAMENT
    // -------------------------------------------------------------
    const initWizard = () => {
        const tSelect = document.getElementById('wiz-select-tournament');
        tSelect.innerHTML = '';
        
        const tournaments = DB.getTournaments();
        if (tournaments.length === 0) {
            tSelect.innerHTML = `<option value="">-- No tournaments found, please add in setup first --</option>`;
            document.getElementById('btn-wiz-next-1').disabled = true;
            return;
        }

        tournaments.forEach(t => {
            tSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`;
        });

        selectedTournamentId = tSelect.value;
        loadTeamsForMatchup();

        tSelect.addEventListener('change', () => {
            selectedTournamentId = tSelect.value;
            loadTeamsForMatchup();
        });
    };

    const loadTeamsForMatchup = () => {
        const teamSelectA = document.getElementById('wiz-select-team-a');
        const teamSelectB = document.getElementById('wiz-select-team-b');
        teamSelectA.innerHTML = '';
        teamSelectB.innerHTML = '';

        const teams = DB.getTeams(selectedTournamentId);
        if (teams.length < 2) {
            teamSelectA.innerHTML = `<option value="">-- Requires at least 2 clubs --</option>`;
            teamSelectB.innerHTML = `<option value="">-- Setup teams first --</option>`;
            document.getElementById('btn-wiz-next-2').disabled = true;
            return;
        } else {
            document.getElementById('btn-wiz-next-2').disabled = false;
        }

        teams.forEach(team => {
            teamSelectA.innerHTML += `<option value="${team.id}">${team.name} (${team.shortName})</option>`;
            teamSelectB.innerHTML += `<option value="${team.id}">${team.name} (${team.shortName})</option>`;
        });

        // Set different defaults
        if (teamSelectB.options.length > 1) {
            teamSelectB.selectedIndex = 1;
        }
    };

    // Step navigation progressor
    const gotoStep = (stepNum) => {
        currentStep = stepNum;
        
        // Hide all screens
        step1.style.display = 'none';
        step2.style.display = 'none';
        step3.style.display = 'none';
        step4.style.display = 'none';

        // Reset step nodes active frames
        stepNodes.forEach((node, idx) => {
            if (idx + 1 === stepNum) {
                node.className = 'wizard-step-node active';
            } else if (idx + 1 < stepNum) {
                node.className = 'wizard-step-node completed';
            } else {
                node.className = 'wizard-step-node';
            }
        });

        if (stepNum === 1) {
            step1.style.display = 'block';
            wizTitle.textContent = "League Tournament Selector";
            wizSubtitle.textContent = "Step 1 of 4: Choose league for live broadcast stream";
        } else if (stepNum === 2) {
            step2.style.display = 'block';
            wizTitle.textContent = "Club Matchup Pairing";
            wizSubtitle.textContent = "Step 2 of 4: Match up Home and Away club teams";
        } else if (stepNum === 3) {
            step3.style.display = 'block';
            wizTitle.textContent = "Match Metadata Details";
            wizSubtitle.textContent = "Step 3 of 4: Provide Stadium, Referees and Casters";
        } else if (stepNum === 4) {
            step4.style.display = 'block';
            wizTitle.textContent = "Pre-Kickoff Stream Control Desk";
            wizSubtitle.textContent = "Step 4 of 4: Prepare OBS scenes and overlays";
            
            // Build the initial match state mapping
            saveSetupStateToDb();
        }
    };

    // Save Setup Inputs to active local storage Match State
    const saveSetupStateToDb = () => {
        const db = DB.getDb();
        const teamAId = document.getElementById('wiz-select-team-a').value;
        const teamBId = document.getElementById('wiz-select-team-b').value;

        selectedTeamA = db.teams.find(t => t.id === teamAId);
        selectedTeamB = db.teams.find(t => t.id === teamBId);

        matchState = {
            ...matchState,
            tournamentId: selectedTournamentId,
            teamA: selectedTeamA,
            teamB: selectedTeamB,
            stadium: document.getElementById('wiz-input-stadium').value,
            referee: document.getElementById('wiz-input-referee').value,
            casters: document.getElementById('wiz-input-casters').value,
            duration: parseInt(document.getElementById('wiz-input-duration').value) || 45,
            status: 'ready',
            currentTime: 0,
            kickoffAt: null,       // timestamp when match started
            totalPausedMs: 0,      // total ms spent paused
            pauseStartAt: null,    // timestamp when current pause began
            scoreA: 0,
            scoreB: 0,
            stats: {
                shotsA: 0, shotsB: 0,
                sotA: 0, sotB: 0,
                foulsA: 0, foulsB: 0,
                cornersA: 0, cornersB: 0,
                offsidesA: 0, offsidesB: 0,
                ycA: 0, ycB: 0,
                rcA: 0, rcB: 0
            },
            timeline: [],
            activeGraphic: 'none',
            timerRunning: false
        };

        DB.saveMatchState(matchState);
    };

    // Wizard Next & Back Buttons
    document.getElementById('btn-wiz-next-1').addEventListener('click', () => gotoStep(2));
    
    document.getElementById('btn-wiz-next-2').addEventListener('click', () => {
        const teamAId = document.getElementById('wiz-select-team-a').value;
        const teamBId = document.getElementById('wiz-select-team-b').value;
        if (teamAId === teamBId) {
            alert("Error: Home and Away clubs must be different! Select another franchise.");
            return;
        }
        gotoStep(3);
    });

    document.getElementById('btn-wiz-back-2').addEventListener('click', () => gotoStep(1));
    document.getElementById('btn-wiz-next-3').addEventListener('click', () => gotoStep(4));
    document.getElementById('btn-wiz-back-3').addEventListener('click', () => gotoStep(2));
    document.getElementById('btn-wiz-back-4').addEventListener('click', () => gotoStep(3));

    // Pre-match intro buttons triggers
    document.querySelectorAll('.btn-prematch-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const graphicType = btn.dataset.graphic;
            
            // Toggle highlight
            if (btn.classList.contains('btn-primary')) {
                btn.classList.replace('btn-primary', 'btn-secondary');
                matchState.activeGraphic = 'none';
            } else {
                document.querySelectorAll('.btn-prematch-toggle').forEach(b => b.classList.replace('btn-primary', 'btn-secondary'));
                btn.classList.replace('btn-secondary', 'btn-primary');
                matchState.activeGraphic = graphicType;
            }
            
            DB.saveMatchState(matchState);
        });
    });

    // -------------------------------------------------------------
    // LIVE BROADCAST ENGINE SWITCHES
    // -------------------------------------------------------------
    let liveClockInterval = null;

    // ─── TIMESTAMP-BASED ELAPSED TIME ──────────────────────────
    // Returns real elapsed seconds based on kickoff timestamp
    // Works even after page close — clock kept by real wall time
    const getElapsedSeconds = () => {
        if (!matchState.kickoffAt) return matchState.currentTime || 0;
        const pausedMs = matchState.totalPausedMs || 0;
        if (!matchState.timerRunning && matchState.pauseStartAt) {
            // Clock is paused — elapsed is frozen at pause moment
            return Math.floor((matchState.pauseStartAt - matchState.kickoffAt - pausedMs) / 1000);
        }
        // Clock is running — calculate from now
        return Math.floor((Date.now() - matchState.kickoffAt - pausedMs) / 1000);
    };

    // Trigger Kickoff whistle start
    document.getElementById('btn-kickoff-action').addEventListener('click', () => {
        // Play Referee whistle sound
        try {
            const whistleAudio = new Audio('data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
            whistleAudio.play();
        } catch(e) {}

        // Set match active
        matchState.status = 'live';
        matchState.timerRunning = true;
        matchState.kickoffAt = matchState.kickoffAt || Date.now(); // set once
        matchState.totalPausedMs = matchState.totalPausedMs || 0;
        matchState.pauseStartAt = null;
        DB.saveMatchState(matchState);
        // Save to server immediately on kick-off
        if (window.apiFetch) {
            window.apiFetch('/api/data/match_state', {
                method: 'POST',
                body: JSON.stringify({ data: matchState })
            }).catch(e => console.warn('Server sync failed:', e));
        }

        // Hide setup screen & show dashboard
        wizardContainer.style.display = 'none';
        liveDashboard.style.display = 'grid';

        // Load dashboard layout elements
        loadLiveControlPanelData();
        
        // Start Live clock tick loop
        startMatchClockTimer();
    });

    // Load static names, logos, colors to control rows
    const loadLiveControlPanelData = () => {
        // Team A details
        document.getElementById('ctrl-name-a').textContent = matchState.teamA.name;
        document.getElementById('ctrl-score-a').textContent = matchState.scoreA;
        document.getElementById('ctrl-badge-a').innerHTML = `<img src="${DB.getTeamLogo(matchState.teamA)}" style="width:100%; height:100%;"/>`;
        document.getElementById('panel-team-a').style.setProperty('--team-color', matchState.teamA.primaryColor);

        // Team B details
        document.getElementById('ctrl-name-b').textContent = matchState.teamB.name;
        document.getElementById('ctrl-score-b').textContent = matchState.scoreB;
        document.getElementById('ctrl-badge-b').innerHTML = `<img src="${DB.getTeamLogo(matchState.teamB)}" style="width:100%; height:100%;"/>`;
        document.getElementById('panel-team-b').style.setProperty('--team-color', matchState.teamB.primaryColor);

        // Rerender Timeline Log logs
        renderTimelineEventFeed();
        
        // Setup initial stats values
        document.getElementById('stats-shots-a').value = matchState.stats.shotsA;
        document.getElementById('stats-sot-a').value = matchState.stats.sotA;
        document.getElementById('stats-corners-a').value = matchState.stats.cornersA;
        document.getElementById('stats-offsides-a').value = matchState.stats.offsidesA;

        document.getElementById('stats-shots-b').value = matchState.stats.shotsB;
        document.getElementById('stats-sot-b').value = matchState.stats.sotB;
        document.getElementById('stats-corners-b').value = matchState.stats.cornersB;
        document.getElementById('stats-offsides-b').value = matchState.stats.offsidesB;

        // Reset toggles states based on match active graphics
        document.getElementById('toggle-graphic-scoreboard').checked = (matchState.activeGraphic === 'scoreboard');
        document.getElementById('toggle-graphic-lineups').checked = (matchState.activeGraphic === 'lineups');
        document.getElementById('toggle-graphic-vs').checked = (matchState.activeGraphic === 'vs');
        document.getElementById('toggle-graphic-stats').checked = (matchState.activeGraphic === 'stats');
    };

    // -------------------------------------------------------------
    // TIMER / CLOCK LOOP MANAGEMENT
    // -------------------------------------------------------------
    const startMatchClockTimer = () => {
        if (liveClockInterval) clearInterval(liveClockInterval);

        btnClockPlay.style.display = 'none';
        btnClockPause.style.display = 'block';

        // Timestamp-based: calculate real elapsed time every second
        // Works after page close/reopen — no counting, just math
        liveClockInterval = setInterval(() => {
            if (!matchState.timerRunning) return;

            const elapsed = getElapsedSeconds();
            matchState.currentTime = elapsed;
            lblLiveTimer.textContent = DB.formatMatchTime(elapsed);

            // Save to localStorage every 5 seconds to reduce writes
            if (elapsed % 5 === 0) {
                DB.saveMatchState(matchState);
            }

            // Half-time boundary check
            const halfSeconds = matchState.duration * 60;
            if (elapsed >= halfSeconds && matchState.currentHalf === 1) {
                pauseClockTimer();
                logMatchTimelineEvent('Half Time', 'info', { desc: 'First Half Complete' });
                alert("First Half Finished! Press 'Next Half' to begin 2nd session.");
            }
        }, 1000);
    };

    const pauseClockTimer = () => {
        matchState.timerRunning = false;
        matchState.pauseStartAt = Date.now(); // record when pause began
        matchState.currentTime = getElapsedSeconds(); // freeze time
        DB.saveMatchState(matchState);
        // Save to server immediately on pause
        if (window.apiFetch) {
            window.apiFetch('/api/data/match_state', {
                method: 'POST',
                body: JSON.stringify({ data: matchState })
            }).catch(() => {});
        }
        btnClockPlay.style.display = 'block';
        btnClockPause.style.display = 'none';
    };

    // Clock Button Listeners
    btnClockPlay.addEventListener('click', () => {
        // Accumulate pause duration before resuming
        if (matchState.pauseStartAt) {
            matchState.totalPausedMs = (matchState.totalPausedMs || 0) + (Date.now() - matchState.pauseStartAt);
            matchState.pauseStartAt = null;
        }
        matchState.timerRunning = true;
        DB.saveMatchState(matchState);
        // Save to server on resume
        if (window.apiFetch) {
            window.apiFetch('/api/data/match_state', {
                method: 'POST',
                body: JSON.stringify({ data: matchState })
            }).catch(() => {});
        }
        startMatchClockTimer();
    });

    btnClockPause.addEventListener('click', () => {
        pauseClockTimer();
    });

    // +1m = extend half duration by 1 minute (injury/stoppage time)
    document.getElementById('btn-clock-adjust-plus').addEventListener('click', () => {
        matchState.duration = (matchState.duration || 45) + 1;
        lblClockHalf.textContent = (matchState.currentHalf === 2 ? '2ND' : '1ST') + ' +' +
            (matchState.duration - (matchState.currentHalf === 2 ? matchState.duration : matchState.duration) ) + '';
        // Show how many extra minutes added above base
        const base = matchState.baseHalfDuration || matchState.duration - 1;
        if (!matchState.baseHalfDuration) matchState.baseHalfDuration = base;
        const extra = matchState.duration - matchState.baseHalfDuration;
        lblClockHalf.textContent = (matchState.currentHalf >= 2 ? '2ND' : '1ST') + (extra > 0 ? ' +' + extra + "'" : '');
        DB.saveMatchState(matchState);
    });

    // -1m = reduce half duration
    document.getElementById('btn-clock-adjust-minus').addEventListener('click', () => {
        const base = matchState.baseHalfDuration || matchState.duration;
        matchState.duration = Math.max(base, (matchState.duration || 45) - 1);
        const extra = matchState.duration - (matchState.baseHalfDuration || matchState.duration);
        lblClockHalf.textContent = (matchState.currentHalf >= 2 ? '2ND' : '1ST') + (extra > 0 ? ' +' + extra + "'" : '');
        DB.saveMatchState(matchState);
    });

    // Overlay time offset buttons — shift what displays on screen ±1 min
    document.getElementById('btn-overlay-time-plus').addEventListener('click', () => {
        if (matchState.kickoffAt) matchState.kickoffAt -= 60000;
        else matchState.currentTime += 60;
        const elapsed = getElapsedSeconds();
        matchState.currentTime = elapsed;
        lblLiveTimer.textContent = DB.formatMatchTime(elapsed);
        DB.saveMatchState(matchState);
    });

    document.getElementById('btn-overlay-time-minus').addEventListener('click', () => {
        if (matchState.kickoffAt) matchState.kickoffAt += 60000;
        else matchState.currentTime = Math.max(0, matchState.currentTime - 60);
        const elapsed = Math.max(0, getElapsedSeconds());
        matchState.currentTime = elapsed;
        lblLiveTimer.textContent = DB.formatMatchTime(elapsed);
        DB.saveMatchState(matchState);
    });

    // ── HALF MANAGEMENT ─────────────────────────────────────────
    function showFirstHalfButtons() {
        document.getElementById('btn-next-half').style.display = 'inline-block';
        document.getElementById('btn-end-match').style.display = 'none';
        document.getElementById('btn-extra-time').style.display = 'none';
        document.getElementById('btn-penalty-kicks').style.display = 'none';
    }

    function showSecondHalfButtons() {
        document.getElementById('btn-next-half').style.display = 'none';
        document.getElementById('btn-end-match').style.display = 'inline-block';
        document.getElementById('btn-extra-time').style.display = 'inline-block';
        document.getElementById('btn-penalty-kicks').style.display = 'inline-block';
    }

    // Next Half → go to 2nd half and show End/ExtraTime/Penalty buttons
    document.getElementById('btn-next-half').addEventListener('click', () => {
        pauseClockTimer();
        const halfSecs = matchState.duration * 60;
        matchState.currentHalf = 2;
        lblClockHalf.textContent = '2ND';
        // Reset timer for 2nd half — new kickoff timestamp from now
        matchState.kickoffAt = Date.now() - (halfSecs * 1000); // starts at half-time mark
        matchState.totalPausedMs = 0;
        matchState.pauseStartAt = Date.now();
        matchState.timerRunning = false;
        matchState.currentTime = halfSecs;
        lblLiveTimer.textContent = DB.formatMatchTime(halfSecs);
        showSecondHalfButtons();
        logMatchTimelineEvent('2nd Half', 'info', { desc: 'Second Half Ready — Press Start Clock' });
        DB.saveMatchState(matchState);
    });

    // End Match → show post-match screen
    document.getElementById('btn-end-match').addEventListener('click', () => {
        if (!confirm('End the match? This will stop the clock and finalise the result.')) return;

        pauseClockTimer();
        if (liveClockInterval) clearInterval(liveClockInterval);
        matchState.status = 'finished';
        matchState.timerRunning = false;
        DB.saveMatchState(matchState);
        logMatchTimelineEvent('Full Time', 'info', { desc: `Final Score: ${matchState.scoreA} - ${matchState.scoreB}` });
        if (window.apiFetch) {
            window.apiFetch('/api/data/match_state', { method: 'POST', body: JSON.stringify({ data: matchState }) }).catch(() => {});
        }

        // Switch to post-match screen
        liveDashboard.style.display = 'none';
        const pmContainer = document.getElementById('post-match-container');
        pmContainer.style.display = 'block';

        // Populate summary
        document.getElementById('pm-final-score').textContent =
            matchState.scoreA + ' — ' + matchState.scoreB;
        document.getElementById('pm-team-names').textContent =
            (matchState.teamA?.name || 'Home') + ' vs ' + (matchState.teamB?.name || 'Away');

        // Build match summary text
        const s = matchState.stats || {};
        document.getElementById('pm-summary-content').innerHTML = `
            <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:4px 12px;align-items:center;">
                <span style="text-align:right;color:#fff;">${matchState.scoreA}</span><span style="color:#6b7280;font-size:0.75rem;">Goals</span><span style="color:#fff;">${matchState.scoreB}</span>
                <span style="text-align:right;">${s.shotsA||0}</span><span style="color:#6b7280;font-size:0.75rem;">Shots</span><span>${s.shotsB||0}</span>
                <span style="text-align:right;">${s.sotA||0}</span><span style="color:#6b7280;font-size:0.75rem;">On Target</span><span>${s.sotB||0}</span>
                <span style="text-align:right;">${s.cornersA||0}</span><span style="color:#6b7280;font-size:0.75rem;">Corners</span><span>${s.cornersB||0}</span>
                <span style="text-align:right;">${s.ycA||0}</span><span style="color:#6b7280;font-size:0.75rem;">Yellow Cards</span><span>${s.ycB||0}</span>
                <span style="text-align:right;">${s.foulsA||0}</span><span style="color:#6b7280;font-size:0.75rem;">Fouls</span><span>${s.foulsB||0}</span>
            </div>`;
    });

    // Post-match broadcast triggers
    window.postMatchTrigger = function(type) {
        DB.triggerOverlayAnimation('config_update', { activeGraphic: type });
        matchState.activeGraphic = type;
        DB.saveMatchState(matchState);
    };

    // Register match stats to team records & start new match
    document.getElementById('btn-pm-register').addEventListener('click', () => {
        if (!confirm('Register this match result to team and player records?')) return;

        const db = DB.getDb();
        const sA = matchState.scoreA || 0;
        const sB = matchState.scoreB || 0;
        const stats = matchState.stats || {};

        // Update team records
        [matchState.teamA, matchState.teamB].forEach((team, idx) => {
            if (!team) return;
            const dbTeam = db.teams.find(t => t.id === team.id);
            if (!dbTeam) return;
            if (!dbTeam.record) dbTeam.record = { played:0, won:0, drew:0, lost:0, gf:0, ga:0 };
            const goalsFor  = idx === 0 ? sA : sB;
            const goalsAgainst = idx === 0 ? sB : sA;
            dbTeam.record.played++;
            dbTeam.record.gf += goalsFor;
            dbTeam.record.ga += goalsAgainst;
            if (goalsFor > goalsAgainst) dbTeam.record.won++;
            else if (goalsFor === goalsAgainst) dbTeam.record.drew++;
            else dbTeam.record.lost++;
            // Add shots to team record
            dbTeam.record.shots = (dbTeam.record.shots || 0) + (idx === 0 ? (stats.shotsA||0) : (stats.shotsB||0));
            dbTeam.record.shotsOnTarget = (dbTeam.record.shotsOnTarget || 0) + (idx === 0 ? (stats.sotA||0) : (stats.sotB||0));
        });

        DB.saveDb(db);
        alert('Match stats registered! Starting new match.');
        resetAndStartNew();
    });

    // Discard and start new
    document.getElementById('btn-pm-skip').addEventListener('click', () => {
        if (confirm('Discard match data and start fresh?')) resetAndStartNew();
    });

    function resetAndStartNew() {
        document.getElementById('post-match-container').style.display = 'none';
        DB.resetMatchState();
        if (window.apiFetch) {
            window.apiFetch('/api/data/match_state', { method: 'POST', body: JSON.stringify({ data: null }) }).catch(() => {});
        }
        matchState = DB.getMatchState();
        showFirstHalfButtons();
        document.getElementById('btn-next-half').textContent = 'Next Half';
        lblLiveTimer.textContent = '00:00';
        lblClockHalf.textContent = '1ST';
        wizardContainer.style.display = 'block';
        initWizard();
        gotoStep(1);
    }

    // Extra Time — open modal
    document.getElementById('btn-extra-time').addEventListener('click', () => {
        document.getElementById('extra-time-modal').style.display = 'flex';
        document.getElementById('et-minutes-input').value = 15;
    });

    // Confirm Extra Time kick-off
    document.getElementById('btn-confirm-extra-time').addEventListener('click', () => {
        const mins = parseInt(document.getElementById('et-minutes-input').value) || 15;
        if (!confirm(`Start Extra Time — ${mins} minutes per half?`)) return;
        document.getElementById('extra-time-modal').style.display = 'none';

        matchState.currentHalf = 3; // ET 1st half
        matchState.duration = mins;
        matchState.kickoffAt = Date.now();
        matchState.totalPausedMs = 0;
        matchState.pauseStartAt = null;
        matchState.timerRunning = true;
        matchState.currentTime = 0;
        lblClockHalf.textContent = 'ET1';
        lblLiveTimer.textContent = '00:00';
        // Show same controls as regular play
        showFirstHalfButtons();
        document.getElementById('btn-next-half').textContent = 'ET 2nd Half';
        startMatchClockTimer();
        logMatchTimelineEvent('Extra Time', 'info', { desc: `Extra Time Started — ${mins} mins/half` });
        DB.saveMatchState(matchState);
        if (window.apiFetch) {
            window.apiFetch('/api/data/match_state', { method: 'POST', body: JSON.stringify({ data: matchState }) }).catch(() => {});
        }
    });

    // Penalty Kicks
    document.getElementById('btn-penalty-kicks').addEventListener('click', () => {
        if (!confirm('Start Penalty Shootout? This will stop the match clock.')) return;
        pauseClockTimer();
        matchState.currentHalf = 5; // penalties
        matchState.status = 'penalties';
        lblClockHalf.textContent = 'PEN';
        showFirstHalfButtons();
        document.getElementById('btn-next-half').style.display = 'none';
        document.getElementById('btn-end-match').style.display = 'inline-block';
        logMatchTimelineEvent('Penalty Shootout', 'info', { desc: 'Penalty Kicks Started' });
        DB.saveMatchState(matchState);
    });

    // Reset match — clear state and go back to wizard without page reload
    document.getElementById('btn-reset-match-control').addEventListener('click', () => {
        if (confirm('Reset match? This clears score, clock, and all events.')) {
            if (liveClockInterval) clearInterval(liveClockInterval);
            DB.resetMatchState();
            // Clear server match state
            if (window.apiFetch) {
                window.apiFetch('/api/data/match_state', {
                    method: 'POST',
                    body: JSON.stringify({ data: null })
                }).catch(() => {});
            }
            // Reset UI without page reload
            matchState = DB.getMatchState();
            liveDashboard.style.display = 'none';
            wizardContainer.style.display = 'block';
            showFirstHalfButtons();
            document.getElementById('btn-next-half').textContent = 'Next Half';
            lblLiveTimer.textContent = '00:00';
            lblClockHalf.textContent = '1ST';
            initWizard();
            gotoStep(1);
        }
    });

    // -------------------------------------------------------------
    // MATCH OPERATIONS: REGISTER EVENT EVENTS (GOALS / CARDS)
    // -------------------------------------------------------------
    let pendingActionData = null; // Stores { team: 'A'|'B', action: 'goal'|'yellow'|'red'|'foul' }

    const openPlayerPickerModal = (teamSide, actionKey) => {
        pendingActionData = { team: teamSide, action: actionKey };
        
        const teamObj = (teamSide === 'A') ? matchState.teamA : matchState.teamB;
        const pickerTitle = document.getElementById('lbl-picker-title');
        const pickerDesc = document.getElementById('lbl-picker-desc');
        const listContainer = document.getElementById('picker-players-list');
        
        listContainer.innerHTML = '';
        
        // Customize text titles
        if (actionKey === 'goal') {
            pickerTitle.innerHTML = `<span style="color:var(--color-accent);">⚽ Score Goal Scored</span>`;
            pickerDesc.textContent = `Choose player from ${teamObj.name} who scored the goal.`;
        } else if (actionKey === 'yellow') {
            pickerTitle.innerHTML = `<span style="color:var(--color-yellow);">🟨 Register Yellow Card</span>`;
            pickerDesc.textContent = `Who receives the yellow card booking for ${teamObj.name}?`;
        } else if (actionKey === 'red') {
            pickerTitle.innerHTML = `<span style="color:var(--color-red);">🟥 Register Red Card</span>`;
            pickerDesc.textContent = `Who receives the red card ejection for ${teamObj.name}?`;
        } else if (actionKey === 'foul') {
            pickerTitle.innerHTML = `<span>⚠️ Register Foul</span>`;
            pickerDesc.textContent = `Select player from ${teamObj.name} who committed the foul.`;
        }

        // Render roster card buttons inside selector modal
        const players = DB.getPlayers(teamObj.id);
        if (players.length === 0) {
            listContainer.innerHTML = `<div style="color:var(--color-text-dim); text-align:center; padding:15px; width:100%;">Roster empty. Seed players in setup database first!</div>`;
        }

        players.forEach(p => {
            const card = document.createElement('div');
            card.className = 'player-picker-card';
            card.dataset.playerid = p.id;

            card.innerHTML = `
                <div class="player-picker-avatar">
                    <img src="${DB.getPlayerAvatar(p, teamObj)}" />
                </div>
                <div class="player-picker-name">${p.name}</div>
                <div class="player-picker-num">Squad #${p.number} • ${p.position}</div>
            `;

            listContainer.appendChild(card);

            // Card Click selector
            card.addEventListener('click', () => {
                executeRosterRegisteredAction(p);
                closeSelectPlayerModal();
            });
        });

        // Open modal
        document.getElementById('modal-select-player-action').classList.add('active');
    };

    const closeSelectPlayerModal = () => {
        document.getElementById('modal-select-player-action').classList.remove('active');
        pendingActionData = null;
    };

    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', closeSelectPlayerModal);
    });

    // Execute selected event registration
    const executeRosterRegisteredAction = (player) => {
        if (!pendingActionData) return;
        
        const side = pendingActionData.team;
        const action = pendingActionData.action;
        const teamObj = (side === 'A') ? matchState.teamA : matchState.teamB;

        const currentMin = Math.floor(matchState.currentTime / 60) + 1;

        if (action === 'goal') {
            // 1. Increment Scores
            if (side === 'A') {
                matchState.scoreA += 1;
                matchState.stats.shotsA += 1;
                matchState.stats.sotA += 1;
                document.getElementById('ctrl-score-a').textContent = matchState.scoreA;
            } else {
                matchState.scoreB += 1;
                matchState.stats.shotsB += 1;
                matchState.stats.sotB += 1;
                document.getElementById('ctrl-score-b').textContent = matchState.scoreB;
            }

            // 2. Increment stats cell value
            player.stats.goals = (player.stats.goals || 0) + 1;
            player.stats.shots = (player.stats.shots || 0) + 1;
            player.stats.shotsOnTarget = (player.stats.shotsOnTarget || 0) + 1;
            DB.updatePlayer(player.id, player);

            // 3. Log event
            logMatchTimelineEvent('Goal Scored', 'goal', {
                team: side,
                teamName: teamObj.name,
                player: player.name,
                number: player.number,
                min: currentMin
            });

            // 4. Trigger OBS Animation notify
            DB.triggerOverlayAnimation('goal', {
                teamSide: side,
                teamName: teamObj.name,
                player: player.name,
                number: player.number,
                minute: currentMin,
                photo: DB.getPlayerAvatar(player, teamObj)
            });

        } else if (action === 'yellow') {
            player.stats.yellowCards = (player.stats.yellowCards || 0) + 1;
            
            // Check double booking
            if (player.stats.yellowCards === 2) {
                player.stats.redCards = 1;
                if (side === 'A') matchState.stats.rcA += 1;
                else matchState.stats.rcB += 1;
            }

            if (side === 'A') matchState.stats.ycA += 1;
            else matchState.stats.ycB += 1;

            DB.updatePlayer(player.id, player);

            logMatchTimelineEvent('Yellow Card', 'yellow', {
                team: side,
                teamName: teamObj.name,
                player: player.name,
                number: player.number,
                min: currentMin
            });

            DB.triggerOverlayAnimation('yellow_card', {
                teamSide: side,
                player: player.name,
                number: player.number,
                minute: currentMin,
                photo: DB.getPlayerAvatar(player, teamObj)
            });

        } else if (action === 'red') {
            player.stats.redCards = 1;
            if (side === 'A') matchState.stats.rcA += 1;
            else matchState.stats.rcB += 1;
            
            DB.updatePlayer(player.id, player);

            logMatchTimelineEvent('Red Card', 'red', {
                team: side,
                teamName: teamObj.name,
                player: player.name,
                number: player.number,
                min: currentMin
            });

            DB.triggerOverlayAnimation('red_card', {
                teamSide: side,
                player: player.name,
                number: player.number,
                minute: currentMin,
                photo: DB.getPlayerAvatar(player, teamObj)
            });

        } else if (action === 'foul') {
            player.stats.fouls = (player.stats.fouls || 0) + 1;
            if (side === 'A') matchState.stats.foulsA += 1;
            else matchState.stats.foulsB += 1;
            
            DB.updatePlayer(player.id, player);

            logMatchTimelineEvent('Foul Committed', 'foul', {
                team: side,
                teamName: teamObj.name,
                player: player.name,
                number: player.number,
                min: currentMin
            });
        }

        // Save states
        DB.saveMatchState(matchState);
        loadLiveControlPanelData();
    };

    // Setup buttons quick clicks
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const side = btn.dataset.team;
            const action = btn.dataset.action;

            if (action === 'substitution') {
                openSubstitutionSelectionModal(side);
            } else if (action === 'offside') {
                // Quick offside increment
                const currentMin = Math.floor(matchState.currentTime / 60) + 1;
                const teamObj = (side === 'A') ? matchState.teamA : matchState.teamB;
                
                if (side === 'A') matchState.stats.offsidesA += 1;
                else matchState.stats.offsidesB += 1;

                logMatchTimelineEvent('Offside Flagged', 'foul', {
                    team: side,
                    teamName: teamObj.name,
                    player: 'Offside Call',
                    number: '',
                    min: currentMin
                });

                DB.saveMatchState(matchState);
                loadLiveControlPanelData();
            } else {
                openPlayerPickerModal(side, action);
            }
        });
    });

    // -------------------------------------------------------------
    // DYNAMIC MATCH TIMELINE LOG FEED
    // -------------------------------------------------------------
    const logMatchTimelineEvent = (title, type, details) => {
        const timestamp = DB.formatMatchTime(matchState.currentTime);
        const event = {
            id: 'ev_' + Date.now(),
            timeStr: timestamp,
            secs: matchState.currentTime,
            type: type,
            title: title,
            details: details
        };

        matchState.timeline.unshift(event); // add to top
        DB.saveMatchState(matchState);
        renderTimelineEventFeed();
    };

    const renderTimelineEventFeed = () => {
        timelineFeed.innerHTML = '';
        const timeline = matchState.timeline || [];

        document.getElementById('lbl-feed-count').textContent = `${timeline.length} Events`;

        if (timeline.length === 0) {
            timelineFeed.innerHTML = `<li style="color:var(--color-text-dim); text-align:center; padding:10px;">Event logs is currently empty.</li>`;
            return;
        }

        timeline.forEach(ev => {
            const li = document.createElement('li');
            li.className = 'timeline-item';

            let icon = '📢';
            if (ev.type === 'goal') icon = '⚽';
            else if (ev.type === 'yellow') icon = '🟨';
            else if (ev.type === 'red') icon = '🟥';
            else if (ev.type === 'foul') icon = '⚠️';
            else if (ev.type === 'sub') icon = '🔄';

            let desc = '';
            if (ev.type === 'goal') {
                desc = `<strong>${ev.details.player}</strong> scored! (${ev.details.teamName})`;
            } else if (ev.type === 'yellow' || ev.type === 'red') {
                desc = `Card booked for <strong>${ev.details.player}</strong> (${ev.details.teamName})`;
            } else if (ev.type === 'sub') {
                desc = `Sub: <strong>${ev.details.playerIn}</strong> IN ⇄ <strong>${ev.details.playerOut}</strong> OUT`;
            } else {
                desc = ev.details.desc || `${ev.title}`;
            }

            li.innerHTML = `
                <span class="timeline-time">${ev.timeStr}</span>
                <span class="timeline-icon">${icon}</span>
                <span class="timeline-desc">${desc}</span>
            `;

            timelineFeed.appendChild(li);
        });
    };

    // -------------------------------------------------------------
    // SUBSTITUTIONS POPUP ACTIONS
    // -------------------------------------------------------------
    let subTeamSide = '';
    const openSubstitutionSelectionModal = (side) => {
        subTeamSide = side;
        const teamObj = (side === 'A') ? matchState.teamA : matchState.teamB;
        
        const selOut = document.getElementById('select-sub-out');
        const selIn = document.getElementById('select-sub-in');
        
        selOut.innerHTML = '';
        selIn.innerHTML = '';

        const players = DB.getPlayers(teamObj.id);
        
        players.forEach(p => {
            selOut.innerHTML += `<option value="${p.id}">${p.name} (Squad #${p.number} - ${p.position})</option>`;
            selIn.innerHTML += `<option value="${p.id}">${p.name} (Squad #${p.number} - ${p.position})</option>`;
        });

        // Open modal
        document.getElementById('modal-select-sub-action').classList.add('active');
    };

    document.getElementById('btn-submit-sub-action').addEventListener('click', () => {
        const teamObj = (subTeamSide === 'A') ? matchState.teamA : matchState.teamB;
        const outId = document.getElementById('select-sub-out').value;
        const inId = document.getElementById('select-sub-in').value;

        if (outId === inId) {
            alert("Error: Substitution must be between two different players!");
            return;
        }

        const playerOut = DB.getPlayers().find(p => p.id === outId);
        const playerIn = DB.getPlayers().find(p => p.id === inId);

        if (playerOut && playerIn) {
            const currentMin = Math.floor(matchState.currentTime / 60) + 1;

            logMatchTimelineEvent('Substitution', 'sub', {
                team: subTeamSide,
                teamName: teamObj.name,
                playerOut: playerOut.name,
                playerIn: playerIn.name,
                min: currentMin
            });

            DB.triggerOverlayAnimation('substitution', {
                teamSide: subTeamSide,
                playerOut: playerOut.name,
                numberOut: playerOut.number,
                playerIn: playerIn.name,
                numberIn: playerIn.number,
                minute: currentMin,
                photoIn: DB.getPlayerAvatar(playerIn, teamObj)
            });

            document.getElementById('modal-select-sub-action').classList.remove('active');
            renderTimelineEventFeed();
        }
    });

    // Close buttons on Modals
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        });
    });

    // -------------------------------------------------------------
    // STATS CELL ADJUSTMENTS UPDATES
    // -------------------------------------------------------------
    document.querySelectorAll('.ctrl-stat-cell').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const teamSide = e.target.dataset.team;
            const statKey = e.target.dataset.stat;
            const val = parseInt(e.target.value) || 0;

            if (teamSide === 'A') {
                matchState.stats[statKey + 'A'] = val;
            } else {
                matchState.stats[statKey + 'B'] = val;
            }

            DB.saveMatchState(matchState);
        });
    });

    // -------------------------------------------------------------
    // BROADCAST GRAPHICS TOGGLES
    // -------------------------------------------------------------
    const bindGraphicToggleSwitch = (toggleId, graphicKey) => {
        const toggle = document.getElementById(toggleId);
        toggle.addEventListener('change', () => {
            if (toggle.checked) {
                // Disable other checkboxes to prevent graphic overlap in OBS
                if (graphicKey !== 'scoreboard') {
                    // Scoreboard can run concurrently, but VS, Lineups, Stats should toggle
                    if (graphicKey === 'vs' || graphicKey === 'lineups' || graphicKey === 'stats') {
                        document.getElementById('toggle-graphic-vs').checked = (graphicKey === 'vs');
                        document.getElementById('toggle-graphic-lineups').checked = (graphicKey === 'lineups');
                        document.getElementById('toggle-graphic-stats').checked = (graphicKey === 'stats');
                    }
                }
                
                matchState.activeGraphic = graphicKey;
            } else {
                if (matchState.activeGraphic === graphicKey) {
                    matchState.activeGraphic = 'none';
                }
            }

            DB.saveMatchState(matchState);
        });
    };

    bindGraphicToggleSwitch('toggle-graphic-scoreboard', 'scoreboard');
    bindGraphicToggleSwitch('toggle-graphic-lineups', 'lineups');
    bindGraphicToggleSwitch('toggle-graphic-vs', 'vs');
    bindGraphicToggleSwitch('toggle-graphic-stats', 'stats');

    // ─── PAGE LOAD: RESTORE SESSION FROM SERVER ─────────────
    async function initPage() {
        if (window.apiFetch) {
            try {
                const res = await window.apiFetch('/api/data/match_state');
                const data = await res.json();
                if (data.data && data.data.status === 'live') {
                    matchState = data.data;
                    DB.saveMatchState(matchState);
                }
            } catch(e) {
                console.warn('Server load failed, using local state:', e);
            }
        }

        initWizard();

        if (matchState && matchState.status === 'live') {
            wizardContainer.style.display = 'none';
            liveDashboard.style.display = 'grid';
            loadLiveControlPanelData();

            // Recalculate real elapsed time from kickoff timestamp
            const elapsed = getElapsedSeconds();
            matchState.currentTime = elapsed;
            lblLiveTimer.textContent = DB.formatMatchTime(elapsed);
            lblClockHalf.textContent = (matchState.currentHalf === 2) ? '2ND' : '1ST';

            if (matchState.timerRunning) {
                startMatchClockTimer();
            } else {
                btnClockPlay.style.display = 'block';
                btnClockPause.style.display = 'none';
            }
            // Restore correct half buttons
            if (matchState.currentHalf >= 2) {
                showSecondHalfButtons();
            } else {
                showFirstHalfButtons();
            }
        } else {
            gotoStep(1);
        }
    }

    initPage();
});
