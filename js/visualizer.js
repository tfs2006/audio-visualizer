/**
 * 4ourmedia Audio Visualizer Core
 * Handles audio analysis and canvas rendering.
 */

class AudioVisualizer {
    constructor(canvasId, audioPlayerId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.audioPlayer = document.getElementById(audioPlayerId);

        // Audio Context State
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.dataArray = null;
        this.bufferLength = 0;

        // Visualizer Settings
        this.settings = {
            barStyle: 'gradient',
            sensitivity: 1.5,
            colorTheme: 'default',
            animationSpeed: 1.0,
            position: 'bottom',
            barCount: 64,
            mirrorMode: 'none',
            glowIntensity: 0,
            frameRate: 30
        };

        // State
        this.animationFrameId = null;
        this.lastFrameTime = 0;
        this.targetFrameInterval = 1000 / 30;
        this.animationFrame = 0;
        this.backgroundImage = null;
        this.backgroundVideo = null;
        this.cachedBackground = null;
        this.backgroundNeedsUpdate = true;

        // Callbacks
        this.onDraw = null; // External hook for drawing overlays
    }

    init() {
        this.updateCanvasSize();
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        if (newSettings.frameRate) {
            this.targetFrameInterval = 1000 / parseInt(newSettings.frameRate);
        }
        if (newSettings.width || newSettings.height) {
            this.updateCanvasSize(newSettings.width, newSettings.height);
        }
    }

    updateCanvasSize(width, height) {
        if (width) this.canvas.width = width;
        if (height) this.canvas.height = height;
        this.backgroundNeedsUpdate = true;
    }

    setBackground(image) {
        this.backgroundImage = image;
        this.backgroundVideo = null;
        this.backgroundNeedsUpdate = true;
        if (!this.animationFrameId) this.drawInitialState();
    }

    setBackgroundVideo(url) {
        if (this.backgroundVideo) {
            this.backgroundVideo.pause();
            this.backgroundVideo.src = '';
            this.backgroundVideo = null;
        }

        const video = document.createElement('video');
        video.src = url;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;

        video.onloadedmetadata = () => {
            video.play().catch(e => console.warn("Video play failed", e));
            this.backgroundVideo = video;
            this.backgroundImage = null;
            this.backgroundNeedsUpdate = true;
            if (!this.animationFrameId) this.drawInitialState();
        };
    }

    async setupAudio() {
        if (this.audioContext) return;

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = 0.8;
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);

