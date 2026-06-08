// db.js - Unified database & LocalStorage sync layer for BhakundoFX
// Supports both local (guest) and authenticated (cloud sync) modes

// ─── SERVER SYNC ─────────────────────────────────────────────
// Syncs data to Railway server in background (non-blocking)
async function syncToServer(key, value) {
    if (!window.BFX_TOKEN) return;
    try {
        await window.apiFetch('/api/data/' + key, {
            method: 'POST',
            body: JSON.stringify({ data: value })
        });
    } catch (e) {
        console.warn('Sync to server failed for key:', key);
    }
}

// Load all user data from server into localStorage on login
async function loadFromServer() {
    if (!window.BFX_TOKEN) return;
    try {
        const res = await window.apiFetch('/api/data');
        const data = await res.json();
        const uid = window.BFX_USER.id;
        Object.entries(data).forEach(([key, value]) => {
            if (value !== null) localStorage.setItem('bfx_' + uid + '_' + key, JSON.stringify(value));
        });
        console.log('User data loaded from server');
    } catch (e) {
        console.warn('Failed to load from server, using local cache');
    }
}

// Get namespaced localStorage key (per-user isolation)
function userKey(key) {
    if (window.BFX_USER) return 'bfx_' + window.BFX_USER.id + '_' + key;
    return 'bfx_guest_' + key;
}

// -------------------------------------------------------------
// HELPER: Generate Beautiful SVG Avatars with Team Colors
// -------------------------------------------------------------
function generateSvgAvatar(initials, primaryColor, secondaryColor) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">' +
        '<circle cx="50" cy="50" r="46" fill="' + primaryColor + '" stroke="' + secondaryColor + '" stroke-width="4"/>' +
        '<circle cx="50" cy="38" r="18" fill="white" opacity="0.15"/>' +
        '<path d="M 20,82 C 20,62 30,55 50,55 C 70,55 80,62 80,82 Z" fill="white" opacity="0.15"/>' +
        '<text x="50" y="58" font-family="Space Grotesk, sans-serif" font-weight="bold" font-size="28" fill="white" text-anchor="middle" dominant-baseline="middle">' + initials + '</text>' +
        '</svg>';
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

function generateSvgLogo(name, primaryColor, secondaryColor) {
    const encInitials = encodeURIComponent(name.substring(0, 3).toUpperCase());
    const encPrimary = encodeURIComponent(primaryColor);
    const encSecondary = encodeURIComponent(secondaryColor);
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">` +
        `<polygon points="50,5 90,25 90,75 50,95 10,75 10,25" fill="${encPrimary}" stroke="${encSecondary}" stroke-width="5" stroke-linejoin="round"/>` +
        `<polygon points="50,15 80,30 80,70 50,85 20,70 20,30" fill="none" stroke="white" stroke-width="2" opacity="0.5"/>` +
        `<text x="50" y="52" font-family="'Space Grotesk', sans-serif" font-weight="bold" font-size="24" fill="white" text-anchor="middle" dominant-baseline="middle">${encInitials}</text>` +
        `</svg>`;
}

// -------------------------------------------------------------
// CORE DB CONFIG
// -------------------------------------------------------------
const DB_KEYS = {
    DATABASE: 'bfx_database',
    MATCH_STATE: 'bfx_match_state',
    OVERLAY_CONFIG: 'bfx_overlay_config',
    OVERLAY_TRIGGER: 'bfx_overlay_trigger'
};

