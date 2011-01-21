/* ***** BEGIN LICENSE BLOCK ***** 
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Text Link.
 *
 * The Initial Developer of the Original Code is SHIMODA Hiroshi.
 * Portions created by the Initial Developer are Copyright (C) 2002-2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s): SHIMODA Hiroshi <piro@p.club.ne.jp>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ******/
 
const EXPORTED_SYMBOLS = ['TextLinkUtils']; 

const Cc = Components.classes;
const Ci = Components.interfaces;

Components.utils.import('resource://textlink-modules/prefs.js');
 
var TextLinkUtils = { 
	prefs : prefs,
	
	schemerFixupDefault : 'http', 
	strict              : true,
	contextItemCurrent  : true,
	contextItemWindow   : true,
	contextItemTab      : true,
	contextItemCopy     : true,

	multilineURIEnabled : false,

	get schemer()
	{
		return this._schemer;
	},
	set schemer(val)
	{
		this._schemer = val;

		this._schemers = this.schemer
			.replace(/([\(\)\+\.\{\}])/g, '\\$1')
			.replace(/\?/g, '.')
			.replace(/\*/g, '.+')
			.split(/[,\| \n\r\t]+/);

		this.invalidatePatterns();
		return val;
	},
	_schemer : '',
	get schemers()
	{
		return this._schemers.concat(this._fixupSchemers);
	},
	_schemers : [],
	_fixupSchemers : [],

	get schemerFixupTable()
	{
		return this._schemerFixupTable;
	},
	set schemerFixupTable(val)
	{
		this._schemerFixupTable = val;

		this._fixupTable = this._schemerFixupTable
					.replace(/(\s*[^:\s]+)\s*=>\s*([^:\s]+)(\s*([,\| \n\r\t]|$))/g, '$1:=>$2:$3');
		this._fixupTargets = this._fixupTable
					.replace(/\s*=>\s*[^,\| \n\r\t]+|\s*=>\s*[^,\| \n\r\t]+$/g, '')
					.replace(/([\(\)\+\.\{\}])/g, '\\$1')
					.replace(/\?/g, '.')
					.replace(/\*/g, '.+')
					.split(/\s*[,\| \n\r\t]+\s*/);
		this._fixupSchemers = this._fixupTargets
					.filter(function(aTarget) {
						return /:$/.test(aTarget);
					})
					.map(function(aTarget) {
						return aTarget.replace(/:$/, '');
					});
		this._fixupTargetsPattern = this._fixupTargets.join('|');
		this._fixupTargetsRegExp = new RegExp('^('+this._fixupTargetsPattern+')');

		this.invalidatePatterns();
		return val;
	},
	_schemerFixupTable : '',

	get relativePathEnabled()
	{
		return this._relativePathEnabled;
	},
	set relativePathEnabled(val)
	{
		this._relativePathEnabled = val;
		this.invalidatePatterns();
		return val;
	},
	_relativePathEnabled : false,

	get multibyteEnabled()
	{
		return this._multibyteEnabled;
	},
	set multibyteEnabled(val)
	{
		this._multibyteEnabled = val;
		this.invalidatePatterns();
		return val;
	},
	_multibyteEnabled : true,

	get IDNEnabled()
	{
		return this._IDNEnabled;
	},
	set IDNEnabled(val)
	{
		this._IDNEnabled = val;
		this.invalidatePatterns();
		return val;
	},
	_IDNEnabled : true,

	get i18nPathEnabled()
	{
		return this._i18nPathEnabled;
	},
	set i18nPathEnabled(val)
	{
		this._i18nPathEnabled = val;
		this.invalidatePatterns();
		return val;
	},
	_i18nPathEnabled : false,
 
	ACTION_DISABLED               : 0, 
	ACTION_STEALTH                : 1,
	ACTION_SELECT                 : 2,
	ACTION_OPEN_IN_CURRENT        : 4,
	ACTION_OPEN_IN_WINDOW         : 8,
	ACTION_OPEN_IN_TAB            : 16,
	ACTION_OPEN_IN_BACKGROUND_TAB : 32,
	ACTION_COPY                   : 1024,

	actions : {},
 
// regexp 
	
	get URIPattern() 
	{
		if (!this._URIPattern) {
			this._URIPattern = this.URIPattern_base
				.replace(
					/%SCHEMER_PATTERN%/g,
					'(?:'+this.schemers.join('|')+'):'
				)
				.replace(
					/%PART_PATTERN%/g,
					this.URIPattern_part
				)
				.replace(
					/%LAZY_DOMAIN_PATTERN%/g,
					this.getDomainPattern(this.kDOMAIN_LAZY)
				)
				.replace(
					/%DOMAIN_PATTERN%/g,
					this.getDomainPattern()
				);
		}

		return this._URIPattern;
	},
	_URIPattern : null,
 
	get URIPatternRelative() 
	{
		if (!this._URIPatternRelative) {
			this._URIPatternRelative = this.URIPatternRelative_base
				.replace(
					/%PART_PATTERN%/g,
					this.URIPattern_part
				);
		}

		return this._URIPatternRelative;
	},
	_URIPatternRelative : null,
 
	get URIPatternMultibyte() 
	{
		if (!this._URIPatternMultibyte) {
			this._URIPatternMultibyte = this.URIPatternMultibyte_base
				.replace(
					/%SCHEMER_PATTERN%/g,
					'(?:'+
					this.schemers.map(function(aSchemer) {
						return aSchemer+'|'+this.convertHalfWidthToFullWidth(aSchemer);
					}, this).join('|')+
					')[:\uff1a]'
				)
				.replace(
					/%PART_PATTERN%/g,
					this.URIPatternMultibyte_part
				)
				.replace(
					/%LAZY_DOMAIN_PATTERN%/g,
					this.getDomainPattern(this.kDOMAIN_MULTIBYTE | this.kDOMAIN_LAZY)
				)
				.replace(
					/%DOMAIN_PATTERN%/g,
					this.getDomainPattern(this.kDOMAIN_MULTIBYTE)
				);
		}

		return this._URIPatternMultibyte;
	},
	_URIPatternMultibyte : null,
 
	get URIPatternMultibyteRelative() 
	{
		if (!this._URIPatternMultibyteRelative) {
			this._URIPatternMultibyteRelative = this.URIPatternMultibyteRelative_base
				.replace(
					/%PART_PATTERN%/g,
					this.URIPatternMultibyte_part
				);
		}

		return this._URIPatternMultibyteRelative;
	},
	_URIPatternMultibyteRelative : null,
 
	getDomainPattern : function(aOptionsFlag) 
	{
		aOptionsFlag = aOptionsFlag || 0;
		var multibyte = aOptionsFlag & this.kDOMAIN_MULTIBYTE;
		var pattern = this._domainPatterns[aOptionsFlag];
		if (!pattern) {
			if (this.IDNEnabled) {
				let forbiddenCharacters = this.kStringprepForbiddenCharacters+
											this.kIDNDomainSeparators+
											':/\uff1a\uff0f';
				if (aOptionsFlag & this.kDOMAIN_LAZY)
					forbiddenCharacters += this.prefs.getPref('textlink.idn.lazyDetection.separators');
				let part = '[^'+
							forbiddenCharacters+
							(this.prefs.getPref('network.IDN.blacklist_chars') || '')
								.replace(new RegExp('['+forbiddenCharacters+']', 'g'), '')
								.replace(/(.)\1+/g, '$1')
								.replace(/./g, function(aChar) {
									return '\\u'+(('00'+aChar.charCodeAt(0).toString(16)).substr(-4, 4));
								})+
							']+';
				pattern = part + '(?:[' + this.kIDNDomainSeparators + ']' + part + ')*';
			}
			else if (multibyte) {
				let part = '[0-9a-z-\uff10-\uff19\uff41-\uff5a\uff21-\uff3a\uff0d]+';
				pattern = part + '(?:[' + this.kMultibyteDomainSeparators + ']' + part + ')*';
			}
			else {
				let part = '[0-9a-z-]+';
				pattern = part + '(?:' + this.kDomainSeparators + part + ')*';
			}
			pattern += this.getTLDPattern(multibyte);

			this._domainPatterns[aOptionsFlag] = pattern;
		}
		return pattern;
	},
	_domainPatterns : {},
	kDOMAIN_MULTIBYTE : (1 << 0),
	kDOMAIN_LAZY      : (1 << 1),
 
	kDomainSeparators          : '\\.', 
	kMultibyteDomainSeparators : '\\.\uff0e',
	kIDNDomainSeparators       : '\\.\u3002\uff0e',
 
	getTLDPattern : function(aMultibyte) 
	{
		var TLD = this.topLevelDomains;
		var halfWidthTLDPattern = '(?:'+TLD.join('|')+')\\b';
		var TLDPattern = aMultibyte ?
						'(?:' +
						[halfWidthTLDPattern]
							.concat(TLD.map(this.convertHalfWidthToFullWidth, this))
							.join('|') +
						')' :
						halfWidthTLDPattern ;
		return (this.IDNEnabled ?
					'['+this.kIDNDomainSeparators+']' :
				aMultibyte ?
					'['+this.kMultibyteDomainSeparators+']' :
					this.kDomainSeparators
				)+
				TLDPattern;
	},
 
	// Forbidden characters in IDN are defined by RFC 3491. 
	//   http://www.ietf.org/rfc/rfc3491.txt
	//   http://www5d.biglobe.ne.jp/~stssk/rfc/rfc3491j.html
	// and
	//   http://www.ietf.org/rfc/rfc3454.txt
	//   http://www.jdna.jp/survey/rfc/rfc3454j.html
	kStringprepForbiddenCharacters : '\\u0000-\\u0020\\u0080-\\u00A0\\u0340\\u0341\\u06DD\\u070F\\u1680\\u180E\\u2000-\\u200F\\u2028-\\u202F\\u205F-\\u2063\\u206A-\\u206F\\u2FF0-\\u2FFB\\u3000\\uD800-\\uF8FF\\uFDD0-\\uFDEF\\uFEFF\\uFFF9-\\uFFFF',
	kStringprepReplaceToNothingRegExp : /[\u00AD\u034F\u1806\u180B-\u180D\u200B-\u200D\u2060\uFE00-\uFE0F\uFEFF]/g,
 
	URIPattern_base : '\\(?(%SCHEMER_PATTERN%(?://)?%DOMAIN_PATTERN%(?:/(?:%PART_PATTERN%)?)?|%LAZY_DOMAIN_PATTERN%(?:/%PART_PATTERN%)?)', 
	URIPatternRelative_base : '%PART_PATTERN%(?:\\.|/)%PART_PATTERN%',
 
	URIPatternMultibyte_base : '[\\(\uff08]?(%SCHEMER_PATTERN%(?://|\uff0f\uff0f)?%DOMAIN_PATTERN%(?:[/\uff0f](?:%PART_PATTERN%)?)?|%LAZY_DOMAIN_PATTERN%(?:[/\uff0f](?:%PART_PATTERN%)?)?)', 
	URIPatternMultibyteRelative_base : '%PART_PATTERN%[\\.\uff0e/\uff0f]%PART_PATTERN%',
 
	kSchemerPattern : '[\\*\\+a-z0-9_]+:', 
	kSchemerPatternMultibyte : '[\\*\\+a-z0-9_\uff41-\uff5a\uff21-\uff3a\uff10-\uff19\uff3f]+[:\uff1a]',

	kURIPattern_part : '[-_\\.!~*\'()a-z0-9;/?:@&=+$,%#]+',
	kURIPatternMultibyte_part : '[-_\\.!~*\'()a-z0-9;/?:@&=+$,%#\u301c\uff0d\uff3f\uff0e\uff01\uff5e\uffe3\uff0a\u2019\uff08\uff09\uff41-\uff5a\uff21-\uff3a\uff10-\uff19\uff1b\uff0f\uff1f\uff1a\uff20\uff06\uff1d\uff0b\uff04\uff0c\uff05\uff03]+',
 
	get URIPattern_part() 
	{
		if (!this._URIPattern_part) {
			this._URIPattern_part = this.i18nPathEnabled ?
				'[^'+this.kStringprepForbiddenCharacters+']+' :
				this.kURIPattern_part ;
		}
		return this._URIPattern_part;
	},
	_URIPattern_part : null,
	get URIPatternMultibyte_part()
	{
		if (!this._URIPatternMultibyte_part) {
			this._URIPatternMultibyte_part = this.i18nPathEnabled ?
				'[^'+this.kStringprepForbiddenCharacters+']+' :
				this.kURIPatternMultibyte_part ;
		}
		return this._URIPatternMultibyte_part;
	},
	_URIPatternMultibyte_part : null,
 
	get findURIPatternPart() 
	{
		if (!this._findURIPatternPart) {
			this._findURIPatternPart = this.i18nPathEnabled || this.IDNEnabled ?
				'[^'+this.kStringprepForbiddenCharacters+']+' :
				this.kURIPattern_part ;
		}
		return this._findURIPatternPart;
	},
	_findURIPatternPart : null,
	get findURIPatternMultibytePart()
	{
		if (!this._findURIPatternMultibytePart) {
			this._findURIPatternMultibytePart = this.i18nPathEnabled || this.IDNEnabled ?
				'[^'+this.kStringprepForbiddenCharacters+']+' :
				this.kURIPatternMultibyte_part ;
		}
		return this._findURIPatternMultibytePart;
	},
	_findURIPatternMultibytePart : null,
 
	get topLevelDomains() 
	{
		if (!this._topLevelDomains) {
			let TLD = [
					this.prefs.getPref('textlink.gTLD'),
					this.prefs.getPref('textlink.ccTLD'),
					this.prefs.getPref('textlink.extraTLD')
				];
			if (this.IDNEnabled)
				TLD .push(this.prefs.getPref('textlink.IDN_TLD'));
			this._topLevelDomains = this.cleanUpArray(TLD.join(' ').replace(/^\s+|\s+$/g, '').split(/\s+/))
										.reverse(); // this is required to match "com" instead of "co".
		}
		return this._topLevelDomains;
	},
	_topLevelDomains : null,
 
	get URIExceptionPattern() 
	{
		this._updateURIExceptionPattern();
		return this._URIExceptionPattern;
	},
	get URIExceptionPattern_start()
	{
		this._updateURIExceptionPattern();
		return this._URIExceptionPattern_start;
	},
	get URIExceptionPattern_end()
	{
		this._updateURIExceptionPattern();
		return this._URIExceptionPattern_end;
	},
	_updateURIExceptionPattern : function()
	{
		if (this._URIExceptionPattern) return;
		var regexp = this.prefs.getPref('textlink.part.exception');
		try {
			this._URIExceptionPattern = new RegExp('^('+regexp+')$', 'i');
			this._URIExceptionPattern_start = new RegExp('^('+regexp+')', 'i');
			this._URIExceptionPattern_end = new RegExp('('+regexp+')$', 'i');
		}
		catch(e) {
			this._URIExceptionPattern = /[^\w\W]/;
			this._URIExceptionPattern_start = /[^\w\W]/;
			this._URIExceptionPattern_end = /[^\w\W]/;
		}
	},
	_URIExceptionPattern : null,
	_URIExceptionPattern_start : null,
	_URIExceptionPattern_end : null,
 
	invalidatePatterns : function() 
	{
		this._schemerRegExp = null;

		this._domainPatterns = {};
		this._topLevelDomains = null;
		this._topLevelDomainsRegExp = null;

		this._findURIPatternPart = null;
		this._findURIPatternMultibytePart = null;

		this._URIPattern_part = null;
		this._URIPattern = null;
		this._URIPatternMultibyte_part = null;
		this._URIPatternMultibyte = null;

		this._URIMatchingRegExp = null;
		this._URIMatchingRegExp_fromHead = null;
		this._URIPartFinderRegExp_start = null;
		this._URIPartFinderRegExp_end = null;
	},
  
	// XPConnect 
	
	get IOService() 
	{
		if (!this._IOService) {
			this._IOService = Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService);
		}
		return this._IOService;
	},
	_IOService : null,
 
	get URIFixup() 
	{
		if (!this._URIFixup) {
			this._URIFixup = Cc['@mozilla.org/docshell/urifixup;1'].getService(Ci.nsIURIFixup);
		}
		return this._URIFixup;
	},
	_URIFixup : null,
  
