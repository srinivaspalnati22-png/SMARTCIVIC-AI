// Camera Capture Module
class CameraCapture {
    constructor() {
        this.stream = null;
        this.videoElement = null;
        this.canvasElement = null;
        this.isActive = false;
    }

    async start(videoElementId, canvasElementId) {
        try {
            // Request camera access
            const constraints = {
                video: {
                    facingMode: 'environment', // Use back camera on mobile
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);

            this.videoElement = document.getElementById(videoElementId);
            this.canvasElement = document.getElementById(canvasElementId);

            if (this.videoElement) {
                this.videoElement.srcObject = this.stream;
                this.videoElement.play();
                this.isActive = true;
                showToast('Camera activated successfully', 'success');
            }

            return true;
        } catch (error) {
            console.error('Camera access error:', error);
            showToast('Camera access denied or not available', 'error');
            return false;
        }
    }

    capture() {
        if (!this.videoElement || !this.canvasElement || !this.isActive) {
            showToast('Camera not active', 'error');
            return null;
        }

        const context = this.canvasElement.getContext('2d');
        this.canvasElement.width = this.videoElement.videoWidth;
        this.canvasElement.height = this.videoElement.videoHeight;

        context.drawImage(this.videoElement, 0, 0);

        // Convert to blob
        return new Promise((resolve) => {
            this.canvasElement.toBlob((blob) => {
                showToast('Photo captured!', 'success');
                resolve(blob);
            }, 'image/jpeg', 0.95);
        });
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }

        this.isActive = false;
        showToast('Camera closed', 'info');
    }

    switchCamera() {
        if (!this.isActive) return;

        const currentFacingMode = this.stream.getVideoTracks()[0].getSettings().facingMode;
        const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

        this.stop();

        setTimeout(() => {
            this.start(this.videoElement.id, this.canvasElement.id, newFacingMode);
        }, 100);
    }
}

// Global camera instance
const camera = new CameraCapture();
