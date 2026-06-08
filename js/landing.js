// landing.js - Landing page navigation & antigravity physics engine

// -------------------------------------------------------------
// Part A: Button Navigation (redirects to /login or /setup)
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const isLoggedIn = !!localStorage.getItem('bfx_token');

    const btnHeaderLogin = document.getElementById('btn-header-login');
    const btnHeroStart   = document.getElementById('btn-hero-start');
    const btnHeroFeatures = document.getElementById('btn-hero-features');

    if (btnHeaderLogin) {
        btnHeaderLogin.textContent = isLoggedIn ? 'Dashboard' : 'Sign In';
        btnHeaderLogin.addEventListener('click', () => {
            window.location.href = isLoggedIn ? '/setup' : '/login';
        });
    }

    if (btnHeroStart) {
        btnHeroStart.textContent = isLoggedIn ? 'Go to Dashboard' : 'Launch Stream Dashboard';
        btnHeroStart.addEventListener('click', () => {
            window.location.href = isLoggedIn ? '/setup' : '/login';
        });
    }

    if (btnHeroFeatures) {
        btnHeroFeatures.addEventListener('click', () => {
            const footer = document.querySelector('.hero-footer');
            if (footer) footer.scrollIntoView({ behavior: 'smooth' });
        });
    }
});