// utilities 
	
	evaluateXPath : function(aExpression, aContext, aType) 
	{
		if (!aType) aType = Ci.nsIDOMXPathResult.ORDERED_NODE_SNAPSHOT_TYPE;
		try {
			var xpathResult = (aContext.ownerDocument || aContext || this.document).evaluate(
					aExpression,
					(aContext || this.document),
					this.NSResolver,
					aType,
					null
				);
		}
		catch(e) {
			return {
				singleNodeValue : null,
				snapshotLength  : 0,
				snapshotItem    : function() {
					return null
				}
			};
		}
		return xpathResult;
	},
 
	evalInSandbox : function(aCode, aOwner) 
	{
		try {
			var sandbox = new Components.utils.Sandbox(aOwner || 'about:blank');
			return Components.utils.evalInSandbox(aCode, sandbox);
		}
		catch(e) {
		}
		return void(0);
	},
 
	setClipBoard : function(aString) 
	{
		Cc['@mozilla.org/widget/clipboardhelper;1']
			.getService(Ci.nsIClipboardHelper)
			.copyString(aString);
	},
 
	cleanUpArray : function(aArray) 
	{
		return aArray.slice(0)
					.sort()
					.join('\n')
					.replace(/^(.+)$\n(\1\n)+/gm, '$1\n')
					.split('\n');
	},
  
