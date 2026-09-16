(function () {
  'use strict';

  var FRACTIONS = [
    [0, ''], [0.125, '⅛'], [0.25, '¼'], [0.333, '⅓'], [0.375, '⅜'],
    [0.5, '½'], [0.625, '⅝'], [0.667, '⅔'], [0.75, '¾'], [0.875, '⅞'], [1, '']
  ];

  function formatAmount(value) {
    if (!isFinite(value) || value <= 0) return '';
    if (value < 0.0625) return String(Math.round(value * 1000) / 1000);
    var whole = Math.floor(value);
    var frac = value - whole;
    var best = null;
    for (var i = 0; i < FRACTIONS.length; i++) {
      var diff = Math.abs(FRACTIONS[i][0] - frac);
      if (best === null || diff < best.diff) best = { diff: diff, value: FRACTIONS[i][0], glyph: FRACTIONS[i][1] };
    }
    if (best.diff > 0.04) {
      var rounded = Math.round(value * 100) / 100;
      return String(rounded);
    }
    if (best.value === 1) whole += 1;
    var glyph = best.value === 1 ? '' : best.glyph;
    if (whole === 0) return glyph || '0';
    return glyph ? whole + ' ' + glyph : String(whole);
  }

  function initStepper() {
    var stepper = document.querySelector('[data-stepper]');
    if (!stepper) return;
    var output = stepper.querySelector('[data-servings-output]');
    var decBtn = stepper.querySelector('[data-servings-step="-1"]');
    var incBtn = stepper.querySelector('[data-servings-step="1"]');
    var amounts = document.querySelectorAll('[data-base-amount]');
    var base = parseFloat(stepper.getAttribute('data-base-servings')) || 1;
    var noun = stepper.getAttribute('data-servings-noun') || 'servings';
    var min = 1;
    var max = base * 4;
    var current = base;

    function render() {
      output.textContent = current + ' ' + (current === 1 ? noun.replace(/s$/, '') : noun);
      for (var i = 0; i < amounts.length; i++) {
        var el = amounts[i];
        var baseAmount = parseFloat(el.getAttribute('data-base-amount'));
        el.textContent = formatAmount(baseAmount * current / base);
      }
      decBtn.disabled = current <= min;
      incBtn.disabled = current >= max;
    }

    stepper.addEventListener('click', function (event) {
      var button = event.target.closest('[data-servings-step]');
      if (!button || button.disabled) return;
      var next = current + parseInt(button.getAttribute('data-servings-step'), 10);
      current = Math.min(max, Math.max(min, next));
      render();
    });

    render();
  }

  function initFilters() {
    var root = document.querySelector('[data-filters]');
    if (!root) return;
    var search = root.querySelector('[data-filter-search]');
    var chips = root.querySelectorAll('[data-filter-value]');
    var cards = document.querySelectorAll('[data-recipe-card]');
    var count = document.querySelector('[data-result-count]');
    var empty = document.querySelector('[data-empty-state]');
    var state = { category: 'all', difficulty: 'all', q: '' };

    function apply() {
      var shown = 0;
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var haystack = card.getAttribute('data-search') || '';
        var matches =
          (state.category === 'all' || card.getAttribute('data-category') === state.category) &&
          (state.difficulty === 'all' || card.getAttribute('data-difficulty') === state.difficulty) &&
          (state.q === '' || haystack.indexOf(state.q) !== -1);
        card.hidden = !matches;
        if (matches) shown++;
      }
      if (count) count.textContent = shown + (shown === 1 ? ' recipe' : ' recipes') + ' shown';
      if (empty) empty.hidden = shown !== 0;
    }

    if (search) {
      search.addEventListener('input', function () {
        state.q = search.value.trim().toLowerCase();
        apply();
      });
    }

    root.addEventListener('click', function (event) {
      var chip = event.target.closest('[data-filter-value]');
      if (!chip) return;
      var group = chip.getAttribute('data-filter-group');
      state[group] = chip.getAttribute('data-filter-value');
      for (var i = 0; i < chips.length; i++) {
        if (chips[i].getAttribute('data-filter-group') === group) {
          chips[i].setAttribute('aria-pressed', String(chips[i] === chip));
        }
      }
      apply();
    });

    apply();
  }

  function initNav() {
    var header = document.querySelector('[data-header]');
    if (!header) return;
    var toggle = header.querySelector('[data-nav-toggle]');
    var nav = header.querySelector('[data-nav]');
    if (!toggle || !nav) return;

    header.setAttribute('data-js', 'on');
    toggle.hidden = false;

    function setOpen(open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('[data-nav-toggle-label]').textContent = open ? 'Close' : 'Menu';
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });

    setOpen(false);
  }

  function init() {
    initNav();
    initStepper();
    initFilters();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
