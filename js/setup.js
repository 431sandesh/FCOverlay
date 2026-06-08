// setup.js - Roster Setup Page Dashboard Logic

document.addEventListener('DOMContentLoaded', () => {
    // Current Active Selection State
    let activeSelection = { type: 'welcome', id: null };
    let tempPlayerPhotoBase64 = '';
    let tempTournamentLogoBase64 = '';
    let tempTeamLogoBase64 = '';

    // Cache DOM Elements
    const treeList = document.getElementById('navigator-tree-list');
    const welcomeView = document.getElementById('editor-welcome-view');
    const tournamentView = document.getElementById('tournament-editor-view');
    const teamView = document.getElementById('team-editor-view');

    // Modals
    const modalAddTournament = document.getElementById('modal-add-tournament');
    const modalAddTeam = document.getElementById('modal-add-team');
    const modalEditTeam = document.getElementById('modal-edit-team');
    const modalAddPlayer = document.getElementById('modal-add-player');

    // -------------------------------------------------------------
    // NAVIGATION TREE GENERATOR
    // -------------------------------------------------------------
    const renderNavigatorTree = () => {
        treeList.innerHTML = '';
        const tournaments = DB.getTournaments();

        if (tournaments.length === 0) {
            treeList.innerHTML = `<div style="text-align: center; color: var(--color-text-dim); font-size: 0.85rem; padding: 15px;">No leagues created yet. Click "Add Tournament" above to start.</div>`;
            return;
        }

        tournaments.forEach(t => {
            const tNode = document.createElement('li');
            tNode.className = 'tournament-node';

            // Active Class Check
            const isTActive = activeSelection.type === 'tournament' && activeSelection.id === t.id;
            const tLogo = DB.getTournamentLogo(t);

            tNode.innerHTML = `
                <div class="tournament-header ${isTActive ? 'active' : ''}" data-tid="${t.id}">
                    <span style="display:flex; align-items:center; gap:8px;">
                        <img src="${tLogo}" style="width:20px; height:20px; border-radius:50%; object-fit:cover; border:1px solid rgba(255,255,255,0.15);" />
                        ${t.name}
                    </span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
                <ul class="team-sublist" id="sublist-${t.id}"></ul>
            `;

            treeList.appendChild(tNode);

            // Fetch Teams under this tournament
            const sublist = document.getElementById(`sublist-${t.id}`);
            const teams = DB.getTeams(t.id);

            teams.forEach(team => {
                const teamNode = document.createElement('li');
                const isTeamActive = activeSelection.type === 'team' && activeSelection.id === team.id;
                const teamCrest = DB.getTeamLogo(team);
                
                teamNode.className = `team-node ${isTeamActive ? 'active' : ''}`;
                teamNode.dataset.teamid = team.id;
                teamNode.innerHTML = `
                    <span style="display:flex; align-items:center; gap:6px;">
                        <img src="${teamCrest}" style="width:16px; height:16px; border-radius:4px; object-fit:contain;" />
                        ${team.name}
                    </span>
                    <span style="opacity: 0.6; font-size: 0.75rem;">${team.shortName}</span>
                `;

                sublist.appendChild(teamNode);

                // Team Click Select
                teamNode.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectNode('team', team.id);
                });
            });

            // Tournament Click Select
            tNode.querySelector('.tournament-header').addEventListener('click', () => {
                selectNode('tournament', t.id);
            });
        });
    };

    // -------------------------------------------------------------
    // NODE SELECT ROUTER
    // -------------------------------------------------------------
    const selectNode = (type, id) => {
        activeSelection = { type, id };
        
        // Render Active borders on Nav Tree
        renderNavigatorTree();

        // Hide all editor subviews
        welcomeView.style.display = 'none';
        tournamentView.style.display = 'none';
        teamView.style.display = 'none';

        if (type === 'tournament') {
            showTournamentEditor(id);
        } else if (type === 'team') {
            showTeamEditor(id);
        } else {
            welcomeView.style.display = 'flex';
        }
    };

    // -------------------------------------------------------------
    // TOURNAMENT DETAILS RENDERER
    // -------------------------------------------------------------
    const showTournamentEditor = (tid) => {
        const tournament = DB.getTournaments().find(t => t.id === tid);
        if (!tournament) return;

        tournamentView.style.display = 'block';
        document.getElementById('lbl-tournament-name').textContent = tournament.name;

        // Render Tournament Logo Badge
        const tLogo = DB.getTournamentLogo(tournament);
        document.getElementById('badge-tournament-large').innerHTML = `<img src="${tLogo}" style="max-width:100%; max-height:100%; border-radius:50%; object-fit:cover;"/>`;

        // Populate Teams table under this tournament
        const tbody = document.getElementById('tournament-teams-tbody');
        tbody.innerHTML = '';
        const teams = DB.getTeams(tid);

        if (teams.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--color-text-dim); padding: 30px;">No teams registered in this league yet. Click "Add Club Team" to create one.</td></tr>`;
            return;
        }

        teams.forEach(team => {
            const pCount = DB.getPlayers(team.id).length;
            const tr = document.createElement('tr');
            
            tr.innerHTML = `
                <td>
                    <div style="width:36px; height:36px; border-radius:6px; background:rgba(0,0,0,0.2); padding: 4px; display:flex; align-items:center; justify-content:center;">
                        <img src="${DB.getTeamLogo(team)}" style="max-width:100%; max-height:100%; object-fit:contain;" />
                    </div>
                </td>
                <td style="font-weight: 600; color: white; cursor:pointer;" class="btn-navigate-team">${team.name}</td>
                <td><span style="font-family: var(--font-display); background:rgba(255,255,255,0.05); padding: 2px 6px; border-radius:4px;">${team.shortName}</span></td>
                <td style="color:var(--color-accent); font-weight:500;">${team.coach.name}</td>
                <td><strong style="color:white; font-family:var(--font-display);">${pCount}</strong> Players</td>
                <td>
                    <button class="btn-secondary btn-delete-team-row" style="padding: 5px 10px; font-size:0.8rem;" data-teamid="${team.id}">Delete</button>
                </td>
            `;

            tbody.appendChild(tr);

            // Row click navigation to team details
            tr.querySelector('.btn-navigate-team').addEventListener('click', () => {
                selectNode('team', team.id);
            });

            // Action delete click
            tr.querySelector('.btn-delete-team-row').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete ${team.name} and all its players?`)) {
                    DB.deleteTeam(team.id);
                    showTournamentEditor(tid);
                    renderNavigatorTree();
                }
            });
        });
    };

    // -------------------------------------------------------------
    // TEAM DETAILS & ROSTER SPREADSHEET RENDERER
    // -------------------------------------------------------------
    const showTeamEditor = (teamId) => {
        const db = DB.getDb();
        const team = db.teams.find(t => t.id === teamId);
        if (!team) return;

        teamView.style.display = 'block';

        // Apply team color variables to visual cards
        teamView.style.setProperty('--team-color', team.primaryColor);
        document.getElementById('lbl-team-name').textContent = team.name;
        document.getElementById('lbl-team-coach').innerHTML = `Manager/Coach: <strong style="color:white;">${team.coach.name}</strong>`;
        
        // Render badge
        const badgeBox = document.getElementById('badge-team-large');
        badgeBox.innerHTML = `<img src="${DB.getTeamLogo(team)}" style="max-width:100%; max-height:100%;" />`;

        // Render roster spreadsheet rows
        const tbody = document.getElementById('team-roster-tbody');
        tbody.innerHTML = '';
        const players = DB.getPlayers(teamId);

        if (players.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:var(--color-text-dim); padding: 40px;">Roster empty. Click "Create Player Profile" to add soccer players.</td></tr>`;
            return;
        }

        players.forEach(p => {
            const tr = document.createElement('tr');
            
            // Check if player photo exists, else generate SVG avatar
            const photoUrl = DB.getPlayerAvatar(p, team);

            tr.innerHTML = `
                <td>
                    <input type="number" class="quick-input cell-number" data-pid="${p.id}" value="${p.number}" min="1" max="99" style="font-family: var(--font-display); font-weight:700;">
                </td>
                <td>
                    <div class="player-profile-cell">
                        <div class="player-photo-mini">
                            <img src="${photoUrl}" />
                        </div>
                        <input type="text" class="cell-name" data-pid="${p.id}" value="${p.name}" style="background:transparent; border:none; padding:4px; font-weight:600; width: 100%;" />
                    </div>
                </td>
                <td>
                    <select class="cell-position" data-pid="${p.id}" style="padding:4px; font-size:0.8rem; font-weight:bold; width: 70px;">
                        <option value="GK" ${p.position === 'GK' ? 'selected' : ''}>GK</option>
                        <option value="DF" ${p.position === 'DF' ? 'selected' : ''}>DF</option>
                        <option value="MF" ${p.position === 'MF' ? 'selected' : ''}>MF</option>
                        <option value="FW" ${p.position === 'FW' ? 'selected' : ''}>FW</option>
                    </select>
                </td>
                <!-- Quick spreadsheets inline stat editors -->
                <td><input type="number" class="quick-input cell-stat" data-pid="${p.id}" data-stat="goals" value="${p.stats.goals || 0}" min="0"></td>
                <td><input type="number" class="quick-input cell-stat" data-pid="${p.id}" data-stat="shots" value="${p.stats.shots || 0}" min="0"></td>
                <td><input type="number" class="quick-input cell-stat" data-pid="${p.id}" data-stat="shotsOnTarget" value="${p.stats.shotsOnTarget || 0}" min="0"></td>
                <td><input type="number" class="quick-input cell-stat" data-pid="${p.id}" data-stat="fouls" value="${p.stats.fouls || 0}" min="0"></td>
                <td><input type="number" class="quick-input cell-stat" data-pid="${p.id}" data-stat="yellowCards" value="${p.stats.yellowCards || 0}" min="0" max="2"></td>
                <td><input type="number" class="quick-input cell-stat" data-pid="${p.id}" data-stat="redCards" value="${p.stats.redCards || 0}" min="0" max="1"></td>
                <td><input type="number" class="quick-input cell-stat" data-pid="${p.id}" data-stat="offsides" value="${p.stats.offsides || 0}" min="0"></td>
                <td><input type="number" class="quick-input cell-stat" data-pid="${p.id}" data-stat="injuries" value="${p.stats.injuries || 0}" min="0" max="1"></td>
                <td style="text-align:center;">
                    <button class="btn-danger btn-delete-player" data-pid="${p.id}" style="padding: 4px 8px; border-radius:4px;">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </td>
            `;

            tbody.appendChild(tr);
        });

        // -------------------------------------------------------------
        // INSTANT SPREADSHEET CELL INPUT AUTO-SAVE LISTENERS
        // -------------------------------------------------------------
        
        // Name changes
        tbody.querySelectorAll('.cell-name').forEach(inp => {
            inp.addEventListener('change', (e) => {
                const pid = e.target.dataset.pid;
                DB.updatePlayer(pid, { name: e.target.value });
            });
        });

        // Number changes
        tbody.querySelectorAll('.cell-number').forEach(inp => {
            inp.addEventListener('change', (e) => {
                const pid = e.target.dataset.pid;
                DB.updatePlayer(pid, { number: parseInt(e.target.value) || 0 });
            });
        });

        // Position changes
        tbody.querySelectorAll('.cell-position').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const pid = e.target.dataset.pid;
                DB.updatePlayer(pid, { position: e.target.value });
                showTeamEditor(teamId); // Reload to update badges colors
            });
        });

        // Stats cell adjustments
        tbody.querySelectorAll('.cell-stat').forEach(inp => {
            inp.addEventListener('change', (e) => {
                const pid = e.target.dataset.pid;
                const statKey = e.target.dataset.stat;
                const val = parseInt(e.target.value) || 0;
                
                // Read current stats, modify value, and update player
                const player = DB.getPlayers().find(p => p.id === pid);
                if (player) {
                    const stats = { ...(player.stats || {}) };
                    stats[statKey] = val;
                    DB.updatePlayer(pid, { stats });
                }
            });
        });

        // Delete player action
        tbody.querySelectorAll('.btn-delete-player').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pid = e.currentTarget.dataset.pid;
                const player = DB.getPlayers().find(p => p.id === pid);
                if (player && confirm(`Are you sure you want to remove ${player.name} from the roster?`)) {
                    DB.deletePlayer(pid);
                    showTeamEditor(teamId);
                }
            });
        });
    };

    // -------------------------------------------------------------
    // SYSTEM MODALS VIEW MANAGEMENT & TRIGGERS
    // -------------------------------------------------------------

    // Helper close modals
    const closeAllModals = () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        // Reset base64 states
        tempPlayerPhotoBase64 = '';
        tempTournamentLogoBase64 = '';
        tempTeamLogoBase64 = '';
        
        document.getElementById('img-player-photo-preview').style.display = 'none';
        document.getElementById('svg-player-photo-placeholder').style.display = 'block';
        
        document.getElementById('img-t-logo-preview').style.display = 'none';
        document.getElementById('svg-t-logo-placeholder').style.display = 'block';
        document.getElementById('img-edit-t-logo-preview').style.display = 'none';
        document.getElementById('svg-edit-t-logo-placeholder').style.display = 'block';
        
        document.getElementById('img-team-logo-preview').style.display = 'none';
        document.getElementById('svg-team-logo-placeholder').style.display = 'block';
        document.getElementById('img-edit-team-logo-preview').style.display = 'none';
        document.getElementById('svg-edit-team-logo-placeholder').style.display = 'block';
        
        document.getElementById('form-add-player').reset();
        document.getElementById('form-add-tournament').reset();
        document.getElementById('form-edit-tournament').reset();
        document.getElementById('form-add-team').reset();
        document.getElementById('form-edit-team').reset();
    };

    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

    // 1. ADD LEAGUE TOURNAMENT
    document.getElementById('btn-create-tournament').addEventListener('click', () => {
        modalAddTournament.classList.add('active');
        document.getElementById('input-tournament-name').focus();
    });

    document.getElementById('form-add-tournament').addEventListener('submit', (e) => {
        const name = document.getElementById('input-tournament-name').value;
        const newT = DB.addTournament(name, tempTournamentLogoBase64);
        closeAllModals();
        selectNode('tournament', newT.id);
        document.getElementById('form-add-tournament').reset();
    });

    // 2. EDIT ACTIVE TOURNAMENT
    document.getElementById('btn-edit-tournament-details').addEventListener('click', () => {
        if (activeSelection.type === 'tournament') {
            const tournament = DB.getTournaments().find(t => t.id === activeSelection.id);
            if (tournament) {
                document.getElementById('edit-t-id').value = tournament.id;
                document.getElementById('edit-t-name').value = tournament.name;
                
                const previewImg = document.getElementById('img-edit-t-logo-preview');
                const placeholderSvg = document.getElementById('svg-edit-t-logo-placeholder');
                
                if (tournament.logo) {
                    previewImg.src = tournament.logo;
                    previewImg.style.display = 'block';
                    placeholderSvg.style.display = 'none';
                    tempTournamentLogoBase64 = tournament.logo;
                } else {
                    previewImg.style.display = 'none';
                    placeholderSvg.style.display = 'block';
                    tempTournamentLogoBase64 = '';
                }
                
                document.getElementById('modal-edit-tournament').classList.add('active');
            }
        }
    });

    document.getElementById('form-edit-tournament').addEventListener('submit', () => {
        const id = document.getElementById('edit-t-id').value;
        const name = document.getElementById('edit-t-name').value;
        
        const db = DB.getDb();
        const tIdx = db.tournaments.findIndex(t => t.id === id);
        if (tIdx !== -1) {
            db.tournaments[tIdx].name = name;
            db.tournaments[tIdx].logo = tempTournamentLogoBase64;
            DB.saveDb(db);
        }
        
        closeAllModals();
        showTournamentEditor(id);
        renderNavigatorTree();
    });

    // 3. DELETE ACTIVE TOURNAMENT
    document.getElementById('btn-delete-tournament-action').addEventListener('click', () => {
        if (activeSelection.type === 'tournament') {
            const t = DB.getTournaments().find(item => item.id === activeSelection.id);
            if (t && confirm(`CRITICAL WARNING: Are you sure you want to delete tournament "${t.name}"? This will erase all member teams, coaches, players, and match statistics logs permanently!`)) {
                DB.deleteTournament(t.id);
                selectNode('welcome', null);
            }
        }
    });

    // 4. ADD CLUB TEAM MODAL
    document.getElementById('btn-add-team-modal').addEventListener('click', () => {
        modalAddTeam.classList.add('active');
        document.getElementById('input-team-name').focus();
    });

    document.getElementById('form-add-team').addEventListener('submit', () => {
        const name = document.getElementById('input-team-name').value;
        const shortName = document.getElementById('input-team-short').value;
        const pColor = document.getElementById('input-team-pcolor').value;
        const sColor = document.getElementById('input-team-scolor').value;
        const coach = document.getElementById('input-team-coach').value;

        if (activeSelection.type === 'tournament') {
            const team = DB.addTeam(activeSelection.id, name, shortName, pColor, sColor, coach, tempTeamLogoBase64);
            closeAllModals();
            selectNode('team', team.id);
            document.getElementById('form-add-team').reset();
        }
    });

    // 5. EDIT ACTIVE TEAM DETAILS
    document.getElementById('btn-edit-team-details').addEventListener('click', () => {
        if (activeSelection.type === 'team') {
            const team = DB.getTeams().find(t => t.id === activeSelection.id);
            if (team) {
                document.getElementById('edit-team-id').value = team.id;
                document.getElementById('edit-team-name').value = team.name;
                document.getElementById('edit-team-short').value = team.shortName;
                document.getElementById('edit-team-pcolor').value = team.primaryColor;
                document.getElementById('edit-team-scolor').value = team.secondaryColor;
                document.getElementById('edit-team-coach').value = team.coach.name;
                
                const previewImg = document.getElementById('img-edit-team-logo-preview');
                const placeholderSvg = document.getElementById('svg-edit-team-logo-placeholder');
                
                if (team.logo) {
                    previewImg.src = team.logo;
                    previewImg.style.display = 'block';
                    placeholderSvg.style.display = 'none';
                    tempTeamLogoBase64 = team.logo;
                } else {
                    previewImg.style.display = 'none';
                    placeholderSvg.style.display = 'block';
                    tempTeamLogoBase64 = '';
                }
                
                modalEditTeam.classList.add('active');
            }
        }
    });

    document.getElementById('form-edit-team').addEventListener('submit', () => {
        const id = document.getElementById('edit-team-id').value;
        const name = document.getElementById('edit-team-name').value;
        const shortName = document.getElementById('edit-team-short').value;
        const primaryColor = document.getElementById('edit-team-pcolor').value;
        const secondaryColor = document.getElementById('edit-team-scolor').value;
        const coachName = document.getElementById('edit-team-coach').value;

        DB.updateTeam(id, {
            name,
            shortName: shortName.toUpperCase(),
            primaryColor,
            secondaryColor,
            coach: { name: coachName, photo: '' },
            logo: tempTeamLogoBase64
        });

        closeAllModals();
        showTeamEditor(id);
        renderNavigatorTree();
    });

    // 5. DELETE ACTIVE TEAM
    document.getElementById('btn-delete-team-action').addEventListener('click', () => {
        if (activeSelection.type === 'team') {
            const team = DB.getTeams().find(t => t.id === activeSelection.id);
            if (team && confirm(`Are you sure you want to delete ${team.name}? This will erase its coach and player roster.`)) {
                DB.deleteTeam(team.id);
                selectNode('tournament', team.tournamentId);
            }
        }
    });

    // 6. ADD PLAYER SQUAD ROSTER
    document.getElementById('btn-add-player-modal').addEventListener('click', () => {
        modalAddPlayer.classList.add('active');
        document.getElementById('input-player-name').focus();
    });

    // Base64 file uploader reader logic
    document.getElementById('input-player-photo').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                tempPlayerPhotoBase64 = event.target.result;
                const previewImg = document.getElementById('img-player-photo-preview');
                const placeholderSvg = document.getElementById('svg-player-photo-placeholder');
                previewImg.src = tempPlayerPhotoBase64;
                previewImg.style.display = 'block';
                placeholderSvg.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    });

    // Tournament Logo Readers
    document.getElementById('input-t-logo').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                tempTournamentLogoBase64 = event.target.result;
                const previewImg = document.getElementById('img-t-logo-preview');
                const placeholderSvg = document.getElementById('svg-t-logo-placeholder');
                previewImg.src = tempTournamentLogoBase64;
                previewImg.style.display = 'block';
                placeholderSvg.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('edit-t-logo').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                tempTournamentLogoBase64 = event.target.result;
                const previewImg = document.getElementById('img-edit-t-logo-preview');
                const placeholderSvg = document.getElementById('svg-edit-t-logo-placeholder');
                previewImg.src = tempTournamentLogoBase64;
                previewImg.style.display = 'block';
                placeholderSvg.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    });

    // Team Logo Readers
    document.getElementById('input-team-logo').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                tempTeamLogoBase64 = event.target.result;
                const previewImg = document.getElementById('img-team-logo-preview');
                const placeholderSvg = document.getElementById('svg-team-logo-placeholder');
                previewImg.src = tempTeamLogoBase64;
                previewImg.style.display = 'block';
                placeholderSvg.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('edit-team-logo').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                tempTeamLogoBase64 = event.target.result;
                const previewImg = document.getElementById('img-edit-team-logo-preview');
                const placeholderSvg = document.getElementById('svg-edit-team-logo-placeholder');
                previewImg.src = tempTeamLogoBase64;
                previewImg.style.display = 'block';
                placeholderSvg.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('form-add-player').addEventListener('submit', () => {
        const name = document.getElementById('input-player-name').value;
        const number = document.getElementById('input-player-number').value;
        const pos = document.getElementById('input-player-position').value;

        if (activeSelection.type === 'team') {
            DB.addPlayer(activeSelection.id, name, number, pos, tempPlayerPhotoBase64);
            closeAllModals();
            showTeamEditor(activeSelection.id);
        }
    });

    // Initial Tree render
    renderNavigatorTree();
});
