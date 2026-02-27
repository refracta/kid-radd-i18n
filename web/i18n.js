(function(window, document, $) {
	'use strict';

	if(!$) {
		return;
	}

	var STORAGE_KEY = 'kidradd.language';
	var CONTROL_ID = 'kr-i18n';
	var PANEL_ID = 'kr-i18n-panel';
	var SELECT_ID = 'kr-i18n-select';
	var STYLE_ID = 'kr-i18n-style';
	var TRIGGER_ID = 'kr-i18n-trigger';

	var FALLBACK_CONFIG = {
		default: 'en',
		supported: ['en', 'ko'],
		labels: {
			en: 'English',
			ko: 'Korean'
		}
	};

	var state = {
		initialized: false,
		config: null,
		currentLang: null,
		projectRoot: '',
		bundles: {},
		positionQueued: false
	};

	function init() {
		if(state.initialized) {
			return;
		}
		state.initialized = true;
		state.projectRoot = detectProjectRoot();

		loadLanguagesConfig(function(rawConfig) {
			state.config = normalizeConfig(rawConfig);
			state.currentLang = resolveInitialLanguage(state.config);
			persistLanguage(state.currentLang);
			injectStyle();
			renderControl();
			applyCurrentLanguage();
		});
	}

	function loadLanguagesConfig(done) {
		var url = state.projectRoot + 'i18n/languages.json';
		$.ajax({
			url: url,
			dataType: 'json',
			cache: false
		}).done(function(data) {
			done(data || FALLBACK_CONFIG);
		}).fail(function() {
			done(FALLBACK_CONFIG);
		});
	}

	function normalizeConfig(raw) {
		var source = raw || {};
		var supported = $.isArray(source.supported) ? source.supported.slice(0) : FALLBACK_CONFIG.supported.slice(0);
		if(!supported.length) {
			supported = FALLBACK_CONFIG.supported.slice(0);
		}

		var labels = {};
		var inputLabels = source.labels || {};
		for(var i = 0; i < supported.length; i++) {
			var lang = supported[i];
			labels[lang] = inputLabels[lang] || FALLBACK_CONFIG.labels[lang] || lang;
		}

		var defaultLang = source.default || FALLBACK_CONFIG.default;
		defaultLang = findSupportedLanguage(defaultLang, supported) || supported[0];

		return {
			default: defaultLang,
			supported: supported,
			labels: labels
		};
	}

	function resolveInitialLanguage(config) {
		var stored = safeLocalStorageGet(STORAGE_KEY);
		var matched = findSupportedLanguage(stored, config.supported);
		if(matched) {
			return matched;
		}

		var browserCandidates = getBrowserLanguageCandidates();
		for(var i = 0; i < browserCandidates.length; i++) {
			matched = findSupportedLanguage(browserCandidates[i], config.supported);
			if(matched) {
				return matched;
			}
		}

		return config.default || 'en';
	}

	function getBrowserLanguageCandidates() {
		var out = [];
		var add = function(value) {
			if(!value) {
				return;
			}
			var normalized = normalizeLang(value);
			if(!normalized) {
				return;
			}
			if($.inArray(normalized, out) === -1) {
				out.push(normalized);
			}
		};

		if(navigator.languages && navigator.languages.length) {
			for(var i = 0; i < navigator.languages.length; i++) {
				add(navigator.languages[i]);
			}
		}
		add(navigator.language);
		add(navigator.userLanguage);
		return out;
	}

	function findSupportedLanguage(value, supported) {
		var normalized = normalizeLang(value);
		if(!normalized) {
			return null;
		}

		for(var i = 0; i < supported.length; i++) {
			if(normalizeLang(supported[i]) === normalized) {
				return supported[i];
			}
		}

		var base = normalized.split('-')[0];
		for(i = 0; i < supported.length; i++) {
			if(normalizeLang(supported[i]).split('-')[0] === base) {
				return supported[i];
			}
		}

		return null;
	}

	function normalizeLang(value) {
		if(!value) {
			return '';
		}
		return String(value).toLowerCase().replace(/_/g, '-');
	}

	function renderControl() {
		if(!document.body || $('#' + CONTROL_ID).length) {
			return;
		}
		var menuBg = state.projectRoot + 'assets/menu.gif';

		var html = ''
			+ '<div id="' + CONTROL_ID + '">'
			+ '  <table id="' + TRIGGER_ID + '" border="0" cellpadding="0" cellspacing="0" width="39" height="19">'
			+ '    <tr><td class="kr-i18n-menu" background="' + menuBg + '"><center>'
			+ '      <a href="#" class="kr-i18n-trigger">lang</a>'
			+ '    </center></td></tr>'
			+ '  </table>'
			+ '  <div id="' + PANEL_ID + '" aria-hidden="true">'
			+ '    <label for="' + SELECT_ID + '">Language</label>'
			+ '    <select id="' + SELECT_ID + '"></select>'
			+ '  </div>'
			+ '</div>';

		$(document.documentElement).append(html);

		var $select = $('#' + SELECT_ID);
		for(var i = 0; i < state.config.supported.length; i++) {
			var lang = state.config.supported[i];
			$select.append(
				$('<option></option>').attr('value', lang).text(state.config.labels[lang] || lang)
			);
		}
		$select.val(state.currentLang);

		$(document).on('click', '.kr-i18n-trigger', function(event) {
			event.preventDefault();
			event.stopPropagation();
			openPanel($(this));
		});

		$select.on('change', function() {
			setLanguage($(this).val(), true);
			closePanel();
		});

		$(document).on('click', function() {
			closePanel();
		});

		$('#' + PANEL_ID).on('click', function(event) {
			event.stopPropagation();
		});

		bindFloatingTriggerPosition();
	}

	function bindFloatingTriggerPosition() {
		scheduleTriggerPosition();
		$(window).on('hashchange.krI18n resize.krI18n scroll.krI18n', scheduleTriggerPosition);
		$(document).on('click.krI18n', 'a', function() {
			window.setTimeout(scheduleTriggerPosition, 0);
			window.setTimeout(scheduleTriggerPosition, 120);
		});
	}

	function scheduleTriggerPosition() {
		if(state.positionQueued) {
			return;
		}
		state.positionQueued = true;

		var schedule = window.requestAnimationFrame || function(cb) { return window.setTimeout(cb, 16); };
		schedule(function() {
			state.positionQueued = false;
			positionFloatingTrigger();
		});
	}

	function positionFloatingTrigger() {
		var $trigger = $('#' + TRIGGER_ID);
		if(!$trigger.length) {
			return;
		}

		var anchors = findReferenceMenuAnchors();
		if(!anchors.zoom.length || anchors.hideTrigger) {
			closePanel();
			$trigger.hide();
			return;
		}

		var zoomAnchor = anchors.zoom.closest('table').get(0) || anchors.zoom.get(0);
		if(!zoomAnchor || !zoomAnchor.getBoundingClientRect) {
			$trigger.hide();
			return;
		}

		var zoomRect = zoomAnchor.getBoundingClientRect();
		if(zoomRect.width <= 0 || zoomRect.height <= 0) {
			$trigger.hide();
			return;
		}

		var left = zoomRect.right + 3;
		if(anchors.list.length) {
			var listAnchor = anchors.list.closest('table').get(0) || anchors.list.get(0);
			if(listAnchor && listAnchor.getBoundingClientRect) {
				var listRect = listAnchor.getBoundingClientRect();
				if(listRect.width > 0 && listRect.height > 0 && listRect.left > zoomRect.right) {
					left = (zoomRect.right + listRect.left - 39) / 2;
				}
			}
		}
		var top = zoomRect.top;
		var maxLeft = Math.max(0, (window.innerWidth || document.documentElement.clientWidth || 0) - 41);
		if(left > maxLeft) {
			left = maxLeft;
		}
		if(left < 0) {
			left = 0;
		}

		$trigger.css({
			left: left + 'px',
			top: top + 'px'
		}).show();
	}

	function findReferenceMenuAnchors() {
		var $visiblePanel = $('a.panel.visible').first();
		if($visiblePanel.length) {
			var $visibleZoom = $visiblePanel.find('a').filter(isZoomLink).first();
			if($visibleZoom.length) {
				var $visibleList = $visiblePanel.find('a').filter(isListLink).first();
				return {
					zoom: $visibleZoom,
					list: $visibleList,
					hideTrigger: shouldHideTriggerByMenuRow($visibleZoom)
				};
			}
		}
		var $zoom = $('a').filter(isZoomLink).first();
		return {
			zoom: $zoom,
			list: $('a').filter(isListLink).first(),
			hideTrigger: shouldHideTriggerByMenuRow($zoom)
		};
	}

	function shouldHideTriggerByMenuRow($zoomLink) {
		if(!$zoomLink || !$zoomLink.length) {
			return false;
		}
		var $menuRow = $zoomLink.parents('tr').filter(function() {
			return $(this).children('td').length >= 3;
		}).first();
		if(!$menuRow.length) {
			return false;
		}
		var $cells = $menuRow.children('td');
		var middleText = $.trim(($cells.eq(1).text() || '').replace(/\s+/g, ' '));
		return middleText.length > 0;
	}

	function isZoomLink() {
		var href = (($(this).attr('href') || '') + '').toLowerCase();
		return href.indexOf('javascript:zoom') === 0;
	}

	function isListLink() {
		var href = (($(this).attr('href') || '') + '').toLowerCase();
		return href.indexOf('listp.htm') >= 0;
	}

	function injectStyle() {
		if(document.getElementById(STYLE_ID)) {
			return;
		}

			var css = ''
				+ '#' + TRIGGER_ID + ' {'
			+ ' display: none;'
			+ ' position: fixed;'
			+ ' pointer-events: auto;'
			+ ' z-index: 2147483001;'
			+ '}'
			+ '#' + TRIGGER_ID + ' .kr-i18n-menu {'
			+ ' background-repeat: no-repeat;'
			+ ' background-position: center center;'
			+ '}'
			+ '#' + TRIGGER_ID + ' .kr-i18n-trigger {'
			+ ' display: inline-block;'
			+ ' width: 39px;'
			+ ' height: 19px;'
			+ ' line-height: 19px;'
			+ ' font-family: verdana, arial, sans-serif;'
			+ ' font-size: 11px;'
			+ ' color: #00ffff;'
			+ ' text-decoration: none;'
			+ ' text-transform: lowercase;'
			+ '}'
			+ '#' + CONTROL_ID + ' {'
				+ ' position: fixed;'
				+ ' top: 0;'
				+ ' left: 0;'
				+ ' width: 0;'
				+ ' height: 0;'
				+ ' pointer-events: none;'
				+ ' z-index: 2147483000;'
				+ ' font-family: verdana, arial, sans-serif;'
			+ '}'
			+ '#' + PANEL_ID + ' {'
				+ ' display: none;'
				+ ' position: fixed;'
				+ ' pointer-events: auto;'
				+ ' background: #ffffff;'
				+ ' border: 2px solid #000084;'
				+ ' padding: 6px;'
				+ ' min-width: 140px;'
			+ ' box-shadow: 0 0 0 1px #ffffff inset;'
			+ '}'
			+ '#' + PANEL_ID + ' label {'
			+ ' display: block;'
			+ ' margin-bottom: 4px;'
			+ ' font-size: 11px;'
			+ ' color: #000033;'
			+ '}'
			+ '#' + SELECT_ID + ' {'
			+ ' width: 100%;'
			+ ' font-family: verdana, arial, sans-serif;'
			+ ' font-size: 11px;'
			+ '}';

		var style = document.createElement('style');
		style.id = STYLE_ID;
		style.type = 'text/css';
		if(style.styleSheet) {
			style.styleSheet.cssText = css;
		} else {
			style.appendChild(document.createTextNode(css));
		}
		document.getElementsByTagName('head')[0].appendChild(style);
	}

	function openPanel($trigger) {
		var $panel = $('#' + PANEL_ID);
		if(!$panel.length) {
			return;
		}
		$('#' + SELECT_ID).val(state.currentLang);

		var rect = $trigger.get(0).getBoundingClientRect();
		var top = rect.bottom + 3;
		var left = rect.left;

		$panel.css({
			top: top + 'px',
			left: left + 'px'
		}).show().attr('aria-hidden', 'false');
	}

	function closePanel() {
		$('#' + PANEL_ID).hide().attr('aria-hidden', 'true');
	}

	function setLanguage(lang, persist) {
		var next = findSupportedLanguage(lang, state.config.supported) || state.config.default;
		state.currentLang = next;
		if(persist) {
			persistLanguage(next);
		}
		applyCurrentLanguage();
	}

	function applyCurrentLanguage() {
		loadPageStrings(state.currentLang, function(strings) {
			applyPageStrings(strings || {});
			notifyLanguageChange();
		});
	}

	function loadPageStrings(lang, done) {
		var page = getCurrentPageName();
		var jsonName = page.replace(/\.(htm|html)$/i, '.json');
		var url = state.projectRoot + 'i18n/' + lang + '/pages/' + jsonName;

		loadJson(url, function(bundle) {
			if(bundle && bundle.strings) {
				done(bundle.strings);
				return;
			}
			if(lang !== state.config.default) {
				loadPageStrings(state.config.default, done);
				return;
			}
			done({});
		});
	}

	function loadJson(url, done) {
		if(state.bundles.hasOwnProperty(url)) {
			done(state.bundles[url]);
			return;
		}
		$.ajax({
			url: url,
			dataType: 'json',
			cache: false
		}).done(function(data) {
			state.bundles[url] = data;
			done(data);
		}).fail(function() {
			state.bundles[url] = null;
			done(null);
		});
	}

	function applyPageStrings(strings) {
		applyCommonUiStrings(strings);

		var page = getCurrentPageName();
		if(page === 'comic1.htm') {
			applyComic1Strings(strings);
		}
	}

	function applyCommonUiStrings(strings) {
		if(strings['ui.zoom']) {
			$('a').filter(function() {
				var href = (($(this).attr('href') || '') + '').toLowerCase();
				return href.indexOf('javascript:zoom') === 0;
			}).text(strings['ui.zoom']);
		}

		if(strings['ui.list']) {
			$('a').filter(function() {
				var text = $.trim($(this).text()).toLowerCase();
				return text === 'list' || text === '목록';
			}).text(strings['ui.list']);
		}

		if(strings['ui.tip.arrow_nav']) {
			$('span').filter(function() {
				var text = $(this).text();
				return text.indexOf('Tip: Use the Left/Right arrow keys to navigate.') >= 0
					|| text.indexOf('팁: 좌우 화살표 키로 이동할 수 있습니다.') >= 0;
			}).first().text(strings['ui.tip.arrow_nav']);
		}
	}

	function applyComic1Strings(strings) {
		setTextIfExists($('a[name="title"]').find('font.rundschrift').first(), strings['title.main']);

		setNarration('p1', strings['panel.p1.narration.1']);
		setNarration('p2', strings['panel.p2.narration.1']);
		setNarration('p3', strings['panel.p3.narration.1']);
		setNarration('p4', strings['panel.p4.narration.1']);

		setBubbleCenter('p2', strings['panel.p2.bubble.center']);
		setBubbleCenter('p3', strings['panel.p3.bubble.center']);
		setBubbleCenter('p4', strings['panel.p4.bubble.center']);
	}

	function setNarration(panelName, value) {
		var $panel = $('a[name="' + panelName + '"]');
		var $target = $panel.find('td[bgcolor="ffff99"] b').first();
		setTextIfExists($target, value);
	}

	function setBubbleCenter(panelName, value) {
		var $panel = $('a[name="' + panelName + '"]');
		var $bubbleTable = $panel.find('table[width="250"]').first();
		var $target = $bubbleTable.find('tr').first().find('td[bgcolor="ffffff"]').first().find('center').first();
		setTextIfExists($target, value);
	}

	function setTextIfExists($el, value) {
		if(!$el || !$el.length) {
			return;
		}
		if(typeof value !== 'string') {
			return;
		}
		$el.text(value);
	}

	function notifyLanguageChange() {
		$(document).trigger('kidradd:i18n:languagechange', [state.currentLang, state.config]);
	}

	function getCurrentPageName() {
		var path = window.location.pathname || '';
		var file = path.substring(path.lastIndexOf('/') + 1);
		if(!file) {
			return 'index.htm';
		}
		return file.toLowerCase();
	}

	function persistLanguage(lang) {
		safeLocalStorageSet(STORAGE_KEY, lang);
	}

	function safeLocalStorageGet(key) {
		try {
			if(window.localStorage) {
				return window.localStorage.getItem(key);
			}
		} catch(err) {}
		return null;
	}

	function safeLocalStorageSet(key, value) {
		try {
			if(window.localStorage) {
				window.localStorage.setItem(key, value);
			}
		} catch(err) {}
	}

	function detectProjectRoot() {
		var scripts = document.getElementsByTagName('script');
		for(var i = scripts.length - 1; i >= 0; i--) {
			var src = stripQuery(scripts[i].getAttribute('src') || '');
			var webMarker = 'web/i18n.js';
			var assetsMarker = 'assets/radd.js';
			var webIndex = src.indexOf(webMarker);
			if(webIndex >= 0) {
				return src.substring(0, webIndex);
			}
			var assetsIndex = src.indexOf(assetsMarker);
			if(assetsIndex >= 0) {
				return src.substring(0, assetsIndex);
			}
		}
		return '../';
	}

	function stripQuery(src) {
		if(!src) {
			return '';
		}
		return src.split('#')[0].split('?')[0];
	}

	window.KidRaddI18n = {
		init: init,
		getLanguage: function() { return state.currentLang; },
		setLanguage: function(lang) { setLanguage(lang, true); },
		getConfig: function() { return state.config; },
		getProjectRoot: function() { return state.projectRoot; }
	};
})(window, document, window.jQuery);
