const test = require('node:test');
const assert = require('node:assert/strict');

const {
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
} = require('../app.js');

test('rgbToHex converts rgb channels to uppercase hex', () => {
  assert.equal(rgbToHex(48, 65, 60), '#30413C');
  assert.equal(rgbToHex(255, 176, 0), '#FFB000');
});

test('collectOpaquePixels ignores fully transparent pixels', () => {
  const pixels = collectOpaquePixels([
    10, 20, 30, 255,
    200, 210, 220, 0,
    40, 50, 60, 128,
  ]);

  assert.deepEqual(pixels, [
    [10, 20, 30],
    [40, 50, 60],
  ]);
});

test('extractPaletteFromPixels returns requested dominant colors', () => {
  const pixels = [
    ...Array.from({ length: 30 }, () => [48, 65, 60]),
    ...Array.from({ length: 20 }, () => [183, 168, 120]),
    ...Array.from({ length: 10 }, () => [215, 176, 122]),
  ];

  assert.deepEqual(extractPaletteFromPixels(pixels, 3), ['#30413C', '#B7A878', '#D7B07A']);
});

test('extractPaletteFromPixels merges visually similar colors', () => {
  const pixels = [
    ...Array.from({ length: 20 }, () => [48, 65, 60]),
    ...Array.from({ length: 20 }, () => [50, 67, 62]),
    ...Array.from({ length: 20 }, () => [220, 210, 188]),
  ];

  assert.deepEqual(extractPaletteFromPixels(pixels, 2), ['#31423D', '#DCD2BC']);
});

test('createDefaultState matches the approved output direction', () => {
  assert.deepEqual(createDefaultState().settings, {
    borderStyle: 'bottom',
    borderSize: 'medium',
    palettePosition: 'bottom',
    swatchShape: 'circle',
    showHex: false,
    paletteCount: 5,
  });
});

test('selectPaletteColors respects requested palette count', () => {
  const palette = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'];

  assert.deepEqual(selectPaletteColors(palette, 4), ['#111111', '#222222', '#333333', '#444444']);
  assert.deepEqual(selectPaletteColors(palette, 6), palette);
});

test('updateSetting returns new state without mutating the previous state', () => {
  const state = createDefaultState();
  const next = updateSetting(state, 'showHex', true);

  assert.equal(state.settings.showHex, false);
  assert.equal(next.settings.showHex, true);
});

test('updateSetting removes invalid palette positions for each border style', () => {
  const bottom = updateSetting(createDefaultState(), 'borderStyle', 'bottom');
  const side = updateSetting(createDefaultState(), 'borderStyle', 'side');

  assert.equal(bottom.settings.palettePosition, 'bottom');
  assert.equal(side.settings.palettePosition, 'right');
});

test('getPalettePositionOptions only exposes valid positions for border style', () => {
  assert.deepEqual(getPalettePositionOptions('bottom'), [['bottom', '下方']]);
  assert.deepEqual(getPalettePositionOptions('side'), [['right', '右侧'], ['left', '左侧']]);
});

test('getExportLayout uses side dimensions when palette is vertical', () => {
  const layout = getExportLayout({
    borderStyle: 'side',
    borderSize: 'medium',
    palettePosition: 'right',
    showHex: true,
  }, { width: 1200, height: 900 });

  assert.equal(layout.orientation, 'horizontal');
  assert.equal(layout.paletteWidth, 300);
});

test('getExportLayout uses 8 to 2 photo and palette ratio', () => {
  const side = getExportLayout({
    borderStyle: 'side',
    borderSize: 'medium',
    palettePosition: 'right',
    showHex: false,
  }, { width: 1200, height: 900 });
  const bottom = getExportLayout(createDefaultState().settings, { width: 1200, height: 900 });

  assert.equal(side.photoWidth / side.paletteWidth, 4);
  assert.equal(bottom.photoHeight / bottom.paletteHeight, 4);
});

test('getExportLayout preserves uploaded image aspect ratio', () => {
  const landscape = getExportLayout(createDefaultState().settings, { width: 1200, height: 900 });
  const portrait = getExportLayout(createDefaultState().settings, { width: 900, height: 1200 });

  assert.equal(landscape.photoWidth, 1200);
  assert.equal(landscape.photoHeight, 900);
  assert.equal(portrait.photoWidth, 900);
  assert.equal(portrait.photoHeight, 1200);
});

test('getContainedImageRect never crops the source image', () => {
  assert.deepEqual(
    getContainedImageRect({ width: 1200, height: 900 }, { width: 900, height: 900 }),
    { x: 0, y: 112.5, width: 900, height: 675 },
  );
});

test('getPaletteFit fills the same horizontal area for different palette counts', () => {
  const four = getPaletteFit({ width: 600, height: 120, count: 4, vertical: false });
  const six = getPaletteFit({ width: 600, height: 120, count: 6, vertical: false });

  assert.ok(four.size > six.size);
  assert.ok(four.gap > six.gap);
  assert.ok(four.size <= 64);
  assert.equal(four.usedSpan, 600);
  assert.equal(six.usedSpan, 600);
});

test('getPaletteFit fills the same vertical area for side palettes', () => {
  const four = getPaletteFit({ width: 120, height: 600, count: 4, vertical: true });
  const six = getPaletteFit({ width: 120, height: 600, count: 6, vertical: true });

  assert.ok(four.size > six.size);
  assert.ok(four.gap > six.gap);
  assert.ok(four.size <= 42);
  assert.equal(four.usedSpan, 600);
  assert.equal(six.usedSpan, 600);
});
