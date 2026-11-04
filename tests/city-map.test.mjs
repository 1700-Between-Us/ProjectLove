import test from 'node:test';
import assert from 'node:assert/strict';
import { mountCityMap, unmountCityMap } from '../city-map.mjs';

test('map markers open a persistent popup whose album button navigates to the group', (t) => {
  const original = { document: globalThis.document, L: globalThis.L, CustomEvent: globalThis.CustomEvent };
  t.after(() => { unmountCityMap(true); Object.assign(globalThis, original); });
  const root = {};
  const dispatched = [];
  const nodes = [];
  globalThis.document = {
    querySelector: () => root,
    createElement() {
      const node = { dataset: {}, children: [], listeners: {}, append(child) { this.children.push(child); },
        addEventListener(type, handler) { this.listeners[type] = handler; } };
      nodes.push(node);
      return node;
    },
    dispatchEvent(event) { dispatched.push(event); }
  };
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  let popup;
  const map = { attributionControl: { setPrefix() {} }, fitBounds() {}, getCenter: () => ({ lat: 39, lng: 116 }), getZoom: () => 9, on() {}, remove() {} };
  globalThis.L = {
    map: () => map,
    tileLayer: () => ({ addTo() {} }),
    divIcon: options => options,
    marker: () => ({ bindPopup(content, options) { popup = { content, options }; return this; }, addTo() {} })
  };
  mountCityMap([], [{ name: '北京', latitude: 39, longitude: 116 }]);
  assert.equal(popup.options.className, 'city-label-popup');
  const button = popup.content.children[1];
  assert.equal(button.textContent, '打开相册');
  let prevented = false, stopped = false;
  button.listeners.click({ preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.ok(prevented && stopped);
  assert.equal(dispatched[0].type, 'between-us:navigate-photos-group');
  assert.equal(dispatched[0].detail.group, '北京');
});
