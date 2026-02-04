// script.js - Final Complete Fix with High Resolution Boxes

const fileInput = document.getElementById('fileUpload');
const originalImg = document.getElementById('originalImg');
const analyzedCanvas = document.getElementById('analyzedCanvas');
const ctx = analyzedCanvas.getContext('2d', { alpha: false }); // Disable alpha for better performance
const summaryTags = document.getElementById('summaryTags');
const recentList = document.getElementById('recentList');
const hideOverlayBtn = document.getElementById('hideOverlayBtn');
const confidenceSlider = document.getElementById('confidenceSlider');
const confidenceValue = document.getElementById('confidenceValue');

// Global state
let currentDetections = [];
let currentFilteredDetections = [];
let currentOriginalBase64 = null;
let currentOriginalImage = null;
let currentImageName = '';
let isOverlayVisible = true;
let recentScans = [];
let animationFrameId = null;
let popInQueue = [];
let popOutQueue = [];
let animating = false;
let confidenceThreshold = 0.25;
let currentMode = "balanced";

// Initialize confidence slider
confidenceSlider.addEventListener('input', (e) => {
  const value = parseInt(e.target.value);
  confidenceThreshold = value / 100;
  confidenceValue.textContent = `${value}%`;
  
  console.log(`Confidence threshold updated to: ${confidenceThreshold}`);
  
  filterDetectionsByConfidence();
  
  if (isOverlayVisible) {
    redrawCanvas();
  }
});

// Filter detections by confidence threshold
function filterDetectionsByConfidence() {
  if (!currentDetections.length) {
    currentFilteredDetections = [];
    updateSummaryTags([]);
    return;
  }
  
  console.log(`Filtering ${currentDetections.length} detections with threshold: ${confidenceThreshold}`);
  
  currentFilteredDetections = currentDetections.filter(det => {
    const conf = det[4];
    return conf >= confidenceThreshold;
  });
  
  console.log(`After filtering: ${currentFilteredDetections.length} detections`);
  
  if (currentDetections.length > 0) {
    const minConf = Math.min(...currentDetections.map(d => d[4]));
    const maxConf = Math.max(...currentDetections.map(d => d[4]));
    console.log(`Confidence range: ${(minConf*100).toFixed(1)}% to ${(maxConf*100).toFixed(1)}%`);
  }
  
  updateSummaryTags(currentFilteredDetections);
}

// Hide/Show with box-wise pop animation
hideOverlayBtn.addEventListener('click', () => {
  if (animating || !currentOriginalImage) return;
  
  isOverlayVisible = !isOverlayVisible;
  hideOverlayBtn.textContent = isOverlayVisible ? 'HIDE OVERLAY' : 'SHOW OVERLAY';
  hideOverlayBtn.disabled = true;
  
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  
  animateBoxes(!isOverlayVisible);
});

// Helper: Load image and return Promise
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Draw original image on canvas
function drawOriginalImage() {
  if (!currentOriginalImage) return;
  
  const container = analyzedCanvas.parentElement;
  const contW = container.clientWidth;
  const contH = container.clientHeight;
  
  const ratio = Math.min(contW / currentOriginalImage.naturalWidth, contH / currentOriginalImage.naturalHeight);
  analyzedCanvas.width = currentOriginalImage.naturalWidth * ratio;
  analyzedCanvas.height = currentOriginalImage.naturalHeight * ratio;
  
  // HIGH RESOLUTION SETTINGS
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  ctx.clearRect(0, 0, analyzedCanvas.width, analyzedCanvas.height);
  ctx.drawImage(currentOriginalImage, 0, 0, analyzedCanvas.width, analyzedCanvas.height);
}

// Redraw canvas with current state
function redrawCanvas() {
  drawOriginalImage();
  
  if (isOverlayVisible && currentFilteredDetections.length > 0) {
    drawDetections();
  }
}

