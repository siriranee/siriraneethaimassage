# Google Analytics 4 setup

The public site uses GA4 measurement ID `G-8QX4CPDY6T`. The Google tag loads only after a visitor accepts analytics. CMS pages and private booking status/confirmation pages do not load it. The site sends sanitized public `page_view` events and one `generate_lead` event after a booking request is saved successfully. A booking request is pending, so it is not tracked as a purchase or a confirmed appointment.

Complete these steps in the Google Analytics dashboard before relying on the reports:

1. In **Admin → Data streams**, verify that the web stream uses `G-8QX4CPDY6T`.
2. Under that stream's **Enhanced measurement → Page views → Advanced settings**, turn off **Page changes based on browser history events**. The website sends its own page views when public routes change. Google states that `send_page_view: false` does not turn off this Enhanced Measurement history option, which can otherwise create duplicate page views and include URL query strings.
3. In the stream's **Data redaction** settings, add `reference` and `token` as URL query parameters for defense in depth. Never put booking references, confirmation tokens, customer contact details, or appointment notes into analytics events.
4. After the site is deployed, accept analytics in a test browser and check **Realtime** or **DebugView** for `page_view`. A successful booking request should appear as `generate_lead` once. Failed submissions and CMS actions should not appear as leads.
5. Mark `generate_lead` as a **key event** in GA4. If Google Ads conversion reporting is wanted, link the Google Ads account and import that GA4 key event. Direct Google Ads tagging instead needs an `AW-...` conversion ID and label, which are not supplied by the GA4 measurement ID.

The consent choice can be changed using **Analytics preferences** in the footer. Rejecting analytics does not affect booking.

Official references: [GA4 page views](https://developers.google.com/analytics/devguides/collection/ga4/views), [GA4 recommended events](https://support.google.com/analytics/answer/9267735), [GA4 key events](https://support.google.com/analytics/answer/9356034), [GA4 data redaction](https://support.google.com/analytics/answer/13544947).

