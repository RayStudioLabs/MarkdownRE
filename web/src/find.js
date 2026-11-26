import {indexPreview, visibleOffsets} from './find-preview.js';

const byId = id => document.getElementById(id);

function matchesIn(text, pattern, offset = 0) {
  return Array.from(text.matchAll(pattern), match => ({
    start:offset + match.index, end:offset + match.index + match[0].length, match
  }));
}

function replacement(template, match) {
  // Standard replacement tokens for the whole match and numbered/named groups.
  return template.replace(/\$(\$|&|\d{1,2}|<[^>]+>)/g, (token, group) => {
    if (group === '$') return '$';
    if (group === '&') return match[0];
    if (group[0] === '<') return match.groups ? match.groups[group.slice(1, -1)] ?? '' : token;
    if (+group > 0 && +group < match.length) return match[+group] ?? '';
    if (group.length === 2 && +group[0] > 0 && +group[0] < match.length) return (match[+group[0]] ?? '') + group[1];
    return token;
  });
}

export function setupFind({getEditor, getLayout, translate}) {
  const panel = byId('find-panel'), preview = byId('preview'), query = byId('find-query');
  const toggle = byId('toggle-replace'), row = byId('replace-row'), field = byId('replace-value');
  const openButton = byId('open-find'), count = byId('find-count');
  const prev = byId('find-prev'), next = byId('find-next');
  const one = byId('replace-one'), all = byId('replace-all');
  const caseButton = byId('find-case'), regexButton = byId('find-regex');
  const pressed = button => button.getAttribute('aria-pressed') === 'true';
  const canEdit = () => getLayout() !== 'preview' && !!getEditor();
  let hits = [], current = 0, invalid = false;
  let spans = [], domIndex, previewCurrent = false;
  let decoration, fallbackRange, pinnedTop;
  const active = () => hits[current];

  function clearHighlight() {
    window.CSS?.highlights?.delete('markdownre-find');
    if (fallbackRange) {
      const selection = window.getSelection();
      if (selection.rangeCount && selection.getRangeAt(0) === fallbackRange) selection.removeAllRanges();
      fallbackRange = null;
    }
  }

  function displayCount() {
    count.textContent = invalid ? translate('invalidRegex') : query.value ? `${hits.length ? current + 1 : 0} / ${hits.length}` : '';
    count.classList.toggle('invalid', invalid);
    query.setAttribute('aria-invalid', String(invalid));
    prev.disabled = next.disabled = !hits.length;
    one.disabled = all.disabled = !hits.length || !canEdit() || row.hidden;
  }

  function previewMatch(scroll) {
    clearHighlight();
    const hit = active();
    if (!hit || getLayout() === 'editor' || !previewCurrent) return;
    domIndex ||= indexPreview(preview);
    const offsets = getLayout() === 'preview' ? [hit.start, hit.end] : visibleOffsets(spans, hit.start, hit.end);
    const range = offsets && domIndex.range(...offsets);
    let rect;
    if (range) {
      if (window.CSS?.highlights && window.Highlight) {
        CSS.highlights.set('markdownre-find', new Highlight(range));
      } else {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        fallbackRange = range;
      }
      if (scroll) {
        const pre = range.startContainer.parentElement.closest('pre');
        if (pre && pre.scrollWidth > pre.clientWidth) {
          pre.scrollLeft += range.getBoundingClientRect().left - pre.getBoundingClientRect().left - pre.clientWidth / 2;
        }
        rect = range.getBoundingClientRect();
      }
    } else if (scroll && canEdit()) {
      // Markdown syntax, URLs and other source-only hits belong to their block.
      const line = getEditor().getModel().getPositionAt(hit.start).lineNumber;
      let target;
      for (const element of preview.querySelectorAll('[data-source-line]')) {
        if (Number(element.dataset.sourceLine) > line) break;
        target = element;
      }
      rect = target?.getBoundingClientRect();
    }
    if (rect) preview.scrollTop += rect.top - preview.getBoundingClientRect().top - (preview.clientHeight - Math.min(rect.height, 24)) / 2;
  }

  function modelRange(hit) {
    const model = getEditor().getModel();
    const from = model.getPositionAt(hit.start), to = model.getPositionAt(hit.end);
    return {startLineNumber:from.lineNumber, startColumn:from.column, endLineNumber:to.lineNumber, endColumn:to.column};
  }

  function show(scroll) {
    displayCount();
    decoration?.clear();
    pinnedTop = undefined;
    if (canEdit() && active()) {
      const editor = getEditor(), range = modelRange(active());
      decoration ||= editor.createDecorationsCollection();
      decoration.set([{range, options:{className:'find-current'}}]);
      if (scroll) {
        editor.setSelection(range);
        editor.revealRangeInCenter(range, 1); // Monaco ScrollType.Immediate
        pinnedTop = editor.getScrollTop();
      }
    }
    previewMatch(scroll);
  }

  function refresh({anchor = active()?.start ?? 0, scroll = false} = {}) {
    if (panel.hidden) return;
    hits = [];
    invalid = false;
    if (query.value) {
      const source = pressed(regexButton) ? query.value : query.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let pattern;
      try { pattern = new RegExp(source, pressed(caseButton) ? 'gmu' : 'gimu'); }
      catch { invalid = true; }
      if (pattern && canEdit()) {
        hits = matchesIn(getEditor().getModel().getValue(), pattern);
      } else if (pattern && getLayout() === 'preview' && previewCurrent) {
        domIndex ||= indexPreview(preview);
        hits = domIndex.groups.filter(group => group.block !== preview || group.text.trim())
          .flatMap(group => matchesIn(group.text, pattern, group.start));
      }
    }
    current = Math.max(0, hits.findIndex(hit => hit.start >= anchor));
    show(scroll);
  }

  function move(direction) {
    if (!hits.length) return;
    current = (current + direction + hits.length) % hits.length;
    show(true);
  }
  function setExpanded(expanded) {
    row.hidden = !expanded || !canEdit();
    toggle.setAttribute('aria-expanded', String(!row.hidden));
    displayCount();
  }
  function layoutChanged() {
    toggle.hidden = getLayout() === 'preview';
    toggle.disabled = !canEdit();
    if (toggle.hidden) {
      if (row.contains(document.activeElement) || document.activeElement === toggle) query.focus();
      setExpanded(false);
    }
    refresh({scroll:true});
  }
  function open() {
    openButton.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    layoutChanged();
    query.focus();
    query.select();
  }
  function close(restoreFocus = true) {
    panel.hidden = true;
    openButton.setAttribute('aria-expanded', 'false');
    clearHighlight();
    decoration?.clear();
    pinnedTop = undefined;
    hits = [];
    domIndex = null;
    if (restoreFocus) {
      if (canEdit()) getEditor().focus(); else preview.focus({preventScroll:true});
    }
  }

  function replace(replaceAll) {
    if (!canEdit() || panel.hidden || row.hidden || !active()) return;
    const editor = getEditor();
    const edits = (replaceAll ? hits : [active()]).map(hit => ({
      range:modelRange(hit),
      text:pressed(regexButton) ? replacement(field.value, hit.match) : field.value,
      forceMoveMarkers:true
    }));
    const anchor = active().start + edits[0].text.length + (active().start === active().end ? 1 : 0);
    editor.pushUndoStop();
    editor.executeEdits('find-replace', edits);
    editor.pushUndoStop();
    refresh({anchor:replaceAll ? 0 : anchor, scroll:true});
  }

  openButton.onclick = open;
  byId('find-close').onclick = () => close();
  toggle.onclick = () => { setExpanded(row.hidden); (row.hidden ? query : field).focus(); };
  query.oninput = () => refresh({anchor:0, scroll:true});
  for (const button of [caseButton, regexButton]) button.onclick = () => {
    button.setAttribute('aria-pressed', String(!pressed(button)));
    refresh({anchor:0, scroll:true});
    query.focus();
  };
  prev.onclick = () => move(-1);
  next.onclick = () => move(1);
  one.onclick = () => replace(false);
  all.onclick = () => replace(true);
  document.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault(); event.stopPropagation(); open();
    } else if (!panel.hidden && event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close();
    } else if (event.key === 'Enter' && (event.target === query || event.target === field)) {
      event.preventDefault();
      if (event.target === field && !event.shiftKey) replace(false); else move(event.shiftKey ? -1 : 1);
    }
  }, true);

  return {
    open, close, layoutChanged, displayCount,
    contentChanged() { previewCurrent = false; refresh(); },
    rendered(newSpans) {
      spans = newSpans;
      domIndex = null;
      previewCurrent = true;
      if (panel.hidden) return;
      if (getLayout() === 'preview') refresh({scroll:true});
      else previewMatch(pinnedTop !== undefined);
    },
    ownsPreviewScroll() {
      return pinnedTop !== undefined && getEditor()?.getScrollTop() === pinnedTop;
    },
    editorScrolled() {
      if (getEditor()?.getScrollTop() !== pinnedTop) pinnedTop = undefined;
    }
  };
}
