// auth-guard.js - Include in every protected page (setup, control, customize, overlay)
(function() {
    const token = localStorage.getItem('bfx_token');
    const user  = localStorage.getItem('bfx_user');

    if (!token || !user) {
        window.location.href = '/login';
        throw new Error('Not authenticated');
    }

    // Expose globally for API calls
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
})();