const DEFAULT_DATABASE = {
    tournaments: [
        { id: 't1', name: 'Champions Elite League', logo: '' },
        { id: 't2', name: 'Super Football Cup', logo: '' }
    ],
    teams: [
        // Tournament 1 Teams
        {
            id: 'team1',
            tournamentId: 't1',
            name: 'Real Madrid',
            shortName: 'RMA',
            primaryColor: '#1e3a8a', // Deep Blue
            secondaryColor: '#f59e0b', // Amber/Gold
            coach: { name: 'Carlo Ancelotti', photo: '' }
        },
        {
            id: 'team2',
            tournamentId: 't1',
            name: 'Manchester City',
            shortName: 'MCI',
            primaryColor: '#0ea5e9', // Sky Blue
            secondaryColor: '#1e293b', // Slate Navy
            coach: { name: 'Pep Guardiola', photo: '' }
        },
        // Tournament 2 Teams
        {
            id: 'team3',
            tournamentId: 't2',
            name: 'Barcelona FC',
            shortName: 'BAR',
            primaryColor: '#b91c1c', // Cardinal Red
            secondaryColor: '#1d4ed8', // Dark Blue
            coach: { name: 'Hansi Flick', photo: '' }
        },
        {
            id: 'team4',
            tournamentId: 't2',
            name: 'Arsenal FC',
            shortName: 'ARS',
            primaryColor: '#dc2626', // Red
            secondaryColor: '#ffffff', // White
            coach: { name: 'Mikel Arteta', photo: '' }
        }
    ],
    players: [
        // Real Madrid Players
        { id: 'p1', teamId: 'team1', name: 'Thibaut Courtois', number: 1, position: 'GK', photo: '', stats: { goals: 0, fouls: 0, shots: 0, shotsOnTarget: 0, yellowCards: 0, redCards: 0, offsides: 0, injuries: 0 } },
        { id: 'p2', teamId: 'team1', name: 'Eder Militao', number: 3, position: 'DF', photo: '', stats: { goals: 1, fouls: 8, shots: 4, shotsOnTarget: 2, yellowCards: 2, redCards: 0, offsides: 0, injuries: 0 } },
        { id: 'p3', teamId: 'team1', name: 'Antonio Rüdiger', number: 22, position: 'DF', photo: '', stats: { goals: 2, fouls: 10, shots: 6, shotsOnTarget: 3, yellowCards: 1, redCards: 0, offsides: 0, injuries: 0 } },
        { id: 'p4', teamId: 'team1', name: 'Jude Bellingham', number: 5, position: 'MF', photo: '', stats: { goals: 12, fouls: 15, shots: 22, shotsOnTarget: 14, yellowCards: 3, redCards: 0, offsides: 1, injuries: 0 } },
        { id: 'p5', teamId: 'team1', name: 'Luka Modric', number: 10, position: 'MF', photo: '', stats: { goals: 4, fouls: 3, shots: 10, shotsOnTarget: 5, yellowCards: 0, redCards: 0, offsides: 0, injuries: 0 } },
        { id: 'p6', teamId: 'team1', name: 'Vinicius Junior', number: 7, position: 'FW', photo: '', stats: { goals: 21, fouls: 9, shots: 38, shotsOnTarget: 24, yellowCards: 4, redCards: 0, offsides: 8, injuries: 0 } },
        { id: 'p7', teamId: 'team1', name: 'Kylian Mbappe', number: 9, position: 'FW', photo: '', stats: { goals: 24, fouls: 2, shots: 42, shotsOnTarget: 29, yellowCards: 1, redCards: 0, offsides: 11, injuries: 0 } },
        { id: 'p8', teamId: 'team1', name: 'Rodrygo Goes', number: 11, position: 'FW', photo: '', stats: { goals: 9, fouls: 4, shots: 18, shotsOnTarget: 11, yellowCards: 0, redCards: 0, offsides: 3, injuries: 0 } },
        { id: 'p9', teamId: 'team1', name: 'Eduardo Camavinga', number: 6, position: 'MF', photo: '', stats: { goals: 2, fouls: 14, shots: 8, shotsOnTarget: 4, yellowCards: 5, redCards: 0, offsides: 0, injuries: 0 } },
        { id: 'p10', teamId: 'team1', name: 'Federico Valverde', number: 8, position: 'MF', photo: '', stats: { goals: 6, fouls: 7, shots: 15, shotsOnTarget: 8, yellowCards: 1, redCards: 0, offsides: 1, injuries: 0 } },
        { id: 'p11', teamId: 'team1', name: 'Dani Carvajal', number: 2, position: 'DF', photo: '', stats: { goals: 1, fouls: 12, shots: 5, shotsOnTarget: 2, yellowCards: 3, redCards: 0, offsides: 1, injuries: 0 } },

        // Manchester City Players
        { id: 'p12', teamId: 'team2', name: 'Ederson Moraes', number: 31, position: 'GK', photo: '', stats: { goals: 0, fouls: 1, shots: 0, shotsOnTarget: 0, yellowCards: 1, redCards: 0, offsides: 0, injuries: 0 } },
        { id: 'p13', teamId: 'team2', name: 'Ruben Dias', number: 3, position: 'DF', photo: '', stats: { goals: 1, fouls: 6, shots: 5, shotsOnTarget: 2, yellowCards: 2, redCards: 0, offsides: 0, injuries: 0 } },
        { id: 'p14', teamId: 'team2', name: 'Manuel Akanji', number: 25, position: 'DF', photo: '', stats: { goals: 2, fouls: 7, shots: 4, shotsOnTarget: 2, yellowCards: 1, redCards: 0, offsides: 0, injuries: 0 } },
        { id: 'p15', teamId: 'team2', name: 'Rodri Hernandez', number: 16, position: 'MF', photo: '', stats: { goals: 7, fouls: 16, shots: 14, shotsOnTarget: 9, yellowCards: 4, redCards: 0, offsides: 0, injuries: 0 } },
        { id: 'p16', teamId: 'team2', name: 'Kevin De Bruyne', number: 17, position: 'MF', photo: '', stats: { goals: 10, fouls: 5, shots: 26, shotsOnTarget: 16, yellowCards: 1, redCards: 0, offsides: 0, injuries: 0 } },
        { id: 'p17', teamId: 'team2', name: 'Phil Foden', number: 47, position: 'MF', photo: '', stats: { goals: 16, fouls: 3, shots: 31, shotsOnTarget: 19, yellowCards: 0, redCards: 0, offsides: 2, injuries: 0 } },
        { id: 'p18', teamId: 'team2', name: 'Erling Haaland', number: 9, position: 'FW', photo: '', stats: { goals: 32, fouls: 8, shots: 55, shotsOnTarget: 38, yellowCards: 2, redCards: 0, offsides: 14, injuries: 0 } },
        { id: 'p19', teamId: 'team2', name: 'Bernardo Silva', number: 20, position: 'MF', photo: '', stats: { goals: 8, fouls: 11, shots: 16, shotsOnTarget: 10, yellowCards: 2, redCards: 0, offsides: 1, injuries: 0 } },
        { id: 'p20', teamId: 'team2', name: 'Jeremy Doku', number: 11, position: 'FW', photo: '', stats: { goals: 5, fouls: 4, shots: 15, shotsOnTarget: 9, yellowCards: 1, redCards: 0, offsides: 4, injuries: 0 } },
        { id: 'p21', teamId: 'team2', name: 'Josko Gvardiol', number: 24, position: 'DF', photo: '', stats: { goals: 4, fouls: 9, shots: 10, shotsOnTarget: 6, yellowCards: 1, redCards: 0, offsides: 0, injuries: 0 } },
        { id: 'p22', teamId: 'team2', name: 'Kyle Walker', number: 2, position: 'DF', photo: '', stats: { goals: 0, fouls: 10, shots: 3, shotsOnTarget: 1, yellowCards: 2, redCards: 0, offsides: 1, injuries: 0 } }
    ]
};

