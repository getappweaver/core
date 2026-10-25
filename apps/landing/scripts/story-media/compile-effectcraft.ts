import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify, parseArgs } from 'node:util';

import type { StoryCaptureManifest } from './types';

const execFileAsync = promisify(execFile);

export type TextSegment = {
  text: string;
  style: 'plain' | 'bold' | 'accent';
};

export function parseMarkdownLine(line: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      const plain = line.slice(lastIndex, match.index).trim();
      if (plain.length > 0) {
        segments.push({
          text: plain,
          style: 'plain',
        });
      }
    }

    const matchedText = match[0];
    if (matchedText.startsWith('**') && matchedText.endsWith('**')) {
      const bold = matchedText.slice(2, -2).trim();
      if (bold.length > 0) {
        segments.push({
          text: bold,
          style: 'bold',
        });
      }
    } else if (matchedText.startsWith('*') && matchedText.endsWith('*')) {
      const accent = matchedText.slice(1, -1).trim();
      if (accent.length > 0) {
        segments.push({
          text: accent,
          style: 'accent',
        });
      }
    }

    lastIndex = match.index + matchedText.length;
  }

  if (lastIndex < line.length) {
    const trailing = line.slice(lastIndex).trim();
    if (trailing.length > 0) {
      segments.push({
        text: trailing,
        style: 'plain',
      });
    }
  }

  return segments;
}

function renderSegmentCalls(segments: TextSegment[], lineVar: string, startT: number, staggerDelta: number): string {
  return segments.map((seg, i) => {
    const cleanStr = seg.text.trim();
    if (!cleanStr) return '';

    const font = seg.style === 'plain' ? 'AvenirNext-Regular' : 'AvenirNext-Bold';
    const color = seg.style === 'plain'
      ? 'C_DESC'
      : seg.style === 'bold'
        ? 'C_WHITE'
        : 'C_CYAN';
    const isAccent = seg.style === 'accent';
    const t0 = (startT + i * staggerDelta).toFixed(2);
    const escaped = cleanStr.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    let code = '';
    if (i > 0) {
      if (isAccent) {
        code += `  ${lineVar} += WORD_GAP + PILL_PAD_X;\n`;
      } else {
        code += `  ${lineVar} += WORD_GAP;\n`;
      }
    }
    code += `  var w_${lineVar}_${i} = addSegment(comp, "${escaped}", "${font}", 26, ${color}, ${lineVar}, ${lineVar.replace('X', 'Y')}, ${isAccent}, ${t0});\n`;
    code += `  ${lineVar} += w_${lineVar}_${i};\n`;
    return code;
  }).join('');
}

export type GenerateExtendScriptProps = {
  manifest: StoryCaptureManifest;
  fps: number;
};

