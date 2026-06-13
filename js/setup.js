// setup.js - Roster Setup Page Dashboard Logic

// ─── CLOUDINARY UPLOAD HELPER ───────────────────────────────
// Uploads a file directly to Railway → Cloudinary via API
// Falls back to compressed base64 if upload fails
async function uploadPhoto(file, type, id, oldUrl) {
    try {
        const formData = new FormData();
        formData.append('photo', file);
        if (oldUrl && oldUrl.includes('res.cloudinary.com')) formData.append('oldUrl', oldUrl);
        const res = await fetch(`/api/upload/${type}/${id}`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('bfx_token') },
            body: formData
        });
        const data = await res.json();
        if (data.success) return data.url;
        throw new Error(data.error);
    } catch (e) {
        console.warn('Cloudinary upload failed, using base64 fallback:', e.message);
        return null;
    }
}

// Delete a single Cloudinary image (no-op for base64/SVG data URLs)
async function deleteCloudImage(url) {
    if (!url || !url.includes('res.cloudinary.com')) return;
    try {
        await fetch('/api/upload/delete', {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('bfx_token') },
            body: JSON.stringify({ url })
        });
    } catch (e) { console.warn('Cloud image delete failed:', e); }
}

// Delete many Cloudinary images at once
async function deleteCloudImagesBulk(urls) {
    const cloudUrls = (urls||[]).filter(u => u && u.includes('res.cloudinary.com'));
    if (cloudUrls.length === 0) return;
    try {
        await fetch('/api/upload/delete-bulk', {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('bfx_token') },
            body: JSON.stringify({ urls: cloudUrls })
        });
    } catch (e) { console.warn('Bulk cloud delete failed:', e); }
}

// 500KB client-side file size check before any upload attempt
function checkFileSize(file) {
    const MAX = 500 * 1024; // 500KB
    if (file.size > MAX) {
        alert(`Image too large (${(file.size/1024).toFixed(0)}KB). Maximum allowed size is 500KB. Please choose a smaller image.`);
        return false;
    }
    return true;
}

// Check player limit (300 per account) before adding a new player
async function checkPlayerLimit() {
    try {
        const res = await window.apiFetch('/api/limits/player-count');
        const data = await res.json();
        if (data.count >= data.limit) {
            alert(`Player limit reached (${data.limit} players max per account). Delete some players before adding new ones.`);
            return false;
        }
        return true;
    } catch (e) {
        return true; // fail open if check itself fails
    }
}