// string operations 
	
	// from http://taken.s101.xrea.com/blog/article.php?id=510
	convertFullWidthToHalfWidth : function(aString) 
	{
		return aString.replace(this.fullWidthRegExp, this.f2h)
					.replace(/\u301c/g, '~'); // another version of tilde
	},
	fullWidthRegExp : /[\uFF01\uFF02\uFF03\uFF04\uFF05\uFF06\uFF07\uFF08\uFF09\uFF0A\uFF0B\uFF0C\uFF0D\uFF0E\uFF0F\uFF10\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16\uFF17\uFF18\uFF19\uFF1A\uFF1B\uFF1C\uFF1D\uFF1E\uFF1F\uFF20\uFF21\uFF22\uFF23\uFF24\uFF25\uFF26\uFF27\uFF28\uFF29\uFF2A\uFF2B\uFF2C\uFF2D\uFF2E\uFF2F\uFF30\uFF31\uFF32\uFF33\uFF34\uFF35\uFF36\uFF37\uFF38\uFF39\uFF3A\uFF3B\uFF3C\uFF3D\uFF3E\uFF3F\uFF40\uFF41\uFF42\uFF43\uFF44\uFF45\uFF46\uFF47\uFF48\uFF49\uFF4A\uFF4B\uFF4C\uFF4D\uFF4E\uFF4F\uFF50\uFF51\uFF52\uFF53\uFF54\uFF55\uFF56\uFF57\uFF58\uFF59\uFF5A\uFF5B\uFF5C\uFF5D\uFF5E]/g,
	f2h : function() {
		var str = arguments[0];
		var code = str.charCodeAt(0);
		code &= 0x007F;
		code += 0x0020;
		return String.fromCharCode(code);
	},

	convertHalfWidthToFullWidth : function(aString)
	{
		return aString.replace(this.halfWidthRegExp, this.h2f);
	},
	halfWidthRegExp : /[!"#$%&'\(\)\*\+,-\.\/0123456789:;<=>\?@ABCDEFGHIJKLMNOPQRSTUVWXYZ\[\\\]\^_`abcdefghijklmnopqrstuvwxyz\{\|\}~]/g,
	h2f : function() {
		var str = arguments[0];
		var code = str.charCodeAt(0);
		code += 0xFF00;
		code -= 0x0020;
		return String.fromCharCode(code);
	},
  
// uri operations 
	
	makeURIFromSpec : function(aURI) 
	{
		try {
			var newURI;
			aURI = aURI || '';
			if (aURI && String(aURI).match(/^file:/)) {
				var fileHandler = this.IOService.getProtocolHandler('file').QueryInterface(Components.interfaces.nsIFileProtocolHandler);
				var tempLocalFile = fileHandler.getFileFromURLSpec(aURI);
				newURI = this.IOService.newFileURI(tempLocalFile);
			}
			else {
				newURI = this.IOService.newURI(aURI, null, null);
			}

			return newURI;
		}
		catch(e){
		}
		return null;
	},
 
	matchURIRegExp : function(aString) 
	{
		this._updateURIRegExp();
		return aString.match(this._URIMatchingRegExp);
	},
	isHeadOfNewURI : function(aString)
	{
		this._updateURIRegExp();
		var match = aString.match(this._URIMatchingRegExp_fromHead);
		match = match ? match[1] : '' ;
		return this.hasLoadableSchemer(match) ? match == aString : false ;
	},
	_URIMatchingRegExp : null,
	_URIMatchingRegExp_fromHead : null,
	_updateURIRegExp : function()
	{
		if (this._URIMatchingRegExp) return;
		var regexp = [];
		if (this.multibyteEnabled) {
			this._URIMatchingRegExp_fromHead = new RegExp(this.URIPatternMultibyte, 'i');
			regexp.push(this.URIPatternMultibyte);
			if (this.relativePathEnabled) regexp.push(this.URIPatternMultibyteRelative);
		}
		else {
			this._URIMatchingRegExp_fromHead = new RegExp(this.URIPattern, 'i');
			regexp.push(this.URIPattern);
			if (this.relativePathEnabled) regexp.push(this.URIPatternRelative);
		}
		this._URIMatchingRegExp = new RegExp(regexp.join('|'), 'ig');
	},
 
	getURIPartFromStart : function(aString, aExcludeURIHead) 
	{
		this._updateURIPartFinderRegExp();
		var match = aString.match(this._URIPartFinderRegExp_start);
		var part = match ? match[1] : '' ;
		return (!aExcludeURIHead || !this.isHeadOfNewURI(part)) ? part : '' ;
	},
	getURIPartFromEnd : function(aString)
	{
		this._updateURIPartFinderRegExp();
		var match = aString.match(this._URIPartFinderRegExp_end);
		return match ? match[1] : '' ;
	},
	_URIPartFinderRegExp_start : null,
	_URIPartFinderRegExp_end : null,
	_updateURIPartFinderRegExp : function()
	{
		if (this._URIPartFinderRegExp_start && this._URIPartFinderRegExp_end)
			return;

		var base = this.multibyteEnabled ?
				this.findURIPatternMultibytePart :
				this.findURIPatternPart ;
		this._URIPartFinderRegExp_start = new RegExp('^('+base+')', 'i');
		this._URIPartFinderRegExp_end   = new RegExp('('+base+')$', 'i');
	},
 
	hasLoadableSchemer : function(aURI) 
	{
		if (!this._schemerRegExp)
			this._schemerRegExp = new RegExp('^('+this.schemers.join('|')+'):', 'i');
		return this._schemerRegExp.test(this.convertFullWidthToHalfWidth(aURI));
	},
	_schemerRegExp : null,
 
	hasSchemer : function(aInput) 
	{
		return this._firstSchemerRegExp.test(aInput);
	},
	removeSchemer : function(aInput)
	{
		return aInput.replace(this._firstSchemerRegExp, '');
	},
	get _firstSchemerRegExp()
	{
		if (!this.__firstSchemerRegExp) {
			this.__firstSchemerRegExp = new RegExp('^'+this.kSchemerPatternMultibyte, 'i');
		}
		return this.__firstSchemerRegExp;
	},
	__firstSchemerRegExp : null,
 
	fixupURI : function(aURIComponent, aBaseURI) 
	{
		if (this.multibyteEnabled) {
			aURIComponent = this.convertFullWidthToHalfWidth(aURIComponent);
		}

		aURIComponent = this.sanitizeURIString(aURIComponent);
		if (!aURIComponent) {
			return null;
		}

		aURIComponent = this.fixupSchemer(aURIComponent);

		if (this.relativePathEnabled) {
			aURIComponent = this.makeURIComplete(aURIComponent, aBaseURI);
		}

		return this.hasLoadableSchemer(aURIComponent) ? aURIComponent : null ;
	},
	
	sanitizeURIString : function(aURIComponent) 
	{
		// escape patterns like program codes like JavaScript etc.
		if (!this._topLevelDomainsRegExp) {
			this._topLevelDomainsRegExp = new RegExp('^(' + this.topLevelDomains.join('|') + ')$');
		}
		if (this.relativePathEnabled) {
			if (
				(
					aURIComponent.match(/^([^\/\.]+\.)+([^\/\.]+)$/) &&
					!RegExp.$2.match(this._topLevelDomainsRegExp)
				) ||
				aURIComponent.match(/(\(\)|\([^\/]+\)|[;\.,])$/)
				)
				return '';
		}

		aURIComponent = this.removeParen(aURIComponent);

		while (
			aURIComponent.match(/^\((.*)$/) ||
			aURIComponent.match(/^([^\(]*)\)$/) ||
			aURIComponent.match(/^(.*)[\.,]$/) ||
			aURIComponent.match(/^([^\"]*)\"$/) ||
			aURIComponent.match(/^([^\']*)\'$/) ||
			aURIComponent.match(/^(.+)\s*\([^\)]+$/) ||
			aURIComponent.match(/^[^\(]+\)\s*(.+)$/) ||
			aURIComponent.match(/^[^\.\/:]*\((.+)\)[^\.\/]*$/) ||
			(
				!this.relativePathEnabled &&
				aURIComponent.match(/^[\.\/:](.+)$/)
			)
			) {
			aURIComponent = RegExp.$1;
		}

		aURIComponent = this.removeParen(aURIComponent);

		if (this.IDNEnabled || this.i18nPathEnabled)
			aURIComponent = aURIComponent.replace(this.kStringprepReplaceToNothingRegExp, '');

		return aURIComponent; // aURIComponent.replace(/^.*\((.+)\).*$/, '$1');
	},
	_topLevelDomainsRegExp : null,
 
	removeParen : function(aInput) 
	{
		var doRemoveParen = function(aRegExp) {
				let match = aInput.match(aRegExp);
				if (!match) return false;
				aInput = match[1];
				return true;
			};
		while (this._parenPatterns.some(doRemoveParen)) {}
		return aInput;
	},
	_parenPatterns : [
		/^["\u201d\u201c\u301d\u301f](.+)["\u201d\u201c\u301d\u301f]$/,
		/^[`'\u2019\u2018](.+)[`'\u2019\u2018]$/,
		/^[(\uff08](.+)[)\uff09]$/,
		/^[{\uff5b](.+)[}\uff5d]$/,
		/^[\[\uff3b](.+)[\]\uff3d]$/,
		/^[<\uff1c](.+)[>\uff1e]$/,
		/^[\uff62\u300c](.+)[\uff63\u300d]$/,
		/^\u226a(.+)\u226b$/,
		/^\u3008(.+)\u3009$/,
		/^\u300a(.+)\u300b$/,
		/^\u300e(.+)\u300f$/,
		/^\u3010(.+)\u3011$/,
		/^\u3014(.+)\u3015$/,
		/^(.+)["\u201d\u201c\u301d\u301f][^"\u201d\u201c\u301d\u301f]*$/,
		/^(.+)[`'\u2019\u2018][^`'\u2019\u2018]*$/,
		/^(.+)[(\uff08][^)\uff09]*$/,
		/^(.+)[{\uff5b][^}\uff5d]*$/,
		/^(.+)[\[\uff3b][^\]\uff3d]*$/,
		/^(.+)[<\uff1c][^>\uff1e]*$/,
		/^(.+)[\uff62\u300c][^\uff63\u300d]*$/,
		/^(.+)\u226a[^\u226b$]*/,
		/^(.+)\u3008[^\u3009$]*/,
		/^(.+)\u300a[^\u300b$]*/,
		/^(.+)\u300e[^\u300f$]*/,
		/^(.+)\u3010[^\u3011$]*/,
		/^(.+)\u3014[^\u3015$]*/
	],
 
	fixupSchemer : function(aURI) 
	{
		var match = aURI.match(this._fixupTargetsRegExp);
		if (match) {
			var target = match[1];
			var table = this.evalInSandbox('(function() {'+
					'var table = '+this._fixupTable.quote()+';'+
					'var target = '+target.quote()+';'+
					((this._fixupTargetsPattern+'|')
						.replace(
							/([^|]+)\|/g,
							<![CDATA[
								if (/^$1$/.test(target))
									table = table.replace(/\b$1\s*=>/, target+"=>");
							]]>
						))+
					'return table;'+
				'})()');
			match = table.match(new RegExp(
					'(?:[,\\| \\n\\r\\t]|^)'+
					target.replace(/([\(\)\+\?\.\{\}])/g, '\\$1')
						.replace(/\?/g, '.')
						.replace(/\*/g, '.+')+
					'\\s*=>\\s*([^,\\| \\n\\r\\t]+)'
				));
			if (match)
				aURI = aURI.replace(target, match[1]);
		}
		else if (!this._firstSchemerRegExp.test(aURI)) {
			var schemer = this.schemerFixupDefault;
			if (schemer)
				aURI = schemer+'://'+aURI;
		}

		return aURI;
	},
	_fixupTable : null,
	_fixupTargets : null,
	_fixupTargetsPattern : null,
	_fixupTargetsRegExp : null,
 
	// ���΃p�X�̉��� 
	makeURIComplete : function(aURI, aSourceURI)
	{
		if (aURI.match(/^(urn|mailto):/i)) return aURI;

		if (aURI.match(/^([^\/\.]+\.)+([^\/\.]+)/) &&
			RegExp.$2.match(new RegExp(['^(', this.topLevelDomains.join('|'), ')$'].join('')))) {
			var fixedURI = this.URIFixup.createFixupURI(aURI || 'about:blank', this.URIFixup.FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP);
			return fixedURI.spec;
		}

		var baseURI = this.IOService.newURI(aSourceURI, null, null);
		return this.IOService.newURI(aURI, null, baseURI).spec;
	},
   
	observe : function(aSubject, aTopic, aData) 
	{
		if (aTopic != 'nsPref:changed') return;

		var value = this.prefs.getPref(aData);
		switch (aData)
		{
			case 'textlink.schemer':
				this.schemer = value;
				return;

			case 'textlink.schemer.fixup.table':
				this.schemerFixupTable = value;
				return;

			case 'textlink.schemer.fixup.default':
				this.schemerFixupDefault = value;
				return;

			case 'textlink.find_click_point.strict':
				this.strict = value;
				return;

			case 'textlink.relative.enabled':
				this.relativePathEnabled = value;
				return;

			case 'textlink.idn.enabled':
			case 'network.enableIDN':
				this.IDNEnabled = this.prefs.getPref('network.enableIDN') && this.prefs.getPref('textlink.idn.enabled');
				return;

			case 'textlink.i18nPath.enabled':
				this.i18nPathEnabled = this.prefs.getPref('textlink.i18nPath.enabled');
				return;

			case 'textlink.gTLD':
			case 'textlink.ccTLD':
			case 'textlink.IDN_TLD':
			case 'textlink.extraTLD':
			case 'network.IDN.blacklist_chars':
				this.invalidatePatterns();
				return;

			case 'textlink.multibyte.enabled':
				this.multibyteEnabled = value;
				return;

			case 'textlink.contextmenu.openTextLink.current':
				this.contextItemCurrent = value;
				return;

			case 'textlink.contextmenu.openTextLink.window':
				this.contextItemWindow = value;
				return;

			case 'textlink.contextmenu.openTextLink.tab':
				this.contextItemTab = value;
				return;

			case 'textlink.contextmenu.openTextLink.copy':
				this.contextItemCopy = value;
				return;

			case 'textlink.part.exception':
				this._URIExceptionPattern = null;
				return;
		}

		var match = aData.match(/^textlink\.actions\.(.+)\.(action|trigger\.key|trigger\.mouse)$/);
		if (!match) return;

		var key = match[1];
		if (!(key in this.actions)) {
			this.actions[key] = {
				action       : null,
				triggerKey   : null,
				triggerMouse : null
			};
		}

		switch (match[2])
		{
			case 'action'       : this.actions[key].action = value; break;
			case 'trigger.key'  : this.actions[key].triggerKey = value; break;
			case 'trigger.mouse': this.actions[key].triggerMouse = value; break;
		}
		if (this.actions[key].action === null) {
			delete this.actions[key];
		}
	},
	domains : [
		'textlink.',
		'network.enableIDN',
		'network.IDN.blacklist_chars'
	],
 
	init : function() 
	{
		this.prefs.addPrefListener(this);
		this.initPrefs();
	},
	
	initPrefs : function() 
	{
		var items = <![CDATA[
			textlink.schemer
			textlink.schemer.fixup.table
			textlink.schemer.fixup.default
			textlink.find_click_point.strict
			textlink.relative.enabled
			textlink.multibyte.enabled
			textlink.multiline.enabled
			textlink.idn.enabled
			textlink.i18nPath.enabled
			textlink.contextmenu.openTextLink.current
			textlink.contextmenu.openTextLink.window
			textlink.contextmenu.openTextLink.tab
			textlink.contextmenu.openTextLink.copy
		]]>.toString()
			.replace(/^\s+|\s+$/g, '')
			.split(/\s+/);

		items = items.concat(this.prefs.getDescendant('textlink.actions.'));

		items.sort().forEach(function(aPref) {
			this.observe(null, 'nsPref:changed', aPref);
		}, this);
	},
  
	destroy : function() 
	{
		this.prefs.removePrefListener(this);
	}
 
};

TextLinkUtils.init(); 
  
