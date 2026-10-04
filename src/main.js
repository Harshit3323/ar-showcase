import '@google/model-viewer';
import './style.css';
import { startCamera, stopCamera } from './camera.js';
import { startAR, stopAR } from './ar.js';

const viewer = document.getElementById('viewer');
const progressBar = viewer.querySelector('.progress-bar');
const progressBarFill = viewer.querySelector('.progress-bar-fill');

viewer.addEventListener('progress', (event) => {
  const progress = event.detail.totalProgress;
  progressBarFill.style.width = `${progress * 100}%`;
  if (progress === 1) {
    progressBar.style.display = 'none';
  } else {
    progressBar.style.display = 'block';
  }
});

const arButton = document.getElementById('ar-button');
const arOverlay = document.getElementById('ar-overlay');
const arVideo = document.getElementById('ar-video');
const arCanvas = document.getElementById('ar-canvas');
const arClose = document.getElementById('ar-close');
const arError = document.getElementById('ar-error');

async function openAR() {
  arError.hidden = true;
  arError.textContent = '';
  arOverlay.hidden = false;

  const cameraResult = await startCamera(arVideo);
  if (cameraResult !== true) {
    arError.textContent = cameraResult.error || 'Failed to start camera';
    arError.hidden = false;
    return;
  }

  try {
    await startAR(arCanvas);
  } catch (err) {
    arError.textContent = err.message || 'Failed to start AR view';
    arError.hidden = false;
    stopCamera();
  }
}

function closeAR() {
  stopAR();
  stopCamera();
  arOverlay.hidden = true;
  arError.hidden = true;
}

arButton.addEventListener('click', openAR);
arClose.addEventListener('click', closeAR);