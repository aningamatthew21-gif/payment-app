import React, { useEffect, useRef } from 'react';

const ParticleBackground = () => {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const particlesRef = useRef([]);
    const mouseRef = useRef({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        prevX: window.innerWidth / 2,
        prevY: window.innerHeight / 2,
        velocity: 0
    });
    const lagMouseRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const timeRef = useRef(0);

    // Configuration constants for Wave Swarm
    const PARTICLE_COUNT = 1500;
    const FRICTION = 0.9;
    const MOUSE_LAG = 0.04;
    const WAVE_SPEED = 0.005;
    const WAVE_SCALE = 0.002;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let width = window.innerWidth;
        let height = window.innerHeight;

        // Particle class for Wave Swarm
        class Particle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = 0;
                this.vy = 0;
                this.size = Math.random() * 2.5 + 1;

                // Google-inspired color palette
                const colors = [
                    { r: 66, g: 133, b: 244 },   // Blue
                    { r: 156, g: 39, b: 176 },   // Purple
                    { r: 26, g: 115, b: 232 },   // Indigo
                    { r: 95, g: 99, b: 104 }     // Grey
                ];
                this.rgb = colors[Math.floor(Math.random() * colors.length)];

                // Wave offsets for unique brightness patterns
                this.waveOffsetX = Math.random() * 1000;
                this.waveOffsetY = Math.random() * 1000;
                this.alpha = 1;
            }

            draw(ctx) {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
                ctx.fillStyle = `rgba(${this.rgb.r}, ${this.rgb.g}, ${this.rgb.b}, ${this.alpha})`;
                ctx.fill();
            }

            update(time, mouse, lagMouse) {
                // Wave-based brightness effect
                const waveX = Math.sin(this.x * WAVE_SCALE + time * WAVE_SPEED + this.waveOffsetX);
                const waveY = Math.cos(this.y * WAVE_SCALE + time * WAVE_SPEED + this.waveOffsetY);
                const waveValue = (waveX + waveY) / 2;
                this.alpha = 0.1 + (waveValue + 1) / 2 * 0.9;

                // Gentle flow toward lagged mouse
                const dx = lagMouse.x - this.x;
                const dy = lagMouse.y - this.y;
                this.vx += dx * 0.0005;
                this.vy += dy * 0.0005;

                // Wave-based directional force
                this.vx += Math.cos(waveValue * Math.PI) * 0.05;
                this.vy += Math.sin(waveValue * Math.PI) * 0.05;

                // Dynamic velocity-based repulsion
                const mDx = mouse.x - this.x;
                const mDy = mouse.y - this.y;
                const mDist = Math.sqrt(mDx * mDx + mDy * mDy);
                const repulsionRadius = 50 + mouse.velocity * 5;
                const repulsionStrength = mouse.velocity * 0.5;

                if (mDist < repulsionRadius) {
                    const force = (repulsionRadius - mDist) / repulsionRadius;
                    const mDirX = mDx / mDist;
                    const mDirY = mDy / mDist;
                    this.vx -= mDirX * force * repulsionStrength;
                    this.vy -= mDirY * force * repulsionStrength;
                }

                // Apply friction
                this.vx *= FRICTION;
                this.vy *= FRICTION;

                // Update position
                this.x += this.vx;
                this.y += this.vy;
            }
        }

        // Initialize canvas and particles
        const init = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;

            particlesRef.current = [];
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                particlesRef.current.push(new Particle());
            }
        };

        // Animation loop
        const animate = () => {
            ctx.clearRect(0, 0, width, height);
            timeRef.current++;

            // Calculate mouse velocity
            const mouse = mouseRef.current;
            const mvX = mouse.x - mouse.prevX;
            const mvY = mouse.y - mouse.prevY;
            const currentVelocity = Math.sqrt(mvX * mvX + mvY * mvY);
            mouse.velocity += (currentVelocity - mouse.velocity) * 0.1;
            mouse.prevX = mouse.x;
            mouse.prevY = mouse.y;

            // Update lagged mouse position
            const lagMouse = lagMouseRef.current;
            lagMouse.x += (mouse.x - lagMouse.x) * MOUSE_LAG;
            lagMouse.y += (mouse.y - lagMouse.y) * MOUSE_LAG;

            // Update and draw all particles
            particlesRef.current.forEach(particle => {
                particle.update(timeRef.current, mouse, lagMouse);
                particle.draw(ctx);
            });

            animationRef.current = requestAnimationFrame(animate);
        };

        // Event handlers
        const handleResize = () => {
            init();
        };

        const handleMouseMove = (e) => {
            mouseRef.current.x = e.clientX;
            mouseRef.current.y = e.clientY;
        };

        // Initialize and start animation
        init();
        animate();

        // Add event listeners
        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ background: '#fdfcfc' }}
        />
    );
};

export default ParticleBackground;
