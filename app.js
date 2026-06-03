(function () {
  const BORDER_SIZES = {
    small: 18,
    medium: 32,
    large: 48,
  };

  const BORDER_OPTIONS = [
    ['side', '侧边框'],
    ['bottom', '下边框'],
  ];

  const PALETTE_POSITION_OPTIONS = {
    bottom: [['bottom', '下方']],
    side: [['right', '右侧'], ['left', '左侧']],
  };

  const state = createDefaultState();

  function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function rgbToHex(r, g, b) {
    return [r, g, b]
      .map((channel) => clampChannel(channel).toString(16).padStart(2, '0').toUpperCase())
      .join('')
      .replace(/^/, '#');
  }

  function collectOpaquePixels(data) {
    const pixels = [];
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] > 0) {
        pixels.push([data[index], data[index + 1], data[index + 2]]);
      }
    }
    return pixels;
  }

  function colorDistance(a, b) {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function averageBucket(bucket) {
    const total = bucket.reduce(
      (sum, color) => [sum[0] + color[0], sum[1] + color[1], sum[2] + color[2]],
      [0, 0, 0],
    );
    return total.map((value) => Math.round(value / bucket.length));
  }

  function extractPaletteFromPixels(pixels, count) {
    if (!pixels.length) return [];

    const buckets = [];
    pixels.forEach((pixel) => {
      const bucket = buckets.find((item) => colorDistance(item.seed, pixel) < 30);
      if (bucket) {
        bucket.colors.push(pixel);
      } else {
        buckets.push({ seed: pixel, colors: [pixel] });
      }
    });

    return buckets
      .sort((a, b) => b.colors.length - a.colors.length)
      .slice(0, count)
      .map((bucket) => rgbToHex(...averageBucket(bucket.colors)));
  }

  function createDefaultState() {
    return {
      image: null,
      imageUrl: '',
      imageName: '',
      palette: [],
      settings: {
        borderStyle: 'bottom',
        borderSize: 'medium',
        palettePosition: 'bottom',
        swatchShape: 'circle',
        showHex: false,
        paletteCount: 5,
      },
    };
  }

  function selectPaletteColors(palette, count) {
    return palette.slice(0, count);
  }

  function updateSetting(previousState, key, value) {
    const settings = {
      ...previousState.settings,
      [key]: value,
    };

    if (key === 'borderStyle') {
      settings.palettePosition = value === 'side' ? 'right' : 'bottom';
    }

    return {
      ...previousState,
      settings,
    };
  }

  function getPalettePositionOptions(borderStyle) {
    return PALETTE_POSITION_OPTIONS[borderStyle] || PALETTE_POSITION_OPTIONS.bottom;
  }

  function getExportLayout(settings, imageSize = { width: 900, height: 1120 }) {
    const border = BORDER_SIZES[settings.borderSize] || BORDER_SIZES.medium;
    const verticalPalette = settings.palettePosition === 'left' || settings.palettePosition === 'right';
    const bottomBorder = border;
    const photoWidth = Math.round(imageSize.width);
    const photoHeight = Math.round(imageSize.height);

    return {
      border,
      bottomBorder,
      orientation: verticalPalette ? 'horizontal' : 'vertical',
      photoWidth,
      photoHeight,
      paletteWidth: verticalPalette ? 160 : 0,
      paletteHeight: verticalPalette ? 0 : 138,
    };
  }

  function getContainedImageRect(source, target) {
    const sourceRatio = source.width / source.height;
    const targetRatio = target.width / target.height;
    let width = target.width;
    let height = target.height;
    let x = 0;
    let y = 0;

    if (sourceRatio > targetRatio) {
      height = target.width / sourceRatio;
      y = (target.height - height) / 2;
    } else {
      width = target.height * sourceRatio;
      x = (target.width - width) / 2;
    }

    return { x, y, width, height };
  }

  function getPaletteFit({ width, height, count, vertical }) {
    const span = vertical ? height : width;
    const cross = vertical ? width : height;
    const safeCount = Math.max(1, count);
    const gapRatio = safeCount <= 4 ? 0.22 : safeCount === 5 ? 0.16 : 0.1;
    const rawSize = span / (safeCount + (safeCount - 1) * gapRatio);
    const size = Math.min(cross, rawSize);
    const gap = safeCount > 1 ? (span - size * safeCount) / (safeCount - 1) : 0;

    return {
      size,
      gap,
      usedSpan: size * safeCount + gap * (safeCount - 1),
    };
  }

  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }

  function getReadableTextColor(hex) {
    const [r, g, b] = hexToRgb(hex);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.62 ? '#4C3F32' : '#FFFDF8';
  }

  function initApp() {
    const dom = getDom();
    if (!dom.fileInput) return;

    dom.uploadButton.addEventListener('click', () => dom.fileInput.click());
    dom.changePhotoButton.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', (event) => {
      const [file] = event.target.files;
      if (file) handleFile(file, dom);
    });
    dom.editOutputButton.addEventListener('click', () => showEditor(dom));
    dom.downloadButton.addEventListener('click', () => downloadExport(dom));

    ['dragenter', 'dragover'].forEach((name) => {
      dom.dropZone.addEventListener(name, (event) => {
        event.preventDefault();
        dom.dropZone.classList.add('is-dragging');
      });
    });

    ['dragleave', 'drop'].forEach((name) => {
      dom.dropZone.addEventListener(name, (event) => {
        event.preventDefault();
        dom.dropZone.classList.remove('is-dragging');
      });
    });

    dom.dropZone.addEventListener('drop', (event) => {
      const [file] = event.dataTransfer.files;
      if (file) handleFile(file, dom);
    });

    renderSettingsControls(dom);
  }

  function getDom() {
    return {
      dropZone: document.getElementById('drop-zone'),
      fileInput: document.getElementById('file-input'),
      uploadButton: document.getElementById('upload-button'),
      changePhotoButton: document.getElementById('change-photo-button'),
      editOutputButton: document.getElementById('edit-output-button'),
      downloadButton: document.getElementById('download-button'),
      galleryState: document.getElementById('gallery-state'),
      editorState: document.getElementById('editor-state'),
      photoPreview: document.getElementById('photo-preview'),
      paletteStrip: document.getElementById('palette-strip'),
      exportPreview: document.getElementById('export-preview'),
      settingsControls: document.getElementById('settings-controls'),
      message: document.getElementById('message'),
    };
  }

  async function handleFile(file, dom) {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setMessage(dom, '请选择 JPG 或 PNG 格式的照片。');
      return;
    }

    setMessage(dom, '正在收集这张照片里的颜色...');

    try {
      const image = await loadImageFromFile(file);
      if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
      state.image = image;
      state.imageUrl = image.src;
      state.imageName = file.name;
      state.palette = extractPaletteFromImage(image, 6);

      if (!state.palette.length) {
        setMessage(dom, '暂时没有从这张照片里识别到颜色，可以换一张试试。');
        return;
      }

      renderGallery(dom);
      renderExportPreview(dom);
      setMessage(dom, '色卡生成好了。');
    } catch (error) {
      setMessage(dom, '图片加载失败，请换一张照片试试。');
    }
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = URL.createObjectURL(file);
    });
  }

  function extractPaletteFromImage(image, count) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const maxSide = 140;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const sampled = [];
    const pixels = collectOpaquePixels(imageData.data);
    const step = Math.max(1, Math.floor(pixels.length / 2500));

    for (let index = 0; index < pixels.length; index += step) {
      sampled.push(pixels[index]);
    }

    return extractPaletteFromPixels(sampled, count);
  }

  function renderGallery(dom) {
    dom.photoPreview.src = state.imageUrl;
    dom.photoPreview.alt = `${state.imageName} 的照片预览`;
    dom.galleryState.hidden = false;
    dom.paletteStrip.innerHTML = '';

    selectPaletteColors(state.palette, state.settings.paletteCount).forEach((color) => {
      const swatch = document.createElement('button');
      swatch.className = 'gallery-swatch';
      swatch.type = 'button';
      swatch.style.background = color;
      swatch.textContent = color;
      swatch.style.color = getReadableTextColor(color);
      swatch.title = color;
      swatch.addEventListener('click', () => copyColor(color, dom));
      dom.paletteStrip.appendChild(swatch);
    });
  }

  async function copyColor(color, dom) {
    try {
      await navigator.clipboard.writeText(color);
      setMessage(dom, `已复制 ${color}`);
    } catch (error) {
      setMessage(dom, color);
    }
  }

  function showEditor(dom) {
    dom.editorState.hidden = false;
    renderSettingsControls(dom);
    renderExportPreview(dom);
    dom.editorState.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSettingsControls(dom) {
    const groups = [
      {
        label: '边框样式',
        key: 'borderStyle',
        options: BORDER_OPTIONS,
      },
      {
        label: '白边大小',
        key: 'borderSize',
        options: [
          ['small', '小'],
          ['medium', '中'],
          ['large', '大'],
        ],
      },
      {
        label: '色卡位置',
        key: 'palettePosition',
        options: getPalettePositionOptions(state.settings.borderStyle),
      },
      {
        label: '色卡形状',
        key: 'swatchShape',
        options: [
          ['circle', '圆形'],
          ['square', '方形'],
        ],
      },
      {
        label: '色卡数量',
        key: 'paletteCount',
        options: [
          [4, '4'],
          [5, '5'],
          [6, '6'],
        ],
      },
    ];

    dom.settingsControls.innerHTML = '';
    groups.forEach((group) => dom.settingsControls.appendChild(createSegmentedGroup(group, dom)));
    dom.settingsControls.appendChild(createHexToggle(dom));
  }

  function createSegmentedGroup(group, dom) {
    const wrapper = document.createElement('div');
    wrapper.className = 'control-group';

    const label = document.createElement('span');
    label.className = 'control-label';
    label.textContent = group.label;
    wrapper.appendChild(label);

    const row = document.createElement('div');
    row.className = 'segmented';
    group.options.forEach(([value, text]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'control-button';
      button.textContent = text;
      button.classList.toggle('is-active', state.settings[group.key] === value);
      button.addEventListener('click', () => {
        const next = updateSetting(state, group.key, value);
        Object.assign(state, next);
        renderSettingsControls(dom);
        renderGallery(dom);
        renderExportPreview(dom);
      });
      row.appendChild(button);
    });
    wrapper.appendChild(row);
    return wrapper;
  }

  function createHexToggle(dom) {
    const wrapper = document.createElement('div');
    wrapper.className = 'control-group toggle-row';

    const label = document.createElement('span');
    label.className = 'control-label';
    label.textContent = '显示 HEX 色值';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'switch';
    button.setAttribute('aria-pressed', String(state.settings.showHex));
    button.innerHTML = '<span></span>';
    button.addEventListener('click', () => {
      const next = updateSetting(state, 'showHex', !state.settings.showHex);
      Object.assign(state, next);
      renderSettingsControls(dom);
      renderExportPreview(dom);
    });

    wrapper.append(label, button);
    return wrapper;
  }

  function renderExportPreview(dom) {
    if (!state.image) return;

    const colors = selectPaletteColors(state.palette, state.settings.paletteCount);
    const ratio = state.image.naturalWidth / state.image.naturalHeight;
    const previewGap = colors.length <= 4 ? 16 : colors.length === 5 ? 12 : 8;
    dom.exportPreview.className = [
      'export-preview',
      `frame-${state.settings.borderStyle}`,
      `border-${state.settings.borderSize}`,
      `palette-${state.settings.palettePosition}`,
      `swatch-${state.settings.swatchShape}`,
      state.settings.showHex ? 'show-hex' : '',
    ].join(' ');
    dom.exportPreview.style.setProperty('--photo-ratio', String(ratio));
    dom.exportPreview.style.setProperty('--palette-count', String(colors.length));
    dom.exportPreview.style.setProperty('--palette-gap', `${previewGap}px`);

    const photo = document.createElement('img');
    photo.className = 'export-photo';
    photo.src = state.imageUrl;
    photo.alt = '成果图中的照片';

    const palette = document.createElement('div');
    palette.className = 'export-palette';
    colors.forEach((color) => {
      const item = document.createElement('div');
      item.className = 'export-color';
      const dot = document.createElement('span');
      dot.className = 'export-swatch';
      dot.style.background = color;
      const hex = document.createElement('span');
      hex.className = 'export-hex';
      hex.textContent = color;
      item.append(dot, hex);
      palette.appendChild(item);
    });

    dom.exportPreview.replaceChildren(photo, palette);
  }

  function drawContainedImage(context, image, x, y, width, height) {
    const rect = getContainedImageRect(
      { width: image.naturalWidth, height: image.naturalHeight },
      { width, height },
    );
    context.drawImage(image, x + rect.x, y + rect.y, rect.width, rect.height);
  }

  function drawExportImage(canvas, image, palette, settings) {
    const maxPhotoSide = 1200;
    const scale = Math.min(1, maxPhotoSide / Math.max(image.naturalWidth, image.naturalHeight));
    const layout = getExportLayout(settings, {
      width: image.naturalWidth * scale,
      height: image.naturalHeight * scale,
    });
    const colors = selectPaletteColors(palette, settings.paletteCount);
    const photoWidth = layout.photoWidth;
    const photoHeight = layout.photoHeight;
    const side = layout.orientation === 'horizontal';

    canvas.width = side ? photoWidth + layout.paletteWidth + layout.border * 2 : photoWidth + layout.border * 2;
    canvas.height = side ? photoHeight + layout.border * 2 : photoHeight + layout.border + layout.paletteHeight + layout.bottomBorder;

    const context = canvas.getContext('2d');
    context.fillStyle = '#FFFDF8';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const photoX = settings.palettePosition === 'left' ? layout.border + layout.paletteWidth : layout.border;
    const photoY = layout.border;
    drawContainedImage(context, image, photoX, photoY, photoWidth, photoHeight);

    const paletteX = settings.palettePosition === 'left'
      ? layout.border / 2
      : settings.palettePosition === 'right'
        ? photoX + photoWidth + layout.border / 2
        : layout.border;
    const paletteY = side ? layout.border : photoY + photoHeight + 32;
    drawPalette(context, colors, settings, paletteX, paletteY, side ? layout.paletteWidth - layout.border : photoWidth, side ? photoHeight : layout.paletteHeight);
  }

  function drawPalette(context, colors, settings, x, y, width, height) {
    context.textAlign = 'center';
    context.font = '24px Arial';
    const vertical = settings.palettePosition === 'left' || settings.palettePosition === 'right';
    const labelSpace = settings.showHex ? 38 : 0;
    const fit = getPaletteFit({
      width,
      height: Math.max(1, height - labelSpace),
      count: colors.length,
      vertical,
    });
    const size = fit.size;

    colors.forEach((color, index) => {
      const cx = vertical ? x + width / 2 : x + size / 2 + index * (size + fit.gap);
      const cy = vertical ? y + size / 2 + index * (size + fit.gap) : y + size / 2;
      context.fillStyle = color;

      if (settings.swatchShape === 'circle') {
        context.beginPath();
        context.arc(cx, cy, size / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(cx - size / 2, cy - size / 2, size, size);
      }

      if (settings.showHex) {
        context.fillStyle = '#625A50';
        context.fillText(color, cx, cy + size / 2 + 34);
      }
    });
  }

  function downloadExport(dom) {
    if (!state.image) {
      setMessage(dom, '请先上传一张照片。');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      drawExportImage(canvas, state.image, state.palette, state.settings);
      const link = document.createElement('a');
      link.download = 'colorwalk-palette.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      setMessage(dom, 'PNG 已生成。');
    } catch (error) {
      setMessage(dom, '导出失败，请稍后再试。');
    }
  }

  function setMessage(dom, text) {
    dom.message.textContent = text;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initApp);
  }

  if (typeof module !== 'undefined') {
    module.exports = {
      rgbToHex,
      collectOpaquePixels,
      extractPaletteFromPixels,
      createDefaultState,
      selectPaletteColors,
      updateSetting,
      getPalettePositionOptions,
      getExportLayout,
      getContainedImageRect,
      getPaletteFit,
    };
  }
}());
