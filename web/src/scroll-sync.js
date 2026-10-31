// Interpolate between source and preview block positions. Explicit endpoints
// keep the start and end aligned even when the panes have different heights.
export function mapScrollPosition(position, sourceMax, previewMax, anchors) {
  if (sourceMax <= 0 || previewMax <= 0) return 0;
  const points = [{source: 0, preview: 0}];
  for (const anchor of anchors) {
    const source = Math.max(0, Math.min(sourceMax, anchor.source));
    const preview = Math.max(0, Math.min(previewMax, anchor.preview));
    const previous = points[points.length - 1];
    if (source > previous.source && source < sourceMax && preview >= previous.preview) {
      points.push({source, preview});
    }
  }
  points.push({source: sourceMax, preview: previewMax});
  const x = Math.max(0, Math.min(sourceMax, position));
  for (let i = 1; i < points.length; i++) {
    const right = points[i];
    if (x <= right.source) {
      const left = points[i - 1];
      const fraction = (x - left.source) / (right.source - left.source);
      return left.preview + fraction * (right.preview - left.preview);
    }
  }
  return previewMax;
}

export function syncPreviewScroll(editor, preview) {
  const model = editor.getModel();
  if (!model || preview.clientHeight === 0) return;
  const sourceMax = Math.max(0, editor.getScrollHeight() - editor.getLayoutInfo().height);
  const previewMax = Math.max(0, preview.scrollHeight - preview.clientHeight);
  if (sourceMax === 0) return;
  const previewTop = preview.getBoundingClientRect().top;
  const anchors = Array.from(preview.querySelectorAll('[data-source-line]'), element => {
    const line = Math.min(model.getLineCount(), Number(element.dataset.sourceLine));
    return {
      source: line > 0 ? editor.getTopForLineNumber(line) : 0,
      preview: element.getBoundingClientRect().top - previewTop + preview.scrollTop,
    };
  });
  preview.scrollTop = mapScrollPosition(editor.getScrollTop(), sourceMax, previewMax, anchors);
}
