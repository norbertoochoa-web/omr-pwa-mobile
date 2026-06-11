const ROI_SIZE = parseInt(import.meta.env.VITE_ROI_SIZE) || 400;
const SHARPNESS_THRESHOLD = parseInt(import.meta.env.VITE_LAPLACIAN_THRESHOLD) || 120;
const STABILITY_THRESHOLD = parseFloat(import.meta.env.VITE_STABILITY_THRESHOLD) || 0.12;
const FRAME_HISTORY = 3;

let prevFrames = [];
let calibrationInterval = null;
let isCalibrated = false;
let stableFrameCount = 0;
const REQUIRED_STABLE_FRAMES = 5;

export function computeLaplacianVariance(pixels, size) {
  const gray = new Uint8Array(size * size);
  for (let i = 0; i < pixels.length; i += 4) {
    gray[i / 4] = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  }

  let sum = 0;
  let count = 0;
  const step = 2;
  for (let y = step; y < size - step; y += step) {
    for (let x = step; x < size - step; x += step) {
      const idx = y * size + x;
      const laplacian =
        gray[idx - step] +
        gray[idx + step] +
        gray[idx - size * step] +
        gray[idx + size * step] -
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
  const step = Math.max(4, Math.floor(sampleSize / 500));

  for (let i = 0; i < sampleSize; i += step) {
    diff += Math.abs(current[i] - previous[i]);
  }

  return diff / (sampleSize / step) / 255;
}

export function detectCorners(pixels, size) {
  const gray = new Uint8Array(size * size);
  for (let i = 0; i < pixels.length; i += 4) {
    gray[i / 4] = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  }

  const threshold = 60;
  let minX = size, maxX = 0, minY = size, maxY = 0;
  let darkCount = 0;

  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      if (gray[y * size + x] < threshold) {
        darkCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const totalPixels = (size / 2) * (size / 2);
  const darkRatio = darkCount / totalPixels;
  if (darkRatio < 0.15) return false;

  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  const bboxArea = bboxW * bboxH;
  const roiArea = size * size;
  const coverage = bboxArea / roiArea;

  if (coverage < 0.70) return false;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const roiCenter = size / 2;
  const maxOffset = size * 0.10;

  if (Math.abs(centerX - roiCenter) > maxOffset) return false;
  if (Math.abs(centerY - roiCenter) > maxOffset) return false;

  return true;
}

export function checkCalibration(videoElement, canvas, ctx) {
  if (!videoElement || videoElement.readyState < 2) return false;

  const videoWidth = videoElement.videoWidth;
  const videoHeight = videoElement.videoHeight;
  
  const drawWidth = Math.min(videoWidth, ROI_SIZE);
  const drawHeight = Math.min(videoHeight, ROI_SIZE);
  const offsetX = Math.floor((videoWidth - drawWidth) / 2);
  const offsetY = Math.floor((videoHeight - drawHeight) / 2);

  canvas.width = drawWidth;
  canvas.height = drawHeight;
  ctx.drawImage(videoElement, offsetX, offsetY, drawWidth, drawHeight, 0, 0, drawWidth, drawHeight);
  
  const imageData = ctx.getImageData(0, 0, drawWidth, drawHeight);
  const pixels = imageData.data;

  const variance = computeLaplacianVariance(pixels, drawWidth);
  
  let avgDiff = 0;
  if (prevFrames.length > 0) {
    for (const prevFrame of prevFrames) {
      avgDiff += computeFrameDiff(pixels, prevFrame);
    }
    avgDiff /= prevFrames.length;
  }

  const isSharp = variance > SHARPNESS_THRESHOLD;
  const isStable = avgDiff < STABILITY_THRESHOLD;
  const hasCorners = detectCorners(pixels, drawWidth);

  if (isSharp && isStable && hasCorners) {
    stableFrameCount++;
  } else {
    stableFrameCount = 0;
  }

  if (prevFrames.length >= FRAME_HISTORY) {
    prevFrames.shift();
  }
  prevFrames.push(new Uint8Array(pixels));

  return isSharp && isStable && hasCorners && stableFrameCount >= REQUIRED_STABLE_FRAMES;
}

export function startCalibration(videoElement, canvas, ctx, onCalibrationChange) {
  stopCalibration();
  stableFrameCount = 0;
  prevFrames = [];

  const check = () => {
    const calibrated = checkCalibration(videoElement, canvas, ctx);

    if (calibrated && !isCalibrated) {
      isCalibrated = true;
      if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
      onCalibrationChange(true);
    } else if (!calibrated && isCalibrated) {
      isCalibrated = false;
      stableFrameCount = 0;
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
    calibrationInterval = setInterval(check, 150);
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
  prevFrames = [];
  isCalibrated = false;
  stableFrameCount = 0;
}

export function isCurrentlyCalibrated() {
  return isCalibrated;
}

export function resetCalibration() {
  prevFrames = [];
  isCalibrated = false;
  stableFrameCount = 0;
}