export function generateExtendScript({
  manifest,
  fps,
}: GenerateExtendScriptProps): string {
  const beats = manifest.beats;
  if (!beats || beats.length === 0) {
    throw new Error('Manifest must have at least 1 beat');
  }

  const N = beats.length;
  const BEAT_STRIDE = 2.8;
  const dur = Number((1.2 + N * BEAT_STRIDE + 2.0).toFixed(2));

  const cardW = manifest.cardWidth;
  const cardH = manifest.cardHeight;
  const k = Number(Math.min(0.82, 960 / cardW, 920 / cardH).toFixed(3));

  const titleLines = manifest.title.split('\n');
  const titleLine1 = titleLines[0] ?? 'Cut the noise.';
  const titleLine2 = titleLines[1] ?? 'Keep the winners.';

  const descRaw = beats[0].description.trim();
  const descLines = descRaw.split('\n').map((l) => l.trim()).filter(Boolean);
  const line1Segments = descLines.length > 0 ? parseMarkdownLine(descLines[0]) : [];
  const line2Segments = descLines.length > 1 ? parseMarkdownLine(descLines[1]) : [];

  const line1Calls = renderSegmentCalls(line1Segments, 'line1X', 0.48, 0.10);
  const line2Calls = renderSegmentCalls(line2Segments, 'line2X', 0.60, 0.10);

  const escapedLine1 = titleLine1.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const escapedLine2 = titleLine2.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const escapedTag = manifest.pluginTag.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const pillW = 104;
  const pillH = 36;
  const pillCenterX = 140 + pillW / 2;
  const pillCenterY = 345;

  const footageImports = beats
    .map(
      (b, i) => `var beforeFootage_${i} = app.project.importFile(new ImportOptions(new File(DIR + "${b.beforeCardPath}")));
var afterFootage_${i} = app.project.importFile(new ImportOptions(new File(DIR + "${b.afterCardPath}")));
var cropFootage_${i} = app.project.importFile(new ImportOptions(new File(DIR + "${b.cropPath}")));`,
    )
    .join('\n');

  const beatLayersJs = beats
    .map((b, i) => {
      const tStart = 1.2 + i * BEAT_STRIDE;
      const tFocusHold = tStart + 0.35;
      const tClick = tStart + 1.35;
      const tTransitionEnd = tStart + 1.75;
      const tBeatEnd = i === N - 1 ? dur : tStart + BEAT_STRIDE;

      return `// --- Beat ${i + 1} (${b.targetId}) ---
var shBeforeW_${i} = beforeFootage_${i}.width * K;
var shBeforeH_${i} = beforeFootage_${i}.height * K;
var shBeforeCenter_${i} = [CARD_TOP_LEFT[0] + 12 + shBeforeW_${i} / 2, CARD_TOP_LEFT[1] + 12 + shBeforeH_${i} / 2];
var shadowBefore_${i} = roundedRect(comp, "Card Shadow Before ${i}", [shBeforeW_${i}, shBeforeH_${i}], shBeforeCenter_${i}, [0, 0, 0], 0);
attach(shadowBefore_${i});
keys(tr(shadowBefore_${i}, "ADBE Opacity"), [
  ${i === 0 ? `[0, 100],` : `[0, 0], [${(tStart - 0.05).toFixed(2)}, 0], [${tStart.toFixed(2)}, 100],`}
  [${tClick.toFixed(2)}, 100],
  [${tTransitionEnd.toFixed(2)}, 0]
]);

var shAfterW_${i} = afterFootage_${i}.width * K;
var shAfterH_${i} = afterFootage_${i}.height * K;
var shAfterCenter_${i} = [CARD_TOP_LEFT[0] + 12 + shAfterW_${i} / 2, CARD_TOP_LEFT[1] + 12 + shAfterH_${i} / 2];
var shadowAfter_${i} = roundedRect(comp, "Card Shadow After ${i}", [shAfterW_${i}, shAfterH_${i}], shAfterCenter_${i}, [0, 0, 0], 0);
attach(shadowAfter_${i});
keys(tr(shadowAfter_${i}, "ADBE Opacity"), [
  [0, 0],
  [${tClick.toFixed(2)}, 0],
  [${tTransitionEnd.toFixed(2)}, 100],
  ${i === N - 1 ? `[${dur.toFixed(2)}, 100]` : `[${(tBeatEnd - 0.05).toFixed(2)}, 100], [${tBeatEnd.toFixed(2)}, 0]`}
]);

var lAfter_${i} = comp.layers.add(afterFootage_${i});
tr(lAfter_${i}, "ADBE Anchor Point").setValue([0, 0]);
tr(lAfter_${i}, "ADBE Position").setValue(CARD_TOP_LEFT);
tr(lAfter_${i}, "ADBE Scale").setValue([K * 100, K * 100]);
attach(lAfter_${i});
keys(tr(lAfter_${i}, "ADBE Opacity"), [
  [0, 0],
  [${tClick.toFixed(2)}, 0],
  [${tTransitionEnd.toFixed(2)}, 100],
  ${i === N - 1 ? `[${dur.toFixed(2)}, 100]` : `[${(tBeatEnd - 0.05).toFixed(2)}, 100], [${tBeatEnd.toFixed(2)}, 0]`}
]);

var lBefore_${i} = comp.layers.add(beforeFootage_${i});
tr(lBefore_${i}, "ADBE Anchor Point").setValue([0, 0]);
tr(lBefore_${i}, "ADBE Position").setValue(CARD_TOP_LEFT);
tr(lBefore_${i}, "ADBE Scale").setValue([K * 100, K * 100]);
attach(lBefore_${i});
keys(tr(lBefore_${i}, "ADBE Opacity"), [
  ${i === 0 ? `[0, 100],` : `[0, 0], [${(tStart - 0.05).toFixed(2)}, 0], [${tStart.toFixed(2)}, 100],`}
  [${tClick.toFixed(2)}, 100],
  [${tTransitionEnd.toFixed(2)}, 0]
]);

var blur_${i} = lBefore_${i}.property("ADBE Effect Parade").addProperty("ADBE Gaussian Blur 2");
blur_${i}.property(3).setValue(1);
keys(blur_${i}.property(1), [
  [${tStart.toFixed(2)}, 0],
  [${tFocusHold.toFixed(2)}, 18],
  [${tClick.toFixed(2)}, 18],
  [${tTransitionEnd.toFixed(2)}, 0]
]);

var pCropTopLeft_${i} = [CARD_TOP_LEFT[0] + ${b.targetRect.x} * K, CARD_TOP_LEFT[1] + ${b.targetRect.y} * K];
var lCrop_${i} = comp.layers.add(cropFootage_${i});
tr(lCrop_${i}, "ADBE Anchor Point").setValue([0, 0]);
tr(lCrop_${i}, "ADBE Position").setValue(pCropTopLeft_${i});
tr(lCrop_${i}, "ADBE Scale").setValue([K * 100, K * 100]);
attach(lCrop_${i});
keys(tr(lCrop_${i}, "ADBE Opacity"), [
  [0, 0],
  [${tStart.toFixed(2)}, 0],
  [${tFocusHold.toFixed(2)}, 100],
  [${tClick.toFixed(2)}, 100],
  [${tTransitionEnd.toFixed(2)}, 0]
]);

var pCropCenter_${i} = [CARD_TOP_LEFT[0] + (${b.targetRect.x} + ${b.targetRect.w} / 2) * K, CARD_TOP_LEFT[1] + (${b.targetRect.y} + ${b.targetRect.h} / 2) * K];
var hlBox_${i} = strokeRect(comp, "Highlight ${i}", [${b.targetRect.w} * K + 24, ${b.targetRect.h} * K + 18], pCropCenter_${i}, C_CYAN, 4);
attach(hlBox_${i});
keys(tr(hlBox_${i}, "ADBE Opacity"), [
  [0, 0],
  [${tStart.toFixed(2)}, 0],
  [${tFocusHold.toFixed(2)}, 100],
  [${tClick.toFixed(2)}, 100],
  [${tTransitionEnd.toFixed(2)}, 0]
]);
keys(tr(hlBox_${i}, "ADBE Scale"), [
  [${tStart.toFixed(2)}, [110, 110]],
  [${tFocusHold.toFixed(2)}, [100, 100]]
]);

var ripple_${i} = ellipse(comp, "Click Ripple ${i}", 42, pCropCenter_${i}, [1, 1, 1]);
attach(ripple_${i});
keys(tr(ripple_${i}, "ADBE Opacity"), [
  [0, 0],
  [${tClick.toFixed(2)}, 0],
  [${(tClick + 0.05).toFixed(2)}, 100],
  [${tTransitionEnd.toFixed(2)}, 0]
]);
keys(tr(ripple_${i}, "ADBE Scale"), [
  [${(tClick + 0.05).toFixed(2)}, [40, 40]],
  [${tTransitionEnd.toFixed(2)}, [160, 160]]
]);

var pTargetPan_${i} = [CARD[0] - (pCropCenter_${i}[0] - CARD[0]) * 0.15, CARD[1] - (pCropCenter_${i}[1] - CARD[1]) * 0.15];
`;
    })
    .join('\n');

  const rigPosKeys = [
    `[0, [CARD[0] + 50, CARD[1]]]`,
    `[0.6, CARD]`,
    `[1.2, CARD]`,
    ...beats.flatMap((_, i) => {
      const tStart = 1.2 + i * BEAT_STRIDE;
      const tFocusHold = tStart + 0.35;
      const tClick = tStart + 1.35;
      const tTransitionEnd = tStart + 1.75;
      const tBeatEnd = i === N - 1 ? dur : tStart + BEAT_STRIDE;
      return [
        `[${tStart.toFixed(2)}, CARD]`,
        `[${tFocusHold.toFixed(2)}, pTargetPan_${i}]`,
        `[${tClick.toFixed(2)}, pTargetPan_${i}]`,
        `[${tTransitionEnd.toFixed(2)}, CARD]`,
        `[${tBeatEnd.toFixed(2)}, CARD]`,
      ];
    }),
  ].join(',\n  ');

  const rigScaleKeys = [
    `[0, [100, 100]]`,
    `[1.2, [100, 100]]`,
    ...beats.flatMap((_, i) => {
      const tStart = 1.2 + i * BEAT_STRIDE;
      const tFocusHold = tStart + 0.35;
      const tClick = tStart + 1.35;
      const tTransitionEnd = tStart + 1.75;
      const tBeatEnd = i === N - 1 ? dur : tStart + BEAT_STRIDE;
      return [
        `[${tStart.toFixed(2)}, [100, 100]]`,
        `[${tFocusHold.toFixed(2)}, [106, 106]]`,
        `[${tClick.toFixed(2)}, [106, 106]]`,
        `[${tTransitionEnd.toFixed(2)}, [100, 100]]`,
        `[${tBeatEnd.toFixed(2)}, [100, 100]]`,
      ];
    }),
  ].join(',\n  ');

  return `// Auto-generated EffectCraft ExtendScript for ${manifest.storyId}
var DIR = new File($.fileName).parent.fsName.replace(/\\\\/g, "/") + "/";
var W = 1920, H = 1080, DUR = ${dur}, FPS = ${fps};
var IMG_W = ${cardW}, IMG_H = ${cardH}, K = ${k};
var CARD = [1340, 540];
var CARD_TOP_LEFT = [Math.round(CARD[0] - (IMG_W * K) / 2), Math.round(CARD[1] - (IMG_H * K) / 2)];

var C_BG = [0.055, 0.059, 0.071];
var C_OLIVE = [0.55, 0.54, 0.11];
var C_CYAN = [0.31, 0.79, 0.79];
var C_WHITE = [0.98, 0.98, 0.98];
var C_DESC = [0.64, 0.68, 0.73];
var C_TAG_TEXT = [0.09, 0.09, 0.09];

function ease(prop) {
  var e = new KeyframeEase(0, 80);
  for (var i = 1; i <= prop.numKeys; i++) {
    var dims = prop.value instanceof Array ? prop.value.length : 1;
    var arr = [];
    var isSpatial = prop.propertyValueType === PropertyValueType.TwoD_SPATIAL || prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL;
    for (var d = 0; d < (isSpatial ? 1 : dims); d++) arr.push(e);
    try { prop.setTemporalEaseAtKey(i, arr, arr); } catch (err) {}
  }
}

function keys(prop, list) {
  for (var i = 0; i < list.length; i++) prop.setValueAtTime(list[i][0], list[i][1]);
  ease(prop);
}

function tr(layer, name) {
  return layer.property("ADBE Transform Group").property(name);
}

function text(comp, str, size, color, pos, fontName, leading, tracking, justification) {
  var t = comp.layers.addText(str);
  var src = t.property("ADBE Text Properties").property("ADBE Text Document");
  var d = src.value;
  d.font = fontName;
  d.fontSize = size;
  d.fillColor = color;
  d.applyFill = true;
  d.applyStroke = false;
  if (leading > 0) {
    d.leading = leading;
    d.applyLeading = true;
  }
  if (tracking !== 0) {
    d.tracking = tracking;
  }
  d.justification = justification;
  src.setValue(d);
  tr(t, "ADBE Position").setValue(pos);
  return t;
}

function roundedRect(comp, name, size, center, color, roundness) {
  var s = comp.layers.addShape();
  s.name = name;
  var g = s.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
  var c = g.property("ADBE Vectors Group");
  var r = c.addProperty("ADBE Vector Shape - Rect");
  r.property("ADBE Vector Rect Size").setValue(size);
  if (roundness > 0) {
    r.property("ADBE Vector Rect Roundness").setValue(roundness);
  }
  var f = c.addProperty("ADBE Vector Graphic - Fill");
  f.property("ADBE Vector Fill Color").setValue(color);
  tr(s, "ADBE Position").setValue(center);
  return s;
}

function strokeRect(comp, name, size, center, color, strokeW) {
  var s = comp.layers.addShape();
  s.name = name;
  var g = s.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
  var c = g.property("ADBE Vectors Group");
  var r = c.addProperty("ADBE Vector Shape - Rect");
  r.property("ADBE Vector Rect Size").setValue(size);
  var st = c.addProperty("ADBE Vector Graphic - Stroke");
  st.property("ADBE Vector Stroke Color").setValue(color);
  st.property("ADBE Vector Stroke Width").setValue(strokeW);
  tr(s, "ADBE Position").setValue(center);
  return s;
}

function ellipse(comp, name, d, center, color) {
  var s = comp.layers.addShape();
  s.name = name;
  var g = s.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
  var c = g.property("ADBE Vectors Group");
  c.addProperty("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size").setValue([d, d]);
  var st = c.addProperty("ADBE Vector Graphic - Stroke");
  st.property("ADBE Vector Stroke Color").setValue(color);
  st.property("ADBE Vector Stroke Width").setValue(4);
  tr(s, "ADBE Position").setValue(center);
  return s;
}

var comp = app.project.items.addComp("${escapedLine1}", W, H, 1, DUR, FPS);

// 1. Solid dark background
comp.layers.addSolid(C_BG, "Background", W, H, 1);

// 2. Camera Zoom Rig Null (centered on CARD)
var rig = comp.layers.addNull();
rig.name = "Zoom Rig";
tr(rig, "ADBE Position").setValue(CARD);

function attach(l) { l.parent = rig; }

// 3. Footage Imports
${footageImports}

// 4. Beat Layers (Shadows, Card States, Blur, Spotlight Cutouts, Ripples)
${beatLayersJs}

// 5. Camera Zoom & Pan Keyframes across Rig
keys(tr(rig, "ADBE Position"), [
  ${rigPosKeys}
]);
keys(tr(rig, "ADBE Scale"), [
  ${rigScaleKeys}
]);
keys(tr(rig, "ADBE Opacity"), [[0, 0], [0.5, 100]]);

// 6. Left-Side Typography Hierarchy
var WORD_GAP = 11;
var PILL_PAD_X = 10;

function animateEntrance(item, t0, deltaY) {
  var dY = deltaY || 16;
  var pos = tr(item, "ADBE Position").value;
  keys(tr(item, "ADBE Position"), [[t0, [pos[0], pos[1] + dY]], [t0 + 0.38, pos]]);
  keys(tr(item, "ADBE Opacity"), [[t0, 0], [t0 + 0.32, 100]]);
}

function addSegment(comp, str, font, size, color, curX, curY, isAccent, t0) {
  var t = text(comp, str, size, color, [curX, curY], font, 0, 0, ParagraphJustification.LEFT_JUSTIFY);
  var r = t.sourceRectAtTime(0, false);
  if (isAccent) {
    var pillW = r.width + PILL_PAD_X * 2;
    var pillH = 36;
    var s = comp.layers.addShape();
    s.name = "Accent Pill";
    s.moveAfter(t);
    var g = s.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    var c = g.property("ADBE Vectors Group");
    var rect = c.addProperty("ADBE Vector Shape - Rect");
    rect.property("ADBE Vector Rect Size").setValue([pillW, pillH]);
    rect.property("ADBE Vector Rect Roundness").setValue(0);
    var fill = c.addProperty("ADBE Vector Graphic - Fill");
    fill.property("ADBE Vector Fill Color").setValue([0.15, 0.22, 0.24]);
    var stroke = c.addProperty("ADBE Vector Graphic - Stroke");
    stroke.property("ADBE Vector Stroke Color").setValue(color);
    stroke.property("ADBE Vector Stroke Width").setValue(1);
    var pillPos = [curX + r.width / 2, curY - 9];
    tr(s, "ADBE Position").setValue(pillPos);
    animateEntrance(s, t0, 16);
  }
  animateEntrance(t, t0, 16);
  return r.width;
}

var tag = roundedRect(comp, "Tag", [${pillW}, ${pillH}], [${pillCenterX}, ${pillCenterY}], C_OLIVE, 0);
var tagText = text(comp, "${escapedTag}", 20, C_TAG_TEXT, [${pillCenterX}, ${pillCenterY + 7}], "CourierNewPS-BoldMT", 0, 0, ParagraphJustification.CENTER_JUSTIFY);
var titleLine1 = text(comp, "${escapedLine1}", 60, C_WHITE, [140, 445], "AvenirNext-Bold", 0, -10, ParagraphJustification.LEFT_JUSTIFY);
var titleLine2 = text(comp, "${escapedLine2}", 60, C_CYAN, [140, 520], "AvenirNext-Bold", 0, -10, ParagraphJustification.LEFT_JUSTIFY);

animateEntrance(tag, 0.15, 16);
animateEntrance(tagText, 0.15, 16);
animateEntrance(titleLine1, 0.28, 20);
animateEntrance(titleLine2, 0.38, 20);

// Line 1 Subcopy
var line1X = 140, line1Y = 595;
${line1Calls}

// Line 2 Subcopy with Styled Kinetic Segments
var line2X = 140, line2Y = 642;
${line2Calls}

app.project.save(new File(DIR + "composition.ecproj"));
writeLn("saved: " + DIR + "composition.ecproj");
`;
}