// Draw all filtered detections with HIGH RESOLUTION
function drawDetections() {
  if (!currentOriginalImage || currentFilteredDetections.length === 0) return;
  
  const container = analyzedCanvas.parentElement;
  const contW = container.clientWidth;
  const contH = container.clientHeight;
  
  const ratio = Math.min(contW / currentOriginalImage.naturalWidth, contH / currentOriginalImage.naturalHeight);
  
  // Sort detections by confidence
  const sortedDetections = [...currentFilteredDetections].sort((a, b) => b[4] - a[4]);
  
  sortedDetections.forEach(det => {
    const [x1, y1, x2, y2, conf, className] = det;
    
    // Scale coordinates
    const scaledX1 = x1 * ratio;
    const scaledY1 = y1 * ratio;
    const scaledX2 = x2 * ratio;
    const scaledY2 = y2 * ratio;
    
    // Get class color
    const color = getClassColor(className);
    
    // Calculate opacity based on confidence
    const opacity = 0.3 + (conf * 0.7);
    
    // HIGH RESOLUTION BOX - THICKER LINES
    ctx.beginPath();
    ctx.lineWidth = 4; // Increased from 3 to 4
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity})`;
    ctx.rect(scaledX1, scaledY1, scaledX2 - scaledX1, scaledY2 - scaledY1);
    ctx.stroke();
    
    // Draw label with HIGH RESOLUTION TEXT
    const label = `${className.toUpperCase()} ${Math.round(conf * 100)}%`;
    
    // HIGH RESOLUTION FONT SETTINGS
    ctx.font = 'bold 0.85rem "Roboto Mono", monospace'; // Increased from 0.7rem
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    
    const textWidth = ctx.measureText(label).width;
    
    // Background with opacity
    ctx.fillStyle = `rgba(0, 0, 0, ${opacity * 0.8})`;
    ctx.fillRect(scaledX1, scaledY1 - 28, textWidth + 12, 28); // Increased height
    
    // Text with shadow for better readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    
    ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 1)`;
    ctx.fillText(label, scaledX1 + 6, scaledY1 - 22); // Adjusted position
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  });
}

// Get class color (sync with backend)
function getClassColor(className) {
  const colors = {
    'auto': [0, 255, 255],
    'car': [0, 255, 255],
    'autos': [0, 255, 255],
    'two_wheeler': [0, 255, 100], // Brighter green
    'number_plate': [255, 50, 255], // Brighter pink
    'bus': [255, 255, 50], // Brighter yellow
    'person': [255, 150, 50], // Brighter orange
    'truck': [255, 180, 50], // Brighter orange
    'motorcycle': [0, 255, 100], // Brighter green
    'bicycle': [0, 200, 255],
    'traffic light': [255, 50, 50], // Brighter red
    'stop sign': [255, 50, 50] // Brighter red
  };
  
  return colors[className.toLowerCase()] || [255, 255, 255];
}

// Shuffle array for random order
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Box-wise animation
function animateBoxes(hide = false) {
  if (!currentOriginalImage || currentFilteredDetections.length === 0) {
    redrawCanvas();
    hideOverlayBtn.disabled = false;
    return;
  }
  
  animating = true;
  let startTime = null;
  const duration = 1200;
  
  const detectionsToAnimate = currentFilteredDetections;
  
  if (hide) {
    popOutQueue = shuffleArray([...Array(detectionsToAnimate.length).keys()]);
  } else {
    popInQueue = shuffleArray([...Array(detectionsToAnimate.length).keys()]);
  }
  
  function animate(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    drawOriginalImage();
    
    if (hide) {
      const visibleCount = Math.floor((1 - progress) * detectionsToAnimate.length);
      
      for (let i = 0; i < visibleCount; i++) {
        const detIdx = popOutQueue[i];
        if (detIdx < detectionsToAnimate.length) {
          drawSingleDetection(detectionsToAnimate[detIdx], 1);
        }
      }
      
      if (visibleCount < detectionsToAnimate.length) {
        const disappearingIdx = popOutQueue[visibleCount];
        if (disappearingIdx < detectionsToAnimate.length) {
          const popScale = 1 + (1 - progress) * 0.5;
          drawSingleDetection(detectionsToAnimate[disappearingIdx], popScale);
        }
      }
    } else {
      const visibleCount = Math.floor(progress * detectionsToAnimate.length);
      
      for (let i = 0; i < visibleCount; i++) {
        const detIdx = popInQueue[i];
        if (detIdx < detectionsToAnimate.length) {
          drawSingleDetection(detectionsToAnimate[detIdx], 1);
        }
      }
      
      if (visibleCount < detectionsToAnimate.length) {
        const appearingIdx = popInQueue[visibleCount];
        if (appearingIdx < detectionsToAnimate.length) {
          const popScale = progress * 2;
          const bounceScale = popScale > 1 ? 2 - popScale : popScale;
          drawSingleDetection(detectionsToAnimate[appearingIdx], bounceScale);
        }
      }
    }
    
    if (progress < 1) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      animating = false;
      hideOverlayBtn.disabled = false;
      redrawCanvas();
    }
  }
  
  animationFrameId = requestAnimationFrame(animate);
}