const DEFAULT_OVERLAY_CONFIG = {
    theme: 'cyber', // 'classic', 'cyber', 'gold', 'fire', 'ice'
    fontFamily: 'Space Grotesk', // 'Space Grotesk', 'Outfit', 'Teko', 'Courier New'
    scoreboardPos: 'top-center', // 'top-left', 'top-center', 'top-right'
    statsPos: 'center-right', // 'bottom-left', 'bottom-right', 'center-left', 'center-right'
    overlayScale: 100, // 80 to 120
    colors: {
        primary: '#10b981', // Glow green
        overlayBg: 'rgba(15, 23, 42, 0.85)'
    }
};

const DEFAULT_MATCH_STATE = {
    status: 'prematch', // 'prematch', 'ready', 'live', 'paused', 'finished'
    tournamentId: '',
    teamA: null, // Team object
    teamB: null, // Team object
    stadium: '',
    referee: '',
    casters: '',
    duration: 90, // Match half duration (usually 45, total 90, or test duration like 10)
    currentTime: 0, // elapsed time in seconds
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
    lineupA: [], // Roster IDs for Team A
    lineupB: [], // Roster IDs for Team B
    timeline: [], // array of events: { time: seconds, type: 'goal'|'card'|'sub'..., detail: {} }
    activeGraphic: 'none', // 'vs', 'lineups', 'stats', 'casters', 'referees', 'none'
    timerRunning: false
};

