/* =========================================================================
   PAP-JOY AI client
   Talks to /api/v1/ai/* on the backend. The provider key never leaves the
   server. Every entry point checks /ai/status first, so when the store has no
   key configured nothing is shown to the customer.
   ========================================================================= */
(function () {
  'use strict';

  var CHAT_PAGES = ['home', 'shop', 'product-detail', 'cart', 'account', 'tracking'];
  var SUGGESTIONS = [
    'Shoes for a wedding under 2000',
    'Comfortable flats for daily wear',
    'Black heels for office'
  ];

  var statusPromise = null;
  var chatState = { messages: [], busy: false, open: false, started: false };
  var ui = null;

  // ---------------------------------------------------------------- client

  function getStatus() {
    if (!statusPromise) {
      statusPromise = fetch(apiUrl('/api/v1/ai/status'), { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) return { enabled: false };
          return res.json();
        })
        .catch(function () {
          return { enabled: false };
        });
    }
    return statusPromise;
  }

  function post(path, payload) {
    return fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var err = new Error((data && data.error) || 'The AI request failed.');
          err.status = res.status;
          err.code = (data && data.code) || 'ai_failed';
          throw err;
        }
        return data || {};
      });
    });
  }

  // ------------------------------------------------------------------ utils

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatINR(value) {
    var n = Number(value) || 0;
    try {
      return '₹' + n.toLocaleString('en-IN');
    } catch (e) {
      return '₹' + n;
    }
  }

  function toast(message) {
    if (typeof showToast === 'function') {
      showToast(message);
      return;
    }
    if (typeof window.showToast === 'function') {
      window.showToast(message);
    }
  }

  function productHref(product) {
    if (product.slug) return 'product-detail.html?slug=' + encodeURIComponent(product.slug);
    return 'product-detail.html?id=' + encodeURIComponent(product.id);
  }

  // ------------------------------------------------------------------- chat

  function buildChat() {
    var fab = el('button', 'pj-ai-fab');
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Open the PAP-JOY shopping assistant');
    fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML = '<i class="fas fa-robot" aria-hidden="true"></i><span>Ask AI</span>';

    var panel = el('section', 'pj-ai-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'PAP-JOY shopping assistant');

    var header = el('div', 'pj-ai-header');
    var icon = el('span', 'pj-ai-header-icon');
    icon.innerHTML = '<i class="fas fa-robot" aria-hidden="true"></i>';
    var headerText = el('div', 'pj-ai-header-text');
    headerText.appendChild(el('strong', null, 'PAP-JOY Assistant'));
    headerText.appendChild(el('span', null, 'Ask me to find the right pair'));
    var close = el('button', 'pj-ai-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close assistant');
    close.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
    header.appendChild(icon);
    header.appendChild(headerText);
    header.appendChild(close);

    var messages = el('div', 'pj-ai-messages');
    messages.setAttribute('aria-live', 'polite');
    messages.setAttribute('aria-relevant', 'additions');

    var suggestions = el('div', 'pj-ai-suggestions');

    var composer = el('form', 'pj-ai-composer');
    var input = el('textarea');
    input.rows = 1;
    input.maxLength = 600;
    input.placeholder = 'e.g. black heels for a wedding under 2000';
    input.setAttribute('aria-label', 'Your message');
    var send = el('button', 'pj-ai-send');
    send.type = 'submit';
    send.setAttribute('aria-label', 'Send message');
    send.innerHTML = '<i class="fas fa-paper-plane" aria-hidden="true"></i>';
    composer.appendChild(input);
    composer.appendChild(send);

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(suggestions);
    panel.appendChild(composer);

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    ui = {
      fab: fab,
      panel: panel,
      messages: messages,
      suggestions: suggestions,
      input: input,
      send: send
    };

    fab.addEventListener('click', function () {
      setOpen(!chatState.open);
    });
    close.addEventListener('click', function () {
      setOpen(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && chatState.open) setOpen(false);
    });

    composer.addEventListener('submit', function (event) {
      event.preventDefault();
      submitInput();
    });

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitInput();
      }
    });

    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 110) + 'px';
    });

    SUGGESTIONS.forEach(function (text) {
      var chip = el('button', 'pj-ai-chip', text);
      chip.type = 'button';
      chip.addEventListener('click', function () {
        if (chatState.busy) return;
        handleUserMessage(text);
      });
      suggestions.appendChild(chip);
    });

    fab.classList.add('is-ready');
  }

  function setOpen(open) {
    if (!ui) return;
    chatState.open = open;
    ui.panel.classList.toggle('is-open', open);
    ui.fab.setAttribute('aria-expanded', String(open));
    ui.fab.style.display = open ? 'none' : '';
    if (open) {
      if (!chatState.started) {
        chatState.started = true;
        appendBot('Hi! Tell me what you are looking for — occasion, colour, size or budget — and I will find matching pairs from our store.');
      }
      setTimeout(function () { ui.input.focus(); }, 60);
    } else {
      ui.fab.focus();
    }
  }

  function scrollToEnd() {
    if (!ui) return;
    ui.messages.scrollTop = ui.messages.scrollHeight;
  }

  function appendBubble(kind, text) {
    var bubble = el('div', 'pj-ai-msg ' + (kind === 'user' ? 'is-user' : kind === 'error' ? 'is-error' : 'is-bot'), text);
    ui.messages.appendChild(bubble);
    scrollToEnd();
    return bubble;
  }

  function appendBot(text) {
    return appendBubble('bot', text);
  }

  function appendTyping() {
    var wrap = el('div', 'pj-ai-typing');
    wrap.appendChild(el('span'));
    wrap.appendChild(el('span'));
    wrap.appendChild(el('span'));
    wrap.setAttribute('aria-label', 'Assistant is typing');
    ui.messages.appendChild(wrap);
    scrollToEnd();
    return wrap;
  }

  function appendProducts(products, into) {
    if (!products || !products.length) return;
    var list = el('div', 'pj-ai-products');
    products.forEach(function (product) {
      var card = el('a', 'pj-ai-product');
      card.href = productHref(product);
      var body = el('span', 'pj-ai-product-body');
      body.appendChild(el('span', 'pj-ai-product-name', product.name));
      var meta = [product.category, product.brand].filter(Boolean).join(' · ');
      if (meta) body.appendChild(el('span', 'pj-ai-product-meta', meta));
      card.appendChild(body);
      card.appendChild(el('span', 'pj-ai-product-price', formatINR(product.price)));
      list.appendChild(card);
    });
    into.appendChild(list);
    scrollToEnd();
  }

  function submitInput() {
    if (!ui || chatState.busy) return;
    var text = ui.input.value.trim();
    if (text.length < 2) {
      ui.input.focus();
      return;
    }
    ui.input.value = '';
    ui.input.style.height = 'auto';
    handleUserMessage(text);
  }

  function handleUserMessage(text) {
    chatState.busy = true;
    ui.send.disabled = true;
    if (ui.suggestions && ui.suggestions.parentNode) {
      ui.suggestions.innerHTML = '';
    }

    appendBubble('user', text);
    chatState.messages.push({ role: 'user', content: text });
    chatState.messages = chatState.messages.slice(-10);

    var typing = appendTyping();

    post('/api/v1/ai/chat', { messages: chatState.messages })
      .then(function (data) {
        typing.remove();
        var reply = (data && data.reply) || 'Sorry, I could not answer that.';
        var bubble = appendBot(reply);
        if (data && data.products && data.products.length) {
          appendProducts(data.products, bubble);
        }
        chatState.messages.push({ role: 'assistant', content: reply });
        chatState.messages = chatState.messages.slice(-10);
      })
      .catch(function (err) {
        typing.remove();
        var message = err && err.message ? err.message : 'The assistant is unavailable right now.';
        appendBubble('error', message);
      })
      .then(function () {
        chatState.busy = false;
        ui.send.disabled = false;
        ui.input.focus();
      });
  }

  // -------------------------------------------------------------- AI search

  function initSearch() {
    var input = document.getElementById('search-products');
    if (!input) return;
    var wrapper = input.closest('.search-autocomplete-wrapper') || input.parentElement;
    if (!wrapper || wrapper.querySelector('.pj-ai-search-btn')) return;

    var button = el('button', 'pj-ai-search-btn');
    button.type = 'button';
    button.setAttribute('aria-label', 'Search with AI');
    button.innerHTML = '<i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i><span>Ask AI</span>';

    wrapper.insertAdjacentElement('afterend', button);

    button.addEventListener('click', function () {
      var query = input.value.trim();
      if (query.length < 3) {
        toast('Describe what you want, for example "black heels under 2000".');
        input.focus();
        return;
      }
      runAiSearch(query, button);
    });
  }

  function runAiSearch(query, button) {
    var original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>Thinking</span>';

    post('/api/v1/ai/search', { query: query })
      .then(function (data) {
        applySearchFilters(data && data.filters, data && data.explanation);
      })
      .catch(function (err) {
        toast((err && err.message) || 'AI search is unavailable right now.');
      })
      .then(function () {
        button.disabled = false;
        button.innerHTML = original;
      });
  }

  function applySearchFilters(filters, explanation) {
    if (!filters || typeof shopState === 'undefined') return;

    shopState.q = filters.keywords || '';
    shopState.category = filters.category || '';
    shopState.priceMin = filters.minPrice === null || filters.minPrice === undefined ? null : Number(filters.minPrice);
    shopState.priceMax = filters.maxPrice === null || filters.maxPrice === undefined ? null : Number(filters.maxPrice);
    shopState.inStock = !!filters.inStock;
    shopState.sort = filters.sort || 'newest';
    shopState.page = 1;
    shopState.unknownCategory = '';

    var searchInput = document.getElementById('search-products');
    if (searchInput) searchInput.value = shopState.q;

    var minInput = document.getElementById('price-min');
    if (minInput) minInput.value = shopState.priceMin === null ? '' : shopState.priceMin;

    var maxInput = document.getElementById('price-max');
    if (maxInput) maxInput.value = shopState.priceMax === null ? '' : shopState.priceMax;

    var stockToggle = document.getElementById('in-stock-filter');
    if (stockToggle) stockToggle.checked = shopState.inStock;

    var sortFilter = document.getElementById('sort-filter');
    if (sortFilter) sortFilter.value = shopState.sort;

    if (typeof applyShopFilters === 'function') applyShopFilters();

    if (explanation) toast(explanation);
  }

  // ------------------------------------------------------------------- boot

  function boot() {
    getStatus().then(function (status) {
      if (!status || !status.enabled) return;
      var page = (document.body && document.body.dataset && document.body.dataset.page) || '';

      if (CHAT_PAGES.indexOf(page) !== -1) {
        buildChat();
      }
      if (page === 'shop') {
        initSearch();
      }
    }).catch(function () { /* never block the page */ });
  }

  window.papjoyAI = {
    status: getStatus,
    chat: function (messages) { return post('/api/v1/ai/chat', { messages: messages }); },
    search: function (query) { return post('/api/v1/ai/search', { query: query }); },
    describe: function (payload) { return post('/api/v1/ai/describe', payload); },
    generateProduct: function (prompt) { return post('/api/v1/ai/generate-product', { prompt: prompt }); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
