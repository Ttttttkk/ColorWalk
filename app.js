(function () {
  const BORDER_SIZES = {
    small: 18,
    medium: 32,
    large: 48,
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
        borderStyle: 'polaroid',
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
    return {
      ...previousState,
      settings: {
        ...previousState.settings,
        [key]: value,
      },
    };
  }

  function getExportLayout(settings) {
    const border = BORDER_SIZES[settings.borderSize] || BORDER_SIZES.medium;
    const verticalPalette = settings.palettePosition === 'left' || settings.palettePosition === 'right';
    const polaroidBottom = settings.borderStyle === 'polaroid' ? border * 1.5 : border;

    return {
      border,
      polaroidBottom,
      orientation: verticalPalette ? 'horizontal' : 'vertical',
      paletteWidth: verticalPalette ? 160 : 0,
      paletteHeight: verticalPalette ? 0 : 128,
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
        options: [
          ['polaroid', '拍立得'],
          ['side', '侧边框'],
          ['bottom', '下边框'],
        ],
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
        options: [
          ['bottom', '下方'],
          ['right', '右侧'],
          ['left', '左侧'],
        ],
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
    dom.exportPreview.className = [
      'export-preview',
      `frame-${state.settings.borderStyle}`,
      `border-${state.settings.borderSize}`,
      `palette-${state.settings.palettePosition}`,
      `swatch-${state.settings.swatchShape}`,
      state.settings.showHex ? 'show-hex' : '',
    ].join(' ');

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

  function drawCoverImage(context, image, x, y, width, height) {
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = width / height;
    let sourceWidth = image.naturalWidth;
    let sourceHeight = image.naturalHeight;
    let sourceX = 0;
    let sourceY = 0;

    if (sourceRatio > targetRatio) {
      sourceWidth = image.naturalHeight * targetRatio;
      sourceX = (image.naturalWidth - sourceWidth) / 2;
    } else {
      sourceHeight = image.naturalWidth / targetRatio;
      sourceY = (image.naturalHeight - sourceHeight) / 2;
    }

    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  }

  function drawExportImage(canvas, image, palette, settings) {
    const layout = getExportLayout(settings);
    const colors = selectPaletteColors(palette, settings.paletteCount);
    const photoWidth = 900;
    const photoHeight = 1120;
    const side = layout.orientation === 'horizontal';

    canvas.width = side ? photoWidth + layout.paletteWidth + layout.border * 2 : photoWidth + layout.border * 2;
    canvas.height = side ? photoHeight + layout.border * 2 : photoHeight + layout.border + layout.paletteHeight + layout.polaroidBottom;

    const context = canvas.getContext('2d');
    context.fillStyle = '#FFFDF8';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const photoX = settings.palettePosition === 'left' ? layout.border + layout.paletteWidth : layout.border;
    const photoY = layout.border;
    drawCoverImage(context, image, photoX, photoY, photoWidth, photoHeight);

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
    const gap = vertical ? 28 : 22;
    const size = vertical ? 72 : 86;

    colors.forEach((color, index) => {
      const cx = vertical ? x + width / 2 : x + ((index + 0.5) * width) / colors.length;
      const cy = vertical ? y + 92 + index * (size + gap) : y + 44;
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
      getExportLayout,
    };
  }
}());