// -------------------------------------------------------------
// DATABASE UTILITY API
// -------------------------------------------------------------
const DB = {
    // Read whole DB
    getDb: function() {
        let dbStr = localStorage.getItem(userKey(DB_KEYS.DATABASE));
        if (!dbStr) {
            this.saveDb(DEFAULT_DATABASE);
            return DEFAULT_DATABASE;
        }
        try {
            const parsed = JSON.parse(dbStr);
            // Ensure coaches exist and photos default
            if (!parsed.tournaments || !parsed.teams || !parsed.players) {
                this.saveDb(DEFAULT_DATABASE);
                return DEFAULT_DATABASE;
            }
            return parsed;
        } catch (e) {
            console.error("Failed to parse DB from localStorage, resetting...", e);
            this.saveDb(DEFAULT_DATABASE);
            return DEFAULT_DATABASE;
        }
    },

    saveDb: function(db) {
        localStorage.setItem(userKey(DB_KEYS.DATABASE), JSON.stringify(db));
        syncToServer(DB_KEYS.DATABASE, db);
    },

    // Tournaments
    getTournaments: function() {
        return this.getDb().tournaments;
    },

    addTournament: function(name, logo = '') {
        const db = this.getDb();
        const newT = {
            id: 't_' + Date.now(),
            name: name,
            logo: logo
        };
        db.tournaments.push(newT);
        this.saveDb(db);
        return newT;
    },

    deleteTournament: function(id) {
        const db = this.getDb();
        db.tournaments = db.tournaments.filter(t => t.id !== id);
        // Cascade delete teams & players
        const teamIds = db.teams.filter(t => t.tournamentId === id).map(t => t.id);
        db.teams = db.teams.filter(t => t.tournamentId !== id);
        db.players = db.players.filter(p => !teamIds.includes(p.teamId));
        this.saveDb(db);
    },

    // Teams
    getTeams: function(tournamentId = null) {
        const db = this.getDb();
        if (tournamentId) {
            return db.teams.filter(t => t.tournamentId === tournamentId);
        }
        return db.teams;
    },

    addTeam: function(tournamentId, name, shortName, pColor, sColor, coachName, logo = '') {
        const db = this.getDb();
        const newTeam = {
            id: 'team_' + Date.now(),
            tournamentId: tournamentId,
            name: name,
            shortName: shortName.toUpperCase(),
            primaryColor: pColor || '#1e3a8a',
            secondaryColor: sColor || '#ffffff',
            coach: { name: coachName || 'TBD', photo: '' },
            logo: logo
        };
        db.teams.push(newTeam);
        this.saveDb(db);
        return newTeam;
    },

    updateTeam: function(teamId, updates) {
        const db = this.getDb();
        const teamIdx = db.teams.findIndex(t => t.id === teamId);
        if (teamIdx !== -1) {
            db.teams[teamIdx] = { ...db.teams[teamIdx], ...updates };
            this.saveDb(db);
            return db.teams[teamIdx];
        }
        return null;
    },

    deleteTeam: function(id) {
        const db = this.getDb();
        db.teams = db.teams.filter(t => t.id !== id);
        db.players = db.players.filter(p => p.teamId !== id);
        this.saveDb(db);
    },

    // Players
    getPlayers: function(teamId = null) {
        const db = this.getDb();
        if (teamId) {
            return db.players.filter(p => p.teamId === teamId);
        }
        return db.players;
    },

    addPlayer: function(teamId, name, number, position, photo = '') {
        const db = this.getDb();
        const newP = {
            id: 'p_' + Date.now(),
            teamId: teamId,
            name: name,
            number: parseInt(number) || 99,
            position: position || 'FW',
            photo: photo,
            stats: { goals: 0, fouls: 0, shots: 0, shotsOnTarget: 0, yellowCards: 0, redCards: 0, offsides: 0, injuries: 0 }
        };
        db.players.push(newP);
        this.saveDb(db);
        return newP;
    },

    updatePlayer: function(playerId, updates) {
        const db = this.getDb();
        const idx = db.players.findIndex(p => p.id === playerId);
        if (idx !== -1) {
            db.players[idx] = { 
                ...db.players[idx], 
                ...updates,
                stats: { ...(db.players[idx].stats || {}), ...(updates.stats || {}) }
            };
            this.saveDb(db);
            return db.players[idx];
        }
        return null;
    },

    deletePlayer: function(id) {
        const db = this.getDb();
        db.players = db.players.filter(p => p.id !== id);
        this.saveDb(db);
    },

    // -------------------------------------------------------------
    // OVERLAY CONFIGURATION MANAGEMENT
    // -------------------------------------------------------------
    getOverlayConfig: function() {
        const configStr = localStorage.getItem(userKey(DB_KEYS.OVERLAY_CONFIG));
        if (!configStr) {
            this.saveOverlayConfig(DEFAULT_OVERLAY_CONFIG);
            return DEFAULT_OVERLAY_CONFIG;
        }
        try {
            return JSON.parse(configStr);
        } catch(e) {
            return DEFAULT_OVERLAY_CONFIG;
        }
    },

    saveOverlayConfig: function(config) {
        localStorage.setItem(userKey(DB_KEYS.OVERLAY_CONFIG), JSON.stringify(config));
        syncToServer(DB_KEYS.OVERLAY_CONFIG, config);
    },

    // -------------------------------------------------------------
    // LIVE MATCH STATE MANAGEMENT
    // -------------------------------------------------------------
    getMatchState: function() {
        const stateStr = localStorage.getItem(userKey(DB_KEYS.MATCH_STATE));
        if (!stateStr) {
            this.saveMatchState(DEFAULT_MATCH_STATE);
            return DEFAULT_MATCH_STATE;
        }
        try {
            return JSON.parse(stateStr);
        } catch(e) {
            return DEFAULT_MATCH_STATE;
        }
    },

    saveMatchState: function(state) {
        localStorage.setItem(userKey(DB_KEYS.MATCH_STATE), JSON.stringify(state));
        syncToServer(DB_KEYS.MATCH_STATE, state);
    },

    resetMatchState: function() {
        this.saveMatchState(DEFAULT_MATCH_STATE);
        return DEFAULT_MATCH_STATE;
    },

    // -------------------------------------------------------------
    // REAL-TIME SYNC TRIGGER SYSTEM (OBS OVERLAYS)
    // -------------------------------------------------------------
    // Sends a high-impact notification to the overlay page
    triggerOverlayAnimation: function(type, payload) {
        const trigger = {
            id: Date.now() + '_' + Math.random(),
            type: type, // 'goal', 'card', 'sub', 'lineup_show', 'stats_show', etc.
            payload: payload,
            timestamp: Date.now()
        };
        localStorage.setItem(userKey(DB_KEYS.OVERLAY_TRIGGER), JSON.stringify(trigger));
    },

    getLatestTrigger: function() {
        const trigStr = localStorage.getItem(userKey(DB_KEYS.OVERLAY_TRIGGER));
        if (!trigStr) return null;
        try {
            return JSON.parse(trigStr);
        } catch(e) {
            return null;
        }
    },

    // Helper to get formatted match time string: "MM:SS" or "45+1" etc.
    formatMatchTime: function(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSecs = seconds % 60;
        const pad = (num) => String(num).padStart(2, '0');
        
        // Handle soccer overtime / half structure
        // Let's keep it simple for now or represent actual live counter:
        return `${pad(minutes)}:${pad(remainingSecs)}`;
    },

    // Render player avatar
    getPlayerAvatar: function(player, team) {
        if (player.photo) return player.photo;
        
        // Generate vector initial avatar using team colors
        const initials = player.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        return generateSvgAvatar(initials, team.primaryColor, team.secondaryColor);
    },

    getTeamLogo: function(team) {
        if (team && team.logo) return team.logo;
        return generateSvgLogo(team ? team.name : 'TEM', team ? team.primaryColor : '#000', team ? team.secondaryColor : '#fff');
    },

    getTournamentLogo: function(tournament) {
        if (tournament && tournament.logo) return tournament.logo;
        // Generate fallback initials badge
        const name = tournament ? tournament.name : 'LEA';
        const initials = name.substring(0, 3).toUpperCase();
        const encInitials = encodeURIComponent(initials);
        return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">` +
            `<circle cx="50" cy="50" r="46" fill="%23111827" stroke="%2310b981" stroke-width="4"/>` +
            `<text x="50" y="55" font-family="'Space Grotesk', sans-serif" font-weight="bold" font-size="28" fill="white" text-anchor="middle" dominant-baseline="middle">${encInitials}</text>` +
            `</svg>`;
    }
};

// Expose DB to global scope for page scripts
window.DB = DB;
window.DB.loadFromServer = loadFromServer;