// Draw single detection with scale - HIGH RESOLUTION
function drawSingleDetection(det, scale = 1) {
  if (!currentOriginalImage) return;
  
  const container = analyzedCanvas.parentElement;
  const contW = container.clientWidth;
  const contH = container.clientHeight;
  
  const ratio = Math.min(contW / currentOriginalImage.naturalWidth, contH / currentOriginalImage.naturalHeight);
  const [x1, y1, x2, y2, conf, className] = det;
  
  const scaledX1 = x1 * ratio;
  const scaledY1 = y1 * ratio;
  const scaledX2 = x2 * ratio;
  const scaledY2 = y2 * ratio;
  
  const color = getClassColor(className);
  const opacity = Math.min(scale, 1) * (0.3 + (conf * 0.7));
  
  // HIGH RESOLUTION BOX
  ctx.beginPath();
  ctx.lineWidth = 4 * scale; // Thicker
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity})`;
  ctx.rect(
    scaledX1 + (scaledX2 - scaledX1) * (1 - scale) / 2,
    scaledY1 + (scaledY2 - scaledY1) * (1 - scale) / 2,
    (scaledX2 - scaledX1) * scale,
    (scaledY2 - scaledY1) * scale
  );
  ctx.stroke();
  
  // Draw label if scale is sufficient
  if (scale > 0.3) {
    const label = `${className.toUpperCase()} ${Math.round(conf * 100)}%`;
    ctx.font = `bold ${0.85 * Math.min(scale, 1)}rem 'Roboto Mono', monospace`;
    const textWidth = ctx.measureText(label).width;
    
    // Background
    ctx.fillStyle = `rgba(0, 0, 0, ${opacity * 0.8})`;
    ctx.fillRect(
      scaledX1,
      scaledY1 - 28 * Math.min(scale, 1),
      textWidth + 12 * Math.min(scale, 1),
      28 * Math.min(scale, 1)
    );
    
    // Text with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 2 * Math.min(scale, 1);
    ctx.shadowOffsetX = 1 * Math.min(scale, 1);
    ctx.shadowOffsetY = 1 * Math.min(scale, 1);
    
    ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 1)`;
    ctx.fillText(
      label, 
      scaledX1 + 6 * Math.min(scale, 1), 
      scaledY1 - 22 * Math.min(scale, 1)
    );
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
}

// Modal setup
const modal = document.getElementById('previewModal');
const modalCanvas = document.getElementById('modalCanvas');
const modalCtx = modalCanvas.getContext('2d', { alpha: false });
const closeModal = document.getElementById('closeModal');

closeModal.onclick = () => modal.style.display = 'none';
window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

