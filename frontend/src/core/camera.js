const PROCESS_SIZE = 480;
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
  if (darkRatio < 0.005) return { detected: false, reason: 'sin_detectar' };

  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  const bboxArea = bboxW * bboxH;
  const roiArea = size * size;
  const coverage = bboxArea / roiArea;

  if (coverage < 0.20) return { detected: false, reason: 'sin_detectar' };

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const roiCenter = size / 2;
  const maxOffset = size * 0.15;

  if (Math.abs(centerX - roiCenter) > maxOffset) return { detected: false, reason: 'sin_detectar' };
  if (Math.abs(centerY - roiCenter) > maxOffset) return { detected: false, reason: 'descentrado' };

  return { detected: true, reason: 'alineado' };
}

export function checkCalibration(videoElement, canvas, ctx, nativeRect) {
  if (!videoElement || videoElement.readyState < 2) return { calibrated: false, guidance: 'alinear' };
  if (!nativeRect || nativeRect.width < 10 || nativeRect.height < 10) return { calibrated: false, guidance: 'alinear' };

  canvas.width = PROCESS_SIZE;
  canvas.height = PROCESS_SIZE;
  ctx.drawImage(videoElement,
    nativeRect.x, nativeRect.y, nativeRect.width, nativeRect.height,
    0, 0, PROCESS_SIZE, PROCESS_SIZE
  );
  
  const imageData = ctx.getImageData(0, 0, PROCESS_SIZE, PROCESS_SIZE);
  const pixels = imageData.data;

  const variance = computeLaplacianVariance(pixels, PROCESS_SIZE);
  
  let avgDiff = 0;
  if (prevFrames.length > 0) {
    for (const prevFrame of prevFrames) {
      avgDiff += computeFrameDiff(pixels, prevFrame);
    }
    avgDiff /= prevFrames.length;
  }

  const isSharp = variance > SHARPNESS_THRESHOLD;
  const isStable = avgDiff < STABILITY_THRESHOLD;
  const cornerResult = detectCorners(pixels, PROCESS_SIZE);

  if (isSharp && isStable && cornerResult.detected) {
    stableFrameCount++;
  } else {
    stableFrameCount = 0;
  }

  if (prevFrames.length >= FRAME_HISTORY) {
    prevFrames.shift();
  }
  prevFrames.push(new Uint8Array(pixels));

  const calibrated = isSharp && isStable && cornerResult.detected && stableFrameCount >= REQUIRED_STABLE_FRAMES;

  let guidance = 'alinear';
  if (calibrated) {
    guidance = 'listo';
  } else if (cornerResult.detected || cornerResult.reason === 'descentrado') {
    guidance = 'quieto';
  }

  return { calibrated, guidance };
}

export function startCalibration(videoElement, canvas, ctx, onCalibrationChange, onFrame, nativeRect) {
  stopCalibration();
  stableFrameCount = 0;
  prevFrames = [];

  const check = () => {
    const result = checkCalibration(videoElement, canvas, ctx, nativeRect);

    if (onFrame) onFrame(result);

    if (result.calibrated && !isCalibrated) {
      isCalibrated = true;
      if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
      onCalibrationChange(result);
    } else if (!result.calibrated && isCalibrated) {
      isCalibrated = false;
      stableFrameCount = 0;
      onCalibrationChange(result);
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
