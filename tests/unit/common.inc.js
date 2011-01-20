var namespace = {
		window : {
			addEventListener : function() {},
			removeEventListener : function() {},
			get document() {
				return gBrowser.ownerDocument;
			},
			get gBrowser() {
				return utils.gBrowser;
			}
		},
		get document() {
			return gBrowser.ownerDocument;
		},
		get gBrowser() {
			return utils.gBrowser;
		}
	};
utils.import(baseURL+'../../modules/prefs.js', namespace);
var moduleNS = utils.import(baseURL+'../../modules/utils.js', namespace);

var sv;

function getNewService()
{
	var obj = moduleNS.TextLinkUtils;
	obj.__defineGetter__('browserWindow', function() {
		return utils.gBrowser.ownerDocument.defaultView;
	});

	var prefs = utils.loadPrefs('../../defaults/preferences/textlink.js');
	for (var i in prefs)
	{
		obj.observe(null, 'nsPref:changed', i);
	}

	obj.relativePathEnabled = false;
	obj.multibyteEnabled = true;
	obj.IDNEnabled = true;
	obj.i18nPathEnabled = false;
	obj.multilineURIEnabled = false;
	obj.strict = true;

	return obj;
}

function $(aId)
{
	return content.document.getElementById(aId);
}

function getSelectionInEditable(aNode)
{
	aNode.focus();
	return aNode
			.QueryInterface(Ci.nsIDOMNSEditableElement)
			.editor
			.selectionController
			.getSelection(Ci.nsISelectionController.SELECTION_NORMAL);
}
