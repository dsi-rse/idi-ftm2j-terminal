/**
 * The query parameter that asks the landing page to focus its search bar, and
 * the link that sets it. Shared by the navbar's search link, which writes it,
 * and the landing view, which reads it and then clears it.
 */
export const SEARCH_FOCUS_PARAM = "focus";
export const SEARCH_FOCUS_VALUE = "search";
export const SEARCH_FOCUS_HREF = `/?${SEARCH_FOCUS_PARAM}=${SEARCH_FOCUS_VALUE}`;
