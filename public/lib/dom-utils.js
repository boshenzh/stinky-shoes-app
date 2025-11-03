// DOM manipulation utilities

/**
 * Safely get an element by ID
 * @param {string} id - Element ID
 * @returns {HTMLElement|null} Element or null if not found
 */
export function getElement(id) {
  return document.getElementById(id);
}

/**
 * Safely get elements by selector
 * @param {string} selector - CSS selector
 * @param {HTMLElement} context - Optional context element (defaults to document)
 * @returns {NodeList|Array} NodeList or empty array
 */
export function querySelectorAll(selector, context = document) {
  try {
    return context.querySelectorAll(selector);
  } catch (e) {
    console.warn(`Invalid selector: ${selector}`, e);
    return [];
  }
}

/**
 * Safely get first element by selector
 * @param {string} selector - CSS selector
 * @param {HTMLElement} context - Optional context element
 * @returns {HTMLElement|null} Element or null
 */
export function querySelector(selector, context = document) {
  try {
    return context.querySelector(selector);
  } catch (e) {
    console.warn(`Invalid selector: ${selector}`, e);
    return null;
  }
}

/**
 * Add event listener with error handling
 * @param {HTMLElement|Window|Document} element - Element to attach listener to
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 * @param {Object} options - Event listener options
 * @returns {Function} Cleanup function to remove listener
 */
export function addEventListener(element, event, handler, options = {}) {
  if (!element) {
    console.warn(`Cannot add event listener to null element: ${event}`);
    return () => {};
  }
  
  try {
    element.addEventListener(event, handler, options);
    return () => {
      try {
        element.removeEventListener(event, handler, options);
      } catch (e) {
        console.warn(`Error removing event listener: ${event}`, e);
      }
    };
  } catch (e) {
    console.warn(`Error adding event listener: ${event}`, e);
    return () => {};
  }
}

/**
 * Create an element with attributes and children
 * @param {string} tag - HTML tag name
 * @param {Object} attrs - Attributes object
 * @param {...(string|HTMLElement)} children - Child elements or text
 * @returns {HTMLElement} Created element
 */
export function createElement(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  
  // Set attributes
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      const eventName = key.slice(2).toLowerCase();
      el.addEventListener(eventName, value);
    } else {
      el.setAttribute(key, value);
    }
  });
  
  // Append children
  children.forEach(child => {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else if (child instanceof HTMLElement) {
      el.appendChild(child);
    }
  });
  
  return el;
}

