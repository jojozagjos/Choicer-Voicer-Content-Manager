/**
 * Making text safe to put inside HTML.
 *
 * One copy, shared, because there were two and both were wrong in the same
 * way. Each built a text node and read its innerHTML back:
 *
 *   div.textContent = text; return div.innerHTML;
 *
 * That escapes `&`, `<` and `>`, which is everything that matters between
 * tags, and it is where nearly every use of it sat. It does not escape quotes,
 * because quotes are not special in a text node, and the serializer is right
 * about that. The trouble is that most of the uses in this app are not between
 * tags, they are inside attributes:
 *
 *   <img src="..." title="${escapeHtml(name)}" />
 *   <article data-author="${escapeHtml(pack.author)}">
 *
 * A pack title, a publisher's name and a file name inside somebody else's zip
 * are all written by other people. Any of them containing a double quote ended
 * the attribute early and could start another one, so a name could add
 * attributes to a tag this app wrote. The content security policy stops that
 * becoming a running script, but a policy is the last line rather than the
 * only one, and "cannot execute" is not the same as "cannot be injected".
 *
 * So quotes are escaped too, and the backtick with them, which old versions of
 * one browser treated as an attribute delimiter.
 */

const REPLACEMENTS = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/** The text, safe to drop between tags or inside a quoted attribute. */
export function escapeForHtml(text) {
  if (text == null) return '';
  return String(text).replace(/[&<>"'`]/g, (ch) => REPLACEMENTS[ch]);
}
