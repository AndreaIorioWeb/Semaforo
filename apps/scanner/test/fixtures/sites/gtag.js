// Finto gtag.js: comportamento tipico di Google Analytics senza Consent Mode.
document.cookie = "_ga=GA1.1.1234567890.1700000000; path=/; max-age=63072000";
document.cookie = "_ga_TEST123=GS1.1.1700000000.1.0.1700000000.0.0.0; path=/; max-age=63072000";
navigator.sendBeacon("http://region1.google-analytics.com/g/collect?v=2&tid=G-TEST123&en=page_view", "x");
