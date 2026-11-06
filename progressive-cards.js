/* Shared presentation state. Workflow completion remains owned by each caller. */
(function (scope) {
  'use strict';
  let sequence = 0;
  function create(options) {
    const { root, toggle, content, summary, focusTarget, onChange } = options;
    if (!root || !toggle || !content) throw new TypeError('A progressive card needs a root, toggle and content.');
    if (!content.id) content.id = 'progressive-card-content-' + (++sequence);
    root.dataset.progressiveCard ||= content.id;
    toggle.setAttribute('aria-controls', content.id);
    let state = { key: undefined, status: 'idle', complete: false, expanded: options.initialExpanded !== false };
    let canCollapse = false, animation = null;
    const getState = () => ({ ...state, presentation: state.expanded ? 'expanded' : 'collapsed' });
    function render(animate) {
      animation?.cancel(); animation = null;
      content.hidden = !state.expanded;
      if (summary) summary.hidden = !state.complete || state.expanded;
      toggle.setAttribute('aria-expanded', String(state.expanded));
      root.dataset.progressiveStatus = state.status;
      root.dataset.progressiveExpanded = String(state.expanded);
      root.dataset.progressiveComplete = String(state.complete);
      const revealed = state.expanded ? content : summary;
      if (animate && revealed && !revealed.hidden && revealed.animate && !scope.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        animation = revealed.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      }
    }
    function setExpanded(expanded, settings = {}) {
      const next = Boolean(expanded) || !canCollapse;
      const changed = next !== state.expanded;
      // Move focus before hiding its containing subtree; never scroll the page.
      if (!next && (content.contains(document.activeElement) || (settings.focusPending && document.activeElement === document.body))) {
        const target = focusTarget?.() || toggle;
        target?.focus({ preventScroll: true });
      }
      state.expanded = next;
      render(changed && settings.animate !== false);
      if (changed) onChange?.({ ...getState(), reason: settings.reason || 'manual' });
      return getState();
    }
    function update(next) {
      const previous = state;
      const keyChanged = next.key !== previous.key;
      state = { ...state, key: next.key, status: next.status || 'idle', complete: next.complete === true };
      canCollapse = state.complete && next.canCollapse !== false && !['loading', 'error'].includes(state.status);
      let expanded = state.expanded;
      if (!canCollapse) expanded = true;
      else if (keyChanged || !previous.complete) expanded = next.defaultExpanded ?? false;
      return setExpanded(expanded, { reason: 'workflow' });
    }
    function toggleCard() { setExpanded(!state.expanded); }
    if (options.listen !== false) toggle.addEventListener('click', toggleCard);
    render(false);
    return { update, setExpanded, getState, destroy() { animation?.cancel(); toggle.removeEventListener('click', toggleCard); } };
  }
  function createDisclosureMemory() {
    const contexts = new Map();
    function entries(root, keyFor) {
      return [...root.querySelectorAll('details')].map((element, index) => [keyFor ? keyFor(element, index) : element.id || String(index), element]);
    }
    return {
      capture(root, contextKey, keyFor) {
        if (contextKey == null) return;
        contexts.set(contextKey, new Map(entries(root, keyFor).map(([key, element]) => [key, element.open])));
      },
      restore(root, contextKey, keyFor) {
        const choices = contexts.get(contextKey);
        if (!choices) return;
        for (const [key, element] of entries(root, keyFor)) if (choices.has(key)) element.open = choices.get(key);
      }
    };
  }
  scope.FirstPrincipleProgressiveCards = Object.freeze({ create, createDisclosureMemory });
})(window);