// Click on analysis panel → open zoomed modal
document.querySelector('.panel.analysis .image-container').addEventListener('click', async () => {
  if (currentOriginalBase64 && currentFilteredDetections.length > 0) {
    const img = await loadImage(`data:image/jpeg;base64,${currentOriginalBase64}`);
    modalCanvas.width = img.naturalWidth;
    modalCanvas.height = img.naturalHeight;
    
    // HIGH RESOLUTION MODAL
    modalCtx.imageSmoothingEnabled = true;
    modalCtx.imageSmoothingQuality = 'high';
    
    modalCtx.drawImage(img, 0, 0);
    
    currentFilteredDetections.forEach(det => {
      const [x1, y1, x2, y2, conf, className] = det;
      const color = getClassColor(className);
      const opacity = 0.3 + (conf * 0.7);
      
      // HIGH RESOLUTION BOX IN MODAL
      modalCtx.beginPath();
      modalCtx.lineWidth = 5; // Even thicker in modal
      modalCtx.lineJoin = 'round';
      modalCtx.lineCap = 'round';
      modalCtx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity})`;
      modalCtx.rect(x1, y1, x2 - x1, y2 - y1);
      modalCtx.stroke();
      
      // HIGH RESOLUTION LABEL IN MODAL
      const label = `${className.toUpperCase()} ${Math.round(conf * 100)}%`;
      modalCtx.font = 'bold 1.2rem "Roboto Mono", monospace'; // Larger in modal
      const textWidth = modalCtx.measureText(label).width;
      
      modalCtx.fillStyle = `rgba(0, 0, 0, ${opacity * 0.8})`;
      modalCtx.fillRect(x1, y1 - 35, textWidth + 15, 35);
      
      // Text shadow
      modalCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      modalCtx.shadowBlur = 3;
      modalCtx.shadowOffsetX = 1;
      modalCtx.shadowOffsetY = 1;
      
      modalCtx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 1)`;
      modalCtx.fillText(label, x1 + 8, y1 - 12);
      
      // Reset shadow
      modalCtx.shadowColor = 'transparent';
      modalCtx.shadowBlur = 0;
      modalCtx.shadowOffsetX = 0;
      modalCtx.shadowOffsetY = 0;
    });
    
    modal.style.display = 'block';
  }
});

// SINGLE fileInput event listener
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  currentImageName = file.name;

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.disabled = true;
  });

  const reader = new FileReader();
  reader.onload = async (ev) => {
    originalImg.src = ev.target.result;
    originalImg.style.display = 'block';
    currentOriginalBase64 = ev.target.result.split(',')[1];
    currentOriginalImage = await loadImage(ev.target.result);
    
    currentDetections = [];
    currentFilteredDetections = [];
    
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    
    confidenceSlider.value = 25;
    confidenceThreshold = 0.25;
    confidenceValue.textContent = '25%';
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.remove('active');
      btn.disabled = true;
      if (btn.dataset.mode === 'balanced') {
        btn.classList.add('active');
      }
    });
    currentMode = "balanced";
    
    redrawCanvas();
    hideOverlayBtn.disabled = false;
    
    updateSummaryTags([]);
    summaryTags.innerHTML = '<div class="tag" style="border-color:#00ffff;color:#00ffff;">LOADING...</div>';
  };
  reader.readAsDataURL(file);

  const formData = new FormData();
  formData.append('file', file);

  try {
    analyzedCanvas.style.display = 'none';
    const loading = document.createElement('div');
    loading.textContent = 'ANALYZING...';
    loading.style.cssText = `
      position: absolute; color: #00ffff; font-size: 24px;
      text-shadow: 0 0 15px #00ffff; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
    `;
    analyzedCanvas.parentElement.appendChild(loading);

    const response = await fetch(`http://127.0.0.1:8000/detect?mode=${currentMode}`, {
      method: 'POST',
      body: formData,
    });

    loading.remove();
    analyzedCanvas.style.display = 'block';

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();

    currentDetections = data.detections || [];
    console.log(`Received ${currentDetections.length} detections in ${currentMode} mode`);
    
    filterDetectionsByConfidence();
    
    isOverlayVisible = true;
    hideOverlayBtn.textContent = 'HIDE OVERLAY';
    animateBoxes(false);
    
    addToRecent(data.annotated_image, currentDetections, file.name || 'image');
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.disabled = false;
    });

  } catch (err) {
    console.error('Upload / Detection failed:', err);
    alert('Upload failed: ' + err.message + '\nCheck console & backend terminal');
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.disabled = false;
    });
  }
});

function updateSummaryTags(detections) {
  summaryTags.innerHTML = '';
  
  if (detections.length === 0) {
    const emptyTag = document.createElement('div');
    emptyTag.className = 'tag';
    emptyTag.innerHTML = '<span style="font-size:24px;">0</span><br>OBJECTS';
    emptyTag.style.cssText = 'border-color:#888;color:#888;';
    summaryTags.appendChild(emptyTag);
    return;
  }
  
  const countByClass = {};

  detections.forEach(det => {
    const className = det[5];
    countByClass[className] = (countByClass[className] || 0) + 1;
  });

  Object.entries(countByClass).forEach(([cls, cnt]) => {
    const tag = document.createElement('div');
    const cleanCls = cls.toLowerCase().replace(/[^a-z]/g,'');
    tag.className = `tag tag-${cleanCls}`;
    
    if (!document.querySelector(`.tag-${cleanCls}`)) {
      const color = getClassColor(cls);
      tag.style.cssText = `
        border-color: rgb(${color[0]}, ${color[1]}, ${color[2]});
        color: rgb(${color[0]}, ${color[1]}, ${color[2]});
        box-shadow: 0 0 20px rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.7);
      `;
    }
    
    tag.innerHTML = `<span style="font-size:24px;">${cnt}</span><br>${cls.toUpperCase()}`;
    summaryTags.appendChild(tag);
  });
}

