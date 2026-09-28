import { getCookie } from './api.js';

// Language lives in a cookie (scenario C3): a persistent client-side change
// that also rewrites many accessible names across the site.
const ES = {
  Home: 'Inicio', Products: 'Productos', Offers: 'Ofertas', Cart: 'Carrito', Wishlist: 'Favoritos',
  Inbox: 'Bandeja', Todos: 'Tareas', Notes: 'Notas', Orders: 'Pedidos', Support: 'Soporte',
  Settings: 'Ajustes', 'Sign out': 'Cerrar sesión', 'Recently viewed': 'Vistos recientemente',
  'Trending now': 'Tendencias', 'Deal of the moment': 'Oferta del momento', 'Add to cart': 'Añadir al carrito',
  'Dismiss announcement': 'Cerrar aviso',
};

export const lang = () => (getCookie('lang') === 'es' ? 'es' : 'en');
export const t = (s) => (lang() === 'es' ? ES[s] || s : s);