export type CompileAndRenderProps = {
  manifest: StoryCaptureManifest;
  workDir: string;
  outWebm: string;
  outPoster: string;
  outSpotlight: string;
  effectcraftCli: string;
  fps: number;
};

export async function compileAndRender({
  manifest,
  workDir,
  outWebm,
  outPoster,
  outSpotlight,
  effectcraftCli,
  fps,
}: CompileAndRenderProps): Promise<void> {
  const scriptPath = resolve(workDir, 'composition.jsx');
  const ecprojPath = resolve(workDir, 'composition.ecproj');

  const jsxCode = generateExtendScript({
    manifest,
    fps,
  });

  await writeFile(scriptPath, jsxCode, 'utf8');
  console.log(`[compile-effectcraft] Generated ExtendScript: ${scriptPath}`);

  console.log(`[compile-effectcraft] Executing script with ${effectcraftCli}...`);
  const { stdout: scriptOut } = await execFileAsync(effectcraftCli, [
    'script',
    scriptPath,
  ]);
  console.log(scriptOut.trim());

  console.log(`[compile-effectcraft] Rendering ${fps} FPS WebM to: ${outWebm}...`);
  const { stdout: renderOut, stderr: renderErr } = await execFileAsync(
    effectcraftCli,
    [
      'render',
      '--project',
      ecprojPath,
      '--out',
      outWebm,
      '--format',
      'webm',
      '--audio',
      'off',
      '--fps',
      String(fps),
      '--resolution',
      'full',
    ],
  );
  if (renderOut.trim()) console.log(renderOut.trim());
  if (renderErr.trim()) console.log(renderErr.trim());

  const N = manifest.beats.length;
  const dur = Number((1.2 + N * 2.8 + 2.0).toFixed(2));
  const posterTime = Number((dur - 1.2).toFixed(2));

  console.log(`[compile-effectcraft] Rendering poster at ${posterTime}s to: ${outPoster}...`);
  const { stdout: posterOut } = await execFileAsync(effectcraftCli, [
    'render-frame',
    '--project',
    ecprojPath,
    '--time',
    String(posterTime),
    '--max-side',
    '1280',
    '--out',
    outPoster,
  ]);
  if (posterOut.trim()) console.log(posterOut.trim());

  console.log(`[compile-effectcraft] Rendering spotlight frame at 1.8s to: ${outSpotlight}...`);
  const { stdout: spotOut } = await execFileAsync(effectcraftCli, [
    'render-frame',
    '--project',
    ecprojPath,
    '--time',
    '1.8',
    '--max-side',
    '1280',
    '--out',
    outSpotlight,
  ]);
  if (spotOut.trim()) console.log(spotOut.trim());

  console.log('[compile-effectcraft] Inspecting generated project:');
  const { stdout: infoOut } = await execFileAsync(effectcraftCli, [
    'info',
    '--project',
    ecprojPath,
  ]);
  console.log(infoOut.trim());
  console.log('[compile-effectcraft] Completed successfully!');
}

