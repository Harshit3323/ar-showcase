let currentStream = null;

export async function startCamera(videoEl) {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera API not available in this browser.');
    }

    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) {
      throw new Error('Camera access requires HTTPS. Please use the HTTPS dev URL.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });

    videoEl.srcObject = stream;
    await videoEl.play();
    currentStream = stream;
    return true;
  } catch (err) {
    let message = err.message;
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      message = 'Camera permission denied. Please allow camera access and try again.';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      message = 'No rear camera found on this device.';
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      message = 'Camera is already in use or could not be started.';
    } else if (err.name === 'SecurityError') {
      message = 'Camera access blocked. This page must be served over HTTPS.';
    }
    return { error: message };
  }
}

export function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
}