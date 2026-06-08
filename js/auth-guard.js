// auth-guard.js - Included in every protected page (setup, control, customize, overlay)
(function() {
    const token = localStorage.getItem('bfx_token');
    const user = localStorage.getItem('bfx_user');
    if (!token || !user) {
        window.location.href = '/login.html';
        throw new Error('Not authenticated');
    }
    window.BFX_TOKEN = token;
    window.BFX_USER = JSON.parse(user);

    // Global fetch wrapper that adds auth header and handles session expiry
    window.apiFetch = async function(url, options = {}) {
        const res = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
                ...(options.headers || {})
            }
        });
        if (res.status === 401) {
            localStorage.removeItem('bfx_token');
            localStorage.removeItem('bfx_user');
            window.location.href = '/login.html?session=expired';
            throw new Error('Session expired');
        }
        return res;
    };
})();
