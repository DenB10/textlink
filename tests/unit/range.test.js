utils.include('common.inc.js');

function setUp()
{
	sv = getNewService();
	yield Do(utils.loadURI('../fixtures/testcase.html'));
}

function tearDown()
{
}

function test_getCurrentFrame()
{
	assert.equals(content, sv.getCurrentFrame());
	assert.equals(content, sv.getCurrentFrame(content));
	assert.equals(content, sv.getCurrentFrame(window));

	yield Do(utils.loadURI('../fixtures/frame.html'));

	assert.equals(content, sv.getCurrentFrame());
	assert.equals(content, sv.getCurrentFrame(content));
	assert.equals(content, sv.getCurrentFrame(window));
	assert.equals(content.frames[0], sv.getCurrentFrame(content.frames[0]));
}

function test_shrinkURIRange()
{
	var range = content.document.createRange();
	var node = $('first').firstChild;

	range.setStart(node, 7);
	range.setEnd(node, 32);
	assert.equals('(http://www.mozilla.org/)', range.toString());
	range = sv.shrinkURIRange(range);
	assert.equals('http://www.mozilla.org/', range.toString());

	range.setStart(node, 8);
	range.setEnd(node, 31);
	assert.equals('http://www.mozilla.org/', range.toString());
	range = sv.shrinkURIRange(range);
	assert.equals('http://www.mozilla.org/', range.toString());

	range.setStart(node, 6);
	range.setEnd(node, 32);
	assert.equals('a(http://www.mozilla.org/)', range.toString());
	range = sv.shrinkURIRange(range);
	assert.equals('http://www.mozilla.org/', range.toString());

	range.selectNodeContents($('br'));
	range.setStartAfter($('br').getElementsByTagName('br')[0]);
	range.setEnd($('br').getElementsByTagName('br')[1].nextSibling, 7);
	assert.equals('http://mozilla.jp/Mozilla', range.toString());
	range = sv.shrinkURIRange(range);
	assert.equals('http://mozilla.jp/', range.toString());

	range.detach();
}

function test_getFindRange()
{
	var range = content.document.createRange();
	var node = $('first').firstChild;
	range.setStart(node, 7);
	range.setEnd(node, 32);
	var rangeText = range.toString();
	assert.equals('(http://www.mozilla.org/)', rangeText);

	var findRange = sv.getFindRange(range);
	var findRangeText = findRange.toString();
	assert.compare(findRangeText.length, '>=', rangeText.length);
	assert.contains(range, findRange);

	range.detach();
	findRange.detach();
}

function test_getURIRangesFromRange()
{
	var range = content.document.createRange();
	range.selectNodeContents($('first'));
	range.setEndAfter($('fullwidth'));

	var ranges;

	ranges = sv.getURIRangesFromRange(range, 1);
	assert.equals(1, ranges.length);
	assert.equals('http://www.mozilla.org/', ranges[0].range.toString());
	assert.equals('http://www.mozilla.org/', ranges[0].uri);

	ranges = sv.getURIRangesFromRange(range);
	assert.equals(12, ranges.length);
	assert.equals(
		[
			'http://www.mozilla.org/',
			'http://www.netscape.com/',
			'http://jt.mozilla.gr.jp/src-faq.html#1',
			'ttp://jt.mozilla.gr.jp/newlayout/gecko.html',
			'ttp://ftp.netscape.com/pub/netscape6/',
			'h++p://www.mozilla.com/',
			'h**p://www.mozilla.com/firefox/',
			'http://piro.sakura.ne.jp/',
			'www.mozilla.org/products/firefox/',
			'update.mozilla.org',
			'ｈｔｔｐ：／／ｗｈｉｔｅ．ｓａｋｕｒａ．ｎｅ．ｊｐ／～ｐｉｒｏ／',
			'ｔｔｐ：／／ｗｗｗ９８．ｓａｋｕｒａ．ｎｅ．ｊｐ／～ｐｉｒｏ／'
		],
		ranges.map(function(aRange) {
			return aRange.range.toString();
		})
	);
	assert.equals(
		[
			'http://www.mozilla.org/',
			'http://www.netscape.com/',
			'http://jt.mozilla.gr.jp/src-faq.html#1',
			'http://jt.mozilla.gr.jp/newlayout/gecko.html',
			'http://ftp.netscape.com/pub/netscape6/',
			'http://www.mozilla.com/',
			'http://www.mozilla.com/firefox/',
			'http://piro.sakura.ne.jp/',
			'http://www.mozilla.org/products/firefox/',
			'http://update.mozilla.org',
			'http://white.sakura.ne.jp/~piro/',
			'http://www98.sakura.ne.jp/~piro/'
		],
		ranges.map(function(aRange) {
			return aRange.uri;
		})
	);

	range.selectNodeContents($('split'));
	ranges = sv.getURIRangesFromRange(range);
	assert.equals(5, ranges.length);
	assert.equals(
		[
			'http://www.mozilla.org/',
			'http://www.netscape.com/',
			'http://jt.mozilla.gr.jp/src-faq.html#1',
			'ttp://jt.mozilla.gr.jp/newlayout/gecko.html',
			'ttp://ftp.netscape.com/pub/netscape6/'
		],
		ranges.map(function(aRange) {
			return aRange.range.toString();
		})
	);
	assert.equals(
		[
			'http://www.mozilla.org/',
			'http://www.netscape.com/',
			'http://jt.mozilla.gr.jp/src-faq.html#1',
			'http://jt.mozilla.gr.jp/newlayout/gecko.html',
			'http://ftp.netscape.com/pub/netscape6/'
		],
		ranges.map(function(aRange) {
			return aRange.uri;
		})
	);

	range.detach();
}