        // Connect audio source
        // Note: For recording, we might need a different connection graph handled by the recorder
        this.source = this.audioContext.createMediaElementSource(this.audioPlayer);
        this.source.connect(this.analyser);
        this.source.connect(this.audioContext.destination);
    }

    start() {
        if (this.backgroundVideo) this.backgroundVideo.play();
        if (!this.audioContext) {
            this.setupAudio().then(() => this.loop());
        } else {
            this.audioContext.resume();
            this.loop();
        }
    }

    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.backgroundVideo) this.backgroundVideo.pause();
        this.drawInitialState();
    }

    pause() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.backgroundVideo) this.backgroundVideo.pause();
    }

    loop(timestamp) {
        this.animationFrameId = requestAnimationFrame((t) => this.loop(t));

        if (timestamp - this.lastFrameTime < this.targetFrameInterval) return;
        this.lastFrameTime = timestamp;

        if (this.analyser) {
            this.analyser.getByteFrequencyData(this.dataArray);
        }

        this.draw();
        this.animationFrame += this.settings.animationSpeed;
    }

    draw() {
        // Draw Background
        // If video is playing, force redraw every frame (no caching)
        if (this.backgroundVideo) {
            this.drawBackgroundOnly();
        } else {
            if (this.backgroundNeedsUpdate || !this.cachedBackground) {
                this.updateCachedBackground();
            }
            if (this.cachedBackground) {
                this.ctx.drawImage(this.cachedBackground, 0, 0);
            } else {
                this.drawBackgroundOnly();
            }
        }

        // Draw Visualizer
        const colors = this.getColorScheme();

        switch (this.settings.barStyle) {
            case 'gradient': this.drawGradientBars(colors); break;
            case 'solid': this.drawSolidBars(colors); break;
            case 'circle': this.drawCircularBars(colors); break;
            case 'wave': this.drawWaveForm(colors); break;
            case 'spectrum': this.drawSpectrum(colors); break;
        }

        // Draw Overlays (Callback)
        if (this.onDraw) {
            this.onDraw(this.ctx);
        }
    }

    drawInitialState() {
        this.drawBackgroundOnly();
        if (this.onDraw) this.onDraw(this.ctx);
    }

    drawBackgroundOnly() {
        this.ctx.fillStyle = '#1f2937'; // Fallback
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const media = this.backgroundVideo || this.backgroundImage;

        if (media) {
            // Check if media is valid/loaded
            const mediaWidth = media.videoWidth || media.width;
            const mediaHeight = media.videoHeight || media.height;

            if (mediaWidth > 0 && mediaHeight > 0) {
                const canvasAspect = this.canvas.width / this.canvas.height;
                const imgAspect = mediaWidth / mediaHeight;
                let sx = 0, sy = 0, sWidth = mediaWidth, sHeight = mediaHeight;

                if (imgAspect > canvasAspect) {
                    sWidth = mediaHeight * canvasAspect;
                    sx = (mediaWidth - sWidth) / 2;
                } else {
                    sHeight = mediaWidth / canvasAspect;
                    sy = (mediaHeight - sHeight) / 2;
                }
                this.ctx.drawImage(media, sx, sy, sWidth, sHeight, 0, 0, this.canvas.width, this.canvas.height);
            }
        } else {
            // Placeholder text if no image
            if (!this.animationFrameId) {
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                this.ctx.font = '30px Inter';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('Upload an image/video to preview', this.canvas.width / 2, this.canvas.height / 2);
            }
        }
    }

    updateCachedBackground() {
        const offscreen = document.createElement('canvas');
        offscreen.width = this.canvas.width;
        offscreen.height = this.canvas.height;
        const offCtx = offscreen.getContext('2d');

        offCtx.fillStyle = '#050510';
        offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

        if (this.backgroundImage) {
            const canvasAspect = offscreen.width / offscreen.height;
            const imgAspect = this.backgroundImage.width / this.backgroundImage.height;
            let sx = 0, sy = 0, sWidth = this.backgroundImage.width, sHeight = this.backgroundImage.height;

            if (imgAspect > canvasAspect) {
                sWidth = this.backgroundImage.height * canvasAspect;
                sx = (this.backgroundImage.width - sWidth) / 2;
            } else {
                sHeight = this.backgroundImage.width / canvasAspect;
                sy = (this.backgroundImage.height - sHeight) / 2;
            }
            offCtx.drawImage(this.backgroundImage, sx, sy, sWidth, sHeight, 0, 0, offscreen.width, offscreen.height);
        }

        this.cachedBackground = offscreen;
        this.backgroundNeedsUpdate = false;
    }

    // --- Drawing Helpers ---
    getColorScheme() {
        const schemes = {
            default: ['rgba(59, 130, 246, 0.8)', 'rgba(139, 92, 246, 0.7)', 'rgba(236, 72, 153, 0.6)'], // 4ourmedia Blue/Purple
            fire: ['rgba(255, 69, 0, 0.8)', 'rgba(255, 140, 0, 0.7)', 'rgba(255, 215, 0, 0.6)'],
            ocean: ['rgba(0, 119, 182, 0.8)', 'rgba(0, 180, 216, 0.7)', 'rgba(72, 202, 228, 0.6)'],
            forest: ['rgba(34, 139, 34, 0.8)', 'rgba(50, 205, 50, 0.7)', 'rgba(144, 238, 144, 0.6)'],
            sunset: ['rgba(255, 94, 77, 0.8)', 'rgba(251, 133, 0, 0.7)', 'rgba(255, 193, 7, 0.6)'],
            neon: ['rgba(57, 255, 20, 0.8)', 'rgba(255, 20, 147, 0.7)', 'rgba(0, 191, 255, 0.6)'],
            rainbow: null
        };

        if (this.settings.colorTheme === 'rainbow') {
            const colors = [];
            for (let i = 0; i < 3; i++) {
                const hue = (this.animationFrame * this.settings.animationSpeed + i * 120) % 360;
                colors.push(`hsla(${hue}, 80%, 60%, 0.8)`);
            }
            return colors;
        }
        return schemes[this.settings.colorTheme] || schemes.default;
    }

    // [Draw Methods - Condensed specifically for 'Midnight Glass']
    // Copying logic from original file but ensuring contexts use 'this'

    drawGradientBars(colors) {
        const barsToUse = Math.min(this.settings.barCount, this.bufferLength);
        // Calculate proper width ensuring it fills the canvas regardless of resolution
        const totalGapSpace = (barsToUse - 1) * (this.canvas.width / barsToUse) * 0.2;
        const availableSpace = this.canvas.width - totalGapSpace;
        const barWidth = availableSpace / barsToUse;
        const gap = (this.canvas.width / barsToUse) * 0.2;

        if (this.settings.glowIntensity > 0) {
            this.ctx.shadowBlur = this.settings.glowIntensity;
            this.ctx.shadowColor = colors[0];
        }

        const drawBarsSet = (startX, direction) => {
            let x = startX;
            for (let i = 0; i < barsToUse; i++) {
                const dataIndex = Math.floor((i / barsToUse) * this.bufferLength);
                const barHeight = this.dataArray ? (this.dataArray[dataIndex] * this.settings.sensitivity) : 10; // 10 is dummy data if silent
                const yPos = this.getYPosition(barHeight);

                const gradient = this.ctx.createLinearGradient(0, yPos, 0, yPos - barHeight);
                gradient.addColorStop(0, colors[0]);
                gradient.addColorStop(0.5, colors[1]);
                gradient.addColorStop(1, colors[2]);
                this.ctx.fillStyle = gradient;

                this.drawBarRect(x, barWidth, barHeight);
                x += (barWidth + gap) * direction;
            }
        };

        this.applyMirrorMode(drawBarsSet);
        this.ctx.shadowBlur = 0;
    }

    drawSolidBars(colors) {
        const barsToUse = Math.min(this.settings.barCount, this.bufferLength);
        // Calculate proper width ensuring it fills the canvas regardless of resolution
        const totalGapSpace = (barsToUse - 1) * (this.canvas.width / barsToUse) * 0.2;
        const availableSpace = this.canvas.width - totalGapSpace;
        const barWidth = availableSpace / barsToUse;
        const gap = (this.canvas.width / barsToUse) * 0.2;

        if (this.settings.glowIntensity > 0) {
            this.ctx.shadowBlur = this.settings.glowIntensity;
            this.ctx.shadowColor = colors[0];
        }

        const drawBarsSet = (startX, direction) => {
            let x = startX;
            for (let i = 0; i < barsToUse; i++) {
                const dataIndex = Math.floor((i / barsToUse) * this.bufferLength);
                const barHeight = this.dataArray ? (this.dataArray[dataIndex] * this.settings.sensitivity) : 10;
                const colorIndex = Math.floor((i / barsToUse) * colors.length);
                this.ctx.fillStyle = colors[colorIndex];

                this.drawBarRect(x, barWidth, barHeight);
                x += (barWidth + gap) * direction;
            }
        };

        this.applyMirrorMode(drawBarsSet);
        this.ctx.shadowBlur = 0;
    }

    // Helper to abstract position/mirror logic
    getYPosition(barHeight) {
        switch (this.settings.position) {
            case 'top': return barHeight;
            case 'center': return (this.canvas.height / 2) + (barHeight / 2);
            default: return this.canvas.height;
        }
    }

    drawBarRect(x, width, height) {
        if (this.settings.position === 'top') {
            this.ctx.fillRect(x, 0, width, height);
        } else if (this.settings.position === 'center') {
            this.ctx.fillRect(x, (this.canvas.height - height) / 2, width, height);
        } else {
            this.ctx.fillRect(x, this.canvas.height - height, width, height);
        }
    }

    applyMirrorMode(drawFn) {
        if (this.settings.mirrorMode === 'horizontal') {
            const centerX = this.canvas.width / 2;
            this.ctx.save();
            drawFn(centerX, 1);
            this.ctx.scale(-1, 1);
            this.ctx.translate(-this.canvas.width, 0);
            drawFn(centerX, 1);
            this.ctx.restore();
        } else if (this.settings.mirrorMode === 'vertical') {
            drawFn(0, 1);
            this.ctx.save();
            this.ctx.scale(1, -1);
            this.ctx.translate(0, -this.canvas.height);
            drawFn(0, 1);
            this.ctx.restore();
        } else {
            drawFn(0, 1);
        }
    }

    // ... Other draw methods (Circle, Wave, Spectrum) implemented similarly ...
    // For brevity, using simplified versions or placeholders for now, unless requested to be 100% feature parity.
    // I will implement them to ensure feature parity.

    drawCircularBars(colors) {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 50;

        if (this.settings.glowIntensity > 0) {
            this.ctx.shadowBlur = this.settings.glowIntensity;
            this.ctx.shadowColor = colors[0];
        }

        const barsToUse = Math.min(this.settings.barCount, this.bufferLength);

        for (let i = 0; i < barsToUse; i++) {
            const dataIndex = Math.floor((i / barsToUse) * this.bufferLength);
            const amplitude = this.dataArray ? this.dataArray[dataIndex] : 0;
            const barHeight = amplitude * this.settings.sensitivity * 0.5;
            const angle = (i / barsToUse) * Math.PI * 2;

            const x1 = centerX + Math.cos(angle) * radius;
            const y1 = centerY + Math.sin(angle) * radius;
            const x2 = centerX + Math.cos(angle) * (radius + barHeight);
            const y2 = centerY + Math.sin(angle) * (radius + barHeight);

            const colorIndex = Math.floor((i / barsToUse) * colors.length);
            this.ctx.strokeStyle = colors[colorIndex];
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
        }
        this.ctx.shadowBlur = 0;
    }

    drawWaveForm(colors) {
        if (this.settings.glowIntensity > 0) {
            this.ctx.shadowBlur = this.settings.glowIntensity;
            this.ctx.shadowColor = colors[1];
        }

        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = colors[1];
        this.ctx.beginPath();

        const sliceWidth = this.canvas.width / this.bufferLength;
        let x = 0;

        let yOffset = 0;
        if (this.settings.position === 'top') yOffset = -this.canvas.height / 4;
        else if (this.settings.position === 'bottom') yOffset = this.canvas.height / 4;

        for (let i = 0; i < this.bufferLength; i++) {
            const v = this.dataArray ? (this.dataArray[i] / 255.0) : 0.5;
            const y = (this.canvas.height / 2) + yOffset + (v * this.canvas.height / 3 * this.settings.sensitivity) - (this.canvas.height / 6);

            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);

            x += sliceWidth;
        }

        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }

    drawSpectrum(colors) {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const maxRadius = Math.min(centerX, centerY) - 20;

        if (this.settings.glowIntensity > 0) {
            this.ctx.shadowBlur = this.settings.glowIntensity;
            this.ctx.shadowColor = colors[0];
        }

        const barsToUse = Math.min(this.settings.barCount, this.bufferLength);

        for (let ring = 0; ring < 3; ring++) {
            const ringRadius = maxRadius * (0.3 + ring * 0.25);
            this.ctx.beginPath();

            for (let i = 0; i < barsToUse; i++) {
                const dataIndex = Math.floor((i / barsToUse) * this.bufferLength);
                const amplitude = this.dataArray ? (this.dataArray[dataIndex] * this.settings.sensitivity * 0.3) : 0;
                const angle = (i / barsToUse) * Math.PI * 2;
                const radius = ringRadius + amplitude * (ring + 1) * 0.5;

                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;

                if (i === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            }

            this.ctx.closePath();
            this.ctx.strokeStyle = colors[ring % colors.length];
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }
        this.ctx.shadowBlur = 0;
    }
}