// ─── IMAGE COMPRESSION HELPER ────────────────────────────────
// Resizes and compresses any image to JPEG before storing as base64
// This prevents localStorage overflow with large PNG/raw files
function compressImage(file, maxSize, quality, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; } }
            else        { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; } }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            callback(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

document.addEventListener('DOMContentLoaded', () => {
    // Current Active Selection State
    let activeSelection = { type: 'welcome', id: null };
    let tempPlayerPhotoBase64 = '';
    let tempTournamentLogoBase64 = '';
    let tempTeamLogoBase64 = '';
    let originalTournamentLogo = '';
    let originalTeamLogo = '';

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

            // Action delete click — cascades to team logo + all player photos
            tr.querySelector('.btn-delete-team-row').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete ${team.name} and all its players?`)) {
                    await cascadeDeleteTeamImages(team.id);
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

        // ── COMPACT PLAYER CARD LIST ──────────────────────────
        players.forEach(p => {
            const photoUrl = DB.getPlayerAvatar(p, team);
            const s = p.stats || {};
            const posColors = { GK:'#f59e0b', DF:'#3b82f6', MF:'#10b981', FW:'#ef4444' };
            const posColor = posColors[p.position] || '#6b7280';

            const card = document.createElement('div');
            card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;transition:background 0.2s;';
            card.innerHTML = `
                <!-- Avatar -->
                <div style="width:44px;height:44px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid ${posColor}33;">
                    <img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;">
                </div>
                <!-- Shirt # -->
                <div style="font-size:1.1rem;font-weight:900;color:${posColor};min-width:28px;text-align:center;">${p.number}</div>
                <!-- Name + pos -->
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;color:#fff;font-size:0.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</div>
                    <span style="font-size:0.7rem;font-weight:700;color:${posColor};background:${posColor}22;padding:2px 7px;border-radius:4px;">${p.position}</span>
                </div>
                <!-- Mini stats -->
                <div style="display:flex;gap:12px;font-size:0.75rem;color:#6b7280;flex-shrink:0;">
                    <span title="Goals">⚽ ${s.goals||0}</span>
                    <span title="Shots">🎯 ${s.shots||0}</span>
                    <span title="Yellow Cards" style="color:#fbbf24;">🟨 ${s.yellowCards||0}</span>
                    <span title="Red Cards" style="color:#ef4444;">🟥 ${s.redCards||0}</span>
                </div>
                <!-- Edit + Delete -->
                <div style="display:flex;gap:6px;flex-shrink:0;">
                    <button class="btn-edit-player" data-pid="${p.id}" type="button"
                        style="padding:6px 12px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);border-radius:6px;color:#10b981;font-size:0.8rem;font-weight:600;cursor:pointer;">
                        ✏️ Edit
                    </button>
                    <button class="btn-delete-player" data-pid="${p.id}" type="button"
                        style="padding:6px 10px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:6px;color:#ef4444;font-size:0.8rem;cursor:pointer;">
                        🗑
                    </button>
                </div>`;

            tbody.appendChild(card);
        });

        // Delete
        tbody.querySelectorAll('.btn-delete-player').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const pid = e.currentTarget.dataset.pid;
                const player = DB.getPlayers().find(p => p.id === pid);
                if (player && confirm(`Remove ${player.name} from the roster?`)) {
                    // Delete player's cloud photo before removing record
                    if (player.photo) await deleteCloudImage(player.photo);
                    DB.deletePlayer(pid);
                    showTeamEditor(teamId);
                }
            });
        });

        // Edit — open modal
        tbody.querySelectorAll('.btn-edit-player').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pid = e.currentTarget.dataset.pid;
                openEditPlayerModal(pid, teamId);
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
                originalTournamentLogo = tournament.logo || '';
                
                document.getElementById('modal-edit-tournament').classList.add('active');
            }
        }
    });

    document.getElementById('form-edit-tournament').addEventListener('submit', async () => {
        const id = document.getElementById('edit-t-id').value;
        const name = document.getElementById('edit-t-name').value;
        
        const db = DB.getDb();
        const tIdx = db.tournaments.findIndex(t => t.id === id);
        if (tIdx !== -1) {
            db.tournaments[tIdx].name = name;
            db.tournaments[tIdx].logo = tempTournamentLogoBase64;
            DB.saveDb(db);

            // If logo changed, delete the old one from Cloudinary
            if (originalTournamentLogo && originalTournamentLogo !== tempTournamentLogoBase64) {
                await deleteCloudImage(originalTournamentLogo);
            }
        }
        
        closeAllModals();
        showTournamentEditor(id);
        renderNavigatorTree();
    });

    // 3. DELETE ACTIVE TOURNAMENT
    document.getElementById('btn-delete-tournament-action').addEventListener('click', async () => {
        if (activeSelection.type === 'tournament') {
            const t = DB.getTournaments().find(item => item.id === activeSelection.id);
            if (t && confirm(`CRITICAL WARNING: Are you sure you want to delete tournament "${t.name}"? This will erase all member teams, coaches, players, and match statistics logs permanently!`)) {
                // Cascade: tournament logo + every team's logo + every player's photo
                const urls = [];
                if (t.logo) urls.push(t.logo);
                const db = DB.getDb();
                const teamsInTournament = db.teams.filter(team => team.tournamentId === t.id);
                teamsInTournament.forEach(team => {
                    if (team.logo) urls.push(team.logo);
                    DB.getPlayers(team.id).forEach(p => { if (p.photo) urls.push(p.photo); });
                });
                await deleteCloudImagesBulk(urls);

                DB.deleteTournament(t.id);
                selectNode('welcome', null);
            }
        }
    });

    // Helper: cascade-delete a team's logo + all its players' photos from Cloudinary
    async function cascadeDeleteTeamImages(teamId) {
        const urls = [];
        const team = DB.getTeams().find(t => t.id === teamId);
        if (team?.logo) urls.push(team.logo);
        DB.getPlayers(teamId).forEach(p => { if (p.photo) urls.push(p.photo); });
        await deleteCloudImagesBulk(urls);
    }

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
                    originalTeamLogo = team.logo;
                } else {
                    previewImg.style.display = 'none';
                    placeholderSvg.style.display = 'block';
                    tempTeamLogoBase64 = '';
                }
                
                modalEditTeam.classList.add('active');
            }
        }
    });

    document.getElementById('form-edit-team').addEventListener('submit', async () => {
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

        if (originalTeamLogo && originalTeamLogo !== tempTeamLogoBase64) { await deleteCloudImage(originalTeamLogo); }

        closeAllModals();
        showTeamEditor(id);
        renderNavigatorTree();
    });

    // 5. DELETE ACTIVE TEAM
    document.getElementById('btn-delete-team-action').addEventListener('click', async () => {
        if (activeSelection.type === 'team') {
            const team = DB.getTeams().find(t => t.id === activeSelection.id);
            if (team && confirm(`Are you sure you want to delete ${team.name}? This will erase its coach and player roster.`)) {
                await cascadeDeleteTeamImages(team.id);
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
    document.getElementById('input-player-photo').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!checkFileSize(file)) { e.target.value = ''; return; }
        const previewImg = document.getElementById('img-player-photo-preview');
        const placeholderSvg = document.getElementById('svg-player-photo-placeholder');

        // Show preview immediately using local URL
        const localUrl = URL.createObjectURL(file);
        previewImg.src = localUrl;
        previewImg.style.display = 'block';
        placeholderSvg.style.display = 'none';

        // Try Cloudinary upload first
        const cloudUrl = await uploadPhoto(file, 'player', 'temp_' + Date.now());
        if (cloudUrl) {
            tempPlayerPhotoBase64 = cloudUrl;
        } else {
            // Fallback: compress and use base64
            compressImage(file, 300, 0.8, function(compressed) {
                tempPlayerPhotoBase64 = compressed;
            });
        }
    });

    // Tournament Logo Readers
    document.getElementById('input-t-logo').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!checkFileSize(file)) { e.target.value = ''; return; }
            compressImage(file, 200, 0.85, function(compressed) {
                tempTournamentLogoBase64 = compressed;
                const previewImg = document.getElementById('img-t-logo-preview');
                const placeholderSvg = document.getElementById('svg-t-logo-placeholder');
                previewImg.src = tempTournamentLogoBase64;
                previewImg.style.display = 'block';
                placeholderSvg.style.display = 'none';
            });
        }
    });

    document.getElementById('edit-t-logo').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!checkFileSize(file)) { e.target.value = ''; return; }
            compressImage(file, 200, 0.85, function(compressed) {
                tempTournamentLogoBase64 = compressed;
                const previewImg = document.getElementById('img-edit-t-logo-preview');
                const placeholderSvg = document.getElementById('svg-edit-t-logo-placeholder');
                previewImg.src = tempTournamentLogoBase64;
                previewImg.style.display = 'block';
                placeholderSvg.style.display = 'none';
            });
        }
    });

    // Team Logo Readers
    document.getElementById('input-team-logo').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!checkFileSize(file)) { e.target.value = ''; return; }
            compressImage(file, 200, 0.85, function(compressed) {
                tempTeamLogoBase64 = compressed;
                const previewImg = document.getElementById('img-team-logo-preview');
                const placeholderSvg = document.getElementById('svg-team-logo-placeholder');
                previewImg.src = tempTeamLogoBase64;
                previewImg.style.display = 'block';
                placeholderSvg.style.display = 'none';
            });
        }
    });

    document.getElementById('edit-team-logo').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!checkFileSize(file)) { e.target.value = ''; return; }
            compressImage(file, 200, 0.85, function(compressed) {
                tempTeamLogoBase64 = compressed;
                const previewImg = document.getElementById('img-edit-team-logo-preview');
                const placeholderSvg = document.getElementById('svg-edit-team-logo-placeholder');
                previewImg.src = tempTeamLogoBase64;
                previewImg.style.display = 'block';
                placeholderSvg.style.display = 'none';
            });
        }
    });

    document.getElementById('form-add-player').addEventListener('submit', async (e) => {
        const name = document.getElementById('input-player-name').value;
        const number = document.getElementById('input-player-number').value;
        const pos = document.getElementById('input-player-position').value;

        if (activeSelection.type === 'team') {
            // Enforce 300 player limit per account
            const okToAdd = await checkPlayerLimit();
            if (!okToAdd) return;

            DB.addPlayer(activeSelection.id, name, number, pos, tempPlayerPhotoBase64);
            closeAllModals();
            showTeamEditor(activeSelection.id);
        }
    });

    // Initial Tree render
    renderNavigatorTree();

    // ── EDIT PLAYER MODAL ─────────────────────────────────────
    let editPlayerTeamId = null;
    let editPlayerPhotoFile = null;

    function openEditPlayerModal(pid, teamId) {
        const player = DB.getPlayers().find(p => p.id === pid);
        if (!player) return;
        editPlayerTeamId = teamId;
        editPlayerPhotoFile = null;

        document.getElementById('ep-player-id').value = pid;
        document.getElementById('ep-name').value = player.name || '';
        document.getElementById('ep-number').value = player.number || '';
        document.getElementById('ep-position').value = player.position || 'FW';
        const s = player.stats || {};
        document.getElementById('ep-goals').value = s.goals || 0;
        document.getElementById('ep-shots').value = s.shots || 0;
        document.getElementById('ep-sot').value = s.shotsOnTarget || 0;
        document.getElementById('ep-fouls').value = s.fouls || 0;
        document.getElementById('ep-yellow').value = s.yellowCards || 0;
        document.getElementById('ep-red').value = s.redCards || 0;
        document.getElementById('ep-offsides').value = s.offsides || 0;
        document.getElementById('ep-injuries').value = s.injuries || 0;

        // Show photo preview
        const preview = document.getElementById('ep-photo-preview');
        const team = DB.getDb().teams.find(t => t.id === teamId);
        const photoUrl = DB.getPlayerAvatar(player, team);
        preview.innerHTML = `<img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;">`;

        document.getElementById('ep-msg').style.display = 'none';
        document.getElementById('edit-player-modal').style.display = 'flex';
    }

    // Photo change in edit modal
    document.getElementById('ep-photo-input').addEventListener('change', function() {
        const file = this.files[0];
        if (!file) return;
        if (!checkFileSize(file)) { this.value = ''; return; }
        editPlayerPhotoFile = file;
        compressImage(file, 300, 0.8, function(compressed) {
            const preview = document.getElementById('ep-photo-preview');
            preview.innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover;">`;
        });
    });

    // Save edited player
    document.getElementById('ep-save-btn').addEventListener('click', async () => {
        const pid = document.getElementById('ep-player-id').value;
        const btn = document.getElementById('ep-save-btn');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        let photoData = null;
        if (editPlayerPhotoFile) {
            // Try Cloudinary upload first
            const player = DB.getPlayers().find(p => p.id === pid);
            const oldPhoto = player?.photo || '';
            const cloudUrl = await uploadPhoto(editPlayerPhotoFile, 'player', pid, oldPhoto);
            if (cloudUrl) {
                photoData = cloudUrl;
            } else {
                // Fallback to base64
                photoData = await new Promise(resolve => {
                    compressImage(editPlayerPhotoFile, 300, 0.8, resolve);
                });
            }
        }

        const updates = {
            name: document.getElementById('ep-name').value.trim(),
            number: parseInt(document.getElementById('ep-number').value) || 0,
            position: document.getElementById('ep-position').value,
            stats: {
                goals:         parseInt(document.getElementById('ep-goals').value) || 0,
                shots:         parseInt(document.getElementById('ep-shots').value) || 0,
                shotsOnTarget: parseInt(document.getElementById('ep-sot').value) || 0,
                fouls:         parseInt(document.getElementById('ep-fouls').value) || 0,
                yellowCards:   parseInt(document.getElementById('ep-yellow').value) || 0,
                redCards:      parseInt(document.getElementById('ep-red').value) || 0,
                offsides:      parseInt(document.getElementById('ep-offsides').value) || 0,
                injuries:      parseInt(document.getElementById('ep-injuries').value) || 0,
            }
        };
        if (photoData) updates.photo = photoData;

        DB.updatePlayer(pid, updates);
        document.getElementById('edit-player-modal').style.display = 'none';
        showTeamEditor(editPlayerTeamId);

        btn.disabled = false;
        btn.textContent = 'Save Player';
    });

    // Close on backdrop click
    document.getElementById('edit-player-modal').addEventListener('click', function(e) {
        if (e.target === this) this.style.display = 'none';
    });
});