function test_getSelectionURIRanges()
{
	var range1 = content.document.createRange();
	range1.selectNodeContents($('split'));

	var range2 = content.document.createRange();
	range2.selectNodeContents($('fullwidth'));

	var range3 = content.document.createRange();
	range3.selectNodeContents($('pre'));

	var selection = content.getSelection();
	selection.removeAllRanges();
	selection.addRange(range1);
	selection.addRange(range2);
	selection.addRange(range3);

	var ranges;

	ranges = sv.getSelectionURIRanges(content, 1);
	assert.equals(1, ranges.length);
	assert.equals('http://www.mozilla.org/', ranges[0].range.toString());
	assert.equals('http://www.mozilla.org/', ranges[0].uri);

	ranges = sv.getSelectionURIRanges(content);
	assert.equals(13, ranges.length);
	assert.equals(
		[
			'http://www.mozilla.org/',
			'http://www.netscape.com/',
			'http://jt.mozilla.gr.jp/src-faq.html#1',
			'ttp://jt.mozilla.gr.jp/newlayout/gecko.html',
			'ttp://ftp.netscape.com/pub/netscape6/',
			'ｈｔｔｐ：／／ｗｈｉｔｅ．ｓａｋｕｒａ．ｎｅ．ｊｐ／～ｐｉｒｏ／',
			'ｔｔｐ：／／ｗｗｗ９８．ｓａｋｕｒａ．ｎｅ．ｊｐ／～ｐｉｒｏ／',
			'http://piro.sakura.ne.jp/latest/',
			'http://piro.sakura.ne.jp/latest/blosxom/mozilla/',
			'http://piro.sakura.ne.jp/latest/blosxom/mozilla/xul/',
			'ttp://piro.sakura.ne.jp/latest/blosxom/webtech/',
			'ttp://piro.sakura.ne.jp/xul/',
			'ttp://piro.sakura.ne.jp/xul/tips/'
		],
		ranges.map(function(aRange) {
			return aRange.range.toString();
		})
	);
	assert.equals(
		[
			'http://www.mozilla.org/',
			'http://www.netscape.com/',
			'http://jt.mozilla.gr.jp/src-faq.html#1',
			'http://jt.mozilla.gr.jp/newlayout/gecko.html',
			'http://ftp.netscape.com/pub/netscape6/',
			'http://white.sakura.ne.jp/~piro/',
			'http://www98.sakura.ne.jp/~piro/',
			'http://piro.sakura.ne.jp/latest/',
			'http://piro.sakura.ne.jp/latest/blosxom/mozilla/',
			'http://piro.sakura.ne.jp/latest/blosxom/mozilla/xul/',
			'http://piro.sakura.ne.jp/latest/blosxom/webtech/',
			'http://piro.sakura.ne.jp/xul/',
			'http://piro.sakura.ne.jp/xul/tips/'
		],
		ranges.map(function(aRange) {
			return aRange.uri;
		})
	);

	selection.removeAllRanges();
}
