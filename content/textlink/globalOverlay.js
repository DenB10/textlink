(function(aGlobal) {
var { Promise } = Components.utils.import('resource://gre/modules/Promise.jsm', {});
var { inherit } = Components.utils.import('resource://textlink-modules/inherit.jsm', {});
var { prefs } = Components.utils.import('resource://textlink-modules/prefs.js', {});
var { TextLinkConstants } = Components.utils.import('resource://textlink-modules/constants.js', {});
var { TextLinkUtils } = Components.utils.import('resource://textlink-modules/utils.js', {});
var { TextLinkRangeUtils } = Components.utils.import('resource://textlink-modules/range.js', {});
var { TextLinkUserActionHandler } = Components.utils.import('resource://textlink-modules/userActionHandler.js', {});

var TextLinkService = inherit(TextLinkConstants, { 
	utils : TextLinkUtils,
	rangeUtils : new TextLinkRangeUtils(window, function() {
		return gBrowser.contentWindow;
	}),
	
	get window() 
	{
		return window;
	},

	get browser()
	{
		return this.rangeUtils.browser;
	},
 
	get browserURI() 
	{
		if (!this._browserURI) {
			var uri = prefs.getPref('browser.chromeURL');
			if (!uri) {
				try {
					var handler = Components.classes['@mozilla.org/commandlinehandler/general-startup;1?type=browser'].getService(Components.interfaces.nsICmdLineHandler);
					uri = handler.chromeUrlForTask;
				}
				catch(e) {
				}
			}
			if (uri.charAt(uri.length-1) == '/')
				uri = uri.replace(/chrome:\/\/([^\/]+)\/content\//, 'chrome://$1/content/$1.xul');
			this._browserURI = uri;
		}
		return this._browserURI;
	},
	_browserURI : null,
 
	get tooltip() 
	{
		return document.getElementById('textLinkTooltip-selectedURI');
	},
	get tooltipBox()
	{
		return document.getElementById('textLinkTooltip-selectedURI-box');
	},
 
	get contextMenu() 
	{
		return document.getElementById('contentAreaContextMenu');
	},
 
	get popupNode() 
	{
		var popup = this.contextMenu;
		return popup && popup.triggerNode || document.popupNode ;
	},
 
	get bundle() { 
		if (!this._bundle) {
			this._bundle = document.getElementById('textlink-bundle');
		}
		return this._bundle;
	},
	_bundle : null,
 
	forbidDblclick: false,
	mousedownPosition: null,
	forbidDblclickTolerance: 24,
 
	handleEvent : function(aEvent) 
	{
		switch (aEvent.type)
		{
			case 'load':
				this.init();
				return;

			case 'unload':
				this.destroy();
				return;

			case 'popupshowing':
				if (aEvent.currentTarget == this.tooltip) {
					this.buildTooltip(aEvent);
				}
				else if (aEvent.target == this.contextMenu) {
					this.initContextMenu();
				}
				return;

			case 'popuphiding':
				this.destroyTooltip();
				this.stopProgressiveBuildTooltip();
				return;

			case 'TabOpen':
				return this.initTab(aEvent.originalTarget, gBrowser);

			case 'TabClose':
				return this.destroyTab(aEvent.originalTarget);
		}
	},
	
	buildTooltip : function(aEvent) 
	{
		this.stopProgressiveBuildTooltip();
		if (!this.popupNode)
			return;

		var target = this.rangeUtils.getEditableFromChild(this.popupNode);
		var selection = this.rangeUtils.getSelection(target);
		selection = selection ?
			[
				this.popupNode.ownerDocument.defaultView.location.href,
				(function() {
					var positions = [];
					for (let i = 0, maxi = selection.rangeCount; i < maxi; i++)
					{
						let range = selection.getRangeAt(i);
						let position = range.cloneRange();
						position.collapse(true);
						try {
							position.setStartBefore(range.startContainer.ownerDocument.documentElement);
							positions.push(position.toString().length+'+'+range.toString().length);
						}
						catch(e) {
						}
					}
					return positions.join(',');
				})(),
				selection.toString()
			].join('\n') :
			null ;

		if (this.tooltip.lastSelection != selection) {
			this.tooltip.findURIsIterator = this.rangeUtils.getURIRangesIterator(target);
			this.tooltip.foundURIRanges   = [];
			this.tooltip.lastSelection    = selection;
		}

		this.tooltip.buildTimer = window.setInterval(function(aSelf) {
			if (aSelf.updateTooltip()) return;
			window.clearInterval(aSelf.tooltip.buildTimer);
			aSelf.tooltip.buildTimer       = null;
			aSelf.tooltip.foundURIRanges.forEach(function(aRange) {
				aRange.range.detach();
			});
			aSelf.tooltip.foundURIRanges   = [];
			aSelf.tooltip.findURIsIterator = null;
		}, 1, this);
	},
	stopProgressiveBuildTooltip : function()
	{
		if (this.tooltip.buildTimer) {
			window.clearInterval(this.tooltip.buildTimer);
			this.tooltip.buildTimer = null;
		}
	},
	updateTooltip : function()
	{
		this.destroyTooltip();

		var iterator = this.tooltip.findURIsIterator;
		if (iterator) {
			var ranges = this.tooltip.foundURIRanges;
			try {
				ranges.push(iterator.next());
			}
			catch(e if e instanceof StopIteration) {
			}
			catch(e) {
				return false;
			}
			ranges.sort(this.rangeUtils._compareRangePosition);

			this.tooltip.foundURIs = ranges.map(function(aRange) {
				return aRange.uri;
			});
		}

		var fragment = document.createDocumentFragment();
		this.tooltip.foundURIs.forEach(function(aURI) {
			var line = document.createElement('description');
			line.setAttribute('value', aURI);
			fragment.appendChild(line);
		});

		this.tooltipBox.appendChild(fragment);
		return iterator;
	},
	destroyTooltip : function()
	{
		var range = document.createRange();
		range.selectNodeContents(this.tooltipBox);
		range.deleteContents();
		range.detach();
	},
  
	loadURI : function(aURI, aReferrer, aAction, aBrowser, aOpener)
	{
		if (aAction & TextLinkConstants.ACTION_OPEN_IN_CURRENT ||
			aURI.match(/^mailto:/) ||
			aBrowser.localName != 'tabbrowser') {
			aBrowser.loadURI(aURI, aReferrer);
		}
		else if (aAction & TextLinkConstants.ACTION_OPEN_IN_WINDOW) {
			window.openDialog(this.browserURI, '_blank', 'chrome,all,dialog=no', aURI, null, aReferrer);
		}
		else {
			if ('TreeStyleTabService' in window) { // Tree Style Tab
				TreeStyleTabService.readyToOpenChildTab(aOpener);
			}
			aBrowser.loadOneTab(aURI, {
				referrerURI: aReferrer,
				charset: null,
				postData: null,
				inBackground: (aAction & TextLinkConstants.ACTION_OPEN_IN_BACKGROUND_TAB),
				relatedToCurrent: true,
			});
		}
	},
 
	openTextLinkIn : function(aAction, aTarget) 
	{
		var frame = this.rangeUtils.getCurrentFrame();
		var self = this;
		return this.rangeUtils.getSelectionURIRanges(this.rangeUtils.getEditableFromChild(aTarget) || frame)
			.then(function(aRanges) {
				if (aRanges.length)
					return self.openTextLinkInPostProcess(aAction, aTarget, aRanges);
			});
	},
	openTextLinkInPostProcess : function(aAction, aTarget, aRanges)
	{
		var selections = [];
		var uris = aRanges.map(function(aRange) {
				if (selections.indexOf(aRange.selection) < 0) {
					selections.push(aRange.selection);
					aRange.selection.removeAllRanges();
				}
				aRange.selection.addRange(aRange.range);
				return aRange.uri;
			});
		selections = void(0);

		if (aAction == TextLinkConstants.ACTION_COPY) {
			if (uris.length > 1) uris.push('');
			TextLinkUtils.setClipBoard(uris.join('\r\n'));
			return;
		}

		if (aAction === void(0))
			aAction = TextLinkConstants.ACTION_OPEN_IN_CURRENT;

		if (
			uris.length > 1 &&
			(aAction == TextLinkConstants.ACTION_OPEN_IN_TAB ||
			aAction == TextLinkConstants.ACTION_OPEN_IN_BACKGROUND_TAB) &&
			!PlacesUIUtils._confirmOpenInTabs(uris.length)
			) {
			return;
		}

		if (aAction == TextLinkConstants.ACTION_OPEN_IN_WINDOW) {
			uris.forEach(function(aURI) {
				window.open(aURI);
			});
			return;
		}

		if (aAction == TextLinkConstants.ACTION_OPEN_IN_CURRENT && uris.length == 1) {
			this.browser.loadURI(uris[0]);
			return;
		}
		this.openTextLinkInTabs(uris, aAction);
	},
	openTextLinkInTabs : function(aURIs, aAction)
	{
		var selectTab;
		var tabs = [];
		var b = this.browser;
		aURIs.forEach(function(aURI, aIndex) {
			if (
				aIndex == 0 &&
				(
					(aAction == TextLinkConstants.ACTION_OPEN_IN_CURRENT) ||
					(b.currentURI && (window.isBlankPageURL ? window.isBlankPageURL(b.currentURI.spec) : (b.currentURI.spec == 'about:blank')))
				)
				) {
				if ('TreeStyleTabService' in window) // Tree Style Tab
					TreeStyleTabService.readyToOpenChildTab(b, true);
				b.loadURI(aURI);
				if (!selectTab) selectTab = b.selectedTab;
				tabs.push(b.selectedTabs);
			}
			else {
				if ('TreeStyleTabService' in window && !TreeStyleTabService.checkToOpenChildTab(b)) // Tree Style Tab
					TreeStyleTabService.readyToOpenChildTab(b, true);
				let tab = b.addTab(aURI, {relatedToCurrent: true});
				if (!selectTab) selectTab = tab;
				tabs.push(tab);
			}
		}, this);

		if ('TreeStyleTabService' in window) // Tree Style Tab
			TreeStyleTabService.stopToOpenChildTab(b);

		if (selectTab &&
			aAction != TextLinkConstants.ACTION_OPEN_IN_BACKGROUND_TAB) {
			b.selectedTab = selectTab;
			if ('scrollTabbarToTab' in b) b.scrollTabbarToTab(selectTab);
			if ('setFocusInternal' in b) b.setFocusInternal();
		}

		return tabs;
	},
 
	init : function() 
	{
		prefs.addPrefListener(this);
		this.migratePrefs();
		this.initPrefs();

		window.removeEventListener('load', this, false);
		window.addEventListener('unload', this, false);

		this.contextMenu.addEventListener('popupshowing', this, false);

		if (prefs.getPref('browser.tabs.remote.autostart')) {
			window.messageManager.loadFrameScript(TextLinkConstants.CONTENT_SCRIPT, true);
		}
		else {
			this.userActionHandler = new TextLinkUserActionHandler(window, gBrowser);
			this.userActionHandler.loadURI = (function(aURI, aReferrer, aAction, aOpener) {
				aReferrer = aReferrer && TextLinkUtils.makeURIFromSpec(aReferrer);
				this.loadURI(aURI, aReferrer, aAction, gBrowser, aOpener);
			}).bind(this);
		}

		Array.forEach(gBrowser.tabContainer.childNodes, function(aTab) {
			this.initTab(aTab, gBrowser);
		}, this);
		gBrowser.tabContainer.addEventListener('TabOpen',  this, true);
		gBrowser.tabContainer.addEventListener('TabClose', this, true);

		// hacks.js
		this.overrideExtensions();
	},
	
	initTab : function(aTab, aTabBrowser) 
	{
		aTab.__textlink__contentBridge = new TextLinkContentBridge(aTab, aTabBrowser);
	},
 
	initContextMenu : function() 
	{
		var items = [
				'context-openTextLink-current',
				'context-openTextLink-window',
				'context-openTextLink-tab',
				'context-openTextLink-copy'
			];
		var self = this;

		var target = this.rangeUtils.getEditableFromChild(this.popupNode);
		var selection = this.rangeUtils.getSelection(target);
		selection = selection && selection.toString();
		if (this.lastSelectionForContextMenu) {
			if (this.lastSelectionForContextMenu == selection)
				return;
		}
		this.lastSelectionForContextMenu = selection;

		items.forEach(function(aID) {
			gContextMenu.showItem(aID, false);
			var item = self.setLabel(aID, 'label-processing');
			if (item) {
				item.setAttribute('disabled', true);
				item.setAttribute('uri-finding', true);
				item.classList.add('menuitem-iconic');
			}
		});

		if (
			(
				!TextLinkUtils.contextItemCurrent &&
				!TextLinkUtils.contextItemWindow &&
				!TextLinkUtils.contextItemTab &&
				!TextLinkUtils.contextItemCopy
			) ||
			(
				(
					!gContextMenu.isTextSelected ||
					!gContextMenu.isContentSelected
				) &&
				(
					!gContextMenu.onTextInput ||
					!selection
				)
			)
			)
			return;

		gContextMenu.showItem('context-openTextLink-current',
			TextLinkUtils.contextItemCurrent);
		gContextMenu.showItem('context-openTextLink-window',
			TextLinkUtils.contextItemWindow);
		gContextMenu.showItem('context-openTextLink-tab',
			TextLinkUtils.contextItemTab);
		gContextMenu.showItem('context-openTextLink-copy',
			TextLinkUtils.contextItemCopy);

		var check = function() {
				if (!gContextMenu) throw new Error('context menu is already closed');
			};

		var uris = [];
		var found = {};
		this.rangeUtils.getFirstSelectionURIRange(target, false, null, check)
			.then(function(aFirstRange) {
				check();
				if (aFirstRange) {
					uris.push(aFirstRange.uri);
					aFirstRange.range.detach();
					found[aFirstRange.uri] = true;
				}
				return self.rangeUtils.getLastSelectionURIRange(target, false, found, check);
			})
			.then(function(aLastRange) {
				check();
				if (aLastRange) {
					uris.push(aLastRange.uri);
					aLastRange.range.detach();
				}

				if (uris.length) {
					var uri1, uri2;

					uri1 = uris[0];
					if (uri1.length > 20) uri1 = uri1.substring(0, 15).replace(/\.+$/, '')+'..';

					if (uris.length > 1) {
						uri2 = uris[uris.length-1];
						if (uri2.length > 20) uri2 = uri2.substring(0, 15).replace(/\.+$/, '')+'..';
					}

					var targets = [/\%s1/i, uri1, /\%s2/i, uri2, /\%s/i, uri1];
					var attr = (uris.length > 1) ? 'label-base-multiple' : 'label-base-single' ;

					items.forEach(function(aID) {
						var item = self.setLabel(aID, attr, targets);
						if (item) {
							item.removeAttribute('disabled');
							item.removeAttribute('uri-finding');
							item.classList.remove('menuitem-iconic');
						}
					});
				}
				else {
					items.forEach(function(aID) {
						var item = self.setLabel(aID, 'label-disabled');
						if (item) {
							item.removeAttribute('uri-finding');
							item.classList.remove('menuitem-iconic');
						}
					});
				}
			})
			.catch(function(e) {
				self.lastSelectionForContextMenu = null;
			});
	},
	setLabel : function(aID, aAttr, aTargets)
	{
		var item = document.getElementById(aID);
		if (!item) return;
		var base = item.getAttribute(aAttr);
		if (aTargets) {
			for (var i = 0; i < aTargets.length; i+=2)
				base = base.replace(aTargets[i], aTargets[i+1]);
		}

		item.setAttribute('label', base);

		return item;
	},
  
	destroy : function() 
	{
		prefs.removePrefListener(this);

		window.removeEventListener('unload', this, false);

		this.contextMenu.removeEventListener('popupshowing', this, false);

		gBrowser.tabContainer.removeEventListener('TabOpen',  this, true);
		gBrowser.tabContainer.removeEventListener('TabClose', this, true);

		if (prefs.getPref('browser.tabs.remote.autostart')) {
			window.messageManager.sendAsyncMessage(this.MESSAGE_TYPE, {
				command : this.COMMAND_SHUTDOWN,
				params  : {}
			});
		}
		else {
			this.userActionHandler.destroy();
		}

		Array.forEach(gBrowser.tabContainer.childNodes, function(aTab) {
			this.destroyTab(aTab);
		}, this);
	},
	
	destroyTab : function(aTab) 
	{
		if (aTab.__textlink__contentBridge) {
			aTab.__textlink__contentBridge.destroy();
			delete aTab.__textlink__contentBridge;
		}
	},

	observe : function(aSubject, aTopic, aData) 
	{
		if (aTopic != 'nsPref:changed') return;

		var value = prefs.getPref(aData);
		TextLinkUtils.onPrefValueChanged(aData, value);

		var configs = {};
		configs[aData] = value;
		window.messageManager.broadcastAsyncMessage(this.MESSAGE_TYPE, {
			command : TextLinkConstants.COMMAND_NOTIFY_CONFIG_UPDATED,
			config  : configs
		});
	},
	domains : [
		'textlink.',
		'network.enableIDN',
		'network.IDN.blacklist_chars'
	],

	get prefKeys() {
		if (!this._prefKeys) {
			this._prefKeys = [
				'network.enableIDN',
				'network.IDN.blacklist_chars',
				'textlink.scheme',
				'textlink.scheme.fixup.table',
				'textlink.scheme.fixup.default',
				'textlink.find_click_point.strict',
				'textlink.relative.enabled',
				'textlink.multibyte.enabled',
				'textlink.multiline.enabled',
				'textlink.idn.enabled',
				'textlink.idn.scheme',
				'textlink.i18nPath.enabled',
				'textlink.gTLD',
				'textlink.ccTLD',
				'textlink.IDN_TLD',
				'textlink.extraTLD',
				'textlink.idn.lazyDetection.separators',
				'textlink.part.exception.whole',
				'textlink.part.exception.start',
				'textlink.part.exception.end',
				'textlink.contextmenu.openTextLink.current',
				'textlink.contextmenu.openTextLink.window',
				'textlink.contextmenu.openTextLink.tab',
				'textlink.contextmenu.openTextLink.copy'
			];
			this._prefKeys = this._prefKeys.concat(prefs.getDescendant('textlink.actions.'));
		}
		return this._prefKeys;
	},
	initPrefs : function() 
	{
		this.prefKeys.sort().forEach(function(aPref) {
			this.observe(null, 'nsPref:changed', aPref);
		}, this);
	},
 
	migratePrefs : function()
	{
		// migrate old prefs
		var orientalPrefs = [];
		switch (prefs.getPref('textlink.prefsVersion'))
		{
			case 0:
				[
					'textlink.schemer:textlink.scheme',
					'textlink.schemer.fixup.table:textlink.scheme.fixup.table',
					'textlink.schemer.fixup.default:textlink.scheme.fixup.default'
				].forEach(function(aPref) {
					var keys = aPref.split(':');
					var value = prefs.getPref(keys[0]);
					if (value !== null) {
						prefs.setPref(keys[1], value);
						prefs.clearPref(keys[0]);
					}
				}, this);
			default:
				break;
		}
		prefs.setPref('textlink.prefsVersion', this.kPREF_VERSION);
	}
   
}); 
aGlobal.TextLinkService = TextLinkService;


function TextLinkContentBridge(aTab, aTabBrowser) 
{
	this.init(aTab, aTabBrowser);
}
TextLinkContentBridge.prototype = inherit(TextLinkConstants, {
	mTab : null,
	mTabBrowser : null,
	init : function TLCB_init(aTab, aTabBrowser)
	{
		this.mTab = aTab;
		this.mTabBrowser = aTabBrowser;
		this.handleMessage = this.handleMessage.bind(this);

		var manager = window.messageManager;
		manager.addMessageListener(this.MESSAGE_TYPE, this.handleMessage);

		this.mTab.addEventListener('TabRemotenessChange', this, false);

		this.notifyConfigUpdatedMessage();
	},
	destroy : function TLCB_destroy()
	{
		this.mTab.removeEventListener('TabRemotenessChange', this, false);

		var manager = window.messageManager;
		manager.removeMessageListener(this.MESSAGE_TYPE, this.handleMessage);

		delete this.mTab;
		delete this.mTabBrowser;
	},
	sendAsyncCommand : function TLCB_sendAsyncCommand(aCommandType, aCommandParams)
	{
		var manager = this.mTab.linkedBrowser.messageManager;
		manager.sendAsyncMessage(this.MESSAGE_TYPE, {
			command : aCommandType,
			params  : aCommandParams || {}
		});
	},
	handleMessage : function TLCB_handleMessage(aMessage)
	{
		dump('*********************handleMessage*******************\n');
		dump('TARGET IS: '+aMessage.target.localName+'\n');
		dump(JSON.stringify(aMessage.json)+'\n');

		if (aMessage.target != this.mTab.linkedBrowser)
		  return;

		switch (aMessage.json.command)
		{
			case this.COMMAND_LOAD_URI:
				var params = aMessage.json;
				var referrer = params.referrer && TextLinkUtils.makeURIFromSpec(params.referrer);
				TextLinkService.loadURI(params.uri, referrer, params.action, this.mTabBrowser, this.mTab);
				return;
		}
	},
	handleEvent: function TLCB_handleEvent(aEvent)
	{
		switch (aEvent.type)
		{
			case 'TabRemotenessChange':
				return this.notifyConfigUpdatedMessage();
		}
	},
	notifyConfigUpdatedMessage : function TLCB_notifyConfigUpdatedMessage()
	{
		var configs = {};
		TextLinkService.prefKeys.forEach(function(aKey) {
			configs[aKey] = prefs.getPref(aKey);
		});
		this.mTab.linkedBrowser.messageManager.sendAsyncMessage(this.MESSAGE_TYPE, {
			command : this.COMMAND_NOTIFY_CONFIG_UPDATED,
			config  : configs
		});
	}
});
aGlobal.TextLinkContentBridge = TextLinkContentBridge;

})(this);
 
