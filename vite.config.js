import { defineConfig } from 'vite';

/**
 * Defines every static HTML page plus the SCSS entry that Vite should process.
 */
export default defineConfig({
  appType: 'mpa',
  css: {
    devSourcemap: true,
  },
  build: {
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: {
        index: 'index.html',
        home: 'pages/home.html',
        products: 'pages/products.html',
        productDetail: 'pages/product-detail.html',
        checkout: 'pages/checkout.html',
        checkoutSuccess: 'pages/checkout-success.html',
        bookingSuccess: 'booking/pages/booking-success.html',
        memberCenter: 'pages/member-center.html',
        blog: 'pages/blog.html',
        blogDetail: 'pages/blog-detail.html',
        branches: 'pages/branches.html',
        faq: 'pages/faq.html',
        bookingCampSearch: 'booking/pages/camp-search.html',
        bookingCampDetail: 'booking/pages/camp-detail.html',
        bookingCampRental: 'booking/pages/camp-rental.html',
        bookingCart: 'booking/pages/booking-cart.html',
        bookingCheckout: 'booking/pages/booking-checkout.html',
        bookingFaq: 'booking/pages/booking-faq.html',
        bookingRentalGuide: 'booking/pages/rental-guide.html',
        bookingMemberCenter: 'booking/pages/member-center.html',
        styles: 'src/styles.js',
      },
    },
  },
});
