const test = require('node:test');
const assert = require('node:assert/strict');

const {
  rgbToHex,
  collectOpaquePixels,
  extractPaletteFromPixels,
  createDefaultState,
  selectPaletteColors,
  updateSetting,
  getExportLayout,
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
    borderStyle: 'polaroid',
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

test('getExportLayout uses side dimensions when palette is vertical', () => {
  const layout = getExportLayout({
    borderStyle: 'side',
    borderSize: 'medium',
    palettePosition: 'right',
    showHex: true,
  });

  assert.equal(layout.orientation, 'horizontal');
  assert.ok(layout.paletteWidth > 0);
});
