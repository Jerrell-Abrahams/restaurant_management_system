import { supabase, API_BASE_URL } from './supabaseClient';

// Every call carries the Supabase session token; the API verifies it and looks up the caller's
// restaurant.staff row. Nothing in this file talks to PostgREST directly -- the browser has no
// grants on the restaurant schema at all, by design.
async function request(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    // 402 means the subscription lapsed rather than anything being wrong with the request. The
    // console reads this to show a "read-only" banner instead of an error toast.
    err.code = body.code;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

const get = (p) => request(p);
const post = (p, body) => request(p, { method: 'POST', body: JSON.stringify(body) });
const patch = (p, body) => request(p, { method: 'PATCH', body: JSON.stringify(body) });
const del = (p) => request(p, { method: 'DELETE' });

export const me = () => get('/api/admin/me');

export const listRestaurants = () => get('/api/admin/restaurants');
export const getRestaurant = (id) => get(`/api/admin/restaurants/${id}`);
export const createRestaurant = (body) => post('/api/admin/restaurants', body);
export const updateRestaurant = (id, body) => patch(`/api/admin/restaurants/${id}`, body);
export const uploadLogo = (id, image) => post(`/api/admin/restaurants/${id}/logo`, { image });

export const getMenu = (id) => get(`/api/admin/restaurants/${id}/menu`);
export const createCategory = (id, body) => post(`/api/admin/restaurants/${id}/categories`, body);
export const updateCategory = (id, catId, body) => patch(`/api/admin/restaurants/${id}/categories/${catId}`, body);
export const deleteCategory = (id, catId) => del(`/api/admin/restaurants/${id}/categories/${catId}`);
export const createItem = (id, body) => post(`/api/admin/restaurants/${id}/items`, body);
export const updateItem = (id, itemId, body) => patch(`/api/admin/restaurants/${id}/items/${itemId}`, body);

export const getFeedback = (id, params = '') => get(`/api/admin/restaurants/${id}/feedback${params}`);
export const updateVisit = (id, visitId, body) => patch(`/api/admin/restaurants/${id}/visits/${visitId}`, body);
export const getDishes = (id) => get(`/api/admin/restaurants/${id}/dishes`);
export const getSummary = (id) => get(`/api/admin/restaurants/${id}/summary`);
export const getAnalytics = (id) => get(`/api/admin/restaurants/${id}/analytics`);

export const getServiceRequests = (id) => get(`/api/admin/restaurants/${id}/service-requests`);
export const ackServiceRequest = (id, requestId) =>
  patch(`/api/admin/restaurants/${id}/service-requests/${requestId}`, {});

// live=1 is what the pass polls: everything still pending or accepted. Without it the route
// answers the last 24h, which is the console's Orders tab.
export const getOrders = (id, live = false) =>
  get(`/api/admin/restaurants/${id}/orders${live ? '?live=1' : ''}`);
// status is 'accepted' (the kitchen now owns it) or 'done' (clear the card). One-way, both of
// them -- the route refuses a transition from any other state.
export const setOrderStatus = (id, orderId, status) =>
  patch(`/api/admin/restaurants/${id}/orders/${orderId}`, { status });

// Admin only. Both files go up together -- the API rejects a half pair, because an SVG from one
// restaurant sitting next to another's PNG is the failure that reaches a printer.
export const uploadQr = (id, body) => request(`/api/admin/restaurants/${id}/qr`, { method: 'PUT', body: JSON.stringify(body) });

// Not JSON: the API streams the stored file back with a Content-Disposition the browser reads the
// filename off. Blob rather than a plain link because the request needs an auth header -- which
// is also why the on-page preview goes through here instead of a plain <img src>.
export async function fetchQr(id, format) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${API_BASE_URL}/api/admin/restaurants/${id}/qr?format=${format}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed (${res.status})`);
    // 404 means nothing has been uploaded yet, which is a normal state for a new restaurant and
    // not an error the page should shout about. The QR tab branches on this.
    err.status = res.status;
    throw err;
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] || `qr.${format}`;
  return { blob: await res.blob(), filename };
}
