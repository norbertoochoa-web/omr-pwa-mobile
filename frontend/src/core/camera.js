const ROI_SIZE = parseInt(import.meta.env.VITE_ROI_SIZE) || 320;
const SHARPNESS_THRESHOLD = parseInt(import.meta.env.VITE_LAPLACIAN_THRESHOLD) || 80;
const STABILITY_THRESHOLD = parseFloat(import.meta.env.VITE_STABILITY_THRESHOLD) || 0.15;

let prevFrame = null;
let calibrationInterval = null;
let isCalibrated = false;

export function computeLaplacianVariance(pixels, size) {
  const gray = new Uint8Array(size * size);
  for (let i = 0; i < pixels.length; i += 4) {
    gray[i / 4] = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  }

  let sum = 0;
  let count = 0;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const idx = y * size + x;
      const laplacian =
        gray[idx - 1] +
        gray[idx + 1] +
        gray[idx - size] +
        gray[idx + size] -
        4 * gray[idx];
      sum += laplacian * laplacian;
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

export function computeFrameDiff(current, previous) {
  if (!previous) return 1;

  let diff = 0;
  const sampleSize = Math.min(current.length, previous.length);
  const step = Math.max(1, Math.floor(sampleSize / 1000));

  for (let i = 0; i < sampleSize; i += step) {
    diff += Math.abs(current[i] - previous[i]);
  }

  return diff / (sampleSize / step) / 255;
}

export function checkCalibration(videoElement, canvas, ctx) {
  if (!videoElement || videoElement.readyState < 2) return false;

  ctx.drawImage(videoElement, 0, 0, ROI_SIZE, ROI_SIZE);
  const imageData = ctx.getImageData(0, 0, ROI_SIZE, ROI_SIZE);
  const pixels = imageData.data;

  const variance = computeLaplacianVariance(pixels, ROI_SIZE);
  const diff = computeFrameDiff(pixels, prevFrame);

  const isSharp = variance > SHARPNESS_THRESHOLD;
  const isStable = diff < STABILITY_THRESHOLD;

  prevFrame = new Uint8Array(pixels);

  return isSharp && isStable;
}

export function startCalibration(videoElement, canvas, ctx, onCalibrationChange) {
  stopCalibration();

  const check = () => {
    const calibrated = checkCalibration(videoElement, canvas, ctx);

    if (calibrated && !isCalibrated) {
      isCalibrated = true;
      if (navigator.vibrate) navigator.vibrate(50);
      onCalibrationChange(true);
    } else if (!calibrated && isCalibrated) {
      isCalibrated = false;
      onCalibrationChange(false);
    }
  };

  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    let running = true;
    const loop = () => {
      if (!running) return;
      check();
      videoElement.requestVideoFrameCallback(loop);
    };
    videoElement.requestVideoFrameCallback(loop);
    calibrationInterval = { stop: () => { running = false; } };
  } else {
    calibrationInterval = setInterval(check, 200);
  }
}

export function stopCalibration() {
  if (calibrationInterval) {
    if (typeof calibrationInterval.stop === 'function') {
      calibrationInterval.stop();
    } else {
      clearInterval(calibrationInterval);
    }
    calibrationInterval = null;
  }
  prevFrame = null;
  isCalibrated = false;
}

export function isCurrentlyCalibrated() {
  return isCalibrated;
}

export function resetCalibration() {
  prevFrame = null;
  isCalibrated = false;
}