function addToRecent(annotatedBase64, detections, filename) {
  const recentItem = {
    originalBase64: currentOriginalBase64,
    detections: detections,
    filename: filename,
    imageName: currentImageName
  };
  
  const thumb = document.createElement('div');
  thumb.className = 'recent-item';
  thumb.innerHTML = `
    <img src="data:image/jpeg;base64,${annotatedBase64}" alt="recent" />
    <div class="recent-label">${filename.slice(0,12)}${filename.length > 12 ? '...' : ''}</div>
  `;

  thumb.addEventListener('click', async () => {
    if (recentItem.originalBase64) {
      const img = await loadImage(`data:image/jpeg;base64,${recentItem.originalBase64}`);
      
      originalImg.src = `data:image/jpeg;base64,${recentItem.originalBase64}`;
      currentOriginalBase64 = recentItem.originalBase64;
      currentOriginalImage = img;
      currentDetections = recentItem.detections;
      currentImageName = recentItem.imageName;
      
      filterDetectionsByConfidence();
      
      isOverlayVisible = true;
      hideOverlayBtn.textContent = 'HIDE OVERLAY';
      hideOverlayBtn.disabled = false;
      
      animateBoxes(false);
    }
  });

  recentList.prepend(thumb);
  recentScans.unshift(recentItem);
  
  if (recentScans.length > 5) {
    recentScans.pop();
    if (recentList.children.length > 5) {
      recentList.removeChild(recentList.lastChild);
    }
  }
}

// Resize handler
window.addEventListener('resize', () => {
  redrawCanvas();
});

// Initialize - page load par
window.addEventListener('load', () => {
  hideOverlayBtn.disabled = true;
  
  confidenceSlider.value = 25;
  confidenceThreshold = 0.25;
  confidenceValue.textContent = '25%';
  
  currentMode = "balanced";
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.mode === 'balanced') {
      btn.classList.add('active');
    }
  });
  
  console.log("Initialized with: 25% confidence, Balanced mode");
});

// Mode selection
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (animating || !currentOriginalBase64) return;
    
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.remove('active');
      b.disabled = false;
    });
    
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.disabled = true;
    });
    
    console.log(`Switched to ${currentMode} mode`);
    
    reRunDetectionWithMode();
  });
});

// MODE CHANGE FUNCTION - FIXED VERSION
async function reRunDetectionWithMode() {
  if (!currentOriginalBase64) return;
  
  summaryTags.innerHTML = '<div class="tag" style="border-color:#00ffff;color:#00ffff;">PROCESSING...</div>';
  
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.disabled = true;
  });
  
  try {
    // Convert base64 to File object properly
    const base64Response = await fetch(`data:image/jpeg;base64,${currentOriginalBase64}`);
    const blob = await base64Response.blob();
    const file = new File([blob], currentImageName || 'image.jpg', { type: 'image/jpeg' });
    
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`http://127.0.0.1:8000/detect?mode=${currentMode}`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    currentDetections = data.detections || [];
    
    filterDetectionsByConfidence();
    
    isOverlayVisible = true;
    hideOverlayBtn.textContent = 'HIDE OVERLAY';
    hideOverlayBtn.disabled = false;
    
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    
    animateBoxes(false);
    
    console.log(`Mode ${currentMode}: ${currentDetections.length} detections`);
    
  } catch (err) {
    console.error('Mode change failed:', err);
    alert('Mode change failed: ' + err.message);
  } finally {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.disabled = false;
    });
  }
}

// Add HIGH RESOLUTION canvas settings
analyzedCanvas.style.imageRendering = 'high-quality';
analyzedCanvas.style.imageRendering = 'crisp-edges';