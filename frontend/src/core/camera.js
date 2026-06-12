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
  const GRID = 6;
  const cellSize = size / GRID;
  const darkCellRatio = 0.15;

  const cells = [];
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      let darkCount = 0;
      let total = 0;
      for (let y = gy * cellSize; y < (gy + 1) * cellSize; y += 2) {
        for (let x = gx * cellSize; x < (gx + 1) * cellSize; x += 2) {
          total++;
          if (gray[y * size + x] < threshold) darkCount++;
        }
      }
      cells.push({ gx, gy, ratio: darkCount / total });
    }
  }

  const cornerRegions = [
    [0,1,2, 6,7,8, 12,13,14],
    [3,4,5, 9,10,11, 15,16,17],
    [18,19,20, 24,25,26, 30,31,32],
    [21,22,23, 27,28,29, 33,34,35],
  ];

  let cornersDetected = 0;
  for (const region of cornerRegions) {
    const maxRatio = Math.max(...region.map(i => cells[i].ratio));
    if (maxRatio > darkCellRatio) cornersDetected++;
  }

  if (cornersDetected >= 3) return { detected: true, reason: 'alineado' };
  if (cornersDetected >= 2) return { detected: false, reason: 'descentrado' };
  return { detected: false, reason: 'sin_detectar' };
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
