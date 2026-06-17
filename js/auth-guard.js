// auth-guard.js - Included in every protected page
(function() {
    const token = localStorage.getItem('bfx_token');
    const user  = localStorage.getItem('bfx_user');

    if (!token || !user) {
        window.location.href = '/login';
        throw new Error('Not authenticated');
    }

    window.BFX_TOKEN = token;
    window.BFX_USER  = JSON.parse(user);

    // Global fetch wrapper — adds auth header, handles 401
    window.apiFetch = async function(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            ...(options.headers || {})
        };
        const res = await fetch(url, { ...options, headers });
        if (res.status === 401) {
            localStorage.removeItem('bfx_token');
            localStorage.removeItem('bfx_user');
            window.location.href = '/login?session=expired';
            throw new Error('Session expired');
        }
        return res;
    };

    // Auto-sync server data to localStorage on page load
    // This ensures data appears correctly regardless of which domain the user is on
    window.addEventListener('DOMContentLoaded', async () => {
        // Only sync if localStorage appears empty for this user
        const uid = window.BFX_USER?.id;
        if (!uid) return;
        const hasLocalData = localStorage.getItem('bfx_' + uid + '_bfx_database');
        if (!hasLocalData) {
            try {
                const res = await window.apiFetch('/api/data');
                const data = await res.json();
                let loaded = 0;
                Object.entries(data).forEach(([key, value]) => {
                    if (value !== null) {
                        localStorage.setItem('bfx_' + uid + '_' + key, JSON.stringify(value));
                        loaded++;
                    }
                });
                if (loaded > 0) {
                    console.log('BhakundoFX: Loaded ' + loaded + ' data keys from server');
                    // Reload once to apply the freshly loaded data
                    window.location.reload();
                }
            } catch (e) {
                console.warn('BhakundoFX: Could not sync from server:', e.message);
            }
        }
    });
})();
