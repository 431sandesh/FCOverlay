// profile.js — Sidebar user profile + edit modal manager
// Include after auth-guard.js on every protected page

(function() {
    // ── INJECT SIDEBAR HTML ──────────────────────────────────
    function buildSidebar() {
        const user = window.BFX_USER;
        if (!user) return;

        const footer = document.querySelector('.user-profile-footer');
        if (!footer) return;

        const avatarHtml = user.avatarData
            ? `<img src="${user.avatarData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : `<span style="font-size:0.85rem;font-weight:700;color:#000;">${user.initials || '??'}</span>`;

        footer.style.cursor = 'default';
        footer.innerHTML = `
            <div class="user-avatar" id="sidebar-avatar"
                style="background:${user.avatarColor||'#10b981'};overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                ${avatarHtml}
            </div>
            <div class="user-info" style="flex:1;min-width:0;">
                <span class="user-name" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${user.fullName || 'User'}
                </span>
                <span class="user-role" style="display:block;font-size:0.7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:0.6;">
                    ${user.organizationName || user.username || user.email || ''}
                </span>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
                <button onclick="ProfileManager.open()" title="Edit Profile"
                    style="background:none;border:none;color:var(--color-accent);cursor:pointer;padding:4px;font-size:0.7rem;white-space:nowrap;">
                    ✏️ Edit
                </button>
                <button onclick="ProfileManager.logout()" title="Sign Out"
                    style="background:none;border:none;color:#ef4444;cursor:pointer;padding:4px;font-size:0.7rem;white-space:nowrap;">
                    → Out
                </button>
            </div>`;
    }

    // ── INJECT MODAL HTML ────────────────────────────────────
    function buildModal() {
        const existing = document.getElementById('profile-modal-overlay');
        if (existing) return;

        const modal = document.createElement('div');
        modal.id = 'profile-modal-overlay';
        modal.style.cssText = `display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;align-items:center;justify-content:center;`;
        modal.innerHTML = `
        <div style="background:#0d1f17;border:1px solid rgba(16,185,129,0.2);border-radius:16px;padding:28px;width:100%;max-width:420px;margin:20px;position:relative;">
            <button onclick="ProfileManager.close()"
                style="position:absolute;top:14px;right:16px;background:none;border:none;color:#9ca3af;font-size:1.2rem;cursor:pointer;">✕</button>

            <h3 style="color:#fff;margin:0 0 20px;font-size:1.1rem;">Edit Profile</h3>

            <div id="pm-msg" style="display:none;padding:10px 14px;border-radius:8px;font-size:0.85rem;margin-bottom:16px;"></div>

            <!-- Avatar Upload -->
            <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
                <div id="pm-avatar-preview" style="width:72px;height:72px;border-radius:50%;overflow:hidden;background:#10b981;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.3rem;color:#000;border:2px solid rgba(16,185,129,0.4);flex-shrink:0;"></div>
                <div>
                    <p style="font-size:0.8rem;color:#9ca3af;margin:0 0 8px;">Profile Photo</p>
                    <button onclick="document.getElementById('pm-photo-input').click()"
                        style="padding:7px 14px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);border-radius:6px;color:#10b981;font-size:0.8rem;font-weight:600;cursor:pointer;">
                        Upload Photo
                    </button>
                    <input type="file" id="pm-photo-input" accept="image/*" style="display:none;">
                </div>
            </div>

            <!-- Avatar Color -->
            <div style="margin-bottom:16px;">
                <label style="font-size:0.75rem;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Avatar Color</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap;" id="pm-color-swatches">
                    ${['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316'].map(c =>
                        `<div onclick="ProfileManager.setColor('${c}')" data-color="${c}"
                            style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:2px solid transparent;transition:border 0.2s;"></div>`
                    ).join('')}
                </div>
            </div>

            <!-- Fields -->
            <div style="margin-bottom:14px;">
                <label style="font-size:0.75rem;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Full Name *</label>
                <input id="pm-fullname" type="text" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;font-size:0.9rem;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:14px;">
                <label style="font-size:0.75rem;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Username</label>
                <input id="pm-username" type="text" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;font-size:0.9rem;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:20px;">
                <label style="font-size:0.75rem;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Organization / Club</label>
                <input id="pm-org" type="text" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;font-size:0.9rem;box-sizing:border-box;">
            </div>

            <button id="pm-save-btn" onclick="ProfileManager.save()"
                style="width:100%;padding:12px;background:#10b981;color:#000;font-weight:700;border:none;border-radius:8px;font-size:0.95rem;cursor:pointer;">
                Save Changes
            </button>
        </div>`;
        document.body.appendChild(modal);

        // Photo upload handler
        document.getElementById('pm-photo-input').addEventListener('change', async function() {
            const file = this.files[0];
            if (!file) return;

            // Enforce 500KB limit
            if (file.size > 500 * 1024) {
                alert(`Image too large (${(file.size/1024).toFixed(0)}KB). Maximum allowed size is 500KB.`);
                this.value = '';
                return;
            }

            // Show local preview instantly
            const localUrl = URL.createObjectURL(file);
            ProfileManager._renderAvatar(localUrl);
            ProfileManager._pendingPhotoFile = file;
        });
    }

    // ── PROFILE MANAGER PUBLIC API ───────────────────────────
    window.ProfileManager = {
        _pendingColor: null,
        _pendingPhotoFile: null,

        open() {
            const user = window.BFX_USER;
            buildModal();
            document.getElementById('pm-fullname').value = user.fullName || '';
            document.getElementById('pm-username').value = user.username || '';
            document.getElementById('pm-org').value = user.organizationName || '';
            this._pendingColor = user.avatarColor || '#10b981';
            this._pendingPhotoFile = null;
            this._renderAvatar(user.avatarData);
            this._updateSwatches(this._pendingColor);
            this._hideMsg();
            document.getElementById('profile-modal-overlay').style.display = 'flex';
        },

        close() {
            const modal = document.getElementById('profile-modal-overlay');
            if (modal) modal.style.display = 'none';
        },

        setColor(color) {
            this._pendingColor = color;
            this._updateSwatches(color);
            if (!window.BFX_USER.avatarData && !this._pendingPhotoFile) {
                const preview = document.getElementById('pm-avatar-preview');
                if (preview) preview.style.background = color;
            }
        },

        async save() {
            const fullName = document.getElementById('pm-fullname').value.trim();
            const username = document.getElementById('pm-username').value.trim();
            const org      = document.getElementById('pm-org').value.trim();
            const btn      = document.getElementById('pm-save-btn');

            if (!fullName) return this._showMsg('Full name is required.', 'error');

            btn.disabled = true;
            btn.textContent = 'Saving...';
            this._hideMsg();

            try {
                let avatarUrl = window.BFX_USER.avatarData;

                // Upload photo to Cloudinary if new one selected
                if (this._pendingPhotoFile) {
                    const formData = new FormData();
                    formData.append('avatar', this._pendingPhotoFile);
                    if (window.BFX_USER.avatarData && window.BFX_USER.avatarData.includes('res.cloudinary.com')) {
                        formData.append('oldUrl', window.BFX_USER.avatarData);
                    }
                    const uploadRes = await fetch('/api/user/avatar', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + window.BFX_TOKEN },
                        body: formData
                    });
                    const uploadData = await uploadRes.json();
                    if (uploadData.success) {
                        avatarUrl = uploadData.url;
                        if (uploadData.token) {
                            localStorage.setItem('bfx_token', uploadData.token);
                            window.BFX_TOKEN = uploadData.token;
                        }
                    } else {
                        // Fallback: compress and store as base64
                        avatarUrl = await new Promise(resolve => {
                            const reader = new FileReader();
                            reader.onload = e => {
                                const img = new Image();
                                img.onload = () => {
                                    const canvas = document.createElement('canvas');
                                    const MAX = 200;
                                    let w = img.width, h = img.height;
                                    if (w > h) { if (w > MAX) { h = h*MAX/w; w = MAX; } }
                                    else { if (h > MAX) { w = w*MAX/h; h = MAX; } }
                                    canvas.width = w; canvas.height = h;
                                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                                };
                                img.src = e.target.result;
                            };
                            reader.readAsDataURL(this._pendingPhotoFile);
                        });
                    }
                }

                // Save profile data
                const res = await window.apiFetch('/api/user/profile', {
                    method: 'PUT',
                    body: JSON.stringify({ fullName, username, organizationName: org, avatarColor: this._pendingColor, avatarData: avatarUrl })
                });
                const data = await res.json();

                if (data.success) {
                    // Update local token and user
                    if (data.token) {
                        localStorage.setItem('bfx_token', data.token);
                        window.BFX_TOKEN = data.token;
                    }
                    const updatedUser = { ...window.BFX_USER, fullName, username, organizationName: org, avatarColor: this._pendingColor, avatarData: avatarUrl,
                        initials: fullName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2) };
                    localStorage.setItem('bfx_user', JSON.stringify(updatedUser));
                    window.BFX_USER = updatedUser;
                    buildSidebar();
                    this._showMsg('Profile updated!', 'success');
                    setTimeout(() => this.close(), 1200);
                } else {
                    this._showMsg(data.error || 'Update failed.', 'error');
                }
            } catch (e) {
                this._showMsg('Error: ' + e.message, 'error');
            }

            btn.disabled = false;
            btn.textContent = 'Save Changes';
        },

        logout() {
            localStorage.removeItem('bfx_token');
            localStorage.removeItem('bfx_user');
            window.location.href = '/login';
        },

        _renderAvatar(src) {
            const preview = document.getElementById('pm-avatar-preview');
            if (!preview) return;
            if (src) {
                preview.innerHTML = `<img src="${src}" style="width:100%;height:100%;object-fit:cover;">`;
                preview.style.background = 'transparent';
            } else {
                preview.innerHTML = `<span>${window.BFX_USER.initials || '??'}</span>`;
                preview.style.background = this._pendingColor || window.BFX_USER.avatarColor || '#10b981';
            }
        },

        _updateSwatches(activeColor) {
            document.querySelectorAll('#pm-color-swatches div').forEach(el => {
                el.style.border = el.dataset.color === activeColor
                    ? '2px solid #fff' : '2px solid transparent';
            });
        },

        _showMsg(text, type) {
            const el = document.getElementById('pm-msg');
            if (!el) return;
            el.textContent = text;
            el.style.display = 'block';
            el.style.background = type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
            el.style.border = type === 'success' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)';
            el.style.color = type === 'success' ? '#10b981' : '#ef4444';
        },

        _hideMsg() {
            const el = document.getElementById('pm-msg');
            if (el) el.style.display = 'none';
        }
    };

    // Close modal on backdrop click
    document.addEventListener('click', function(e) {
        const modal = document.getElementById('profile-modal-overlay');
        if (modal && e.target === modal) ProfileManager.close();
    });

    // Init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildSidebar);
    } else {
        buildSidebar();
    }
})();
