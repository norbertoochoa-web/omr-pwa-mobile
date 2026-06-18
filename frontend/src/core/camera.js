const PROCESS_SIZE = 480;
const SHARPNESS_THRESHOLD = parseInt(import.meta.env.VITE_LAPLACIAN_THRESHOLD) || 120;
const STABILITY_THRESHOLD = parseFloat(import.meta.env.VITE_STABILITY_THRESHOLD) || 0.12;
const FRAME_HISTORY = 3;
const CAPTURE_STABILITY_THRESHOLD = Math.max(STABILITY_THRESHOLD * 2.2, 0.24);

let prevFrames = [];
let calibrationInterval = null;
let isCalibrated = false;
let stableFrameCount = 0;
const REQUIRED_STABLE_FRAMES = 5;
const MIN_DETECTION_FRAMES = 2;

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
  const histogram = new Uint32Array(256);
  let graySum = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const value = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    gray[i / 4] = value;
    histogram[value]++;
    graySum += value;
  }

  const percentile = (target) => {
    const total = size * size;
    const limit = total * target;
    let count = 0;
    for (let i = 0; i < histogram.length; i++) {
      count += histogram[i];
      if (count >= limit) return i;
    }
    return 255;
  };

  const mean = graySum / (size * size);
  const p65 = percentile(0.65);
  const p20 = percentile(0.20);
  const brightThreshold = Math.max(115, Math.min(185, p65 - 6));
  const darkThreshold = Math.max(55, Math.min(105, p20 + 12, mean - 35));

  let minX = size, maxX = 0, minY = size, maxY = 0;
  let brightCount = 0;

  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      if (gray[y * size + x] > brightThreshold) {
        brightCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const totalSamples = (size / 2) * (size / 2);
  const brightRatio = brightCount / totalSamples;
  if (brightRatio < 0.15 || brightCount < 50) {
    return { detected: false, reason: 'sin_detectar', detail: 'brillo_bajo' };
  }

  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  const bboxArea = bboxW * bboxH;
  const roiArea = size * size;
  const coverage = bboxArea / roiArea;
  if (coverage < 0.65) {
    return { detected: false, reason: 'sin_detectar', detail: 'cartilla_lejana' };
  }

  const cornerSize = Math.max(36, Math.min(bboxW, bboxH) * 0.22);
  const corners = [
    { x: minX, y: minY },
    { x: maxX - cornerSize, y: minY },
    { x: minX, y: maxY - cornerSize },
    { x: maxX - cornerSize, y: maxY - cornerSize },
  ];

  let cornersDetected = 0;

  for (const corner of corners) {
    let darkCount = 0;
    let total = 0;
    const cx = Math.max(minX, Math.min(maxX - cornerSize, corner.x));
    const cy = Math.max(minY, Math.min(maxY - cornerSize, corner.y));
    for (let y = cy; y < cy + cornerSize; y += 2) {
      for (let x = cx; x < cx + cornerSize; x += 2) {
        if (y < size && x < size) {
          total++;
          if (gray[y * size + x] < darkThreshold) darkCount++;
        }
      }
    }
    if (total > 0 && darkCount / total > 0.018 && darkCount > 10) cornersDetected++;
  }

  const scanRegion = (x1, y1, x2, y2) => {
    let darkCount = 0;
    let total = 0;
    const fromX = Math.max(0, Math.floor(x1));
    const fromY = Math.max(0, Math.floor(y1));
    const toX = Math.min(size, Math.ceil(x2));
    const toY = Math.min(size, Math.ceil(y2));

    for (let y = fromY; y < toY; y += 2) {
      for (let x = fromX; x < toX; x += 2) {
        total++;
        if (gray[y * size + x] < darkThreshold) darkCount++;
      }
    }

    return total > 0 ? { ratio: darkCount / total, count: darkCount } : { ratio: 0, count: 0 };
  };

  const edgeBand = Math.max(18, Math.min(bboxW, bboxH) * 0.12);
  const edgeMinRatio = 0.018;
  const edgeMinCount = 16;
  const edges = [
    scanRegion(minX, minY, maxX, minY + edgeBand),
    scanRegion(minX, maxY - edgeBand, maxX, maxY),
    scanRegion(minX, minY, minX + edgeBand, maxY),
    scanRegion(maxX - edgeBand, minY, maxX, maxY),
  ];
  const edgesDetected = edges.filter((edge) => edge.ratio > edgeMinRatio && edge.count > edgeMinCount).length;
  const markerScore = cornersDetected + edgesDetected;

  if (cornersDetected >= 2 || markerScore >= 4) {
    return { detected: true, reason: 'alineado', cornersDetected, edgesDetected, coverage };
  }
  if (cornersDetected >= 1 || edgesDetected >= 2) {
    return { detected: false, reason: 'descentrado', cornersDetected, edgesDetected, coverage };
  }
  return { detected: false, reason: 'sin_detectar', detail: 'marcas_no_detectadas', cornersDetected, edgesDetected, coverage };
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

  const cornerResult = detectCorners(pixels, PROCESS_SIZE);
  const isSharp = variance > SHARPNESS_THRESHOLD || (cornerResult.detected && variance > SHARPNESS_THRESHOLD * 0.55);
  const hasMinimumSharpness = variance > SHARPNESS_THRESHOLD * 0.4 || cornerResult.detected;
  const isStable = avgDiff < STABILITY_THRESHOLD;
  const isCaptureStable = avgDiff < CAPTURE_STABILITY_THRESHOLD;
  const hasCaptureQuality = cornerResult.detected && isSharp && isCaptureStable;
  const canCapture = cornerResult.detected && hasMinimumSharpness;

  if (hasCaptureQuality) {
    stableFrameCount++;
  } else {
    stableFrameCount = 0;
  }

  if (prevFrames.length >= FRAME_HISTORY) {
    prevFrames.shift();
  }
  prevFrames.push(new Uint8Array(pixels));

  const requiredFrames = cornerResult.detected ? MIN_DETECTION_FRAMES : REQUIRED_STABLE_FRAMES;
  const calibrated = hasCaptureQuality && stableFrameCount >= requiredFrames;

  let guidance = 'alinear';
  if (canCapture) {
    guidance = 'listo';
  }

  return { calibrated, canCapture, guidance, cornerResult, sharpness: variance, stability: avgDiff };
}

export function startCalibration(videoElement, canvas, ctx, onCalibrationChange, onFrame, nativeRect) {
  stopCalibration();
  stableFrameCount = 0;
  prevFrames = [];

  const check = () => {
    const rect = typeof nativeRect === 'function' ? nativeRect() : nativeRect;
    const result = checkCalibration(videoElement, canvas, ctx, rect);

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
