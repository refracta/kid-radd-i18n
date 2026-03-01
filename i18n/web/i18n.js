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
	var TRANSLATED_ATTR = 'data-kr-i18n-translated';
	var FONT_APPLIED_ATTR = 'data-kr-i18n-font-applied';
	var BUBBLE_SLOTS = ['left', 'center', 'right'];
	var DEDICATED_KO_PAGES = {
		'index.htm': true,
		'listp.htm': true,
		'faq.htm': true,
		'credits.htm': true,
		'stuff.htm': true,
		'tweaks.htm': true,
		'making1.htm': true,
		'making2.htm': true,
		'making3.htm': true,
		'making4.htm': true,
		'making5.htm': true
	};

	var FALLBACK_CONFIG = {
		default: 'en',
		supported: ['en', 'ko'],
		labels: {
			en: 'English',
			ko: 'Korean'
		},
		fontProfiles: {
			default: {
				title: 'VAGRundschriftD, Arial, sans-serif'
			},
			en: {
				title: 'VAGRundschriftD, Arial, sans-serif'
			},
			ko: {
				cssUrl: 'i18n/fonts/tmoney.css',
				title: 'TMoneyDungunbaram'
			}
		},
		uiTextProfiles: {
			default: {
				zoom: 'zoom',
				list: 'list',
				tipArrowNav: 'Tip: Use the Left/Right arrow keys to navigate.',
				languageLabel: 'Language',
				langButton: 'lang'
			},
			en: {
				zoom: 'zoom',
				list: 'list',
				tipArrowNav: 'Tip: Use the Left/Right arrow keys to navigate.',
				languageLabel: 'Language',
				langButton: 'lang'
			},
			ko: {
				zoom: '확대',
				list: '목록',
				tipArrowNav: '팁: 좌우 화살표 키로 이동할 수 있습니다.',
				languageLabel: '언어',
				langButton: '언어'
			}
		}
	};

	var state = {
		initialized: false,
		config: null,
		currentLang: null,
		projectRoot: '',
		bundles: {},
		positionQueued: false,
		originalStrings: {},
		lastPanelByComicUrl: {},
		lastPanelPending: {}
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
			if(redirectToDedicatedLanguagePage(state.currentLang)) {
				return;
			}
			injectStyle();
			renderControl();
			captureOriginalPageStrings();
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
		var fontProfiles = normalizeLanguageProfiles(source.fontProfiles, FALLBACK_CONFIG.fontProfiles, supported);
		var uiTextProfiles = normalizeLanguageProfiles(source.uiTextProfiles, FALLBACK_CONFIG.uiTextProfiles, supported);

		return {
			default: defaultLang,
			supported: supported,
			labels: labels,
			fontProfiles: fontProfiles,
			uiTextProfiles: uiTextProfiles
		};
	}

	function normalizeLanguageProfiles(rawProfiles, fallbackProfiles, supported) {
		var source = rawProfiles || {};
		var fallback = fallbackProfiles || {};
		var base = $.extend({}, fallback.default || {}, source.default || {});
		var out = {};

		for(var i = 0; i < supported.length; i++) {
			var lang = supported[i];
			out[lang] = $.extend({}, base, fallback[lang] || {}, source[lang] || {});
		}
		return out;
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

		bindKeyboardShortcuts();
		bindHashOnlyAnchorFix();
		bindFloatingTriggerPosition();
		bindPrevComicLastPanelLinks();
	}

	function bindPrevComicLastPanelLinks() {
		if(!/^comic[0-9]+\.htm$/i.test(getCurrentPageName())) {
			return;
		}
		updatePrevComicLastPanelLinks();
		$(window).on('hashchange.krI18nPrevLastPanel', updatePrevComicLastPanelLinks);
		$(document).on('click.krI18nPrevLastPanel', 'a', function() {
			window.setTimeout(updatePrevComicLastPanelLinks, 0);
		});
	}

	function updatePrevComicLastPanelLinks() {
		getPrevNavigationLinks().each(function() {
			updateSinglePrevComicLink(this);
		});
	}

	function getPrevNavigationLinks() {
		return $('a').filter(function() {
			var $link = $(this);
			var $img = $link.find('img').first();
			if(!$img.length) {
				return false;
			}
			var src = ($img.attr('src') || '').toLowerCase();
			return /(?:^|_)prev\.gif$/.test(baseName(stripQuery(src)));
		});
	}

	function updateSinglePrevComicLink(link) {
		var target = getCrossComicTitleTarget(link);
		if(!target) {
			return;
		}
		resolveComicLastPanel(target.baseUrl, function(lastPanelName) {
			if(!lastPanelName) {
				return;
			}
			link.setAttribute('href', target.hrefBase + '#' + lastPanelName);
		});
	}

	function getCrossComicTitleTarget(link) {
		if(!link || !link.getAttribute) {
			return null;
		}
		var href = link.getAttribute('href') || '';
		var absoluteHref = resolveAbsoluteUrl(href);
		if(!absoluteHref) {
			return null;
		}
		var hash = extractHashPart(absoluteHref);
		if(hash !== 'title') {
			return null;
		}
		var baseUrl = absoluteHref.split('#')[0];
		var rawBase = stripHashPart(href);
		var pageName = getPageNameFromUrl(baseUrl);
		if(!/^comic[0-9]+\.htm$/i.test(pageName)) {
			return null;
		}
		if(pageName === getCurrentPageName()) {
			return null;
		}
		return {
			baseUrl: baseUrl,
			hrefBase: rawBase || baseUrl
		};
	}

	function resolveComicLastPanel(baseUrl, done) {
		if(!baseUrl) {
			done('');
			return;
		}
		if(state.lastPanelByComicUrl.hasOwnProperty(baseUrl)) {
			done(state.lastPanelByComicUrl[baseUrl] || '');
			return;
		}
		if(state.lastPanelPending[baseUrl]) {
			state.lastPanelPending[baseUrl].push(done);
			return;
		}
		state.lastPanelPending[baseUrl] = [done];
		$.ajax({
			url: baseUrl,
			dataType: 'text',
			cache: true
		}).done(function(html) {
			var lastPanel = parseLastPanelNameFromHtml(html);
			state.lastPanelByComicUrl[baseUrl] = lastPanel || '';
			flushLastPanelCallbacks(baseUrl, lastPanel || '');
		}).fail(function() {
			state.lastPanelByComicUrl[baseUrl] = '';
			flushLastPanelCallbacks(baseUrl, '');
		});
	}

	function flushLastPanelCallbacks(baseUrl, value) {
		var callbacks = state.lastPanelPending[baseUrl] || [];
		delete state.lastPanelPending[baseUrl];
		for(var i = 0; i < callbacks.length; i++) {
			callbacks[i](value);
		}
	}

	function parseLastPanelNameFromHtml(html) {
		if(typeof html !== 'string' || !html) {
			return '';
		}
		var pattern = /<a[^>]+name\s*=\s*["']?p([0-9]+)["']?/ig;
		var match = null;
		var maxPanel = 0;
		while((match = pattern.exec(html))) {
			var panelNum = parseInt(match[1], 10);
			if(panelNum > maxPanel) {
				maxPanel = panelNum;
			}
		}
		return maxPanel > 0 ? ('p' + maxPanel) : '';
	}

	function extractHashPart(url) {
		var parts = String(url || '').split('#');
		if(parts.length < 2) {
			return '';
		}
		return safeDecodeURIComponent(parts.slice(1).join('#')).replace(/^#/, '').toLowerCase();
	}

	function stripHashPart(url) {
		return String(url || '').split('#')[0];
	}

	function getPageNameFromUrl(url) {
		try {
			var parsed = new window.URL(url, document.baseURI || window.location.href);
			return String(parsed.pathname || '').split('/').pop().toLowerCase();
		} catch(err) {
			return '';
		}
	}

	function bindKeyboardShortcuts() {
		$(document).on('keydown.krI18nShortcuts', function(event) {
			var action = getLanguageShortcutAction(event);
			if(!action) {
				return;
			}
			if(shouldIgnoreLanguageShortcut(event.target)) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			if(action === 'toggle') {
				togglePanelFromKeyboard();
				return;
			}
			if(action === 'prev') {
				cycleLanguageFromKeyboard(-1);
				return;
			}
			if(action === 'next') {
				cycleLanguageFromKeyboard(1);
			}
		});
	}

	function bindHashOnlyAnchorFix() {
		$(document).on('click.krI18nHashOnlyFix', 'a', function(event) {
			if(!shouldFixHashOnlyAnchor(this, event)) {
				return;
			}
			var href = this.getAttribute('href') || '';
			if(href.length < 2) {
				return;
			}
			event.preventDefault();
			navigateWithinCurrentPage(href.substring(1));
		});
	}

	function navigateWithinCurrentPage(fragment) {
		var clean = String(fragment || '').replace(/^#/, '');
		if(!clean) {
			return;
		}
		var target = findFragmentTarget(clean);
		if(window.location.hash !== '#' + clean) {
			window.location.hash = clean;
			if(target) {
				window.setTimeout(function() {
					scrollToTargetTop(target);
				}, 0);
			}
			return;
		}
		if(target) {
			scrollToTargetTop(target);
		}
	}

	function findFragmentTarget(fragment) {
		var candidates = [fragment, safeDecodeURIComponent(fragment)];
		for(var i = 0; i < candidates.length; i++) {
			var name = candidates[i];
			if(!name) {
				continue;
			}
			var byId = document.getElementById(name);
			if(byId) {
				return byId;
			}
			var byName = document.getElementsByName(name);
			if(byName && byName.length) {
				return byName[0];
			}
		}
		return null;
	}

	function safeDecodeURIComponent(value) {
		try {
			return decodeURIComponent(value);
		} catch(err) {
			return value;
		}
	}

	function scrollToTargetTop(target) {
		if(!target || !target.getBoundingClientRect) {
			return;
		}
		var rect = target.getBoundingClientRect();
		var currentY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
		var top = rect.top + currentY;
		if(!isFinite(top)) {
			if(target.scrollIntoView) {
				target.scrollIntoView(true);
			}
			return;
		}
		window.scrollTo(0, Math.max(0, top));
	}

	function shouldFixHashOnlyAnchor(anchor, event) {
		if(!hasBaseHref()) {
			return false;
		}
		if(!anchor || !anchor.getAttribute) {
			return false;
		}
		var href = (anchor.getAttribute('href') || '');
		if(href.charAt(0) !== '#') {
			return false;
		}
		if(event && (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)) {
			return false;
		}
		var target = (anchor.getAttribute('target') || '').toLowerCase();
		if(target && target !== '_self' && target !== '_top') {
			return false;
		}
		return true;
	}

	function hasBaseHref() {
		return $('base[href]').length > 0;
	}

	function getLanguageShortcutAction(event) {
		if(!event) {
			return '';
		}
		if(event.ctrlKey || event.metaKey || event.altKey) {
			return '';
		}
		var key = event.key || '';
		var lower = key ? String(key).toLowerCase() : '';
		if(lower === 'l') {
			return 'toggle';
		}
		if(lower === 'k') {
			return 'prev';
		}
		if(key === ';' || event.code === 'Semicolon' || event.keyCode === 186 || event.which === 186) {
			return 'next';
		}
		if(event.keyCode === 76 || event.which === 76) {
			return 'toggle';
		}
		if(event.keyCode === 75 || event.which === 75) {
			return 'prev';
		}
		return '';
	}

	function shouldIgnoreLanguageShortcut(target) {
		var $target = $(target || null);
		if(!$target.length) {
			return false;
		}
		if($target.closest('#' + PANEL_ID).length || $target.attr('id') === SELECT_ID) {
			return false;
		}
		return $target.is('input, textarea, select, button') || $target.prop('isContentEditable');
	}

	function cycleLanguageFromKeyboard(step) {
		if(!state.config || !$.isArray(state.config.supported) || !state.config.supported.length) {
			return;
		}
		var supported = state.config.supported;
		var current = findSupportedLanguage(state.currentLang, supported) || state.config.default || supported[0];
		var index = $.inArray(current, supported);
		if(index < 0) {
			index = 0;
		}
		var nextIndex = (index + step) % supported.length;
		if(nextIndex < 0) {
			nextIndex += supported.length;
		}
		var nextLang = supported[nextIndex];
		setLanguage(nextLang, true);
		$('#' + SELECT_ID).val(nextLang);
	}

	function togglePanelFromKeyboard() {
		var $panel = $('#' + PANEL_ID);
		if(!$panel.length) {
			return;
		}
		if($panel.is(':visible')) {
			closePanel();
			return;
		}
		var $trigger = $('#' + TRIGGER_ID);
		var triggerVisible = $trigger.length && $trigger.css('display') !== 'none' && $trigger.get(0).getBoundingClientRect;
		if(triggerVisible) {
			openPanel($trigger);
		} else {
			openPanelAtFallbackPosition();
		}
		$('#' + SELECT_ID).focus();
	}

	function openPanelAtFallbackPosition() {
		var $panel = $('#' + PANEL_ID);
		if(!$panel.length) {
			return;
		}
		var overlayScale = syncOverlayScale();
		$('#' + SELECT_ID).val(state.currentLang);
		var panelWidth = Math.max(140, $panel.outerWidth() || 160);
		var panelVisualWidth = panelWidth * overlayScale;
		var left = Math.max(8, (window.innerWidth || document.documentElement.clientWidth || 0) - panelVisualWidth - 10);
		var top = 10;
		$panel.css({
			top: top + 'px',
			left: left + 'px'
		}).show().attr('aria-hidden', 'false');
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
		var overlayScale = syncOverlayScale();
		normalizeTipPosition();

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

		var triggerVisualWidth = 39 * overlayScale;
		var left = zoomRect.right + 3;
		if(anchors.list.length) {
			var listAnchor = anchors.list.closest('table').get(0) || anchors.list.get(0);
			if(listAnchor && listAnchor.getBoundingClientRect) {
				var listRect = listAnchor.getBoundingClientRect();
				if(listRect.width > 0 && listRect.height > 0 && listRect.left > zoomRect.right) {
					left = (zoomRect.right + listRect.left - triggerVisualWidth) / 2;
				}
			}
		}
		var top = zoomRect.top;
		var maxLeft = Math.max(0, (window.innerWidth || document.documentElement.clientWidth || 0) - triggerVisualWidth - 2);
		if(left > maxLeft) {
			left = maxLeft;
		}
		if(left < 0) {
			left = 0;
		}
		left = Math.round(left);
		top = Math.round(top);

		$trigger.css({
			left: left + 'px',
			top: top + 'px'
		}).show();
	}

	function getOverlayScale() {
		return getViewportScale();
	}

	function syncOverlayScale() {
		var scale = getOverlayScale();
		applyOverlayScale($('#' + TRIGGER_ID), scale);
		applyOverlayScale($('#' + PANEL_ID), scale);
		return scale;
	}

	function applyOverlayScale($el, scale) {
		if(!$el || !$el.length) {
			return;
		}
		var normalized = (typeof scale === 'number' && isFinite(scale) && scale > 0) ? scale : 1;
		if(Math.abs(normalized - 1) < 0.01) {
			$el.css('transform', '');
			return;
		}
		$el.css('transform', 'scale(' + normalized + ')');
	}

	function normalizeTipPosition() {
		var $tip = findTipElement();
		if(!$tip.length) {
			return;
		}
		var $tipCenter = $tip.closest('center');
		if(!$tipCenter.length) {
			return;
		}

		$tipCenter.css({
			marginTop: '0px',
			position: 'relative',
			top: '0px'
		});
		var $centers = $('body > center');
		if($centers.length < 2) {
			return;
		}

		var mainRect = $centers.eq(0).get(0).getBoundingClientRect();
		var tipRect = $tipCenter.get(0).getBoundingClientRect();
		if(!mainRect || !tipRect) {
			return;
		}

			var expectedTop = mainRect.top + mainRect.height;
			var gap = Math.round(tipRect.top - expectedTop);
			if(gap > 0) {
				var viewportScale = getViewportScale();
				var htmlZoomScale = getHtmlZoomScale();
				var layoutScale = viewportScale * htmlZoomScale;
				if(!(layoutScale > 0)) {
					layoutScale = 1;
				}
				var cssOffset = Math.round(gap / layoutScale);
				$tipCenter.css('top', (-cssOffset) + 'px');
			}
		}

		function getHtmlZoomScale() {
			var root = document.documentElement;
			if(!root || !window.getComputedStyle) {
				return 1;
			}
			var zoomValue = window.getComputedStyle(root).zoom;
			var zoom = parseFloat(zoomValue);
			if(zoom > 0 && isFinite(zoom)) {
				return zoom;
			}
			return 1;
		}

	function getViewportScale() {
		var body = document.body;
		if(!body) {
			return 1;
		}
		var transform = window.getComputedStyle(body).transform || '';
		if(!transform || transform === 'none') {
			return 1;
		}
		var match = transform.match(/^matrix\(([^)]+)\)$/);
		if(!match) {
			return 1;
		}
		var parts = match[1].split(',');
		if(parts.length < 4) {
			return 1;
		}
		var c = parseFloat(parts[2]);
		var d = parseFloat(parts[3]);
		var scaleY = Math.sqrt((c * c) + (d * d));
		if(scaleY > 0) {
			return scaleY;
		}
		return 1;
	}

	function findReferenceMenuAnchors() {
		var hashPanelName = getCurrentHashPanelName();
		if(hashPanelName) {
			var $hashPanel = $('a[name="' + hashPanelName + '"]').first();
			if($hashPanel.length) {
				var $hashZoom = $hashPanel.find('a').filter(isZoomLink).first();
				if($hashZoom.length) {
					var $hashMenuRow = findMenuRowForZoomLink($hashZoom);
					var $hashList = findListLinkFromMenuRow($hashMenuRow);
					if(!$hashList.length) {
						$hashList = $hashPanel.find('a').filter(isListLink).first();
					}
					return {
						zoom: $hashZoom,
						list: $hashList,
						hideTrigger: shouldHideTriggerByMenuRow($hashZoom)
					};
				}
			}
		}

		var $visiblePanel = $('a.panel.visible').first();
		if($visiblePanel.length) {
			var $visibleZoom = $visiblePanel.find('a').filter(isZoomLink).first();
			if($visibleZoom.length) {
				var $visibleMenuRow = findMenuRowForZoomLink($visibleZoom);
				var $visibleList = findListLinkFromMenuRow($visibleMenuRow);
				if(!$visibleList.length) {
					$visibleList = $visiblePanel.find('a').filter(isListLink).first();
				}
				return {
					zoom: $visibleZoom,
					list: $visibleList,
					hideTrigger: shouldHideTriggerByMenuRow($visibleZoom)
				};
			}
		}
		var $zoom = $('a').filter(isZoomLink).first();
		var $menuRow = findMenuRowForZoomLink($zoom);
		return {
			zoom: $zoom,
			list: findListLinkFromMenuRow($menuRow),
			hideTrigger: shouldHideTriggerByMenuRow($zoom)
		};
	}

	function getCurrentHashPanelName() {
		var rawHash = window.location.hash || '';
		if(!rawHash) {
			return '';
		}
		var decodedHash = safeDecodeURIComponent(rawHash);
		var normalized = String(decodedHash).replace(/^#/, '').toLowerCase();
		if(/^p[0-9]+$/.test(normalized)) {
			return normalized;
		}
		if(normalized === 'title') {
			return normalized;
		}
		return '';
	}

	function shouldHideTriggerByMenuRow($zoomLink) {
		if(!$zoomLink || !$zoomLink.length) {
			return false;
		}
		var $menuRow = findMenuRowForZoomLink($zoomLink);
		if(!$menuRow.length) {
			return false;
		}
		return hasMenuRowMiddleContent($menuRow);
	}

	function hasMenuRowMiddleContent($menuRow) {
		if(!$menuRow || !$menuRow.length) {
			return false;
		}
		var $cells = $menuRow.children('td');
		if($cells.length < 2) {
			return false;
		}
		var $middleCell = $cells.eq(1);
		var middleText = String($middleCell.text() || '')
			.replace(/\u00a0/g, ' ')
			.replace(/\s+/g, ' ');
		if($.trim(middleText).length > 0) {
			return true;
		}

		// Some comics use icon/button rows in the center cell instead of text.
		// Treat these as non-empty menu rows and hide the floating language trigger.
		if($middleCell.find('a, button, input, select, textarea, label').length > 0) {
			return true;
		}
		if($middleCell.find('img, svg, canvas, video, audio, object, embed, iframe').length > 0) {
			return true;
		}

		return false;
	}

	function findMenuRowForZoomLink($zoomLink) {
		if(!$zoomLink || !$zoomLink.length) {
			return $();
		}
		return $zoomLink.parents('tr').filter(function() {
			var $row = $(this);
			var $cells = $row.children('td');
			if($cells.length < 3) {
				return false;
			}
			return $cells.eq(0).find('a').filter(isZoomLink).length > 0;
		}).first();
	}

	function findListLinkFromMenuRow($menuRow) {
		if(!$menuRow || !$menuRow.length) {
			return $();
		}
		var $cells = $menuRow.children('td');
		if($cells.length < 3) {
			return $();
		}
		var $rightCell = $cells.eq($cells.length - 1);
		var $preferred = $rightCell.find('a').filter(isListLink).first();
		if($preferred.length) {
			return $preferred;
		}
		return $rightCell.find('a').first();
	}

	function isZoomLink() {
		var href = (($(this).attr('href') || '') + '').toLowerCase();
		return href.indexOf('javascript:zoom') === 0;
	}

	function isListLink() {
		var href = (($(this).attr('href') || '') + '').toLowerCase();
		if(href.indexOf('listp.htm') >= 0) {
			return true;
		}

		var text = $.trim($(this).text()).toLowerCase();
		if(text !== 'list' && text !== '목록') {
			return false;
		}

		var $link = $(this);
		var $menuCell = $link.closest('td[background]');
		if($menuCell.length) {
			var background = String($menuCell.attr('background') || '').toLowerCase();
			if(background.indexOf('menu.gif') >= 0) {
				return true;
			}
		}

		var $menuTable = $link.closest('table');
		if($menuTable.length) {
			var width = String($menuTable.attr('width') || '').toLowerCase();
			var height = String($menuTable.attr('height') || '').toLowerCase();
			if(width === '39' && (height === '' || height === '19')) {
				return true;
			}
		}

		return false;
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
			+ ' transform-origin: 0 0;'
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
			+ ' transform-origin: 0 0;'
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
			+ '}'
			+ 'html.kr-lang-ko font[face*="Comic Sans MS"] {'
			+ ' font-family: TMoneyDungunbaram, "Noto Sans KR", "Apple SD Gothic Neo", sans-serif !important;'
			+ ' letter-spacing: 0 !important;'
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
		syncOverlayScale();
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
		if(redirectToDedicatedLanguagePage(next)) {
			return;
		}
		applyCurrentLanguage();
	}

	function redirectToDedicatedLanguagePage(lang) {
		var targetUrl = getDedicatedLanguagePageUrl(lang);
		if(!targetUrl) {
			return false;
		}
		var currentUrl = window.location.href.split('#')[0];
		if(sameUrlWithoutHash(currentUrl, targetUrl)) {
			return false;
		}
		window.location.replace(targetUrl + (window.location.hash || ''));
		return true;
	}

	function getDedicatedLanguagePageUrl(lang) {
		var page = getCurrentPageName();
		if(!hasDedicatedKoPage(page)) {
			return '';
		}

		var normalized = normalizeLang(lang);
		var isLocalizedPath = /\/lang\/[a-z0-9-]+\/[^/]+\.htm$/i.test(window.location.pathname || '');
		if(normalized === 'ko') {
			if(isLocalizedPath) {
				return '';
			}
			return resolveAbsoluteUrl(state.projectRoot + 'lang/ko/' + page);
		}
		if(isLocalizedPath) {
			return resolveAbsoluteUrl(state.projectRoot + 'pages/' + page);
		}
		return '';
	}

	function hasDedicatedKoPage(page) {
		return !!DEDICATED_KO_PAGES[page];
	}

	function resolveAbsoluteUrl(url) {
		try {
			return String(new window.URL(url, document.baseURI || window.location.href));
		} catch(err) {
			return url;
		}
	}

	function sameUrlWithoutHash(left, right) {
		var a = (left || '').split('#')[0];
		var b = (right || '').split('#')[0];
		return a === b;
	}

	function applyCurrentLanguage() {
		if(hasDedicatedKoPage(getCurrentPageName())) {
			applyLanguageMetadata();
			applyUiTextProfile(state.config.uiTextProfiles[state.currentLang] || null);
			notifyLanguageChange();
			return;
		}
		loadPageStrings(state.currentLang, function(result) {
			var payload = result || {};
			var strings = payload.strings || {};
			var contentLang = findSupportedLanguage(payload.lang, state.config.supported) || state.currentLang;
			applyPageStrings(strings, contentLang);
			notifyLanguageChange();
		});
	}

	function loadPageStrings(lang, done) {
		var page = getCurrentPageName();
		var jsonName = page.replace(/\.(htm|html)$/i, '.json');
		var url = state.projectRoot + 'i18n/lang/' + lang + '/pages/' + jsonName;

		loadJson(url, function(bundle) {
			if(bundle && bundle.strings) {
				done({
					strings: bundle.strings,
					lang: lang
				});
				return;
			}
			if(lang !== state.config.default) {
				loadPageStrings(state.config.default, done);
				return;
			}
			done({
				strings: {},
				lang: lang
			});
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

	function applyPageStrings(strings, contentLang) {
		var uiTextProfile = state.config.uiTextProfiles[state.currentLang] || null;
		var fontProfile = state.config.fontProfiles[contentLang] || state.config.fontProfiles[state.currentLang] || null;

		applyLanguageMetadata();
		applyCommonUiStrings(strings);
		applyUiTextProfile(uiTextProfile);

		var page = getCurrentPageName();
		if(/^comic[0-9]+\.htm$/i.test(page)) {
			applyComicPageStrings(strings);
			applyComicSceneWordBreak();
		}

		applyFontProfile(fontProfile);
	}

	function applyCommonUiStrings(strings) {
		applyUiTextProfile({
			zoom: strings['ui.zoom'],
			list: strings['ui.list'],
			tipArrowNav: strings['ui.tip.arrow_nav']
		});
	}

	function applyLanguageMetadata() {
		var normalizedLang = normalizeLang(state.currentLang) || 'en';
		var root = document.documentElement;
		if(!root) {
			return;
		}
		root.lang = normalizedLang;

		var className = root.className || '';
		className = className.replace(/\bkr-lang-[a-z0-9-]+\b/g, ' ');
		className = $.trim(className.replace(/\s+/g, ' '));
		root.className = className ? (className + ' kr-lang-' + normalizedLang) : ('kr-lang-' + normalizedLang);
	}

	function applyUiTextProfile(profile) {
		if(!profile) {
			return;
		}
		if(typeof profile.zoom === 'string') {
			getUiZoomTextLinks().text(profile.zoom);
		}
		if(typeof profile.list === 'string') {
			getUiListTextLinks().text(profile.list);
		}
		if(typeof profile.tipArrowNav === 'string') {
			var $tip = findTipElement();
			if($tip.length) {
				$tip.text(profile.tipArrowNav);
			}
		}
		if(typeof profile.languageLabel === 'string') {
			$('#' + PANEL_ID + ' label').text(profile.languageLabel);
		}
		if(typeof profile.langButton === 'string') {
			$('.kr-i18n-trigger').text(profile.langButton);
		}
	}

	function applyFontProfile(profile) {
		if(!profile) {
			return;
		}
		ensureFontProfileStylesheet(profile);
		var titleFont = typeof profile.title === 'string' ? profile.title : null;
		var $targets = getVagTitleTargets();

		clearManagedTitleFontOverrides($targets);

		if(titleFont) {
			$targets.filter(function() {
				return this && this.getAttribute && this.getAttribute(TRANSLATED_ATTR) === '1';
			}).each(function() {
				if(this && this.style && this.style.setProperty) {
					this.style.setProperty('font-family', titleFont, 'important');
					this.setAttribute(FONT_APPLIED_ATTR, '1');
				}
			});
		}
	}

	function clearManagedTitleFontOverrides($targets) {
		if(!$targets || !$targets.length) {
			return;
		}
		$targets.filter(function() {
			return this && this.getAttribute && this.getAttribute(FONT_APPLIED_ATTR) === '1';
		}).each(function() {
			if(this.style && this.style.removeProperty) {
				this.style.removeProperty('font-family');
			}
			this.removeAttribute(FONT_APPLIED_ATTR);
		});
	}

	function ensureFontProfileStylesheet(profile) {
		if(!profile || typeof profile.cssUrl !== 'string' || !profile.cssUrl) {
			return;
		}
		var resolvedUrl = resolveProfileCssUrl(profile.cssUrl);
		if(!resolvedUrl) {
			return;
		}
		var id = 'kr-i18n-font-profile-css';
		var existing = document.getElementById(id);
		if(existing) {
			if(existing.getAttribute('href') !== resolvedUrl) {
				existing.setAttribute('href', resolvedUrl);
			}
			return;
		}
		var link = document.createElement('link');
		link.id = id;
		link.rel = 'stylesheet';
		link.type = 'text/css';
		link.href = resolvedUrl;
		document.getElementsByTagName('head')[0].appendChild(link);
	}

	function resolveProfileCssUrl(url) {
		if(!url) {
			return '';
		}
		if(/^(?:[a-z]+:)?\/\//i.test(url) || url.indexOf('data:') === 0) {
			return url;
		}
		return state.projectRoot + String(url).replace(/^\.\//, '');
	}

	function findTipElement() {
		var $tip = $('body > center > span').first();
		if($tip.length) {
			return $tip;
		}
		return $('span').filter(function() {
			var text = $(this).text();
			return text.indexOf('Tip: Use the Left/Right arrow keys to navigate.') >= 0
				|| text.indexOf('팁: 좌우 화살표 키로 이동할 수 있습니다.') >= 0;
		}).first();
	}

	function getVagTitleTargets() {
		return $('font.rundschrift, font[face*="VAG Rundschrift D"], font[face*="VAG Rundschrift"]').filter(function() {
			var $el = $(this);
			var face = ($el.attr('face') || '').toLowerCase();
			return $el.hasClass('rundschrift') || face.indexOf('vag rundschrift') >= 0;
		});
	}

	function getUiZoomTextLinks() {
		return $('a').filter(isZoomLink).filter(isTextOnlyLink);
	}

	function getUiListTextLinks() {
		return $('a').filter(isListLink).filter(isTextOnlyLink);
	}

	function isTextOnlyLink() {
		return $(this).find('img').length === 0;
	}

	function getTitleMainTarget() {
		return $('a[name="title"]').find('font.rundschrift, font[face*="VAG Rundschrift"]').filter(function() {
			var $el = $(this);
			var face = ($el.attr('face') || '').toLowerCase();
			return $el.hasClass('rundschrift') || face.indexOf('vag rundschrift') >= 0;
		}).first();
	}

	function getTitleExtraTargets() {
		var $title = $('a[name="title"]');
		if(!$title.length) {
			return $();
		}
		var titleMainNode = getTitleMainTarget().get(0) || null;
		var targets = [];

		$title.find('font').each(function() {
			var node = this;
			var $node = $(node);
			var text = $.trim(($node.text() || '').replace(/\u00a0/g, ' '));
			if(!text.length) {
				return;
			}
			if(!/[A-Za-z0-9\u00C0-\u024F\uAC00-\uD7AF]/.test(text)) {
				return;
			}
			if(titleMainNode && (node === titleMainNode || $.contains(titleMainNode, node))) {
				return;
			}
			var $parentFont = $node.parent().closest('font');
			if($parentFont.length) {
				var parentText = $.trim(($parentFont.text() || '').replace(/\u00a0/g, ' '));
				if(parentText.length) {
					return;
				}
			}
			if($node.closest('a[href]').length > 0) {
				return;
			}
			if($node.find('a[href]').length > 0) {
				return;
			}
			if($node.closest('#' + CONTROL_ID).length > 0) {
				return;
			}
			targets.push(node);
		});

		return $(targets);
	}

	function captureOriginalPageStrings() {
		state.originalStrings = {};
		var page = getCurrentPageName();
		if(/^comic[0-9]+\.htm$/i.test(page)) {
			captureComicPageOriginalStrings();
		}
	}

	function captureComicPageOriginalStrings() {
		var $titleMainTarget = getTitleMainTarget();
		state.originalStrings['title.main'] = readTextIfExists($titleMainTarget);
		state.originalStrings['title.main.html'] = readHtmlIfExists($titleMainTarget);
		var $titleExtraTargets = getTitleExtraTargets();
		for(var titleExtraIndex = 0; titleExtraIndex < $titleExtraTargets.length; titleExtraIndex++) {
			var titleExtraKey = 'title.extra.' + (titleExtraIndex + 1);
			var $titleExtraTarget = $titleExtraTargets.eq(titleExtraIndex);
			state.originalStrings[titleExtraKey] = readTextIfExists($titleExtraTarget);
			state.originalStrings[titleExtraKey + '.html'] = readHtmlIfExists($titleExtraTarget);
		}

		var panels = getComicPanelNames();
		for(var i = 0; i < panels.length; i++) {
			var panelName = panels[i];
			var narrationKey = 'panel.' + panelName + '.narration.1';

			state.originalStrings[narrationKey] = readTextIfExists(getNarrationTarget(panelName));
			state.originalStrings[narrationKey + '.html'] = readHtmlIfExists(getNarrationTarget(panelName));
			for(var slotIndex = 0; slotIndex < BUBBLE_SLOTS.length; slotIndex++) {
				var slotName = BUBBLE_SLOTS[slotIndex];
				var bubbleKey = 'panel.' + panelName + '.bubble.' + slotName;
				state.originalStrings[bubbleKey] = readTextIfExists(getBubbleTarget(panelName, slotName));
				state.originalStrings[bubbleKey + '.html'] = readHtmlIfExists(getBubbleTarget(panelName, slotName));
			}
			var $chatTargets = getPanelChatTargets(panelName);
			for(var chatIndex = 0; chatIndex < $chatTargets.length; chatIndex++) {
				var chatKey = 'panel.' + panelName + '.chat.' + (chatIndex + 1);
				var $chatTarget = $chatTargets.eq(chatIndex);
				state.originalStrings[chatKey] = readTextIfExists($chatTarget);
				state.originalStrings[chatKey + '.html'] = readHtmlIfExists($chatTarget);
			}
			var $extraTargets = getPanelExtraTargets(panelName);
			for(var extraIndex = 0; extraIndex < $extraTargets.length; extraIndex++) {
				var extraKey = 'panel.' + panelName + '.extra.' + (extraIndex + 1);
				var $extraTarget = $extraTargets.eq(extraIndex);
				state.originalStrings[extraKey] = readTextIfExists($extraTarget);
				state.originalStrings[extraKey + '.html'] = readHtmlIfExists($extraTarget);
			}
		}
	}

	function applyComicPageStrings(strings) {
		var normalizedStrings = normalizeComicStringsToHtmlOnly(strings);
		var $titleMainTarget = getTitleMainTarget();
		setTextOrHtmlWithFallback(
			$titleMainTarget,
			null,
			state.originalStrings['title.main'],
			normalizedStrings['title.main.html'],
			state.originalStrings['title.main.html']
		);
		applyTitleExtraStrings(normalizedStrings);

		var panels = getComicPanelNames();
		for(var i = 0; i < panels.length; i++) {
			var panelName = panels[i];
			var narrationKey = 'panel.' + panelName + '.narration.1';
			setNarration(
				panelName,
				null,
				state.originalStrings[narrationKey],
				normalizedStrings[narrationKey + '.html'],
				state.originalStrings[narrationKey + '.html']
			);
			for(var slotIndex = 0; slotIndex < BUBBLE_SLOTS.length; slotIndex++) {
				var slotName = BUBBLE_SLOTS[slotIndex];
				var bubbleKey = 'panel.' + panelName + '.bubble.' + slotName;
				setBubble(
					panelName,
					slotName,
					null,
					state.originalStrings[bubbleKey],
					normalizedStrings[bubbleKey + '.html'],
					state.originalStrings[bubbleKey + '.html']
				);
			}
			applyPanelChatStrings(panelName, normalizedStrings);
			applyPanelExtraStrings(panelName, normalizedStrings);
		}
	}

	function normalizeComicStringsToHtmlOnly(strings) {
		var input = strings || {};
		var normalized = {};
		var keys = Object.keys(input);
		for(var i = 0; i < keys.length; i++) {
			var key = keys[i];
			var value = input[key];
			if(typeof value !== 'string') {
				continue;
			}
			if(/\.html$/i.test(key)) {
				normalized[key] = value;
				continue;
			}
			var htmlKey = key + '.html';
			if(typeof input[htmlKey] === 'string') {
				if(typeof normalized[htmlKey] !== 'string') {
					normalized[htmlKey] = input[htmlKey];
				}
				continue;
			}
			normalized[htmlKey] = escapeTextToHtml(value);
		}
		return normalized;
	}

	function escapeTextToHtml(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	function applyComicSceneWordBreak() {
		var panels = getComicPanelNames();
		var keepAll = normalizeLang(state.currentLang) === 'ko';

		for(var i = 0; i < panels.length; i++) {
			var panelName = panels[i];
			applyWordBreakToTarget(getNarrationTarget(panelName), keepAll);
			for(var slotIndex = 0; slotIndex < BUBBLE_SLOTS.length; slotIndex++) {
				applyWordBreakToTarget(getBubbleTarget(panelName, BUBBLE_SLOTS[slotIndex]), keepAll);
			}
		}
	}

	function applyWordBreakToTarget($target, keepAll) {
		if(!$target || !$target.length) {
			return;
		}

		$target.each(function() {
			setWordBreakOnElement(this, keepAll);
		});

		var $cell = $target.closest('td');
		if($cell.length) {
			setWordBreakOnElement($cell.get(0), keepAll);
		}
	}

	function setWordBreakOnElement(el, keepAll) {
		if(!el || !el.style || !el.style.setProperty) {
			return;
		}
		if(keepAll) {
			el.style.setProperty('word-break', 'keep-all');
			return;
		}
		el.style.removeProperty('word-break');
	}

	function getComicPanelNames() {
		var names = [];
		$('a[name]').each(function() {
			var raw = ($(this).attr('name') || '').toLowerCase();
			if(!/^p[0-9]+$/.test(raw)) {
				return;
			}
			if($.inArray(raw, names) === -1) {
				names.push(raw);
			}
		});
		names.sort(function(left, right) {
			return parseInt(left.substring(1), 10) - parseInt(right.substring(1), 10);
		});
		return names;
	}

	function getNarrationTarget(panelName) {
		var $panel = $('a[name="' + panelName + '"]');
		var $yellowNarration = $panel.find('td[bgcolor="ffff99"] b').first();
		if($yellowNarration.length) {
			return $yellowNarration;
		}

		var $bubbleTable = findBubbleTable($panel);
		if(!$bubbleTable.length) {
			return $();
		}

		var $bubbleRow = $bubbleTable.closest('tr');
		if(!$bubbleRow.length) {
			return $();
		}

		var $legacyRow = $bubbleRow.prevAll('tr').filter(function() {
			return $.trim($(this).text()).length > 0;
		}).first();
		if(!$legacyRow.length) {
			return $();
		}

		var $legacyFonts = $legacyRow.find('font').filter(function() {
			return $.trim($(this).text()).length > 0;
		});
		if($legacyFonts.length === 1) {
			return $legacyFonts.first();
		}
		if($legacyFonts.length > 1) {
			var $sharedCenter = $legacyFonts.first().closest('center');
			if($sharedCenter.length && $legacyFonts.filter(function() {
				return this === $sharedCenter[0] || $.contains($sharedCenter[0], this);
			}).length === $legacyFonts.length) {
				return $sharedCenter.first();
			}
		}

		var $legacyBold = $legacyRow.find('b').filter(function() {
			return $.trim($(this).text()).length > 0;
		}).first();
		if($legacyBold.length) {
			return $legacyBold;
		}

		var $legacyCenter = $legacyRow.find('center').filter(function() {
			return $.trim($(this).text()).length > 0;
		}).first();
		if($legacyCenter.length) {
			return $legacyCenter;
		}

		return $legacyRow.find('font').filter(function() {
			return $.trim($(this).text()).length > 0;
		}).first();
	}

	function setNarration(panelName, value, fallbackValue, htmlValue, fallbackHtmlValue) {
		setTextOrHtmlWithFallback(getNarrationTarget(panelName), value, fallbackValue, htmlValue, fallbackHtmlValue);
	}

	function getBubbleCenterTarget(panelName) {
		return getBubbleTarget(panelName, 'center');
	}

	function getBubbleTarget(panelName, slotName) {
		var $panel = $('a[name="' + panelName + '"]');
		var $bubbleTable = findBubbleTable($panel);
		if(!$bubbleTable.length) {
			return $();
		}
		var $firstRow = $bubbleTable.children('tbody').children('tr').first();
		if(!$firstRow.length) {
			$firstRow = $bubbleTable.find('tr').first();
		}
		if(!$firstRow.length) {
			return $();
		}
		var index = bubbleSlotToIndex(slotName);
		var $cell = $firstRow.children('td').eq(index);
		return resolveBubbleTextTarget($cell);
	}

	function resolveBubbleTextTarget($cell) {
		if(!$cell || !$cell.length) {
			return $();
		}

		var $centers = $cell.find('center');
		if($centers.length) {
			var $nonEmptyCenter = $centers.filter(function() {
				return $.trim($(this).text()).length > 0;
			}).first();
			if($nonEmptyCenter.length) {
				return $nonEmptyCenter;
			}
		}

		var $font = $cell.find('font').first();
		if($font.length) {
			return $font;
		}

		if($centers.length) {
			return $centers.first();
		}

		return $cell;
	}

	function bubbleSlotToIndex(slotName) {
		var normalized = String(slotName || 'center').toLowerCase();
		if(normalized === 'left') {
			return 0;
		}
		if(normalized === 'right') {
			return 2;
		}
		return 1;
	}

	function findBubbleTable($panel) {
		if(!$panel || !$panel.length) {
			return $();
		}
		var $fixedWidthTable = $panel.find('table[width="250"]').first();
		if($fixedWidthTable.length) {
			return $fixedWidthTable;
		}
		return $panel.find('table').filter(function() {
			return isBubbleTableCandidate($(this));
		}).first();
	}

	function isBubbleTableCandidate($table) {
		if(!$table || !$table.length) {
			return false;
		}
		if($table.find('a').length > 0) {
			return false;
		}
		var $firstRow = $table.children('tbody').children('tr').first();
		if(!$firstRow.length) {
			$firstRow = $table.find('tr').first();
		}
		if(!$firstRow.length) {
			return false;
		}
		var $cells = $firstRow.children('td');
		if($cells.length !== 3) {
			return false;
		}
		var centerCellCount = $cells.filter(function() {
			return $(this).find('center').length > 0;
		}).length;
		if(centerCellCount < 2) {
			return false;
		}
		return $table.find('font[face*="arial"], font[face*="tahoma"]').length > 0;
	}

	function setBubbleCenter(panelName, value, fallbackValue, htmlValue, fallbackHtmlValue) {
		setTextOrHtmlWithFallback(getBubbleCenterTarget(panelName), value, fallbackValue, htmlValue, fallbackHtmlValue);
	}

	function setBubble(panelName, slotName, value, fallbackValue, htmlValue, fallbackHtmlValue) {
		setTextOrHtmlWithFallback(getBubbleTarget(panelName, slotName), value, fallbackValue, htmlValue, fallbackHtmlValue);
	}

	function getPanelChatTargets(panelName) {
		var $panel = $('a[name="' + panelName + '"]');
		if(!$panel.length) {
			return $();
		}

		var $bubbleTable = findBubbleTable($panel);
		if(!$bubbleTable.length) {
			return $();
		}

		var $bubbleRow = $bubbleTable.closest('tr');
		if(!$bubbleRow.length) {
			return $();
		}

		var targets = [];
		$bubbleRow.nextAll('tr').each(function() {
			var $row = $(this);
			var $fonts = $row.find('font').filter(function() {
				var text = $.trim($(this).text());
				return text.length > 0 && text.indexOf(':') >= 0;
			});
			$fonts.each(function() {
				targets.push(this);
			});
		});

		if(!targets.length) {
			return $();
		}

		return $(targets);
	}

	function applyPanelChatStrings(panelName, normalizedStrings) {
		var $chatTargets = getPanelChatTargets(panelName);
		for(var chatIndex = 0; chatIndex < $chatTargets.length; chatIndex++) {
			var chatKey = 'panel.' + panelName + '.chat.' + (chatIndex + 1);
			var $target = $chatTargets.eq(chatIndex);
			setTextOrHtmlWithFallback(
				$target,
				null,
				state.originalStrings[chatKey],
				normalizedStrings[chatKey + '.html'],
				state.originalStrings[chatKey + '.html']
			);
		}
	}

	function getPanelExtraTargets(panelName) {
		var $panel = $('a[name="' + panelName + '"]');
		if(!$panel.length) {
			return $();
		}

		var $narrationTarget = getNarrationTarget(panelName);
		var $bubbleTable = findBubbleTable($panel);
		var $chatTargets = getPanelChatTargets(panelName);
		var narrationNode = $narrationTarget.get(0) || null;
		var bubbleNode = $bubbleTable.get(0) || null;
		var bubbleTextNodes = [];
		for(var slotIndex = 0; slotIndex < BUBBLE_SLOTS.length; slotIndex++) {
			var bubbleTargetNode = getBubbleTarget(panelName, BUBBLE_SLOTS[slotIndex]).get(0);
			if(bubbleTargetNode) {
				bubbleTextNodes.push(bubbleTargetNode);
			}
		}
		var chatNodes = $chatTargets.get();
		var targets = [];

		$panel.find('font').each(function() {
			var node = this;
			var $node = $(node);
			var text = $.trim(($node.text() || '').replace(/\u00a0/g, ' '));
			if(!text.length) {
				return;
			}
			if(!/[A-Za-z0-9\u00C0-\u024F\uAC00-\uD7AF]/.test(text)) {
				return;
			}
			if(narrationNode && (node === narrationNode || $.contains(narrationNode, node))) {
				return;
			}
			for(var bubbleIndex = 0; bubbleIndex < bubbleTextNodes.length; bubbleIndex++) {
				var bubbleTextNode = bubbleTextNodes[bubbleIndex];
				if(node === bubbleTextNode || $.contains(bubbleTextNode, node)) {
					return;
				}
			}
			if(bubbleNode && bubbleTextNodes.length === 0 && (node === bubbleNode || $.contains(bubbleNode, node))) {
				return;
			}
			for(var i = 0; i < chatNodes.length; i++) {
				if(node === chatNodes[i] || $.contains(chatNodes[i], node)) {
					return;
				}
			}
			// Exclude clickable links only; panel anchors like <a name="pX"> wrap valid text.
			if($node.closest('a[href]').length > 0) {
				return;
			}
			if($node.find('a[href]').length > 0) {
				return;
			}
			if($node.closest('#' + CONTROL_ID).length > 0) {
				return;
			}
			targets.push(node);
		});

		return $(targets);
	}

	function applyPanelExtraStrings(panelName, normalizedStrings) {
		var $extraTargets = getPanelExtraTargets(panelName);
		for(var extraIndex = 0; extraIndex < $extraTargets.length; extraIndex++) {
			var extraKey = 'panel.' + panelName + '.extra.' + (extraIndex + 1);
			var $target = $extraTargets.eq(extraIndex);
			setTextOrHtmlWithFallback(
				$target,
				null,
				state.originalStrings[extraKey],
				normalizedStrings[extraKey + '.html'],
				state.originalStrings[extraKey + '.html']
			);
		}
	}

	function applyTitleExtraStrings(normalizedStrings) {
		var $titleExtraTargets = getTitleExtraTargets();
		for(var titleExtraIndex = 0; titleExtraIndex < $titleExtraTargets.length; titleExtraIndex++) {
			var titleExtraKey = 'title.extra.' + (titleExtraIndex + 1);
			var $target = $titleExtraTargets.eq(titleExtraIndex);
			setTextOrHtmlWithFallback(
				$target,
				null,
				state.originalStrings[titleExtraKey],
				normalizedStrings[titleExtraKey + '.html'],
				state.originalStrings[titleExtraKey + '.html']
			);
		}
	}

	function readTextIfExists($el) {
		if(!$el || !$el.length) {
			return null;
		}
		return $el.text();
	}

	function readHtmlIfExists($el) {
		if(!$el || !$el.length) {
			return null;
		}
		return $el.html();
	}

	function setTextWithFallback($el, value, fallbackValue) {
		if(!$el || !$el.length) {
			return;
		}
		if(typeof value !== 'string') {
			if(typeof fallbackValue === 'string') {
				$el.text(fallbackValue);
			}
			return;
		}
		$el.text(value);
	}

	function setTextOrHtmlWithFallback($el, value, fallbackValue, htmlValue, fallbackHtmlValue) {
		if(!$el || !$el.length) {
			return;
		}
		if(typeof htmlValue === 'string') {
			$el.html(htmlValue);
			markTranslatedElement($el, didTranslatedHtmlChange(htmlValue, fallbackHtmlValue, fallbackValue));
			return;
		}
		if(typeof value === 'string') {
			$el.text(value);
			markTranslatedElement($el, didTranslatedTextChange(value, fallbackValue, fallbackHtmlValue));
			return;
		}
		if(typeof fallbackHtmlValue === 'string') {
			$el.html(fallbackHtmlValue);
			markTranslatedElement($el, false);
			return;
		}
		if(typeof fallbackValue === 'string') {
			$el.text(fallbackValue);
		}
		markTranslatedElement($el, false);
	}

	function markTranslatedElement($el, isTranslated) {
		if(!$el || !$el.length) {
			return;
		}
		$el.each(function() {
			if(!this || !this.setAttribute || !this.removeAttribute) {
				return;
			}
			if(isTranslated) {
				this.setAttribute(TRANSLATED_ATTR, '1');
				return;
			}
			this.removeAttribute(TRANSLATED_ATTR);
		});
	}

	function didTranslatedTextChange(value, fallbackValue, fallbackHtmlValue) {
		if(typeof fallbackValue === 'string') {
			return normalizeComparableText(value) !== normalizeComparableText(fallbackValue);
		}
		if(typeof fallbackHtmlValue === 'string') {
			return normalizeComparableText(value) !== normalizeComparableText(htmlToText(fallbackHtmlValue));
		}
		return false;
	}

	function didTranslatedHtmlChange(htmlValue, fallbackHtmlValue, fallbackValue) {
		if(typeof fallbackHtmlValue === 'string') {
			return normalizeComparableHtml(htmlValue) !== normalizeComparableHtml(fallbackHtmlValue);
		}
		if(typeof fallbackValue === 'string') {
			return normalizeComparableText(htmlToText(htmlValue)) !== normalizeComparableText(fallbackValue);
		}
		return false;
	}

	function normalizeComparableText(value) {
		return $.trim(String(value || '').replace(/\s+/g, ' '));
	}

	function normalizeComparableHtml(value) {
		return $.trim(String(value || '').replace(/\s+/g, ' '));
	}

	function htmlToText(value) {
		return $('<div></div>').html(String(value || '')).text();
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
			var i18nWebMarker = 'i18n/web/i18n.js';
			var legacyWebMarker = 'web/i18n.js';
			var assetsMarker = 'assets/radd.js';
			var i18nWebIndex = src.indexOf(i18nWebMarker);
			if(i18nWebIndex >= 0) {
				return src.substring(0, i18nWebIndex);
			}
			var legacyWebIndex = src.indexOf(legacyWebMarker);
			if(legacyWebIndex >= 0) {
				return src.substring(0, legacyWebIndex);
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

	function baseName(src) {
		var clean = stripQuery(src);
		var index = clean.lastIndexOf('/');
		return index >= 0 ? clean.substring(index + 1) : clean;
	}

	window.KidRaddI18n = {
		init: init,
		getLanguage: function() { return state.currentLang; },
		setLanguage: function(lang) { setLanguage(lang, true); },
		getConfig: function() { return state.config; },
		getProjectRoot: function() { return state.projectRoot; }
	};
})(window, document, window.jQuery);
