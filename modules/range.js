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
 
const EXPORTED_SYMBOLS = ['TextLinkRangeUtils']; 

const Cc = Components.classes;
const Ci = Components.interfaces;

Components.utils.import('resource://textlink-modules/utils.js');
 
function TextLinkRangeUtils(aWindow) 
{
	this.window = aWindow;
}
TextLinkRangeUtils.prototype = {
	utils : TextLinkUtils,
	get prefs()
	{
		return this.utils.prefs;
	},
	
	kINPUT_FIELD_CONDITITON : 'contains(" input INPUT textarea TEXTAREA textbox ", concat(" ", local-name(), " "))', 
	kIGNORE_NODE_CONDITION : 'contains(" head HEAD style STYLE script SCRIPT iframe IFRAME object OBJECT embed EMBED input INPUT textarea TEXTAREA ", concat(" ", local-name(), " ")) or (contains(" a A ", concat(" ", local-name(), " ")) and @href) or @class="moz-txt-citetags"',
	kIGNORE_TEXT_CONDITION : 'ancestor-or-self::*[contains(" head HEAD style STYLE script SCRIPT iframe IFRAME object OBJECT embed EMBED input INPUT textarea TEXTAREA ", concat(" ", local-name(), " ")) or (contains(" a A ", concat(" ", local-name(), " ")) and @href) or @class="moz-txt-citetags"]',
 
	get document() 
	{
		return this.window.document;
	},
 
	get browser() 
	{
		var w = this.window;
		return 'SplitBrowser' in w ? w.SplitBrowser.activeBrowser :
				'gBrowser' in w ? w.gBrowser :
				this.document.getElementById('messagepane') ;
	},
 
	// XPConnect 
	
	get Find() 
	{
		if (!this._Find) {
			this._Find = Cc['@mozilla.org/embedcomp/rangefind;1'].createInstance(Ci.nsIFind);
		}
		return this._Find;
	},
	_Find : null,
  
// utilities 
	
	getCurrentFrame : function(aFrame) 
	{
		var frame = aFrame || this.document.commandDispatcher.focusedWindow;
		if (!frame || frame.top != this.browser.contentWindow) {
			frame = this.browser.contentWindow;
		}
		return frame;
	},
 
	getSelection : function(aFrameOrEditable) 
	{
		if (!aFrameOrEditable || aFrameOrEditable instanceof Ci.nsIDOMWindow) {
			return this.getCurrentFrame(aFrameOrEditable).getSelection();
		}
		else if (aFrameOrEditable instanceof Ci.nsIDOMNSEditableElement) {
			return aFrameOrEditable
					.QueryInterface(Ci.nsIDOMNSEditableElement)
					.editor
					.selectionController
					.getSelection(Ci.nsISelectionController.SELECTION_NORMAL);
		}
		return null;
	},
 
	getEditableFromChild : function(aNode) 
	{
		if (!aNode) return null;
		return this.utils.evaluateXPath(
				'ancestor-or-self::*['+this.kINPUT_FIELD_CONDITITON+'][1]',
				aNode,
				Ci.nsIDOMXPathResult.FIRST_ORDERED_NODE_TYPE
			).singleNodeValue;
	},
 
	getTextContentFromRange : function(aRange) 
	{
		var encoder = this._textEncoder;
		if (encoder) {
			try {
				encoder.init(
					aRange.startContainer.ownerDocument,
					'text/plain',
					encoder.OutputBodyOnly | encoder.OutputLFLineBreak
				);
				encoder.setRange(aRange);
				let result = encoder.encodeToString();
				encoder.init(
					this.document,
					'text/plain',
					encoder.OutputBodyOnly
				);
				encoder.setRange(null);
				return result;
			}
			catch(e) {
			}
		}
		return aRange.toString();
	},
	get _textEncoder()
	{
		if (!this.__textEncoder) {
			this.__textEncoder = Cc['@mozilla.org/layout/documentEncoder;1?type=text/plain']
									.createInstance(Ci.nsIDocumentEncoder);
		}
		return this.__textEncoder;
	},
  
// range operations 
	FIND_ALL    : 1,
	FIND_FIRST  : 2,
	FIND_LAST   : 4,
	ALLOW_SAME_URIS : 8,

	FIND_SINGLE : 6,

	ERRROR_FIND_MODE_NOT_SPECIFIED : new Error('you must specify find mode'),
	ERRROR_NO_URI_RANGE : new Error('there is no range maybe URI'),
	
	getURIRangesIterator : function(aFrameOrEditable, aMode, aStrict, aExceptionsHash) 
	{
		if (!aMode) aMode = this.FIND_ALL;

		var ranges = [];
		var selection = this.getSelection(aFrameOrEditable);
		if (!selection || !selection.rangeCount)
			throw this.ERRROR_NO_URI_RANGE;

		var count, end, step;
		if (aMode & this.FIND_LAST) {
			count = selection.rangeCount-1;
			end   = -1;
			step  = -1;
		}
		else {
			count = 0;
			end   = selection.rangeCount;
			step  = 1;
		}
		for (; count != end; count += step)
		{
			let range = selection.getRangeAt(parseInt(count));
			try {
				let iterator = this.getURIRangesIteratorFromRange(range, aMode, aStrict, aExceptionsHash);
				while(true)
				{
					let foundRange = iterator.next();
					yield foundRange;
					ranges.push(foundRange);
				}
			}
			catch(e) {
			}
			if (
				ranges.length &&
				(range.collapsed || aMode & this.FIND_SINGLE)
				) {
				break;
			}
		}
	},
 
	getURIRangesIteratorFromRange : function(aBaseRange, aMode, aStrict, aExceptionsHash) 
	{
		if (!aMode) throw this.ERRROR_FIND_MODE_NOT_SPECIFIED;
		var ranges = [];

		var findRange = this.getFindRange(aBaseRange);
		var terms = this._getFindTermsFromRange(findRange, aMode);
		if (!terms.length)
			throw this.ERRROR_NO_URI_RANGE;

		var baseURI = aBaseRange.startContainer.ownerDocument.defaultView.location.href;
		var findOnlyFirst = aBaseRange.collapsed || aMode & this.FIND_SINGLE;

		var foundURIsHash = {};
		if (aExceptionsHash) {
			for (var i in aExceptionsHash)
			{
				foundURIsHash[i] = true;
			}
		}

		var rangeSet = this._getRangeSetFromRange(aBaseRange, findRange, aMode);
		var shouldReturnSingleResult = !(aMode & this.ALLOW_SAME_URIS);

		this.Find.findBackwards = (aMode & this.FIND_LAST);
		for (let i in terms)
		{
			let rangesForTerm = this._findRangesForTerm(
					terms[i],
					rangeSet,
					baseURI,
					aStrict,
					ranges,
					foundURIsHash,
					aMode
				);
			if (!rangesForTerm.length) continue;

			ranges = ranges.concat(rangesForTerm);
			if (shouldReturnSingleResult) {
				rangesForTerm.forEach(function(aRange) {
					foundURIsHash[aRange.uri] = true;
				});
			}
			for (let i in rangesForTerm)
			{
				yield rangesForTerm[i];
			}

			if (ranges.length && findOnlyFirst) break;
		}

		this._destroyRangeSet(rangeSet);
	},
	_getFindTermsFromRange : function(aRange, aMode)
	{
		var terms = [];
		var mayBeURIs = this.utils.matchURIRegExp(this.getTextContentFromRange(aRange));
		if (!mayBeURIs) {
			return terms;
		}
		if (aMode & this.FIND_LAST) {
			mayBeURIs = Array.slice(mayBeURIs).reverse();
		}
		mayBeURIs.forEach(function(aTerm) {
			if (typeof aTerm != 'string') aTerm = aTerm[0];
			aTerm = aTerm.replace(/^\s+|\s+$/g, '');
			aTerm = this.utils.sanitizeURIString(aTerm);
			if (!aTerm || terms.indexOf(aTerm) > -1) return;

			let hadlWidthTerm = this.utils.convertFullWidthToHalfWidth(aTerm);
			if (!this.utils.relativePathEnabled && this.utils.hasSchemer(aTerm)) {
				let termForCheck = hadlWidthTerm;
				while (this.utils.hasSchemer(termForCheck))
				{
					if (this.utils.hasLoadableSchemer(termForCheck)) break;
					termForCheck = this.utils.removeSchemer(termForCheck);
					aTerm = this.utils.removeSchemer(aTerm);
				}
				if (!this.utils.hasLoadableSchemer(termForCheck)) return;
			}
			else if (this.utils.URIExceptionPattern.test(hadlWidthTerm)) {
				return;
			}

			if (terms.indexOf(aTerm) < 0) terms.push(aTerm);
		}, this);
		if (aMode & this.FIND_ALL) {
			// �����񒷂��������̂����ɃT�[�`���邽�߂ɕ��בւ���i������v�����O���邽�߁j
			terms.sort(function(aA, aB) { return (aB.length - aA.length) || (aB - aA); });
		}
		return terms;
	},
	_getRangeSetFromRange : function(aBaseRange, aFindRange, aMode)
	{
		var findRange = aFindRange || this.getFindRange(aBaseRange);

		var editable = this.getEditableFromChild(findRange.startContainer);
		if (editable) {
			findRange.detach();
			findRange = editable.ownerDocument.createRange();
			findRange.selectNode(editable);
		}

		var startPoint = findRange.cloneRange();
		startPoint.collapse(!(aMode & this.FIND_LAST));
		var endPoint = findRange.cloneRange();
		endPoint.collapse(aMode & this.FIND_LAST);

		var posRange;
		if (editable) {
			var root = editable.QueryInterface(Ci.nsIDOMNSEditableElement)
					.editor
					.rootElement;
			posRange = root.ownerDocument.createRange();
			posRange.selectNodeContents(root);
		}
		else {
			posRange = findRange.cloneRange()
		}

		return {
				findRange  : findRange,
				startPoint : startPoint,
				endPoint   : endPoint,
				base       : aBaseRange,
				position   : posRange
			};
	},
	_destroyRangeSet : function(aRangeSet)
	{
		aRangeSet.findRange.detach();
		aRangeSet.startPoint.detach();
		aRangeSet.endPoint.detach();
		aRangeSet.position.detach();
		delete aRangeSet.findRange;
		delete aRangeSet.startPoint;
		delete aRangeSet.endPoint;
		delete aRangeSet.position;
		delete aRangeSet.base;
	},
	_findRangesForTerm : function(aTerm, aRangeSet, aBaseURI, aStrict, aRanges, aFoundURIsHash, aMode)
	{
		if (!aFoundURIsHash) aFoundURIsHash = {};
		if (!aRanges) aRanges = [];
		if (this.Find.findBackwards) {
			aRangeSet.startPoint.setStart(aRangeSet.findRange.endContainer, aRangeSet.findRange.endOffset);
		}
		else {
			aRangeSet.startPoint.setStart(aRangeSet.findRange.startContainer, aRangeSet.findRange.startOffset);
		}
		aRangeSet.startPoint.collapse(true);
		var termRange;
		var uriRanges = [];
		var uriRange = null;
		var shouldReturnSingleResult = !(aMode & this.ALLOW_SAME_URIS);
		FIND_URI_RANGE:
		while (termRange = this.Find.Find(aTerm, aRangeSet.findRange, aRangeSet.startPoint, aRangeSet.endPoint))
		{
			let range = this.shrinkURIRange(termRange.cloneRange());
			let uri = this.utils.fixupURI(range.toString(), aBaseURI);
			let ranges = this.getFollowingURIPartRanges(range);
			if (ranges.length) {
				ranges.forEach(function(aRange) {
					uri += this.utils.convertFullWidthToHalfWidth(aRange.toString());
				}, this);
			}
			ranges.unshift(range);

			if (
				ranges.some(function(aRange) {
					return this._containsRange(aRangeSet.base, aRange, aStrict)
				}, this) &&
				uri &&
				!(uri in aFoundURIsHash)
				) {
				for (let i = 0, maxi = ranges.length; i < maxi; i++)
				{
					// ���Ɍ���������蒷��URI������̈ꕔ�ł���ꍇ�͏��O����B
					let range = ranges[i];
					aRangeSet.position.setEnd(range.startContainer, range.startOffset);
					let start = aRangeSet.position.toString().length;
					uriRange = {
						range  : range,
						uri    : uri,
						start  : start,
						end    : start + aTerm.length,
						base   : aRangeSet.base
					};

					if (aRanges.some(this._checkRangeFound, uriRange))
						continue;

					uriRanges.push(uriRange);
					if (shouldReturnSingleResult) {
						break FIND_URI_RANGE;
					}
				}
			}

			if (shouldReturnSingleResult) {
				ranges.forEach(function(aRange) {
					aRange.detach();
				});
			}

			if (this.Find.findBackwards) {
				aRangeSet.startPoint.setEnd(termRange.startContainer, termRange.startOffset);
			}
			else {
				aRangeSet.startPoint.setEnd(termRange.endContainer, termRange.endOffset);
			}
			aRangeSet.startPoint.collapse(false);
		}
		if (termRange) termRange.detach();
		return uriRanges;
	},
	_containsRange : function(aBase, aTarget, aStrict)
	{/* nsIDOMRange��compareBoundaryPoints���g���ƁA�e�L�X�g���͗�����Range�̔�r����
	    NS_ERROR_DOM_WRONG_DOCUMENT_ERR��O���������Ă��܂��̂ŁA�����
	    nsIDOMNSRange��comparePoint���g�� */
		return 	aStrict ?
			(
				(aBase.comparePoint(aTarget.startContainer, aTarget.startOffset) == 0 &&
				 aBase.comparePoint(aTarget.endContainer, aTarget.endOffset) == 0) ||
				(aTarget.comparePoint(aBase.startContainer, aBase.startOffset) == 0 &&
				 aTarget.comparePoint(aBase.endContainer, aBase.endOffset) == 0)
			) :
			(
				aBase.comparePoint(aTarget.startContainer, aTarget.startOffset) == 0 ||
				aBase.comparePoint(aTarget.endContainer, aTarget.endOffset) == 0 ||
				aTarget.comparePoint(aBase.startContainer, aBase.startOffset) == 0 ||
				aTarget.comparePoint(aBase.endContainer, aBase.endOffset) == 0
			);
	},
	_checkRangeFound : function(aRange)
	{
		return (aRange.start >= this.start && aRange.end <= this.end) ||
				(aRange.start <= this.start && aRange.end >= this.end);
	},
	_compareRangePosition : function(aA, aB)
	{
		return (aA.base == aB.base) ? (aA.start - aB.start) :
				(aA.base.comparePoint(aB.base.startContainer, aB.base.startOffset) < 0) ? 1 : -1 ;
	},
	
	getFindRange : function(aBaseRange) 
	{
		var findRange = aBaseRange.cloneRange();

		if (this.getEditableFromChild(findRange.startContainer)) {
			let root = this.utils.evaluateXPath(
					'ancestor-or-self::node()[parent::*['+this.kINPUT_FIELD_CONDITITON+']]',
					findRange.startContainer,
					Ci.nsIDOMXPathResult.FIRST_ORDERED_NODE_TYPE
				).singleNodeValue;
			// setStartBefore causes error...
			findRange.setStart(this.utils.evaluateXPath(
					'preceding-sibling::node()[1]',
					root,
					Ci.nsIDOMXPathResult.FIRST_ORDERED_NODE_TYPE
				).singleNodeValue || root, 0);
			findRange.setEndAfter(this.utils.evaluateXPath(
					'(child::node()[last()] | following-sibling::node()[last()])[1]',
					root,
					Ci.nsIDOMXPathResult.FIRST_ORDERED_NODE_TYPE
				).singleNodeValue || root);
			return findRange;
		}

		var expandToBefore = aBaseRange.collapsed;
		var expandToAfter  = aBaseRange.collapsed;
		if (!aBaseRange.collapsed) {
			let string = aBaseRange.toString();
			expandToBefore = this.utils.getURIPartFromStart(string);
			expandToAfter  = this.utils.getURIPartFromEnd(string);
		}
		if (expandToBefore)
			this._expandURIRangeToBefore(findRange);
		if (expandToAfter)
			this._expandURIRangeToAfter(findRange);

		return findRange;
	},
	_expandURIRangeToBefore : function(aRange)
	{
		var expandRange = aRange.cloneRange();
		expandRange.selectNode(aRange.startContainer);
		expandRange.setEnd(aRange.startContainer, aRange.startOffset);

		var node   = aRange.startContainer;
		var offset = aRange.startOffset;
		if (node.nodeType == Ci.nsIDOMNode.ELEMENT_NODE) {
			node = this._getFirstTextNodeFromRange(aRange);
			offset = 0;
		}
		var baseBlock = this._getParentBlock(node);
		var nodes = this.utils.evaluateXPath(
				'preceding::text()[not('+this.kIGNORE_TEXT_CONDITION+')]',
				node
			);
		var i = nodes.snapshotLength-1,
			lastNode;
		while (true)
		{
			lastNode = node;
			if (this._getParentBlock(lastNode) != baseBlock) break;
			try{ // Firefox 2 sometimes fails...
				expandRange.setStart(lastNode, 0);
				let string = expandRange.toString();
				let part = this.utils.getURIPartFromEnd(string);
				if (!part.length) break;
				if (
					part.length < string.length ||
					(part.length == string.length && i == -1)
					) {
					offset = (expandRange.startContainer == aRange.startContainer ? string : expandRange.startContainer.textContent ).length - part.length;
					break;
				}
				if (i == -1) break;
			}
			catch(e){
			}
			node = nodes.snapshotItem(i--);
			if (!node) break;
			offset = node.textContent.length;
			expandRange.selectNode(node);
		}
		if (
			lastNode &&
			(lastNode != aRange.startContainer || offset != aRange.startOffset)
			) {
			aRange.setStart(lastNode, offset);
		}

		expandRange.detach();
	},
	_expandURIRangeToAfter : function(aRange, aRanges)
	{
		var expandRange = aRange.cloneRange();
		expandRange.selectNode(aRange.endContainer);
		expandRange.setStart(aRange.endContainer, aRange.endOffset);

		var node   = aRange.endContainer;
		var offset = aRange.endOffset;
		if (node.nodeType == Ci.nsIDOMNode.ELEMENT_NODE) {
			node = this._getLastTextNodeFromRange(aRange);
			offset = node ? node.textContent.length : 0 ;
		}
		var baseBlock = this._getParentBlock(node);
		var nodes = this.utils.evaluateXPath(
				'following::text()[not('+this.kIGNORE_TEXT_CONDITION+')]',
				node
			);
		var i = 0,
			maxi = nodes.snapshotLength,
			headPartIsFound = aRanges && this.utils.isHeadOfNewURI(aRange.toString()),
			lastNode;
		while (true)
		{
			lastNode = node;
			if (this._getParentBlock(lastNode) != baseBlock) break;
			try{ // Firefox 2 sometimes fails...
				expandRange.setEnd(lastNode, lastNode.textContent.length);
				let string = expandRange.toString();
				let delta = 0;
				if (this.utils.multilineURIEnabled) {
					// ����ɍœK���H����āARange�̊J�n�ʒu������Ă��܂����Ƃ�����̂ŁA
					// �����I��Range�̊J�n�ʒu�����ɖ߂�
					if (expandRange.startContainer.nodeType == Ci.nsIDOMNode.ELEMENT_NODE) {
						expandRange.setStart(this._getFirstTextNodeFromRange(expandRange), 0);
					}

					let originalString = string;
					string = string.replace(/^[\n\r]+|[\n\r]+$/g, '');
					delta = originalString.indexOf(string);

					originalString = string;
					string = string.replace(this.utils.URIExceptionPattern_start, '');
					if (originalString.indexOf(string) != 0) {
						string = '';
						delta = 0;
					}
				}
				if (!this.utils.multilineURIEnabled || string) {
					let part = this.utils.getURIPartFromStart(string, headPartIsFound);
					if (!part.length) break;
					let partRange;
					if (aRanges) {
						if (!headPartIsFound && this.utils.isHeadOfNewURI(part)) headPartIsFound = true;
						partRange = expandRange.cloneRange();
						aRanges.push(partRange);
						partRange.setStart(lastNode, partRange.startOffset + delta);
						partRange.setEnd(lastNode, partRange.startOffset + part.length);
					}
					if (
						part.length < string.length ||
						(part.length == string.length && i == maxi)
						) {
						offset = expandRange.startOffset + part.length + delta;
						if (aRanges) {
							partRange.setEnd(lastNode, offset);
						}
						break;
					}
				}
				if (i == maxi) break;

			}
			catch(e) {
			}
			node = nodes.snapshotItem(i++);
			if (!node) break;
			offset = 0;
			expandRange.selectNode(node);
		}
		if (
			!aRanges &&
			lastNode &&
			(lastNode != aRange.endContainer || offset != aRange.endOffset)
			) {
			aRange.setEnd(lastNode, offset);
		}

		expandRange.detach();
	},
	_getFirstTextNodeFromRange : function(aRange)
	{
		return this.utils.evaluateXPath(
				'descendant-or-self::text()[not('+this.kIGNORE_TEXT_CONDITION+')][1]',
				aRange.startContainer.childNodes.item(aRange.startOffset) || aRange.startContainer.firstChild,
				Ci.nsIDOMXPathResult.FIRST_ORDERED_NODE_TYPE
			).singleNodeValue;
	},
	_getLastTextNodeFromRange : function(aRange)
	{
		return this.utils.evaluateXPath(
				'descendant-or-self::text()[not('+this.kIGNORE_TEXT_CONDITION+')][last()]',
				aRange.endContainer.childNodes.item(aRange.endOffset) || aRange.endContainer.lastChild,
				Ci.nsIDOMXPathResult.FIRST_ORDERED_NODE_TYPE
			).singleNodeValue;
	},
	_getParentBlock : function(aNode)
	{
		if (!aNode) return null;
		var win = aNode.ownerDocument.defaultView;
		if (aNode.nodeType != Ci.nsIDOMNode.ELEMENT_NODE) aNode = aNode.parentNode;
		while (aNode)
		{
			let display = win.getComputedStyle(aNode, null).getPropertyValue('display');
			if (display != 'inline') break;
			aNode = aNode.parentNode;
		}
		return aNode;
	},
  
	getSelectionURIRanges : function(aFrameOrEditable, aMode, aStrict, aExceptionsHash) 
	{
		if (!aMode) aMode = this.FIND_ALL;

		var ranges = [];
		try {
			var iterator = this.getURIRangesIterator(aFrameOrEditable, aMode, aStrict, aExceptionsHash);
			while(true)
			{
				ranges.push(iterator.next());
			}
		}
		catch(e) {
		}

		if (aMode & this.FIND_ALL) {
			ranges.sort(this._compareRangePosition);
		}

		return ranges;
	},
	
	getFirstSelectionURIRange : function(aFrameOrEditable, aStrict, aExceptionsHash) 
	{
		var ranges = this.getSelectionURIRanges(aFrameOrEditable, this.FIND_FIRST, aStrict, aExceptionsHash);
		return ranges.length ? ranges[0] : null ;
	},
 
	getLastSelectionURIRange : function(aFrameOrEditable, aStrict, aExceptionsHash) 
	{
		var ranges = this.getSelectionURIRanges(aFrameOrEditable, this.FIND_LAST, aStrict, aExceptionsHash);
		return ranges.length ? ranges[0] : null ;
	},
 
	getURIRangesFromRange : function(aBaseRange, aMode, aStrict, aExceptionsHash) 
	{
		if (!aMode) aMode = this.FIND_ALL;
		var ranges = [];

		try {
			var iterator = this.getURIRangesIteratorFromRange(aBaseRange, aMode, aStrict, aExceptionsHash);
			while(true)
			{
				ranges.push(iterator.next());
			}
		}
		catch(e if e instanceof StopIteration) {
		}
		catch(e if e == this.ERRROR_NO_URI_RANGE) {
			return ranges;
		}

		if (aMode & this.FIND_ALL) {
			ranges.sort(this._compareRangePosition);
		}

		return ranges;
	},
  
	shrinkURIRange : function(aRange) 
	{
		// �������s�ȍ~��؂藎�Ƃ�
		var nodes = this.utils.evaluateXPath(
				'following::*[local-name()="br" or local-name()="BR"] | '+
				'descendant-or-self::*[local-name()="br" or local-name()="BR"]',
				aRange.startContainer
			);
		var br;
		/* nsIDOMRange��compareBoundaryPoints���g���ƁA�e�L�X�g���͗�����Range�̔�r����
		   NS_ERROR_DOM_WRONG_DOCUMENT_ERR��O���������Ă��܂��̂ŁA�����
		   nsIDOMNSRange��comparePoint���g�� */
		for (var i = 0, maxi = nodes.snapshotLength; i < maxi; i++)
		{
			br = nodes.snapshotItem(i);
			if (aRange.comparePoint(br, 0) < 0) { // before
				continue;
			}
			else if (aRange.comparePoint(br, 0) > 0) { // after
				break;
			}
			aRange.setEndBefore(br);
			break;
		}

		return aRange;
	},
 
	getFollowingURIPartRanges : function(aRange) 
	{
		var ranges = [];
		if (this.utils.multilineURIEnabled) {
			this._expandURIRangeToAfter(aRange, ranges);
		}
		return ranges;
	}
  
}; 
  