if (import.meta.main) {
  const defaultCli =
    process.env.EFFECTCRAFT_CLI?.trim() ||
    '/Users/baris/Downloads/effectcraft-cli-0.11.1-macos-universal/effectcraft-cli';

  const { values } = parseArgs({
    options: {
      manifest: { type: 'string', default: 'scratch/story-media/todo-filter-champions/manifest.json' },
      cli: { type: 'string', default: defaultCli },
      fps: { type: 'string', default: '60' },
      out: { type: 'string' },
      poster: { type: 'string' },
      spotlight: { type: 'string' },
    },
  });

  const manifestPath = resolve(values.manifest ?? 'manifest.json');
  const workDir = dirname(manifestPath);
  const cli = values.cli ?? defaultCli;
  const fps = Number(values.fps ?? '60');

  const content = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(content) as StoryCaptureManifest;

  const outWebm = values.out ? resolve(values.out) : resolve(workDir, `${manifest.storyId}.webm`);
  const outPoster = values.poster ? resolve(values.poster) : resolve(workDir, 'poster.png');
  const outSpotlight = values.spotlight ? resolve(values.spotlight) : resolve(workDir, 'spotlight.png');

  void compileAndRender({
    manifest,
    workDir,
    outWebm,
    outPoster,
    outSpotlight,
    effectcraftCli: cli,
    fps,
  }).catch((err: unknown) => {
    console.error('[compile-effectcraft] Failed:', err);
    process.exit(1);
  });
}