// Part B: Antigravity Physics-based Interactive Football Engine
// -------------------------------------------------------------
(function() {
    const canvas = document.getElementById('physics-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // HDPI / Retina Screen Scaling Configuration
    let dpr = window.devicePixelRatio || 1;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let grassBlades = [];
    let windParticles = [];

    // Lingering cursor-wind trail queue
    let mouseTrail = [];
    const maxTrailPoints = 35;

    // Mouse velocity details
    let mouse = { x: -1000, y: -1000, prevX: -1000, prevY: -1000, vx: 0, vy: 0 };
    let hasMoved = false;

    // Wind particles parameters
    const maxParticles = 25;

    // Resizing & Scaling Setup
    function resize() {
        dpr = window.devicePixelRatio || 1;
        width = window.innerWidth;
        height = window.innerHeight;
        
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        
        ctx.resetTransform();
        ctx.scale(dpr, dpr);
        
        // Ensure ball remains bounded inside new viewport
        if (ball.x - ball.r < 0) ball.x = ball.r;
        if (ball.x + ball.r > width) ball.x = width - ball.r;
        if (ball.y - ball.r < 0) ball.y = ball.r;
        if (ball.y + ball.r > height) ball.y = height - ball.r;
        
        initGrass();
        initParticles();
    }

    // -------------------------------------------------------------
    // GRASS SIMULATION INITIALIZER (DENSE CONSTANT-LENGTH CARPET)
    // -------------------------------------------------------------
    function initGrass() {
        grassBlades = [];
        const spacing = 18; // dense grid for premium carpet look
        const margin = 20;
        
        for (let x = -margin; x < width + margin; x += spacing) {
            for (let y = -margin; y < height + margin; y += spacing) {
                // Organic jitter offset to eliminate rigid tiling
                const bx = x + (Math.random() - 0.5) * 8;
                const by = y + (Math.random() - 0.5) * 8;
                
                // Grass height variation
                const h = 8.0 + Math.random() * 6.0;
                
                // Lawnmower alternating vertical stripes pattern
                const stripeIdx = Math.floor(bx / 120);
                
                // Dynamic HSL coloring (Lush emerald vs deep turf forest green)
                let baseH = 142; // Emerald Green
                let baseS = 65;
                let baseL = 22; // default brightness
                
                if (stripeIdx % 2 === 0) {
                    baseL = 16; // Dark stripe
                    baseS = 52;
                } else {
                    baseL = 25; // Bright stripe
                    baseS = 68;
                }
                
                // Individual blade HSL variations
                const individualH = baseH + Math.floor((Math.random() - 0.5) * 6);
                const individualS = baseS + Math.floor((Math.random() - 0.5) * 10);
                const individualL = baseL + Math.floor((Math.random() - 0.5) * 4);

                // Chalk-Line Grow-Through calculations
                const centerX = width / 2;
                const centerY = height / 2;
                const dx = bx - centerX;
                const dy = by - centerY;
                const distToCenter = Math.sqrt(dx*dx + dy*dy);
                
                let isOnLine = false;
                const lineThickness = 3.5;
                const fieldMargin = 40;
                
                // Center Circle
                if (Math.abs(distToCenter - 140) < lineThickness) isOnLine = true;
                // Center dividing line
                if (Math.abs(bx - centerX) < lineThickness / 2) isOnLine = true;
                // Outer boundaries
                if (Math.abs(bx - fieldMargin) < lineThickness / 2 || Math.abs(bx - (width - fieldMargin)) < lineThickness / 2) isOnLine = true;
                if (Math.abs(by - fieldMargin) < lineThickness / 2 || Math.abs(by - (height - fieldMargin)) < lineThickness / 2) isOnLine = true;
                
                // Goal areas (Home: Left, Away: Right)
                const goalAreaHeight = 320;
                const goalAreaWidth = 100;
                
                // Left Goal Box
                if (bx >= fieldMargin && bx <= fieldMargin + goalAreaWidth && Math.abs(by - centerY) < goalAreaHeight / 2) {
                    if (Math.abs(bx - (fieldMargin + goalAreaWidth)) < lineThickness / 2 || 
                        Math.abs(by - (centerY - goalAreaHeight / 2)) < lineThickness / 2 || 
                        Math.abs(by - (centerY + goalAreaHeight / 2)) < lineThickness / 2) {
                        isOnLine = true;
                    }
                }
                // Right Goal Box
                if (bx >= width - fieldMargin - goalAreaWidth && bx <= width - fieldMargin && Math.abs(by - centerY) < goalAreaHeight / 2) {
                    if (Math.abs(bx - (width - fieldMargin - goalAreaWidth)) < lineThickness / 2 || 
                        Math.abs(by - (centerY - goalAreaHeight / 2)) < lineThickness / 2 || 
                        Math.abs(by - (centerY + goalAreaHeight / 2)) < lineThickness / 2) {
                        isOnLine = true;
                    }
                }

                grassBlades.push({
                    bx: bx,
                    by: by,
                    h: h,
                    angle: (Math.random() - 0.5) * 0.15, // angle in radians
                    targetAngle: 0,
                    angleVelocity: 0,
                    hue: individualH,
                    sat: individualS,
                    light: individualL,
                    isOnLine: isOnLine,
                    stiffness: 0.016 + Math.random() * 0.016, // softer for wide natural wind sway
                    damping: 0.83 + Math.random() * 0.05
                });
            }
        }
    }

    // -------------------------------------------------------------
    // FLOATING TURF SPARKLES INITIALIZER (DANDELION / DEW PARTICLES)
    // -------------------------------------------------------------
    function initParticles() {
        windParticles = [];
        for (let i = 0; i < maxParticles; i++) {
            windParticles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 0.8,
                r: 0.8 + Math.random() * 1.6,
                color: `rgba(16, 185, 129, ${0.15 + Math.random() * 0.35})`, // glowing emerald particle
                life: Math.random() * 200,
                maxLife: 200 + Math.random() * 250
            });
        }
    }

    // Pushes wind vectors when cursor sweeps
    function addTrailPoint(x, y, vx, vy) {
        const speed = Math.sqrt(vx*vx + vy*vy);
        if (speed < 0.8) return; // ignore static hover
        
        mouseTrail.push({
            x: x,
            y: y,
            vx: vx,
            vy: vy,
            maxAge: 35 + Math.min(speed * 1.5, 45), // duration scale
            age: 0,
            radius: 35 + Math.min(speed * 3.5, 95), // influence sweep area
            force: 0.4 + Math.min(speed * 0.06, 1.4) // vector weight multiplier
        });
        
        if (mouseTrail.length > maxTrailPoints) {
            mouseTrail.shift();
        }
    }

    // -------------------------------------------------------------
    // PROCEDURAL GRASS FIELD RENDERING & ROTATIONAL PHYSICS TICK
    // -------------------------------------------------------------
    function updateAndDrawGrass() {
        const time = Date.now() * 0.0022;

        // 1. Deep premium turf backdrop with subtle radial green vignette
        const baseGradient = ctx.createRadialGradient(width/2, height/2, 20, width/2, height/2, Math.max(width, height) * 0.95);
        baseGradient.addColorStop(0, '#0a2310'); // vibrant emerald green center
        baseGradient.addColorStop(0.5, '#05160a'); // deep turf forest green
        baseGradient.addColorStop(1, '#020904'); // obsidian dark border frame
        ctx.fillStyle = baseGradient;
        ctx.fillRect(0, 0, width, height);

        // 2. Lawnmower striped lanes overlays (subtle contrasting vertical green lanes)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.012)';
        const stripeWidth = 120;
        for (let x = 0; x < width; x += stripeWidth * 2) {
            ctx.fillRect(x, 0, stripeWidth, height);
        }

        // 3. Volumetric Stadium Floodlight Beams (emanating from top corners)
        const leftLight = ctx.createRadialGradient(0, 0, 50, width * 0.25, height * 0.25, Math.max(width, height) * 0.45);
        leftLight.addColorStop(0, 'rgba(16, 185, 129, 0.07)'); // emerald neon flare
        leftLight.addColorStop(0.6, 'rgba(16, 185, 129, 0.015)');
        leftLight.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = leftLight;
        ctx.fillRect(0, 0, width, height);
        
        const rightLight = ctx.createRadialGradient(width, 0, 50, width * 0.75, height * 0.25, Math.max(width, height) * 0.45);
        rightLight.addColorStop(0, 'rgba(16, 185, 129, 0.07)');
        rightLight.addColorStop(0.6, 'rgba(16, 185, 129, 0.015)');
        rightLight.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rightLight;
        ctx.fillRect(0, 0, width, height);

        // 4. White Chalk lines backdrop (painted under the grass mesh!)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'; // realistic painted chalk
        ctx.lineWidth = 4;
        
        // Center Circle
        ctx.beginPath();
        ctx.arc(width/2, height/2, 140, 0, Math.PI*2);
        ctx.stroke();
        
        // Center dividing line
        ctx.beginPath();
        ctx.moveTo(width/2, 40);
        ctx.lineTo(width/2, height - 40);
        ctx.stroke();
        
        // Boundary Touchlines rectangle
        ctx.strokeRect(40, 40, width - 80, height - 80);
        
        // Goal Areas (Left and Right goalmouth boundaries)
        const centerY = height / 2;
        const goalAreaHeight = 320;
        const goalAreaWidth = 100;
        ctx.strokeRect(40, centerY - goalAreaHeight / 2, goalAreaWidth, goalAreaHeight);
        ctx.strokeRect(width - 40 - goalAreaWidth, centerY - goalAreaHeight / 2, goalAreaWidth, goalAreaHeight);

        // 5. Update wind vortices inside the lingering cursor queue
        for (let i = mouseTrail.length - 1; i >= 0; i--) {
            const p = mouseTrail[i];
            p.age++;
            p.radius += 0.75; // expand vector wake width
            p.force *= 0.945; // decay velocity weight
            
            if (p.age >= p.maxAge || p.force < 0.01) {
                mouseTrail.splice(i, 1);
            }
        }

        // 6. Global Atmospheric breeze oscillation wave (diagonal sweeps)
        const globalWindX = Math.sin(time * 0.75) * 0.5;

        // 7. Update and Render individual grass blades inside our mesh carpet
        for (let i = 0; i < grassBlades.length; i++) {
            const g = grassBlades[i];

            // A. Global Breeze Wind Sway factor
            const breezeFreq = time * 0.85 + g.bx * 0.007 + g.by * 0.003;
            const windForceX = Math.sin(breezeFreq) * Math.cos(time * 0.4 + g.bx * 0.002) * 0.35;
            const torqueWind = windForceX * 0.075; // dynamic breeze torque

            // B. Accumulate wind wake drag from the lingering cursor vortices
            let torqueMouse = 0;
            
            for (let j = 0; j < mouseTrail.length; j++) {
                const p = mouseTrail[j];
                const dx = g.bx - p.x;
                const dy = g.by - p.y;
                const distSq = dx * dx + dy * dy;
                const pRad = p.radius;
                
                if (distSq < pRad * pRad) {
                    const dist = Math.sqrt(distSq) || 1;
                    const pct = (pRad - dist) / pRad; // 1 at center, 0 at border edge
                    const factor = pct * p.force;
                    
                    // Wind drag torque: push in direction of cursor travel path + radial splash push
                    const sweepPush = p.vx * 0.14;
                    const radialPush = (dx / dist) * 1.6;
                    
                    torqueMouse += (sweepPush + radialPush) * factor * 0.045;
                }
            }

            // C. Soccer Ball rolling crushing physics (Bends grass completely flat)
            const dbx = g.bx - ball.x;
            const dby = g.by - ball.y;
            const ballDistSq = dbx * dbx + dby * dby;
            const ballAura = ball.r + 10;
            
            let isCurrentlyCrushed = false;
            let currentStiffness = g.stiffness;

            if (ballDistSq < ballAura * ballAura) {
                const ballDist = Math.sqrt(ballDistSq) || 1;
                const pct = (ballAura - ballDist) / ballAura;
                
                // Squash grass tip flat in the direction away from ball center
                const squashDir = dbx > 0 ? 1 : -1;
                g.targetAngle = squashDir * pct * 1.45; // ~83 degrees bend
                currentStiffness = 0.005; // spring structural fatigue
                isCurrentlyCrushed = true;
            } else {
                // Delayed viscoelastic recovery
                if (g.targetAngle !== 0) {
                    g.targetAngle *= 0.915; // slow return memory decay
                    if (Math.abs(g.targetAngle) < 0.005) {
                        g.targetAngle = 0;
                    }
                }
            }

            // D. Angular torque integration (No stretching possible!)
            const springTorque = (g.targetAngle - g.angle) * currentStiffness;
            const totalTorque = springTorque + torqueWind + torqueMouse;

            g.angleVelocity = (g.angleVelocity + totalTorque) * g.damping;
            g.angle += g.angleVelocity;

            // Constrain bending to realistic levels
            if (g.angle > 1.45) g.angle = 1.45;
            if (g.angle < -1.45) g.angle = -1.45;

            // E. Calculate constant-length tip projections using trigonometry
            const tx = g.bx + Math.sin(g.angle) * g.h;
            const ty = g.by - Math.cos(g.angle) * g.h;

            // Parabolic curve: control point curves at half the tip angle
            const cpX = g.bx + Math.sin(g.angle * 0.5) * g.h * 0.5;
            const cpY = g.by - Math.cos(g.angle * 0.5) * g.h * 0.5;

            // F. Render blade graphics
            let color;
            if (g.isOnLine) {
                // Painted chalk grow-through white paint tips
                const bendHighlight = Math.abs(g.angle) * 8;
                color = `hsl(142, 25%, ${72 + bendHighlight}%)`;
            } else {
                // Multi-tone dynamic shading reflecting wind displacement and lights
                const speedHighlight = Math.abs(g.angleVelocity) * 45;
                const currentLightness = Math.min(g.light + speedHighlight + (1 - Math.abs(g.angle) * 0.2) * 3.5, 45);
                color = `hsl(${g.hue}, ${g.sat}%, ${currentLightness}%)`;
            }

            ctx.beginPath();
            ctx.moveTo(g.bx, g.by);
            ctx.quadraticCurveTo(cpX, cpY, tx, ty);
            ctx.strokeStyle = color;
            
            // Width adjustments
            const strokeWidth = 1.8 + (Math.abs(g.angle) * 0.8);
            ctx.lineWidth = strokeWidth;
            ctx.lineCap = 'round';
            ctx.stroke();

            // Tiny sunlit dew glisten dot at tips for premium depth
            if (!g.isOnLine && g.light > 22 && !isCurrentlyCrushed) {
                ctx.beginPath();
                ctx.arc(tx, ty, 0.65, 0, Math.PI * 2);
                ctx.fillStyle = `hsl(${g.hue + 8}, 95%, 68%)`; // bright neon chartreuse glisten
                ctx.fill();
            }
        }

        // 8. Update and Draw floating wind dandelions / sparkles
        updateAndDrawParticles(globalWindX, time);
    }

    // -------------------------------------------------------------
    // UPDATE AND RENDER FLOATING WIND PARTICLES
    // -------------------------------------------------------------
    function updateAndDrawParticles(globalWindX, time) {
        for (let i = 0; i < windParticles.length; i++) {
            const p = windParticles[i];
            
            // Apply air currents: breeze + local noise vectors
            const localBreeze = Math.sin(time * 0.85 + p.x * 0.005) * 0.35;
            p.vx = (p.vx * 0.95) + (globalWindX + localBreeze) * 0.05;
            p.vy = (p.vy * 0.95) + (0.12 + Math.cos(time * 0.5 + p.y * 0.005) * 0.18) * 0.05;
            
            // Cursor trailing turbulence pushes particles
            for (let j = 0; j < mouseTrail.length; j++) {
                const mt = mouseTrail[j];
                const dx = p.x - mt.x;
                const dy = p.y - mt.y;
                const distSq = dx * dx + dy * dy;
                const pushRad = mt.radius + 15;
                
                if (distSq < pushRad * pushRad) {
                    const dist = Math.sqrt(distSq) || 1;
                    const pct = (pushRad - dist) / pushRad;
                    p.vx += mt.vx * pct * 0.22;
                    p.vy += mt.vy * pct * 0.22;
                    
                    p.x += (dx / dist) * pct * 2.2;
                    p.y += (dy / dist) * pct * 2.2;
                }
            }
            
            p.x += p.vx;
            p.y += p.vy;
            p.life++;
            
            // Viewport bounds wrapping
            if (p.x < 0) { p.x = width; p.life = 0; }
            if (p.x > width) { p.x = 0; p.life = 0; }
            if (p.y < 0) { p.y = height; p.life = 0; }
            if (p.y > height) { p.y = 0; p.life = 0; }
            
            // Draw floating particle glow
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.shadowColor = '#10b981';
            ctx.shadowBlur = 4;
            ctx.fill();
            ctx.shadowBlur = 0; // reset canvas shadow
            
            // Life recycling
            if (p.life >= p.maxLife) {
                p.x = Math.random() * width;
                p.y = Math.random() * height;
                p.life = 0;
                p.vx = (Math.random() - 0.5) * 1.5;
                p.vy = (Math.random() - 0.5) * 0.8;
            }
        }
    }

    // -------------------------------------------------------------
    // Mouse and Touch Interaction Listeners
    // -------------------------------------------------------------
    window.addEventListener('mousemove', (e) => {
        if (!hasMoved) {
            mouse.prevX = e.clientX;
            mouse.prevY = e.clientY;
            hasMoved = true;
        } else {
            mouse.prevX = mouse.x;
            mouse.prevY = mouse.y;
        }
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.vx = mouse.x - mouse.prevX;
        mouse.vy = mouse.y - mouse.prevY;
        
        // Push wind nodes into trailing wake queue
        addTrailPoint(mouse.x, mouse.y, mouse.vx, mouse.vy);
    });

    window.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) {
            const t = e.touches[0];
            if (!hasMoved) {
                mouse.prevX = t.clientX;
                mouse.prevY = t.clientY;
                hasMoved = true;
            } else {
                mouse.prevX = mouse.x;
                mouse.prevY = mouse.y;
            }
            mouse.x = t.clientX;
            mouse.y = t.clientY;
            mouse.vx = mouse.x - mouse.prevX;
            mouse.vy = mouse.y - mouse.prevY;
            
            addTrailPoint(mouse.x, mouse.y, mouse.vx, mouse.vy);
        }
    });

    // -------------------------------------------------------------
    // SOCCER BALL PHYSICS CLASS
    // -------------------------------------------------------------
    class SoccerBall {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.vx = 2.5; // initial kick nudge
            this.vy = -3.5;
            this.r = 46; // Radius (92px diameter)
            this.mass = 1;
            this.angle = 0; // rotation angle
            this.angularVelocity = 0.025; // rolling spin speed
            this.elasticity = 0.78; // boundary bounce elasticity
            this.friction = 0.985; // turf resistance drag
        }

        update() {
            // Apply drag dampening
            this.vx *= this.friction;
            this.vy *= this.friction;
            this.angularVelocity *= 0.97; // spin friction

            // Boundary collision checks (bounces off screen edges)
            if (this.x - this.r < 0) {
                this.x = this.r;
                this.vx = -this.vx * this.elasticity;
                this.angularVelocity += this.vy * 0.05; // rotation roll transfer
            }
            if (this.x + this.r > width) {
                this.x = width - this.r;
                this.vx = -this.vx * this.elasticity;
                this.angularVelocity -= this.vy * 0.05;
            }
            if (this.y - this.r < 0) {
                this.y = this.r;
                this.vy = -this.vy * this.elasticity;
                this.angularVelocity -= this.vx * 0.05;
            }
            if (this.y + this.r > height) {
                this.y = height - this.r;
                this.vy = -this.vy * this.elasticity;
                this.angularVelocity += this.vx * 0.05;
            }

            // Mouse proximity kick impulse
            const dx = this.x - mouse.x;
            const dy = this.y - mouse.y;
            const distSq = dx * dx + dy * dy;
            const kickAura = this.r + 20; // proximity collision threshold

            if (distSq < kickAura * kickAura) {
                const dist = Math.sqrt(distSq);
                const nx = dx / (dist || 1);
                const ny = dy / (dist || 1);

                // Calculate mouse push force scale
                const mSpeed = Math.sqrt(mouse.vx * mouse.vx + mouse.vy * mouse.vy);
                const cappedSpeed = Math.min(mSpeed, 32);

                // Impulse force calculation: base push + speed projection
                const impulse = Math.max(cappedSpeed * 1.35, 4.8);

                this.vx = nx * impulse;
                this.vy = ny * impulse;

                // Slice spin (cross product vector speed slices)
                const slice = (nx * mouse.vy - ny * mouse.vx) * 0.16;
                this.angularVelocity = slice;

                // Restrict stickiness by placing ball on boundary perimeter
                this.x = mouse.x + nx * kickAura;
                this.y = mouse.y + ny * kickAura;
            }

            // Roll rate dictated by coordinates shifts
            this.angle += this.angularVelocity + (this.vx * 0.008);

            // Coordinates translation
            this.x += this.vx;
            this.y += this.vy;
        }

        draw() {
            ctx.save();

            // 1. Perspective turf shadow under the ball (oval ellipse)
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            const shadowOffset = 18 + Math.min(speed * 0.3, 10);
            const shadowBlur = 10 + Math.min(speed * 0.5, 12);
            
            ctx.shadowColor = 'rgba(0, 0, 0, 0.48)';
            ctx.shadowBlur = shadowBlur;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
            ctx.beginPath();
            ctx.ellipse(this.x, this.y + shadowOffset, this.r * 0.95, this.r * 0.28, 0, 0, Math.PI * 2);
            ctx.fill();

            // Reset shadow to avoid blurring pentagon graphics
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            // 2. Leather ball base sphere
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);

            ctx.beginPath();
            ctx.arc(0, 0, this.r, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            
            ctx.strokeStyle = '#111827';
            ctx.lineWidth = 3;
            ctx.stroke();

            // 3. Mathematical projections of pentagonal leather panels (spherical depth)
            const pents = [
                { cx: 0, cy: 0, size: 13 },            // Center panel
                { cx: 0, cy: -27, size: 9 },           // Top panel
                { cx: 25, cy: -9, size: 9 },           // Top-Right
                { cx: 16, cy: 22, size: 9 },           // Bottom-Right
                { cx: -16, cy: 22, size: 9 },          // Bottom-Left
                { cx: -25, cy: -9, size: 9 }           // Top-Left
            ];

            pents.forEach((p, idx) => {
                ctx.fillStyle = '#064e3b'; // Premium dark sports forest emerald panels
                ctx.strokeStyle = '#111827';
                ctx.lineWidth = 2;

                ctx.beginPath();
                for (let i = 0; i < 5; i++) {
                    const angleStep = (Math.PI * 2 / 5) * i - Math.PI / 2;
                    const distortionX = p.cx === 0 ? 1 : 0.85;
                    const distortionY = p.cy === 0 ? 1 : 0.85;

                    const px = p.cx + Math.cos(angleStep) * p.size * distortionX;
                    const py = p.cy + Math.sin(angleStep) * p.size * distortionY;

                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // Draw seam connections from center pentagon to the side pentagons
                if (idx > 0) {
                    ctx.strokeStyle = '#111827';
                    ctx.lineWidth = 2;
                    
                    const centerPointAngle = (Math.PI * 2 / 5) * (idx - 1) - Math.PI / 2;
                    const cPentVertexX = Math.cos(centerPointAngle) * 13;
                    const cPentVertexY = Math.sin(centerPointAngle) * 13;

                    ctx.beginPath();
                    ctx.moveTo(p.cx * 0.7, p.cy * 0.7);
                    ctx.lineTo(cPentVertexX, cPentVertexY);
                    ctx.stroke();
                }
            });

            // 4. Premium Neon Emerald inner shine halo
            ctx.beginPath();
            ctx.arc(0, 0, this.r - 2, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.26)'; // glowing emerald ring overlay
            ctx.lineWidth = 4;
            ctx.stroke();

            // 5. 3D Spherical lens highlight gradient
            const gradientShine = ctx.createRadialGradient(-12, -12, 5, 0, 0, this.r);
            gradientShine.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
            gradientShine.addColorStop(0.3, 'rgba(255, 255, 255, 0.05)');
            gradientShine.addColorStop(1, 'rgba(0, 0, 0, 0.36)');

            ctx.beginPath();
            ctx.arc(0, 0, this.r, 0, Math.PI * 2);
            ctx.fillStyle = gradientShine;
            ctx.fill();

            ctx.restore();
        }
    }

    // Initialize ball at screen center coordinate
    const ball = new SoccerBall(width / 2, height / 2);
    
    // Globally register ball reference to handle CTA pushes
    window.soccerBall = ball;

    // Trigger initial resizing scaling metrics
    resize();

    // Listen to window resize events to maintain crisp scaling
    window.addEventListener('resize', resize);

    // -------------------------------------------------------------
    // CORE PHYSICS RENDER LOOP
    // -------------------------------------------------------------
    function loop() {
        // Draw the highly physical grass backdrop
        updateAndDrawGrass();

        // Decay speed vectors of mouse
        mouse.vx *= 0.8;
        mouse.vy *= 0.8;

        // Perform ball steps
        ball.update();
        ball.draw();

        requestAnimationFrame(loop);
    }

    // Start
    loop();
})();
