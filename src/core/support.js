define([
	"../var/support"
], function( support ) {

// Support: Safari 8+, IE<9
// Safari 8 collapses sibling forms in documents created via
// document.implementation.createHTMLDocument (the second one becomes
// a child of the first one) and IE<9 lacks the method altogether,
// so the inert-document parsing in jQuery.parseHTML is disabled there.
support.createHTMLDocument = (function() {
	if ( !document.implementation.createHTMLDocument ) {
		return false;
	}
	var doc = document.implementation.createHTMLDocument( "" );
	doc.body.innerHTML = "<form></form><form></form>";
	return doc.body.childNodes.length === 2;
})();

return support;
});
